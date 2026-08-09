import { createHash, randomUUID } from "node:crypto";
import {
  previewSlotsResponseSchema,
  previewDependenciesResponseSchema,
  previewSessionResponseSchema,
  type PreviewCapability,
  type PreviewCapacityPreview,
  type PreviewDependenciesResponse,
  type PreviewDependency,
  type PreviewLimitation,
  type PreviewServiceEdge,
  type PreviewSessionRequest,
  type PreviewSessionResponse,
  type PreviewSlot,
  type PreviewSlotAssignmentRequest,
  type PreviewSlotsResponse,
} from "@workbench/contracts";
import { AppError } from "../utils/errors.js";
import type { PreviewSlotDatabase, BindingRow, SessionRow } from "./database.js";
import { PreviewGateway, type GatewayDiagnosticEvent } from "./gateway.js";
import { PREVIEW_BRIDGE_VERSION } from "./bridge.js";
import {
  bindingFingerprint,
  buildRoutingSnapshot,
  emptyRoutingSnapshot,
  type PreviewSlotDefinition,
  type RoutingSnapshot,
} from "./routing.js";
import { PreviewResetService, mayReuseSlot, storageOwnerKey } from "./reset.js";

export { PreviewSlotDatabase } from "./database.js";
export type { PreviewSlotDefinition } from "./routing.js";

const leaseMilliseconds = 30 * 60_000;

interface DesiredBinding {
  targetPort: number;
  targetProtocol: "http" | "https";
  role: "primary" | "dependency";
  label: string;
}

export interface PreviewSlotServiceOptions {
  database: PreviewSlotDatabase;
  slotPorts: number[];
  publicPorts: number[];
  hostname: string;
  forbiddenTargetPorts?: number[];
  workbenchOrigins?: string[];
  flags?: Partial<PreviewFlags>;
  onDiagnostic?: (event: GatewayDiagnosticEvent) => void;
}

export interface PreviewFlags {
  gatewayV2Enabled: boolean;
  bridgeEnabled: boolean;
  diagnosticsEnabled: boolean;
  storageSyncEnabled: boolean;
  slotResetEnabled: boolean;
  maxInjectableHtmlBytes: number;
  maxStorageBytes: number;
  maxStorageKeys: number;
  /** Testmodus: Slot-Origins als `http://127.0.0.1:<internalPort>` ausgeben. */
  loopbackPublicOrigins: boolean;
}

const defaultFlags: PreviewFlags = {
  gatewayV2Enabled: false,
  bridgeEnabled: false,
  diagnosticsEnabled: false,
  storageSyncEnabled: false,
  slotResetEnabled: false,
  maxInjectableHtmlBytes: 2_097_152,
  maxStorageBytes: 262_144,
  maxStorageKeys: 1_000,
  loopbackPublicOrigins: false,
};

/**
 * Fachliche Klammer um Datenbank, Routing-Snapshot, Gateway und Slot-Reset.
 * Sessions, Bindings, Slotzustände und Zielports werden in genau einer
 * Transaktion geändert; erst nach dem Commit wird ein neuer, unveränderlicher
 * Routing-Snapshot veröffentlicht.
 */
export class PreviewSlotService {
  readonly definitions: PreviewSlotDefinition[];
  readonly reset: PreviewResetService;
  private readonly database: PreviewSlotDatabase;
  private readonly hostname: string;
  private readonly forbiddenTargetPorts: Set<number>;
  private readonly flags: PreviewFlags;
  private readonly gateway: PreviewGateway;
  private snapshot: RoutingSnapshot = emptyRoutingSnapshot;

  constructor(options: PreviewSlotServiceOptions) {
    this.database = options.database;
    this.hostname = options.hostname;
    this.flags = { ...defaultFlags, ...options.flags };
    this.forbiddenTargetPorts = new Set([
      ...options.slotPorts,
      ...options.publicPorts,
      ...(options.forbiddenTargetPorts ?? []),
    ]);
    this.definitions = options.slotPorts.map((internalPort, index) => ({
      id: index + 1,
      internalPort,
      publicPort: options.publicPorts[index]!,
    }));
    this.reset = new PreviewResetService({ database: this.database, enabled: this.flags.slotResetEnabled });
    this.gateway = new PreviewGateway({
      definitions: this.definitions,
      route: (slotId) => this.snapshot.routes.get(slotId) ?? null,
      routingRevision: () => this.snapshot.revision,
      publicUrlForSlot: (slotId) => this.publicUrl(slotId),
      workbenchOrigins: options.workbenchOrigins ?? [],
      flags: {
        gatewayV2Enabled: this.flags.gatewayV2Enabled,
        bridgeEnabled: this.flags.bridgeEnabled,
        diagnosticsEnabled: this.flags.diagnosticsEnabled,
        storageSyncEnabled: this.flags.storageSyncEnabled,
        maxInjectableHtmlBytes: this.flags.maxInjectableHtmlBytes,
        maxStorageBytes: this.flags.maxStorageBytes,
        maxStorageKeys: this.flags.maxStorageKeys,
      },
      ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {}),
    });
    this.publish();
  }

  private definition(slotId: number): PreviewSlotDefinition {
    const found = this.definitions.find((slot) => slot.id === slotId);
    if (!found) throw new AppError(404, "PREVIEW_SLOT_NOT_FOUND", "Dieser Preview-Slot ist nicht konfiguriert.");
    return found;
  }

  publicUrl(slotId: number): string {
    const definition = this.definition(slotId);
    return this.flags.loopbackPublicOrigins
      ? `http://127.0.0.1:${definition.internalPort}/`
      : `https://${this.hostname}:${definition.publicPort}/`;
  }

  /**
   * Baut den Routing-Snapshot vollständig aus der Datenbank neu und tauscht ihn
   * atomar aus. Nach einem Fehler zwischen Commit und Swap führt der nächste
   * Aufruf zum konsistenten Zustand zurück.
   */
  publish(): RoutingSnapshot {
    this.snapshot = buildRoutingSnapshot(this.database, this.definitions, (slotId) => this.publicUrl(slotId));
    return this.snapshot;
  }

  routingRevision(): number {
    return this.snapshot.revision;
  }

  list(assignedSlotId: number | null = null, userId: string | null = null): PreviewSlotsResponse {
    const persisted = new Map(this.database.list().map((slot) => [slot.slotId, slot]));
    const affinities = new Map(this.database.affinities().map((row) => [row.slotId, row]));
    const ownSessions = userId === null ? [] : this.database.allSessions().filter((session) => session.userId === userId);
    const ownSlots = new Set(ownSessions.flatMap((session) => this.database.bindings(session.id).map((binding) => binding.slotId)));
    const slots: PreviewSlot[] = this.definitions.map((definition) => {
      const stored = persisted.get(definition.id);
      const affinity = affinities.get(definition.id);
      const route = this.snapshot.routes.get(definition.id);
      const own = ownSlots.has(definition.id);
      return {
        ...definition,
        targetPort: stored?.targetPort ?? null,
        publicUrl: this.publicUrl(definition.id),
        updatedAt: stored?.updatedAt ?? null,
        state: route?.state ?? affinity?.state ?? "free",
        // Fremde Storage-Profile bleiben unsichtbar; sie erscheinen nur als „belegt“.
        storageProfileId: own ? affinity?.storageProfileId ?? null : null,
        slotGeneration: affinity?.generation ?? 0,
        routingRevision: this.snapshot.revision,
        affinityStatus: affinity?.state === "quarantined"
          ? "quarantined"
          : affinity?.storageOwnerKey === null || affinity === undefined
            ? "none"
            : own ? "own" : "foreign",
        busy: Boolean(route) && !own,
      };
    });
    return previewSlotsResponseSchema.parse({ slots, assignedSlotId, routingRevision: this.snapshot.revision });
  }

  // ── Direktzuweisung (Bestandspfad) ───────────────────────────────────────────

  assign(input: PreviewSlotAssignmentRequest): PreviewSlotsResponse {
    if (input.targetPort === null) {
      const slotId = input.slotId!;
      this.definition(slotId);
      const currentTarget = this.database.target(slotId);
      if (input.expectedTargetPort !== undefined && currentTarget !== input.expectedTargetPort) {
        throw new AppError(409, "PREVIEW_SLOT_CHANGED", "Der Preview-Slot wurde inzwischen einem anderen Ziel zugewiesen.");
      }
      if (this.database.bindingCount(slotId) > 0) return this.list(slotId);
      this.database.transaction(() => {
        this.database.assign(slotId, null);
        this.database.nextRoutingRevision();
      });
      this.reset.release(slotId);
      this.publish();
      return this.list(slotId);
    }

    this.assertAllowedTarget(input.targetPort);
    let slotId = input.slotId ?? null;
    if (slotId !== null) {
      this.definition(slotId);
      const currentTarget = this.database.target(slotId);
      if (currentTarget !== null && currentTarget !== input.targetPort) {
        throw new AppError(409, "PREVIEW_SLOT_CHANGED", "Der gewünschte Preview-Slot ist inzwischen belegt.");
      }
    }
    const current = this.list().slots;
    if (slotId === null && !input.isolate) {
      slotId = current.find((slot) => slot.targetPort === input.targetPort && slot.state !== "quarantined")?.id ?? null;
    }
    slotId ??= current.find((slot) => slot.targetPort === null && slot.state === "free")?.id ?? null;
    if (slotId === null) {
      throw new AppError(409, "PREVIEW_SLOTS_EXHAUSTED", "Alle Preview-Slots sind belegt. Gib einen Slot frei oder teile eine bestehende Session.");
    }
    this.database.transaction(() => {
      this.database.assign(slotId!, input.targetPort);
      this.database.nextRoutingRevision();
    });
    this.publish();
    return this.list(slotId);
  }

  private assertAllowedTarget(port: number) {
    if (this.forbiddenTargetPorts.has(port)) {
      throw new AppError(400, "PREVIEW_TARGET_FORBIDDEN", "Infrastrukturports dürfen nicht als Preview-Ziel verwendet werden.");
    }
  }

  // ── Abhängigkeiten ───────────────────────────────────────────────────────────

  dependencies(projectId: string, primaryPort: number): PreviewDependenciesResponse {
    return previewDependenciesResponseSchema.parse({ projectId, primaryPort, dependencies: this.database.dependencies(projectId, primaryPort) });
  }

  saveDependencies(projectId: string, primaryPort: number, dependencies: PreviewDependency[]): PreviewDependenciesResponse {
    for (const item of dependencies) {
      if (item.port === primaryPort || this.forbiddenTargetPorts.has(item.port)) {
        throw new AppError(400, "PREVIEW_DEPENDENCY_FORBIDDEN", "Der Hauptport und Infrastrukturports können nicht als Begleitdienst gespeichert werden.");
      }
    }
    this.database.saveDependencies(projectId, primaryPort, dependencies);
    this.publish();
    return this.dependencies(projectId, primaryPort);
  }

  saveServiceGraph(projectId: string, primaryServiceId: string, edges: PreviewServiceEdge[]): string {
    const updatedAt = this.database.transaction(() => {
      const savedAt = this.database.saveServiceGraph(projectId, primaryServiceId, edges);
      this.database.nextRoutingRevision();
      return savedAt;
    });
    this.publish();
    return updatedAt;
  }

  /** Bestätigte Kanten des Service-Graphen, sonst die gespeicherten Portregeln. */
  private desiredBindings(input: { projectId: string | null; primaryPort: number; primaryProtocol: "http" | "https" }): DesiredBinding[] {
    const primary: DesiredBinding = {
      targetPort: input.primaryPort,
      targetProtocol: input.primaryProtocol,
      role: "primary",
      label: "Hauptdienst",
    };
    if (input.projectId === null) return [primary];
    const graph = this.database.serviceGraph(input.projectId, String(input.primaryPort));
    const edges: PreviewServiceEdge[] = graph?.edges ?? [];
    if (edges.length > 0) {
      return [primary, ...edges.map((edge) => ({
        targetPort: edge.port,
        targetProtocol: (edge.protocol === "https" || edge.protocol === "wss" ? "https" : "http") as "http" | "https",
        role: "dependency" as const,
        label: edge.label,
      }))];
    }
    return [primary, ...this.database.dependencies(input.projectId, input.primaryPort)
      .filter((item) => item.enabled)
      .map((item) => ({
        targetPort: item.port,
        targetProtocol: (item.protocol === "https" ? "https" : "http") as "http" | "https",
        role: "dependency" as const,
        label: item.label,
      }))];
  }

  /** Zeigt vor dem Speichern, wie viele Slots ein Graph benötigt. */
  capacity(input: { projectId: string | null; primaryPort: number; edges: readonly PreviewServiceEdge[] }): PreviewCapacityPreview {
    const requiredSlots = input.edges.length + 1;
    const slots = this.list().slots;
    const desiredPorts = new Set([input.primaryPort, ...input.edges.map((edge) => edge.port)]);
    const reusableSlots = slots.filter((slot) => slot.targetPort !== null && desiredPorts.has(slot.targetPort) && slot.state !== "quarantined").length;
    const freeSlots = slots.filter((slot) => slot.targetPort === null && slot.state === "free").length;
    const limitations: PreviewLimitation[] = ["cookies-share-host"];
    return {
      requiredSlots,
      reusableSlots,
      freeSlots,
      totalSlots: slots.length,
      fits: requiredSlots <= reusableSlots + freeSlots,
      limitations,
    };
  }

  // ── Sessions ─────────────────────────────────────────────────────────────────

  private releaseUnusedSlots(slotIds: number[]) {
    for (const slotId of new Set(slotIds)) {
      if (this.database.bindingCount(slotId) === 0) {
        this.database.assign(slotId, null);
        this.reset.release(slotId);
      }
    }
  }

  private capabilities(): PreviewCapability[] {
    const capabilities: PreviewCapability[] = ["websocket", "event-source"];
    if (this.flags.bridgeEnabled && this.flags.gatewayV2Enabled) capabilities.push("bridge");
    if (this.flags.diagnosticsEnabled) capabilities.push("diagnostics");
    if (this.flags.storageSyncEnabled) capabilities.push("storage-snapshot");
    if (this.flags.slotResetEnabled) capabilities.push("slot-reset");
    return capabilities;
  }

  private limitations(): PreviewLimitation[] {
    const limitations: PreviewLimitation[] = [
      "cookies-share-host",
      "no-indexeddb-sync",
      "no-service-worker-sync",
      "no-session-storage-sync",
      "approximate-device-metrics",
      "partial-network-visibility",
    ];
    if (!this.flags.bridgeEnabled || !this.flags.gatewayV2Enabled) limitations.push("bridge-unavailable");
    return limitations;
  }

  openSession(userId: string, input: PreviewSessionRequest): PreviewSessionResponse {
    this.assertAllowedTarget(input.primaryPort);
    // Abgelaufene Sessions werden erst aufgeräumt, wenn wirklich kein Slot mehr
    // frei ist (Kapazitätsdruck). Solange Platz ist, bleibt die Zuordnung
    // bestehen, damit ein später zurückkehrender Tab seinen Slot wiederfindet.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = this.openSessionOnce(userId, input);
        return result;
      } catch (error) {
        const exhausted = error instanceof AppError && error.code === "PREVIEW_SLOTS_EXHAUSTED";
        if (attempt === 0 && exhausted) {
          this.database.transaction(() => {
            this.releaseUnusedSlots(this.database.deleteExpiredSessions(new Date().toISOString()));
          });
          this.publish();
          continue;
        }
        throw error;
      }
    }
    // Unerreichbar, aber TypeScript verlangt einen Rückgabewert.
    throw new AppError(409, "PREVIEW_SLOTS_EXHAUSTED", "Für die verbundenen Dienste sind nicht genügend Preview-Slots frei.");
  }

  private openSessionOnce(userId: string, input: PreviewSessionRequest): PreviewSessionResponse {
    const result = this.database.transaction((): { mutated: boolean; session: SessionRow; bindings: BindingRow[] } => {
      // Auch Idempotenzprüfung und Slotwahl laufen unter derselben
      // Schreibsperre. Damit können zwei parallele Requests weder
      // denselben Slot noch denselben (User, sessionKey)-Datensatz erobern.
      const desired = this.desiredBindings(input);
      const requestFingerprint = createHash("sha256").update(JSON.stringify({
        sessionKey: input.sessionKey,
        projectId: input.projectId,
        primaryPort: input.primaryPort,
        primaryProtocol: input.primaryProtocol,
        isolate: input.isolate,
        storageProfileId: input.storageProfileId,
        requestedSlotId: input.requestedSlotId ?? null,
        desired,
      })).digest("hex");
      for (const item of desired) if (item.role === "dependency") this.assertAllowedTarget(item.targetPort);

      const previous = this.database.sessionByKey(userId, input.sessionKey);
      if (input.expectedRoutingRevision !== undefined && input.expectedRoutingRevision !== this.database.routingRevision()) {
        throw new AppError(409, "PREVIEW_ROUTING_CHANGED", "Das Preview-Routing hat sich inzwischen geändert.");
      }
      // Wiederholte Anfragen mit demselben Idempotenzschlüssel liefern denselben Stand.
      if (previous && input.idempotencyKey !== undefined && previous.idempotencyKey === input.idempotencyKey) {
        if (previous.requestFingerprint !== requestFingerprint) {
          throw new AppError(409, "PREVIEW_IDEMPOTENCY_CONFLICT", "Der Idempotenzschlüssel wurde bereits für eine andere Preview-Anfrage verwendet.");
        }
        const bindings = this.database.bindings(previous.id);
        if (bindings.length > 0) return { mutated: false, session: previous, bindings };
      }

      const previousBindings = previous ? this.database.bindings(previous.id) : [];
      const sessionId = previous?.id ?? randomUUID();
      const ownerKey = storageOwnerKey({
        projectId: input.projectId,
        primaryPort: input.primaryPort,
        storageProfileId: input.storageProfileId,
      });
      const leaseExpiresAt = new Date(Date.now() + leaseMilliseconds).toISOString();
      // Die Slotwahl muss dieselbe BEGIN-IMMEDIATE-Sperre wie der Commit
      // halten. Sonst können zwei Requests denselben freien Slot lesen und
      // anschließend für verschiedene Benutzer überschreiben.
      const bindings = this.allocateSlots({
        sessionId,
        userId,
        desired,
        ownerKey,
        isolate: input.isolate,
        requestedSlotId: input.requestedSlotId ?? null,
        previousBindings,
      });
      const routingRevision = this.database.nextRoutingRevision();
      const row: SessionRow = {
        id: sessionId,
        userId,
        sessionKey: input.sessionKey,
        projectId: input.projectId,
        primaryPort: input.primaryPort,
        storageProfileId: input.storageProfileId,
        routingRevision,
        idempotencyKey: input.idempotencyKey ?? null,
        requestFingerprint,
        leaseExpiresAt,
      };
      this.database.writeSession(row, bindings);
      for (const binding of bindings) {
        this.database.assign(binding.slotId, binding.targetPort);
        this.reset.claim(binding.slotId, ownerKey, input.storageProfileId);
      }
      const reserved = new Set(bindings.map((binding) => binding.slotId));
      this.releaseUnusedSlots(previousBindings.filter((old) => !reserved.has(old.slotId)).map((old) => old.slotId));
      return { mutated: true, session: row, bindings };
    });
    if (result.mutated) this.publish();
    return this.sessionResponse(result.session, result.bindings);
  }

  /**
   * Wählt Slots für die gewünschten Dienste. Geteilte Slots sind nur erlaubt,
   * wenn eine bestehende Session denselben Binding-Fingerprint und dieselbe
   * Storage-Affinität besitzt.
   */
  private allocateSlots(input: {
    sessionId: string;
    userId: string;
    desired: DesiredBinding[];
    ownerKey: string;
    isolate: boolean;
    requestedSlotId: number | null;
    previousBindings: BindingRow[];
  }): BindingRow[] {
    const slots = this.list().slots;
    // Direktzuweisungen ohne Session sind Reste des alten Pfads; sie dürfen neu
    // vergeben werden, statt einen Slot dauerhaft zu blockieren.
    const bound = new Set(this.database.allBindings().map((binding) => binding.slotId));
    const usable = (slotId: number) => {
      const slot = slots.find((candidate) => candidate.id === slotId);
      if (!slot || slot.state === "quarantined" || slot.state === "resetting") return false;
      return mayReuseSlot(this.database.affinity(slotId), input.ownerKey);
    };

    if (!input.isolate) {
      // Vollständig identische Sessions dürfen ihre Slotzuordnung gemeinsam nutzen.
      const shared = this.findSharableSession(input.desired, input.sessionId, input.ownerKey);
      if (shared) return shared.map((binding) => ({ ...binding, sessionId: input.sessionId }));
    }

    const reserved = new Set<number>();
    const bindings: BindingRow[] = [];
    for (const item of input.desired) {
      let slotId: number | null = null;
      if (item.role === "primary" && input.requestedSlotId !== null) {
        const requested = this.definition(input.requestedSlotId).id;
        const slot = slots.find((candidate) => candidate.id === requested)!;
        const free = slot.targetPort === null || slot.targetPort === item.targetPort
          || input.previousBindings.some((old) => old.slotId === slot.id);
        if (!free || !usable(requested)) {
          throw new AppError(409, "PREVIEW_SLOT_CHANGED", "Der gewünschte Preview-Slot ist inzwischen belegt.");
        }
        slotId = requested;
      }
      slotId ??= input.previousBindings.find((old) => old.targetPort === item.targetPort && !reserved.has(old.slotId) && usable(old.slotId))?.slotId ?? null;
      // Nach Lease-Ablauf ohne Bindings gewinnt der ehemals eigene Slot: Die
      // Storage-Affinität bleibt bestehen, und der Nutzer erhält dieselbe
      // Slot-Origin (und damit dieselbe URL) zurück.
      slotId ??= slots.find((slot) => slot.targetPort === null && slot.state === "free" && !reserved.has(slot.id)
        && usable(slot.id) && this.database.affinity(slot.id)?.storageOwnerKey === input.ownerKey)?.id ?? null;
      slotId ??= slots.find((slot) => slot.targetPort === null && slot.state === "free" && !reserved.has(slot.id) && usable(slot.id))?.id ?? null;
      slotId ??= slots.find((slot) => !bound.has(slot.id) && !reserved.has(slot.id) && usable(slot.id))?.id ?? null;
      if (slotId === null) {
        const quarantined = slots.filter((slot) => slot.state === "quarantined").length;
        throw new AppError(409, "PREVIEW_SLOTS_EXHAUSTED",
          quarantined > 0
            ? `Für ${input.desired.length} verbundene Dienste sind nicht genügend Preview-Slots frei; ${quarantined} stehen in Quarantäne.`
            : `Für ${input.desired.length} verbundene Dienste sind nicht genügend Preview-Slots frei.`);
      }
      reserved.add(slotId);
      bindings.push({ sessionId: input.sessionId, slotId, ...item });
    }
    return bindings;
  }

  private findSharableSession(desired: DesiredBinding[], sessionId: string, ownerKey: string): BindingRow[] | null {
    for (const session of this.database.allSessions()) {
      if (session.id === sessionId) continue;
      const bindings = this.database.bindings(session.id);
      if (bindings.length !== desired.length) continue;
      const sameTargets = desired.every((item) => bindings.some((binding) =>
        binding.targetPort === item.targetPort
        && binding.targetProtocol === item.targetProtocol
        && binding.role === item.role
        && binding.label === item.label));
      if (!sameTargets) continue;
      if (!bindings.every((binding) => mayReuseSlot(this.database.affinity(binding.slotId), ownerKey))) continue;
      // Jede weitere Session an diesen Slots muss denselben Fingerprint besitzen,
      // sonst hätte dieselbe Origin zwei widersprüchliche Routingkontexte.
      const fingerprint = bindingFingerprint(bindings);
      const conflicting = bindings.some((binding) => this.database.sessionsForSlot(binding.slotId)
        .some((other) => other.id !== session.id && bindingFingerprint(this.database.bindings(other.id)) !== fingerprint));
      if (conflicting) continue;
      return bindings;
    }
    return null;
  }

  renewLease(userId: string, sessionId: string): PreviewSessionResponse {
    const session = this.database.sessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(404, "PREVIEW_SESSION_NOT_FOUND", "Diese Preview-Session gehört nicht zu deinem Benutzer.");
    }
    const leaseExpiresAt = new Date(Date.now() + leaseMilliseconds).toISOString();
    this.database.renewLease(sessionId, leaseExpiresAt);
    return this.sessionResponse({ ...session, leaseExpiresAt }, this.database.bindings(sessionId));
  }

  closeSessionById(userId: string, sessionId: string): void {
    const session = this.database.sessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(404, "PREVIEW_SESSION_NOT_FOUND", "Diese Preview-Session gehört nicht zu deinem Benutzer.");
    }
    this.database.transaction(() => {
      this.releaseUnusedSlots(this.database.deleteSession(sessionId));
      this.database.nextRoutingRevision();
    });
    this.publish();
  }

  closeSession(userId: string, sessionKey: string): void {
    const session = this.database.sessionByKey(userId, sessionKey);
    if (!session) return;
    this.closeSessionById(userId, session.id);
  }

  sessionsOf(userId: string): SessionRow[] {
    return this.database.allSessions().filter((session) => session.userId === userId);
  }

  assertSessionOwned(userId: string, sessionId: string): SessionRow {
    const session = this.database.sessionById(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(404, "PREVIEW_SESSION_NOT_FOUND", "Diese Preview-Session gehört nicht zu deinem Benutzer.");
    }
    return session;
  }

  assertSlotOwned(userId: string, slotId: number, storageProfileId?: string | null): SessionRow {
    const session = this.database.sessionsForSlot(slotId).find((candidate) => candidate.userId === userId);
    if (!session || (storageProfileId !== undefined && session.storageProfileId !== storageProfileId)) {
      throw new AppError(404, "PREVIEW_SLOT_NOT_FOUND", "Dieser Preview-Slot gehört nicht zu deinem Benutzer oder Storage-Profil.");
    }
    return session;
  }

  beginReclaim(): { slotId: number; nonce: string; affinity: ReturnType<PreviewResetService["affinity"]> } {
    const result = this.database.transaction(() => {
      this.releaseUnusedSlots(this.database.deleteExpiredSessions(new Date().toISOString()));
      const persisted = new Map(this.database.list().map((slot) => [slot.slotId, slot]));
      for (const definition of this.definitions) {
        const affinity = this.reset.affinity(definition.id);
        const targetPort = persisted.get(definition.id)?.targetPort ?? null;
        if (targetPort !== null || this.database.bindingCount(definition.id) > 0) continue;
        if (affinity.state !== "free" || affinity.storageOwnerKey === null) continue;
        const started = this.reset.begin(definition.id, affinity.generation, affinity.storageProfileId);
        return { slotId: definition.id, ...started };
      }
      throw new AppError(409, "PREVIEW_SLOTS_EXHAUSTED", "Es ist kein freier Preview-Slot verfügbar, der sicher zurückgesetzt werden kann.");
    });
    this.publish();
    return result;
  }

  assertResetVerificationAllowed(userId: string, slotId: number): void {
    if (this.database.sessionsForSlot(slotId).some((session) => session.userId === userId)) return;
    const affinity = this.database.affinity(slotId);
    if (this.database.bindingCount(slotId) === 0 && affinity?.state === "resetting") return;
    throw new AppError(404, "PREVIEW_SLOT_NOT_FOUND", "Dieser Preview-Slot gehört nicht zu deinem Benutzer oder einem laufenden Rücksetzvorgang.");
  }

  private sessionResponse(session: SessionRow, bindings: BindingRow[]): PreviewSessionResponse {
    const affinity = this.database.affinity(bindings.find((binding) => binding.role === "primary")?.slotId ?? bindings[0]!.slotId);
    return previewSessionResponseSchema.parse({
      id: session.id,
      sessionKey: session.sessionKey,
      projectId: session.projectId,
      primaryPort: session.primaryPort,
      leaseExpiresAt: session.leaseExpiresAt,
      routingRevision: this.database.routingRevision(),
      bridgeVersion: PREVIEW_BRIDGE_VERSION,
      capabilities: this.capabilities(),
      limitations: this.limitations(),
      storageProfileId: session.storageProfileId,
      slotGeneration: affinity?.generation ?? 0,
      bindings: bindings.map((binding) => ({
        role: binding.role,
        label: binding.label,
        targetPort: binding.targetPort,
        targetProtocol: binding.targetProtocol,
        slotId: binding.slotId,
        publicUrl: this.publicUrl(binding.slotId),
      })),
    });
  }

  // ── Listener ─────────────────────────────────────────────────────────────────

  async startListeners() {
    this.publish();
    await this.gateway.start();
  }

  async stopListeners() {
    await this.gateway.stop();
  }
}
