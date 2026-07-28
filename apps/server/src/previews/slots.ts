import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import replyFrom, { type FastifyReplyFromHooks } from "@fastify/reply-from";
import websocket from "@fastify/websocket";
import {
  previewSlotsResponseSchema,
  previewDependenciesResponseSchema,
  previewSessionResponseSchema,
  type PreviewDependency,
  type PreviewDependenciesResponse,
  type PreviewSessionRequest,
  type PreviewSessionResponse,
  type PreviewSlot,
  type PreviewSlotAssignmentRequest,
  type PreviewSlotsResponse,
} from "@workbench/contracts";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import WebSocket from "ws";
import { AppError } from "../utils/errors.js";

interface SlotRow {
  slotId: number;
  targetPort: number | null;
  updatedAt: string | null;
}

interface SessionRow {
  id: string;
  sessionKey: string;
  projectId: string | null;
  primaryPort: number;
  leaseExpiresAt: string;
}

interface BindingRow {
  sessionId: string;
  slotId: number;
  targetPort: number;
  targetProtocol: "http" | "https";
  role: "primary" | "dependency";
  label: string;
}

export interface PreviewSlotDefinition {
  id: number;
  internalPort: number;
  publicPort: number;
}

export class PreviewSlotDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS preview_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS preview_slots (
        slot_id INTEGER PRIMARY KEY,
        target_port INTEGER,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS preview_project_port_rules (
        project_id TEXT NOT NULL,
        primary_port INTEGER NOT NULL,
        dependency_port INTEGER NOT NULL,
        label TEXT NOT NULL,
        protocol TEXT NOT NULL CHECK(protocol IN ('auto','http','https')),
        enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, primary_port, dependency_port)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS preview_sessions (
        id TEXT PRIMARY KEY,
        session_key TEXT NOT NULL UNIQUE,
        project_id TEXT,
        primary_port INTEGER NOT NULL,
        lease_expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS preview_session_bindings (
        session_id TEXT NOT NULL REFERENCES preview_sessions(id) ON DELETE CASCADE,
        slot_id INTEGER NOT NULL,
        target_port INTEGER NOT NULL,
        target_protocol TEXT NOT NULL CHECK(target_protocol IN ('http','https')),
        role TEXT NOT NULL CHECK(role IN ('primary','dependency')),
        label TEXT NOT NULL,
        PRIMARY KEY(session_id, slot_id)
      ) STRICT;
      INSERT OR IGNORE INTO preview_schema_migrations(version, applied_at) VALUES (1, datetime('now'));
      INSERT OR IGNORE INTO preview_schema_migrations(version, applied_at) VALUES (2, datetime('now'));
    `);
  }

  close() {
    this.db.close();
  }

  list(): SlotRow[] {
    return this.db.prepare(`
      SELECT slot_id slotId, target_port targetPort, updated_at updatedAt
      FROM preview_slots
      ORDER BY slot_id
    `).all() as unknown as SlotRow[];
  }

  target(slotId: number): number | null {
    const row = this.db.prepare("SELECT target_port targetPort FROM preview_slots WHERE slot_id = ?")
      .get(slotId) as { targetPort: number | null } | undefined;
    return row?.targetPort ?? null;
  }

  assign(slotId: number, targetPort: number | null): string {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO preview_slots(slot_id, target_port, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(slot_id) DO UPDATE SET target_port=excluded.target_port, updated_at=excluded.updated_at
    `).run(slotId, targetPort, updatedAt);
    return updatedAt;
  }

  dependencies(projectId: string, primaryPort: number): PreviewDependency[] {
    return this.db.prepare(`SELECT dependency_port port, label, protocol, enabled
      FROM preview_project_port_rules WHERE project_id = ? AND primary_port = ? ORDER BY dependency_port`)
      .all(projectId, primaryPort).map((row) => ({ ...(row as object), enabled: Boolean((row as { enabled: number }).enabled) })) as PreviewDependency[];
  }

  saveDependencies(projectId: string, primaryPort: number, dependencies: PreviewDependency[]): void {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM preview_project_port_rules WHERE project_id = ? AND primary_port = ?").run(projectId, primaryPort);
      const insert = this.db.prepare(`INSERT INTO preview_project_port_rules
        (project_id, primary_port, dependency_port, label, protocol, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const item of dependencies) insert.run(projectId, primaryPort, item.port, item.label, item.protocol, item.enabled ? 1 : 0, now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  sessionByKey(sessionKey: string): SessionRow | null {
    return (this.db.prepare(`SELECT id, session_key sessionKey, project_id projectId, primary_port primaryPort,
      lease_expires_at leaseExpiresAt FROM preview_sessions WHERE session_key = ?`).get(sessionKey) as SessionRow | undefined) ?? null;
  }

  sessionForSlot(slotId: number): SessionRow | null {
    return (this.db.prepare(`SELECT s.id, s.session_key sessionKey, s.project_id projectId, s.primary_port primaryPort,
      s.lease_expires_at leaseExpiresAt FROM preview_sessions s JOIN preview_session_bindings b ON b.session_id=s.id
      WHERE b.slot_id = ? ORDER BY s.updated_at DESC LIMIT 1`).get(slotId) as SessionRow | undefined) ?? null;
  }

  bindings(sessionId: string): BindingRow[] {
    return this.db.prepare(`SELECT session_id sessionId, slot_id slotId, target_port targetPort,
      target_protocol targetProtocol, role, label FROM preview_session_bindings WHERE session_id = ? ORDER BY role DESC, slot_id`)
      .all(sessionId) as unknown as BindingRow[];
  }

  replaceSession(session: SessionRow, bindings: BindingRow[]): void {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO preview_sessions(id, session_key, project_id, primary_port, lease_expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(session_key) DO UPDATE SET project_id=excluded.project_id,
        primary_port=excluded.primary_port, lease_expires_at=excluded.lease_expires_at, updated_at=excluded.updated_at`)
        .run(session.id, session.sessionKey, session.projectId, session.primaryPort, session.leaseExpiresAt, now);
      this.db.prepare("DELETE FROM preview_session_bindings WHERE session_id = ?").run(session.id);
      const insert = this.db.prepare(`INSERT INTO preview_session_bindings
        (session_id, slot_id, target_port, target_protocol, role, label) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const item of bindings) insert.run(session.id, item.slotId, item.targetPort, item.targetProtocol, item.role, item.label);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  deleteSession(sessionKey: string): number[] {
    const session = this.sessionByKey(sessionKey);
    if (!session) return [];
    const slots = this.bindings(session.id).map((binding) => binding.slotId);
    this.db.prepare("DELETE FROM preview_session_bindings WHERE session_id = ?").run(session.id);
    this.db.prepare("DELETE FROM preview_sessions WHERE id = ?").run(session.id);
    return slots;
  }

  bindingCount(slotId: number): number {
    return (this.db.prepare("SELECT count(*) count FROM preview_session_bindings WHERE slot_id = ?")
      .get(slotId) as { count: number }).count;
  }

  deleteExpiredSessions(now: string): number[] {
    const rows = this.db.prepare(`SELECT DISTINCT b.slot_id slotId FROM preview_session_bindings b
      JOIN preview_sessions s ON s.id=b.session_id WHERE s.lease_expires_at < ?`).all(now) as unknown as Array<{ slotId: number }>;
    this.db.prepare("DELETE FROM preview_session_bindings WHERE session_id IN (SELECT id FROM preview_sessions WHERE lease_expires_at < ?)").run(now);
    this.db.prepare("DELETE FROM preview_sessions WHERE lease_expires_at < ?").run(now);
    return rows.map((row) => row.slotId);
  }
}

function closeCode(code: number): number {
  return code === 1005 || code === 1006 ? 1011 : code;
}

function proxyHeaders(request: FastifyRequest, targetPort: number, targetProtocol: "http" | "https", upstreamOrigin?: string) {
  const headers: Record<string, string | string[] | undefined> = {
    ...request.headers,
    host: `127.0.0.1:${targetPort}`,
    "x-forwarded-host": request.headers.host ?? "",
    "x-forwarded-proto": "https",
  };
  delete headers.connection;
  delete headers.upgrade;
  delete headers["content-length"];
  delete headers["sec-websocket-key"];
  delete headers["sec-websocket-version"];
  if (request.headers.origin) headers.origin = upstreamOrigin ?? `${targetProtocol}://127.0.0.1:${targetPort}`;
  return headers as Record<string, string>;
}

function rewritePublicLocation(value: string, mapping: Record<string, string>): string {
  try {
    const url = new URL(value);
    const localNames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
    const replacement = localNames.has(url.hostname) ? mapping[url.port] : undefined;
    if (!replacement) return value;
    const publicUrl = new URL(replacement);
    publicUrl.pathname = url.pathname;
    publicUrl.search = url.search;
    publicUrl.hash = url.hash;
    return publicUrl.href;
  } catch { return value; }
}

function embeddableResponseHeaders(headers: Record<string, string | string[] | undefined>) {
  const rewritten = { ...headers };
  delete rewritten["content-security-policy"];
  delete rewritten["content-security-policy-report-only"];
  delete rewritten["x-frame-options"];
  return rewritten;
}

function proxyWebSocket(source: WebSocket, request: FastifyRequest, targetPort: number, targetProtocol: "http" | "https", upstreamOrigin?: string) {
  const protocolHeader = request.headers["sec-websocket-protocol"];
  const protocols = typeof protocolHeader === "string"
    ? protocolHeader.split(",").map((protocol) => protocol.trim()).filter(Boolean)
    : [];
  const rawUrl = request.raw.url ?? request.url;
  const target = new WebSocket(`${targetProtocol === "https" ? "wss" : "ws"}://127.0.0.1:${targetPort}${rawUrl}`, protocols, {
    headers: proxyHeaders(request, targetPort, targetProtocol, upstreamOrigin),
    rejectUnauthorized: false,
  });
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  let pendingBytes = 0;
  const maximumPendingBytes = 512 * 1024;

  source.on("message", (data, binary) => {
    if (target.readyState === WebSocket.OPEN) {
      target.send(data, { binary });
      return;
    }
    if (target.readyState !== WebSocket.CONNECTING) return;
    pendingBytes += Array.isArray(data) ? data.reduce((sum, chunk) => sum + chunk.length, 0) : data.byteLength;
    if (pendingBytes > maximumPendingBytes) {
      source.close(1009, "Preview-WebSocket-Puffer überschritten");
      target.terminate();
      return;
    }
    pending.push({ data, binary });
  });
  target.on("open", () => {
    for (const message of pending.splice(0)) target.send(message.data, { binary: message.binary });
    pendingBytes = 0;
  });
  target.on("message", (data, binary) => {
    if (source.readyState === WebSocket.OPEN) source.send(data, { binary });
  });
  source.on("close", (code, reason) => {
    if (target.readyState === WebSocket.OPEN) target.close(closeCode(code), reason);
    else if (target.readyState === WebSocket.CONNECTING) target.terminate();
  });
  target.on("close", (code, reason) => {
    if (source.readyState === WebSocket.OPEN) source.close(closeCode(code), reason);
  });
  source.on("error", () => target.terminate());
  target.on("error", () => {
    if (source.readyState === WebSocket.OPEN) source.close(1011, "Preview-Devserver nicht erreichbar");
  });
}

// Diese Funktion wird als Quelltext in eine fremde Browser-Seite injiziert. Die
// dortigen Konstruktoren sind absichtlich dynamisch und nicht Node-typisierbar.
/* eslint-disable @typescript-eslint/no-explicit-any */
function previewBridge(mapping: Record<string, string>) {
  const scope = globalThis as any;
  const rewrite = (value: any): string => {
    try {
      const url = new scope.URL(String(value), scope.location.href);
      const localNames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", scope.location.hostname]);
      const replacement = localNames.has(url.hostname) ? mapping[url.port] : undefined;
      if (!replacement) return String(value);
      const base = new scope.URL(replacement);
      base.pathname = url.pathname;
      base.search = url.search;
      base.hash = url.hash;
      if (url.protocol === "ws:" || url.protocol === "wss:") base.protocol = "wss:";
      return base.href;
    } catch { return String(value); }
  };
  const nativeFetch = scope.fetch.bind(scope);
  scope.fetch = ((input: any, init?: any) => {
    if (input instanceof scope.Request) return nativeFetch(new scope.Request(rewrite(input.url), input), init);
    return nativeFetch(rewrite(input), init);
  });
  const nativeOpen = scope.XMLHttpRequest.prototype.open;
  scope.XMLHttpRequest.prototype.open = function(method: string, url: any, ...rest: any[]) {
    return nativeOpen.call(this, method, rewrite(url), ...rest);
  };
  const NativeWebSocket = scope.WebSocket;
  scope.WebSocket = class extends NativeWebSocket { constructor(url: any, protocols?: any) { super(rewrite(url), protocols); } };
  const NativeEventSource = scope.EventSource;
  if (NativeEventSource) scope.EventSource = class extends NativeEventSource { constructor(url: any, options?: any) { super(rewrite(url), options); } };
  const nativeBeacon = scope.navigator.sendBeacon?.bind(scope.navigator);
  if (nativeBeacon) scope.navigator.sendBeacon = (url: any, data: any) => nativeBeacon(rewrite(url), data);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class PreviewSlotService {
  private readonly definitions: PreviewSlotDefinition[];
  private readonly database: PreviewSlotDatabase;
  private readonly hostname: string;
  private readonly forbiddenTargetPorts: Set<number>;
  private readonly listeners: FastifyInstance[] = [];

  constructor(options: {
    database: PreviewSlotDatabase;
    slotPorts: number[];
    publicPorts: number[];
    hostname: string;
    forbiddenTargetPorts?: number[];
  }) {
    this.database = options.database;
    this.hostname = options.hostname;
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
  }

  private definition(slotId: number): PreviewSlotDefinition {
    const found = this.definitions.find((slot) => slot.id === slotId);
    if (!found) throw new AppError(404, "PREVIEW_SLOT_NOT_FOUND", "Dieser Preview-Slot ist nicht konfiguriert.");
    return found;
  }

  list(assignedSlotId: number | null = null): PreviewSlotsResponse {
    const persisted = new Map(this.database.list().map((slot) => [slot.slotId, slot]));
    const slots: PreviewSlot[] = this.definitions.map((definition) => {
      const stored = persisted.get(definition.id);
      return {
        ...definition,
        targetPort: stored?.targetPort ?? null,
        publicUrl: `https://${this.hostname}:${definition.publicPort}/`,
        updatedAt: stored?.updatedAt ?? null,
      };
    });
    return previewSlotsResponseSchema.parse({ slots, assignedSlotId });
  }

  assign(input: PreviewSlotAssignmentRequest): PreviewSlotsResponse {
    if (input.targetPort === null) {
      const slotId = input.slotId!;
      this.definition(slotId);
      const currentTarget = this.database.target(slotId);
      if (input.expectedTargetPort !== undefined && currentTarget !== input.expectedTargetPort) {
        throw new AppError(409, "PREVIEW_SLOT_CHANGED", "Der Preview-Slot wurde inzwischen einem anderen Ziel zugewiesen.");
      }
      if (this.database.bindingCount(slotId) > 0) return this.list(slotId);
      this.database.assign(slotId, null);
      return this.list(slotId);
    }

    if (this.forbiddenTargetPorts.has(input.targetPort)) {
      throw new AppError(400, "PREVIEW_TARGET_FORBIDDEN", "Infrastrukturports dürfen nicht als Preview-Ziel verwendet werden.");
    }
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
      slotId = current.find((slot) => slot.targetPort === input.targetPort)?.id ?? null;
    }
    slotId ??= current.find((slot) => slot.targetPort === null)?.id ?? null;
    if (slotId === null) {
      throw new AppError(409, "PREVIEW_SLOTS_EXHAUSTED", "Alle Preview-Slots sind belegt. Gib einen Slot frei oder teile eine bestehende Session.");
    }
    this.database.assign(slotId, input.targetPort);
    return this.list(slotId);
  }

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
    return this.dependencies(projectId, primaryPort);
  }

  private releaseUnusedSlots(slotIds: number[]) {
    for (const slotId of new Set(slotIds)) if (this.database.bindingCount(slotId) === 0) this.database.assign(slotId, null);
  }

  openSession(input: PreviewSessionRequest): PreviewSessionResponse {
    this.releaseUnusedSlots(this.database.deleteExpiredSessions(new Date().toISOString()));
    if (this.forbiddenTargetPorts.has(input.primaryPort)) throw new AppError(400, "PREVIEW_TARGET_FORBIDDEN", "Infrastrukturports dürfen nicht als Preview-Ziel verwendet werden.");
    const previous = this.database.sessionByKey(input.sessionKey);
    const previousBindings = previous ? this.database.bindings(previous.id) : [];
    const dependencies = input.projectId ? this.database.dependencies(input.projectId, input.primaryPort).filter((item) => item.enabled) : [];
    const desired = [
      { targetPort: input.primaryPort, targetProtocol: input.primaryProtocol, role: "primary" as const, label: "Hauptdienst" },
      ...dependencies.map((item) => ({ targetPort: item.port, targetProtocol: item.protocol === "https" ? "https" as const : "http" as const, role: "dependency" as const, label: item.label })),
    ];
    const current = this.list().slots;
    const reserved = new Set<number>();
    const bindings: BindingRow[] = [];
    const sessionId = previous?.id ?? randomUUID();
    for (const item of desired) {
      let slotId: number | null = null;
      if (item.role === "primary" && input.requestedSlotId != null) {
        const slot = current.find((candidate) => candidate.id === this.definition(input.requestedSlotId!).id)!;
        if (slot.targetPort === null || slot.targetPort === item.targetPort || previousBindings.some((old) => old.slotId === slot.id)) slotId = slot.id;
        else throw new AppError(409, "PREVIEW_SLOT_CHANGED", "Der gewünschte Preview-Slot ist inzwischen belegt.");
      }
      slotId ??= previousBindings.find((old) => old.targetPort === item.targetPort && !reserved.has(old.slotId))?.slotId ?? null;
      if (!input.isolate) slotId ??= current.find((slot) => slot.targetPort === item.targetPort && !reserved.has(slot.id))?.id ?? null;
      slotId ??= current.find((slot) => slot.targetPort === null && !reserved.has(slot.id))?.id ?? null;
      if (slotId === null) throw new AppError(409, "PREVIEW_SLOTS_EXHAUSTED", `Für ${desired.length} verbundene Dienste sind nicht genügend Preview-Slots frei.`);
      reserved.add(slotId);
      bindings.push({ sessionId, slotId, ...item });
    }
    const leaseExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const session = { id: sessionId, sessionKey: input.sessionKey, projectId: input.projectId, primaryPort: input.primaryPort, leaseExpiresAt };
    this.database.replaceSession(session, bindings);
    for (const binding of bindings) this.database.assign(binding.slotId, binding.targetPort);
    this.releaseUnusedSlots(previousBindings.filter((old) => !reserved.has(old.slotId)).map((old) => old.slotId));
    return this.sessionResponse(session, bindings);
  }

  closeSession(sessionKey: string): void {
    this.releaseUnusedSlots(this.database.deleteSession(sessionKey));
  }

  private sessionResponse(session: SessionRow, bindings: BindingRow[]): PreviewSessionResponse {
    const slots = this.list().slots;
    return previewSessionResponseSchema.parse({ ...session, bindings: bindings.map((binding) => ({ ...binding, publicUrl: slots.find((slot) => slot.id === binding.slotId)!.publicUrl })) });
  }

  private bridgeForSlot(slotId: number): string | null {
    const session = this.database.sessionForSlot(slotId);
    if (!session) return null;
    const bindings = this.database.bindings(session.id);
    if (!bindings.some((binding) => binding.slotId === slotId && binding.role === "primary") || bindings.length < 2) return null;
    const slots = this.list().slots;
    const mapping = Object.fromEntries(bindings.map((binding) => [String(binding.targetPort), slots.find((slot) => slot.id === binding.slotId)!.publicUrl]));
    return `<script data-workbench-preview-bridge>(${previewBridge.toString()})(${JSON.stringify(mapping)});</script>`;
  }

  private sessionContext(slotId: number) {
    const session = this.database.sessionForSlot(slotId);
    if (!session) return null;
    const bindings = this.database.bindings(session.id);
    const current = bindings.find((binding) => binding.slotId === slotId);
    const primary = bindings.find((binding) => binding.role === "primary");
    if (!current || !primary) return null;
    const slots = this.list().slots;
    return {
      current,
      primary,
      mapping: Object.fromEntries(bindings.map((binding) => [String(binding.targetPort), slots.find((slot) => slot.id === binding.slotId)!.publicUrl])),
    };
  }

  private async createListener(definition: PreviewSlotDefinition): Promise<FastifyInstance> {
    const listener = Fastify({ logger: false, trustProxy: ["127.0.0.1", "::1"] });
    await listener.register(replyFrom);
    await listener.register(websocket);
    const resolveTarget = () => {
      const targetPort = this.database.target(definition.id);
      if (targetPort === null) throw new AppError(503, "PREVIEW_SLOT_UNASSIGNED", "Dieser Preview-Slot ist noch keinem Devserver zugewiesen.");
      const session = this.database.sessionForSlot(definition.id);
      const protocol = session ? this.database.bindings(session.id).find((binding) => binding.slotId === definition.id)?.targetProtocol ?? "http" : "http";
      return { port: targetPort, protocol };
    };
    const proxyHttp = (request: FastifyRequest, reply: FastifyReply) => {
      const target = resolveTarget();
      const bridge = this.bridgeForSlot(definition.id);
      const context = this.sessionContext(definition.id);
      reply.removeHeader("content-security-policy");
      reply.removeHeader("x-frame-options");
      const proxyOptions: FastifyReplyFromHooks = {
        rewriteRequestHeaders: () => {
          const primaryOrigin = context?.current.role === "dependency"
            ? `${context.primary.targetProtocol}://127.0.0.1:${context.primary.targetPort}`
            : undefined;
          const headers = proxyHeaders(request, target.port, target.protocol, primaryOrigin);
          if (bridge) delete headers["accept-encoding"];
          return headers;
        },
        rewriteHeaders: (headers) => {
          const rewritten = embeddableResponseHeaders(headers as Record<string, string | string[] | undefined>);
          if (bridge && String(rewritten["content-type"] ?? "").includes("text/html")) {
            delete rewritten["content-length"];
            delete rewritten["content-encoding"];
          }
          const location = rewritten.location;
          if (context && typeof location === "string") rewritten.location = rewritePublicLocation(location, context.mapping);
          if (context?.current.role === "dependency" && request.headers.origin) {
            rewritten["access-control-allow-origin"] = request.headers.origin;
            rewritten["access-control-allow-credentials"] = "true";
            const vary = String(rewritten.vary ?? "");
            rewritten.vary = vary.split(",").map((item) => item.trim().toLowerCase()).includes("origin") ? vary : [vary, "Origin"].filter(Boolean).join(", ");
          }
          return rewritten;
        },
        ...(bridge ? { onResponse: async (_request, responseReply, response) => {
          const upstream = response as unknown as { headers: Record<string, string | string[] | undefined>; stream: NodeJS.ReadableStream & AsyncIterable<unknown> };
          if (!String(upstream.headers["content-type"] ?? "").includes("text/html")) return responseReply.send(upstream.stream);
          const chunks: Buffer[] = [];
          for await (const chunk of upstream.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(typeof chunk === "string" ? chunk : chunk as unknown as Uint8Array));
          const html = Buffer.concat(chunks).toString("utf8");
          const injected = /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (tag) => `${tag}${bridge}`) : `${bridge}${html}`;
          return responseReply.send(injected);
        } } : {}),
        timeout: 30_000,
      };
      return reply.from(`${target.protocol}://127.0.0.1:${target.port}${request.raw.url ?? request.url}`, proxyOptions);
    };
    for (const url of ["/", "/*"]) {
      listener.route({
        method: "GET",
        url,
        config: { rateLimit: false },
        helmet: false,
        handler: proxyHttp,
        wsHandler: (socket, request) => {
          const target = resolveTarget();
          const context = this.sessionContext(definition.id);
          const primaryOrigin = context?.current.role === "dependency" ? `${context.primary.targetProtocol}://127.0.0.1:${context.primary.targetPort}` : undefined;
          proxyWebSocket(socket, request, target.port, target.protocol, primaryOrigin);
        },
      });
      listener.route({
        method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"],
        url,
        config: { rateLimit: false },
        helmet: false,
        handler: proxyHttp,
      });
    }
    await listener.listen({ host: "127.0.0.1", port: definition.internalPort });
    return listener;
  }

  async startListeners() {
    if (this.listeners.length > 0) return;
    try {
      for (const definition of this.definitions) {
        this.listeners.push(await this.createListener(definition));
      }
    } catch (error) {
      await this.stopListeners();
      throw error;
    }
  }

  async stopListeners() {
    const listeners = this.listeners.splice(0);
    await Promise.allSettled(listeners.map((listener) => listener.close()));
  }
}
