import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  previewCaptureSessionRequestSchema,
  previewCaptureSessionSchema,
  previewDependenciesResponseSchema,
  previewDevicePreferenceRequestSchema,
  previewDevicePreferenceSchema,
  previewDiagnosticBatchSchema,
  previewDiagnosticEventSchema,
  previewDiagnosticsResponseSchema,
  previewLocalStorageRestoreRequestSchema,
  previewLocalStorageRestoreResponseSchema,
  previewLocalStorageSnapshotRequestSchema,
  previewLocalStorageStateSchema,
  previewRepairJobSchema,
  previewRepairRequestSchema,
  previewServiceCandidatesResponseSchema,
  previewServiceGraphRequestSchema,
  previewServiceGraphResponseSchema,
  previewSessionRequestSchema,
  previewSessionResponseSchema,
  previewSlotAssignmentRequestSchema,
  previewSlotResetReportSchema,
  previewSlotResetRequestSchema,
  previewSlotResetResponseSchema,
  previewSlotResetVerificationResponseSchema,
  previewSlotsResponseSchema,
  type PreviewServiceCandidate,
} from "@workbench/contracts";
import { AppError } from "../utils/errors.js";
import { PREVIEW_RESET_ROUTE } from "./bridge.js";
import type { PreviewSlotDatabase } from "./database.js";
import type { PreviewDiagnosticsService } from "./diagnostics.js";
import { requireSameOrigin, resolvePreviewUser, type PreviewIdentityOptions } from "./identity.js";
import type { PreviewSecrets } from "./keys.js";
import type { PreviewRepairService } from "./repair.js";
import type { PreviewSlotService } from "./slots.js";
import type { PreviewStorageService } from "./storage.js";

export interface PreviewRouteOptions {
  slots: PreviewSlotService;
  database: PreviewSlotDatabase;
  diagnostics: PreviewDiagnosticsService;
  storage: PreviewStorageService;
  repair: PreviewRepairService;
  secrets: PreviewSecrets;
  identity: PreviewIdentityOptions;
  scanCandidates: () => Promise<PreviewServiceCandidate[]>;
  diagnosticsEnabled: boolean;
  diagnosticMaxBatchBytes: number;
  diagnosticRetentionDays: number;
}

const slotParamsSchema = z.object({ slotId: z.coerce.number().int().min(1).max(32) });
const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });
const storageParamsSchema = z.object({ storageProfileId: z.string().uuid() });
const graphParamsSchema = z.object({
  projectId: z.string().min(1).max(160),
  primaryServiceId: z.string().min(1).max(120),
});

function isLoopbackConnection(request: FastifyRequest): boolean {
  const address = request.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

/**
 * Lokaler Doctor-Zugriff: nur über eine direkte Loopback-Verbindung und nur mit
 * dem Capability-Token aus dem Datenverzeichnis. Er darf keine Benutzersession
 * schließen, keinen Storage lesen und keine Präferenz ändern.
 */
function requireCapability(request: FastifyRequest, secrets: PreviewSecrets): void {
  if (!isLoopbackConnection(request)) {
    throw new AppError(403, "PREVIEW_CAPABILITY_REMOTE", "Der Agentenzugriff ist nur über eine lokale Verbindung erlaubt.");
  }
  const header = request.headers.authorization;
  const token = typeof header === "string" && header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !secrets.matchesCapabilityToken(token)) {
    throw new AppError(403, "PREVIEW_CAPABILITY_INVALID", "Das lokale Capability-Token ist ungültig.");
  }
}

export async function registerPreviewRoutes(app: FastifyInstance, options: PreviewRouteOptions) {
  const user = (request: FastifyRequest) => resolvePreviewUser(request, options.identity);
  const mutating = (request: FastifyRequest) => {
    requireSameOrigin(request);
    return user(request);
  };

  // ── Gerätepräferenz ────────────────────────────────────────────────────────
  app.get("/previews/device-preference", async (request) => {
    const preference = options.database.devicePreference(user(request));
    return previewDevicePreferenceSchema.parse(preference ?? { deviceId: "iphone-13", orientation: "portrait", updatedAt: null });
  });
  app.put("/previews/device-preference", async (request) => {
    const userId = mutating(request);
    const input = previewDevicePreferenceRequestSchema.parse(request.body);
    return previewDevicePreferenceSchema.parse(options.database.saveDevicePreference(userId, input.deviceId, input.orientation));
  });

  // ── Slots und Sessions ─────────────────────────────────────────────────────
  app.get("/previews/slots", async (request) => previewSlotsResponseSchema.parse(options.slots.list(null, user(request))));
  // Bestandsmutation. Sie bleibt nur während der Migration erhalten.
  app.put("/previews/slots", async (request) => {
    mutating(request);
    return previewSlotsResponseSchema.parse(options.slots.assign(previewSlotAssignmentRequestSchema.parse(request.body)));
  });

  const dependencyQuerySchema = z.object({
    projectId: z.string().min(1).max(160),
    primaryPort: z.coerce.number().int().min(1).max(65_535),
  });
  app.get("/previews/dependencies", async (request) => {
    user(request);
    const query = dependencyQuerySchema.parse(request.query);
    return previewDependenciesResponseSchema.parse(options.slots.dependencies(query.projectId, query.primaryPort));
  });
  app.put("/previews/dependencies", async (request) => {
    mutating(request);
    const input = previewDependenciesResponseSchema.parse(request.body);
    return previewDependenciesResponseSchema.parse(options.slots.saveDependencies(input.projectId, input.primaryPort, input.dependencies));
  });

  app.post("/previews/sessions", async (request) => {
    const userId = mutating(request);
    return previewSessionResponseSchema.parse(options.slots.openSession(userId, previewSessionRequestSchema.parse(request.body)));
  });
  app.put("/previews/sessions/:sessionId/lease", async (request) => {
    const userId = mutating(request);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    return previewSessionResponseSchema.parse(options.slots.renewLease(userId, sessionId));
  });
  app.delete("/previews/sessions/:sessionId", async (request, reply) => {
    const userId = mutating(request);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    options.slots.closeSessionById(userId, sessionId);
    return reply.status(204).send();
  });
  // Bestandspfad für Clients, die nur ihren Sessionschlüssel kennen.
  app.delete("/previews/sessions/by-key/:sessionKey", async (request, reply) => {
    const userId = mutating(request);
    const { sessionKey } = z.object({ sessionKey: z.string().min(1).max(160) }).parse(request.params);
    options.slots.closeSession(userId, sessionKey);
    return reply.status(204).send();
  });

  // ── Slot-Reset ─────────────────────────────────────────────────────────────
  app.post("/previews/slots/:slotId/reset", async (request) => {
    const userId = mutating(request);
    const { slotId } = slotParamsSchema.parse(request.params);
    const input = previewSlotResetRequestSchema.parse(request.body);
    options.slots.assertSlotOwned(userId, slotId, input.storageProfileId);
    const { nonce, affinity } = options.slots.reset.begin(slotId, input.expectedGeneration, input.storageProfileId);
    options.slots.publish();
    return previewSlotResetResponseSchema.parse({
      slotId,
      nonce,
      state: affinity.state,
      slotGeneration: affinity.generation,
      resetUrl: new URL(PREVIEW_RESET_ROUTE, options.slots.publicUrl(slotId)).toString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });
  app.post("/previews/slots/:slotId/reset/verify", async (request) => {
    const userId = mutating(request);
    const { slotId } = slotParamsSchema.parse(request.params);
    options.slots.assertSlotOwned(userId, slotId);
    const report = previewSlotResetReportSchema.parse(request.body);
    const result = options.slots.reset.verify(slotId, report);
    options.slots.publish();
    return previewSlotResetVerificationResponseSchema.parse({
      slotId,
      state: result.affinity.state,
      slotGeneration: result.affinity.generation,
      verifiedAt: result.affinity.lastVerifiedResetAt,
      message: result.message,
    });
  });

  // ── Service-Graph ──────────────────────────────────────────────────────────
  app.get("/previews/service-candidates", async (request) => {
    user(request);
    const { projectId } = z.object({ projectId: z.string().min(1).max(160).optional() }).parse(request.query);
    const candidates = options.database.candidates(projectId ?? null);
    return previewServiceCandidatesResponseSchema.parse({
      projectId: projectId ?? null,
      candidates,
      scannedAt: candidates[0]?.detectedAt ?? new Date().toISOString(),
    });
  });
  app.post("/previews/service-candidates/scan", async (request) => {
    mutating(request);
    const candidates = await options.scanCandidates();
    options.database.replaceCandidates(candidates);
    return previewServiceCandidatesResponseSchema.parse({
      projectId: null,
      candidates,
      scannedAt: new Date().toISOString(),
    });
  });
  app.get("/previews/service-graphs/:projectId/:primaryServiceId", async (request) => {
    user(request);
    const { projectId, primaryServiceId } = graphParamsSchema.parse(request.params);
    const stored = options.database.serviceGraph(projectId, primaryServiceId);
    const edges = stored?.edges ?? [];
    return previewServiceGraphResponseSchema.parse({
      graph: { projectId, primaryServiceId, edges, updatedAt: stored?.updatedAt ?? null },
      capacity: options.slots.capacity({ projectId, primaryPort: Number(primaryServiceId), edges }),
    });
  });
  app.put("/previews/service-graphs/:projectId/:primaryServiceId", async (request) => {
    mutating(request);
    const { projectId, primaryServiceId } = graphParamsSchema.parse(request.params);
    const input = previewServiceGraphRequestSchema.parse(request.body);
    const capacity = options.slots.capacity({ projectId, primaryPort: Number(primaryServiceId), edges: input.edges });
    // Ein Graph, der die Kapazität überschreitet, wird nicht teilweise aktiviert.
    if (!capacity.fits) {
      throw new AppError(409, "PREVIEW_CAPACITY_EXCEEDED",
        `Dieser Graph benötigt ${capacity.requiredSlots} Slots, verfügbar sind ${capacity.reusableSlots + capacity.freeSlots}.`);
    }
    const updatedAt = options.slots.saveServiceGraph(projectId, primaryServiceId, input.edges);
    return previewServiceGraphResponseSchema.parse({
      graph: { projectId, primaryServiceId, edges: input.edges, updatedAt },
      capacity,
    });
  });

  // ── Diagnose ───────────────────────────────────────────────────────────────
  app.post("/previews/diagnostics/batches", {
    // Eigenes, benutzerbezogenes Budget statt des globalen IP-Limits.
    config: { rateLimit: { max: 60, timeWindow: "1 minute", keyGenerator: (request: FastifyRequest) => String(request.headers["tailscale-user-login"] ?? request.ip) } },
  }, async (request) => {
    const userId = mutating(request);
    if (!options.diagnosticsEnabled) return previewDiagnosticsResponseSchema.parse({ events: [], dropped: 0 });
    if (Buffer.byteLength(JSON.stringify(request.body), "utf8") > options.diagnosticMaxBatchBytes) {
      throw new AppError(413, "PREVIEW_DIAGNOSTIC_BATCH_TOO_LARGE", "Der Diagnoseblock überschreitet das konfigurierte Größenlimit.");
    }
    const batch = previewDiagnosticBatchSchema.parse(request.body);
    if (batch.sessionId === null) {
      throw new AppError(400, "PREVIEW_DIAGNOSTIC_SESSION_REQUIRED", "Diagnoseereignisse benötigen eine Preview-Session.");
    }
    options.slots.assertSessionOwned(userId, batch.sessionId);
    if (batch.events.some((event) => event.sessionId !== null && event.sessionId !== batch.sessionId)) {
      throw new AppError(400, "PREVIEW_DIAGNOSTIC_SESSION_MISMATCH", "Diagnoseereignisse dürfen nur zur angegebenen Session gehören.");
    }
    const events = batch.events.map((event) => previewDiagnosticEventSchema.parse({
      ...event,
      previewNodeId: event.previewNodeId ?? batch.previewNodeId,
      sessionId: event.sessionId ?? batch.sessionId,
      bridgeSessionId: event.bridgeSessionId ?? batch.bridgeSessionId,
    }));
    const result = options.diagnostics.record(events, { userId, dropped: batch.droppedSinceLastBatch });
    return previewDiagnosticsResponseSchema.parse({ events: [], dropped: result.dropped });
  });
  app.get("/previews/diagnostics", async (request) => {
    const userId = user(request);
    const query = z.object({
      previewNodeId: z.string().max(120).optional(),
      since: z.string().max(40).optional(),
      severity: z.enum(["debug", "info", "warn", "error"]).optional(),
    }).parse(request.query);
    const result = options.diagnostics.list({
      previewNodeId: query.previewNodeId ?? null,
      ...(query.since === undefined ? {} : { since: query.since }),
      ...(query.severity === undefined ? {} : { severity: query.severity }),
    }, userId);
    return previewDiagnosticsResponseSchema.parse({ ...result, retentionDays: options.diagnosticRetentionDays });
  });
  app.get("/previews/diagnostics/log-tail", async (request) => {
    const userId = user(request);
    const query = z.object({
      since: z.string().max(40).default(new Date(Date.now() - 3_600_000).toISOString()),
      previewNodeId: z.string().max(120).optional(),
      severity: z.enum(["debug", "info", "warn", "error"]).optional(),
    }).parse(request.query);
    const events = await options.diagnostics.readLog({
      since: query.since,
      previewNodeId: query.previewNodeId ?? null,
      ...(query.severity === undefined ? {} : { severity: query.severity }),
    }, userId);
    return previewDiagnosticsResponseSchema.parse({ events, dropped: 0, retentionDays: options.diagnosticRetentionDays });
  });
  app.post("/previews/diagnostics/capture-session", async (request) => {
    const userId = mutating(request);
    const input = previewCaptureSessionRequestSchema.parse(request.body);
    return previewCaptureSessionSchema.parse(options.diagnostics.startCapture(input.previewNodeId, input.durationMinutes, userId));
  });
  app.delete("/previews/diagnostics/capture-session/:id", async (request, reply) => {
    const userId = mutating(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const stopped = options.diagnostics.stopCapture(id, userId);
    if (!stopped) throw new AppError(404, "PREVIEW_CAPTURE_NOT_FOUND", "Diese Diagnosesitzung wurde nicht gefunden.");
    return reply.send(previewCaptureSessionSchema.parse(stopped));
  });

  // Nur Loopback-Capability, ausschließlich redigierte Ausgabe, maximal sieben Tage.
  app.get("/previews/doctor/logs", async (request) => {
    requireCapability(request, options.secrets);
    const query = z.object({
      since: z.string().max(40).default(new Date(Date.now() - 3_600_000).toISOString()),
      previewNodeId: z.string().max(120).optional(),
      severity: z.enum(["debug", "info", "warn", "error"]).optional(),
    }).parse(request.query);
    const events = await options.diagnostics.readLog({
      since: query.since,
      previewNodeId: query.previewNodeId ?? null,
      ...(query.severity === undefined ? {} : { severity: query.severity }),
    }, null);
    return previewDiagnosticsResponseSchema.parse({ events, dropped: 0, retentionDays: options.diagnosticRetentionDays });
  });
  app.get("/previews/doctor/status", async (request) => {
    requireCapability(request, options.secrets);
    return {
      slots: options.slots.list().slots,
      routingRevision: options.slots.routingRevision(),
      candidates: options.database.candidates(null),
      generatedAt: new Date().toISOString(),
    };
  });
  app.post("/previews/doctor/probe", async (request) => {
    requireCapability(request, options.secrets);
    const job = await options.repair.run({ action: "probe-services", projectId: null, sessionId: null, slotId: null, confirmed: false }, { actor: "local-agent", userId: null });
    return previewRepairJobSchema.parse(job);
  });

  // ── localStorage ───────────────────────────────────────────────────────────
  app.get("/previews/storage/:storageProfileId", async (request) => {
    const userId = user(request);
    const { storageProfileId } = storageParamsSchema.parse(request.params);
    return previewLocalStorageStateSchema.parse(options.storage.state(userId, storageProfileId));
  });
  app.put("/previews/storage/:storageProfileId", async (request) => {
    const userId = mutating(request);
    const { storageProfileId } = storageParamsSchema.parse(request.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    return previewLocalStorageStateSchema.parse(options.storage.setEnabled(userId, storageProfileId, enabled));
  });
  app.post("/previews/storage/:storageProfileId/snapshots", async (request, reply) => {
    const userId = mutating(request);
    const { storageProfileId } = storageParamsSchema.parse(request.params);
    const input = previewLocalStorageSnapshotRequestSchema.parse(request.body);
    try {
      const snapshot = options.storage.write(userId, storageProfileId, input);
      return reply.status(201).send(previewLocalStorageStateSchema.parse({
        ...options.storage.state(userId, storageProfileId),
        current: snapshot,
      }));
    } catch (error) {
      if (error instanceof AppError && error.code === "PREVIEW_STORAGE_CONFLICT") {
        return reply.status(409).send({
          error: { code: error.code, message: error.message, details: error.details, requestId: request.id, retryable: false },
          conflict: options.storage.conflict(userId, storageProfileId),
        });
      }
      throw error;
    }
  });
  app.post("/previews/storage/:storageProfileId/restore", async (request) => {
    const userId = mutating(request);
    const { storageProfileId } = storageParamsSchema.parse(request.params);
    const input = previewLocalStorageRestoreRequestSchema.parse(request.body);
    const result = options.storage.read(userId, storageProfileId, input.expectedRevision);
    return previewLocalStorageRestoreResponseSchema.parse(result);
  });
  app.delete("/previews/storage/:storageProfileId", async (request, reply) => {
    const userId = mutating(request);
    const { storageProfileId } = storageParamsSchema.parse(request.params);
    options.storage.clear(userId, storageProfileId);
    return reply.status(204).send();
  });

  // ── Reparatur ──────────────────────────────────────────────────────────────
  app.post("/previews/repair", async (request) => {
    const userId = mutating(request);
    const input = previewRepairRequestSchema.parse(request.body);
    if (input.sessionId) options.slots.assertSessionOwned(userId, input.sessionId);
    if (input.slotId !== null) options.slots.assertSlotOwned(userId, input.slotId);
    return previewRepairJobSchema.parse(await options.repair.run(input, { actor: "user", userId }));
  });
  app.get("/previews/repair/:jobId", async (request) => {
    const userId = user(request);
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);
    const job = options.repair.job(jobId, userId);
    if (!job) throw new AppError(404, "PREVIEW_REPAIR_NOT_FOUND", "Dieser Reparaturauftrag wurde nicht gefunden.");
    return previewRepairJobSchema.parse(job);
  });
}

export { randomUUID as previewRandomId };
