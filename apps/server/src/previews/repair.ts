import { randomUUID } from "node:crypto";
import type { PreviewRepairJob, PreviewRepairRequest, PreviewServiceCandidate } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import type { PreviewSlotDatabase } from "./database.js";
import type { PreviewSlotService } from "./slots.js";

export type RepairActor = "user" | "local-agent";

export interface RepairServiceOptions {
  database: PreviewSlotDatabase;
  slots: PreviewSlotService;
  scanCandidates: () => Promise<PreviewServiceCandidate[]>;
}

/**
 * Führt ausschließlich feste, validierte Aktionen aus. Es gibt bewusst keine
 * Shell-Kommandos, keinen Dateischreibzugriff und keine Änderung an Projektcode
 * oder CORS-Konfiguration.
 */
export class PreviewRepairService {
  private readonly options: RepairServiceOptions;
  private readonly jobs = new Map<string, PreviewRepairJob>();
  private readonly jobOwners = new Map<string, string>();

  constructor(options: RepairServiceOptions) {
    this.options = options;
  }

  job(id: string, userId?: string): PreviewRepairJob | null {
    this.pruneJobs();
    if (userId && this.jobOwners.get(id) !== userId) return null;
    return this.jobs.get(id) ?? null;
  }

  async run(input: PreviewRepairRequest, context: { actor: RepairActor; userId: string | null }): Promise<PreviewRepairJob> {
    this.pruneJobs();
    const job: PreviewRepairJob = {
      id: randomUUID(),
      action: input.action,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      message: "",
      details: {},
    };
    this.jobs.set(job.id, job);
    if (context.userId) this.jobOwners.set(job.id, context.userId);
    const before = JSON.stringify({ slots: this.options.slots.list().slots.map((slot) => ({ id: slot.id, state: slot.state })) });
    try {
      const result = await this.execute(input, context);
      const finished: PreviewRepairJob = {
        ...job,
        status: "succeeded",
        finishedAt: new Date().toISOString(),
        message: result.message,
        details: result.details,
      };
      this.jobs.set(job.id, finished);
      this.audit(input, context, before, "erfolgreich");
      return finished;
    } catch (error) {
      const failed: PreviewRepairJob = {
        ...job,
        status: "failed",
        finishedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Die Reparatur ist fehlgeschlagen.",
        details: {},
      };
      this.jobs.set(job.id, failed);
      this.audit(input, context, before, "fehlgeschlagen");
      return failed;
    }
  }

  private pruneJobs() {
    const cutoff = Date.now() - 24 * 60 * 60_000;
    for (const [id, job] of this.jobs) {
      if (job.finishedAt && Date.parse(job.finishedAt) < cutoff) {
        this.jobs.delete(id);
        this.jobOwners.delete(id);
      }
    }
    while (this.jobs.size >= 200) {
      const oldest = this.jobs.keys().next().value as string | undefined;
      if (!oldest) break;
      this.jobs.delete(oldest);
      this.jobOwners.delete(oldest);
    }
  }

  private audit(input: PreviewRepairRequest, context: { actor: RepairActor; userId: string | null }, before: string, result: string) {
    this.options.database.writeAudit({
      id: randomUUID(),
      at: new Date().toISOString(),
      actor: context.actor,
      userId: context.userId,
      action: input.action,
      target: JSON.stringify({ projectId: input.projectId, sessionId: input.sessionId, slotId: input.slotId }),
      beforeState: before,
      afterState: JSON.stringify({ slots: this.options.slots.list().slots.map((slot) => ({ id: slot.id, state: slot.state })) }),
      result,
    });
  }

  private async execute(input: PreviewRepairRequest, context: { actor: RepairActor; userId: string | null }): Promise<{ message: string; details: Record<string, unknown> }> {
    switch (input.action) {
      case "probe-services":
      case "rebuild-suggestions": {
        const candidates = await this.options.scanCandidates();
        this.options.database.replaceCandidates(candidates);
        return {
          message: `${candidates.length} lokale Dienste erneut geprüft. Verbunden wird erst nach Bestätigung.`,
          details: { candidates: candidates.map((candidate) => ({ port: candidate.port, role: candidate.suggestedRole, probeStatus: candidate.probeStatus })) },
        };
      }
      case "renew-own-session": {
        const userId = this.requireUser(context);
        if (!input.sessionId) throw new AppError(400, "PREVIEW_SESSION_REQUIRED", "Für diese Aktion wird eine Session benötigt.");
        const session = this.options.slots.renewLease(userId, input.sessionId);
        return { message: "Die eigene Session wurde verlängert.", details: { leaseExpiresAt: session.leaseExpiresAt } };
      }
      case "release-own-session": {
        const userId = this.requireUser(context);
        if (!input.sessionId) throw new AppError(400, "PREVIEW_SESSION_REQUIRED", "Für diese Aktion wird eine Session benötigt.");
        this.options.slots.closeSessionById(userId, input.sessionId);
        return { message: "Die eigene Session wurde freigegeben.", details: {} };
      }
      case "reset-slot-storage": {
        // Reset und Quarantäne bleiben an Benutzeridentität und sichtbare Bestätigung gebunden.
        const userId = this.requireUser(context);
        if (!input.confirmed) throw new AppError(400, "PREVIEW_CONFIRMATION_REQUIRED", "Der Storage-Reset benötigt eine ausdrückliche Bestätigung.");
        if (input.slotId === null) throw new AppError(400, "PREVIEW_SLOT_REQUIRED", "Für den Reset wird ein Slot benötigt.");
        this.options.slots.assertSlotOwned(userId, input.slotId);
        const affinity = this.options.slots.reset.affinity(input.slotId);
        return {
          message: "Der Reset wurde vorbereitet. Die Workbench führt ihn im iframe aus und meldet das Ergebnis zurück.",
          details: { slotId: input.slotId, generation: affinity.generation, state: affinity.state },
        };
      }
      case "clear-quarantine": {
        const userId = this.requireUser(context);
        if (!input.confirmed) throw new AppError(400, "PREVIEW_CONFIRMATION_REQUIRED", "Das Aufheben der Quarantäne benötigt eine Bestätigung.");
        if (input.slotId === null) throw new AppError(400, "PREVIEW_SLOT_REQUIRED", "Für diese Aktion wird ein Slot benötigt.");
        this.options.slots.assertSlotOwned(userId, input.slotId);
        const affinity = this.options.slots.reset.clearQuarantine(input.slotId);
        this.options.slots.publish();
        return { message: "Die Quarantäne wurde nach verifiziertem Reset aufgehoben.", details: { slotId: input.slotId, state: affinity.state } };
      }
      default:
        throw new AppError(400, "PREVIEW_REPAIR_UNKNOWN", "Diese Reparaturaktion ist nicht erlaubt.");
    }
  }

  private requireUser(context: { actor: RepairActor; userId: string | null }): string {
    if (context.actor !== "user" || context.userId === null) {
      throw new AppError(403, "PREVIEW_REPAIR_FORBIDDEN", "Diese Aktion ist dem angemeldeten Benutzer vorbehalten.");
    }
    return context.userId;
  }
}
