import { chmodSync, createReadStream, createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { appendFile, chmod, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";
import { gunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PREVIEW_DIAGNOSTIC_LIMITS,
  previewDiagnosticEventSchema,
  type PreviewCaptureSession,
  type PreviewDiagnosticEvent,
  type PreviewDiagnosticSeverity,
} from "@workbench/contracts";
import type { PreviewSecrets } from "./keys.js";

/** Header, deren Werte niemals in Diagnose oder Logs auftauchen. */
const alwaysRedactedHeaders = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "x-csrf-token",
  "x-session-token",
]);

const secretQueryParameters = /^(token|access_token|refresh_token|id_token|api[-_]?key|secret|password|code|session|auth)$/i;
const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Erfasst „Authorization: Bearer x", „token=abc" und „secret: y" gleichermaßen.
const bearerPattern = /\b(authorization|proxy-authorization|bearer|token|secret|password|api[-_]?key)\b\s*[:=]?\s*(bearer\s+)?\S+/gi;

/** Entfernt Zugangsdaten aus einer URL und maskiert bekannte Secret-Parameter. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value, "http://placeholder.invalid");
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (secretQueryParameters.test(key)) url.searchParams.set(key, "[redigiert]");
    }
    return url.host === "placeholder.invalid" ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return value.replace(/\/\/[^/@]*@/, "//");
  }
}

export function redactText(value: string): string {
  return value
    .replace(emailPattern, "[e-mail]")
    .replace(bearerPattern, (_match, keyword: string) => `${keyword}=[redigiert]`);
}

/** Redigiert strukturierte Metadaten rekursiv und begrenzt ihre Größe. */
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (typeof value === "string") return redactText(value.length > 4_096 ? `${value.slice(0, 4_096)}…` : value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactMetadata(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    let count = 0;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (count >= 100) break;
      count += 1;
      if (alwaysRedactedHeaders.has(key.toLowerCase())) {
        result[key] = "[redigiert]";
        continue;
      }
      // Request- und Response-Bodies gehören standardmäßig nie in die Diagnose.
      if (/^(body|requestBody|responseBody|payload)$/i.test(key)) {
        result[key] = "[nicht erfasst]";
        continue;
      }
      result[key] = redactMetadata(entry, depth + 1);
    }
    return result;
  }
  return undefined;
}

export function redactEvent(event: PreviewDiagnosticEvent): PreviewDiagnosticEvent {
  return {
    ...event,
    message: redactText(event.message),
    route: event.route === null ? null : redactUrl(event.route),
    metadata: (redactMetadata(event.metadata) ?? {}) as Record<string, unknown>,
  };
}

const severityRank: Record<PreviewDiagnosticSeverity, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const gunzipAsync = promisify(gunzip);

export interface DiagnosticsOptions {
  directory: string;
  secrets: PreviewSecrets;
  retentionDays: number;
  maxEventBytes: number;
  maxDailyBytes?: number;
  maxTotalBytes?: number;
  enabled: boolean;
}

interface LogIndex {
  updatedAt: string;
  days: Array<{ day: string; file: string; events: number; bytes: number; compressed: boolean }>;
  dropped: number;
}

/**
 * Quelle der Wahrheit für persistierte Diagnose sind redigierte JSONL-Dateien.
 * Der Client hält zusätzlich einen Ringpuffer; es gibt bewusst keine
 * Diagnosetabelle in SQLite.
 */
export class PreviewDiagnosticsService {
  private readonly options: DiagnosticsOptions;
  private readonly recent: Array<{ event: PreviewDiagnosticEvent; user: string }> = [];
  private readonly captureSessions = new Map<string, PreviewCaptureSession>();
  private readonly captureOwners = new Map<string, string>();
  private readonly queue: Array<{ day: string; line: string; bytes: number }> = [];
  private readonly reservedDailyBytes = new Map<string, number>();
  private index: LogIndex;
  private reservedTotalBytes = 0;
  private flushScheduled = false;
  private ioTail: Promise<void> = Promise.resolve();
  private dropped = 0;

  constructor(options: DiagnosticsOptions) {
    this.options = { maxDailyBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024, ...options };
    if (this.options.enabled) {
      mkdirSync(this.options.directory, { recursive: true, mode: 0o700 });
      chmodSync(this.options.directory, 0o700);
    }
    this.index = this.readIndex();
    this.dropped = this.index.dropped;
    for (const day of this.index.days) {
      this.reservedDailyBytes.set(day.day, (this.reservedDailyBytes.get(day.day) ?? 0) + day.bytes);
      this.reservedTotalBytes += day.bytes;
    }
  }

  private dayKey(at: string): string {
    return new Date(at).toISOString().slice(0, 10);
  }

  private filePath(day: string): string {
    return join(this.options.directory, `${day}.jsonl`);
  }

  private indexPath(): string {
    return join(this.options.directory, "index.json");
  }

  private readIndex(): LogIndex {
    try {
      return JSON.parse(readFileSync(this.indexPath(), "utf8")) as LogIndex;
    } catch {
      return { updatedAt: new Date().toISOString(), days: [], dropped: 0 };
    }
  }

  /** Tauscht `index.json` atomar aus. */
  private async writeIndex() {
    this.index.updatedAt = new Date().toISOString();
    this.index.dropped = this.dropped;
    const temporary = `${this.indexPath()}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.index, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.indexPath());
  }

  /**
   * Nimmt bereits validierte Events entgegen, redigiert sie und schreibt sie in
   * das Tageslog. Persistenzfehler blockieren die Preview nie.
   */
  record(events: PreviewDiagnosticEvent[], context: { userId: string; dropped?: number }): { stored: number; dropped: number } {
    if (!this.options.enabled) return { stored: 0, dropped: events.length };
    this.dropped += context.dropped ?? 0;
    let stored = 0;
    for (const event of events) {
      const redacted = redactEvent(event);
      this.recent.push({ event: redacted, user: this.options.secrets.pseudonym(context.userId) });
      if (this.recent.length > PREVIEW_DIAGNOSTIC_LIMITS.clientRingBuffer) this.recent.shift();
      const line = `${JSON.stringify({
        ...redacted,
        // Persistierte Logs kennen nur ein stabiles Pseudonym, nie die echte Identität.
        user: this.options.secrets.pseudonym(context.userId),
      })}\n`;
      const bytes = Buffer.byteLength(line);
      const day = this.dayKey(redacted.at);
      const dailyBytes = this.reservedDailyBytes.get(day) ?? 0;
      if (
        bytes > this.options.maxEventBytes
        || dailyBytes + bytes > this.options.maxDailyBytes!
        || this.reservedTotalBytes + bytes > this.options.maxTotalBytes!
        || this.queue.length >= PREVIEW_DIAGNOSTIC_LIMITS.clientRingBuffer
      ) {
        this.dropped += 1;
        continue;
      }
      this.queue.push({ day, line, bytes });
      this.reservedDailyBytes.set(day, dailyBytes + bytes);
      this.reservedTotalBytes += bytes;
      const indexed = this.index.days.find((entry) => entry.day === day);
      if (indexed) {
        indexed.bytes += bytes;
        indexed.events += 1;
      } else {
        this.index.days.push({ day, file: `${day}.jsonl`, events: 1, bytes, compressed: false });
        this.index.days.sort((left, right) => left.day.localeCompare(right.day));
      }
      stored += 1;
    }
    this.scheduleFlush();
    return { stored, dropped: this.dropped };
  }

  private scheduleFlush() {
    if (this.flushScheduled || this.queue.length === 0) return;
    this.flushScheduled = true;
    setImmediate(() => { void this.flush(); });
  }

  private serializeIo(operation: () => Promise<void>): Promise<void> {
    const next = this.ioTail.then(operation, operation);
    this.ioTail = next.catch(() => undefined);
    return next;
  }

  /** Schreibt die bounded Queue gebündelt und außerhalb des Request-Callstacks. */
  async flush(): Promise<void> {
    this.flushScheduled = false;
    const pending = this.queue.splice(0);
    if (pending.length === 0) {
      await this.ioTail;
      return;
    }
    await this.serializeIo(async () => {
      const byDay = new Map<string, typeof pending>();
      for (const item of pending) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
      for (const [day, items] of byDay) {
        try {
          const path = this.filePath(day);
          await appendFile(path, items.map((item) => item.line).join(""), { encoding: "utf8", mode: 0o600 });
          await chmod(path, 0o600);
        } catch {
          const failedBytes = items.reduce((sum, item) => sum + item.bytes, 0);
          this.dropped += items.length;
          this.reservedTotalBytes -= failedBytes;
          this.reservedDailyBytes.set(day, Math.max(0, (this.reservedDailyBytes.get(day) ?? 0) - failedBytes));
          const indexed = this.index.days.find((entry) => entry.day === day);
          if (indexed) {
            indexed.bytes = Math.max(0, indexed.bytes - failedBytes);
            indexed.events = Math.max(0, indexed.events - items.length);
            if (indexed.events === 0) this.index.days = this.index.days.filter((entry) => entry !== indexed);
          }
        }
      }
      await this.writeIndex();
    });
    if (this.queue.length > 0) this.scheduleFlush();
  }

  /** Nimmt ein Gateway-Ereignis auf und ergänzt die fehlenden Pflichtfelder. */
  recordGateway(event: {
    slotId: number;
    sessionId: string | null;
    routingRevision: number;
    category: PreviewDiagnosticEvent["category"];
    severity: PreviewDiagnosticSeverity;
    message: string;
    route: string | null;
    metadata: Record<string, unknown>;
  }, userId: string) {
    this.record([previewDiagnosticEventSchema.parse({
      id: randomUUID(),
      at: new Date().toISOString(),
      source: "gateway",
      category: event.category,
      severity: event.severity,
      completeness: "partial",
      slotId: event.slotId,
      sessionId: event.sessionId,
      routingRevision: event.routingRevision,
      route: event.route,
      message: event.message,
      metadata: event.metadata,
    })], { userId });
  }

  list(filter: { previewNodeId?: string | null; since?: string; severity?: PreviewDiagnosticSeverity; limit?: number }, userId: string | null = null): {
    events: PreviewDiagnosticEvent[];
    dropped: number;
    truncated: boolean;
  } {
    const minimumRank = severityRank[filter.severity ?? "debug"];
    const since = filter.since ? Date.parse(filter.since) : 0;
    const user = userId === null ? null : this.options.secrets.pseudonym(userId);
    const matching = this.recent.filter((entry) =>
      (user === null || entry.user === user)
      && (!filter.previewNodeId || entry.event.previewNodeId === filter.previewNodeId)
      && severityRank[entry.event.severity] >= minimumRank
      && (!since || Date.parse(entry.event.at) >= since))
      .map((entry) => entry.event);
    const limit = filter.limit ?? 500;
    return { events: matching.slice(-limit), dropped: this.dropped, truncated: matching.length > limit };
  }

  /** Liest redigierte Zeilen aus den Tagesdateien; maximal sieben Tage. */
  async readLog(filter: { since: string; previewNodeId?: string | null; severity?: PreviewDiagnosticSeverity; limit?: number }, userId: string | null = null): Promise<PreviewDiagnosticEvent[]> {
    if (!this.options.enabled) return [];
    await this.flush();
    const sinceMs = Date.parse(filter.since);
    const oldest = Date.now() - this.options.retentionDays * 86_400_000;
    const from = Math.max(Number.isFinite(sinceMs) ? sinceMs : oldest, oldest);
    const minimumRank = severityRank[filter.severity ?? "debug"];
    const results: PreviewDiagnosticEvent[] = [];
    const limit = filter.limit ?? 500;
    const user = userId === null ? null : this.options.secrets.pseudonym(userId);
    for (const entry of this.index.days) {
      if (entry.day < new Date(from).toISOString().slice(0, 10)) continue;
      const path = join(this.options.directory, entry.file);
      let contents: string;
      try {
        const raw = await readFile(path);
        contents = entry.compressed ? (await gunzipAsync(raw)).toString("utf8") : raw.toString("utf8");
      } catch {
        continue;
      }
      for (const line of contents.split("\n")) {
        if (!line.trim()) continue;
        let raw: unknown;
        try {
          raw = JSON.parse(line);
        } catch {
          continue;
        }
        if (user !== null && (!raw || typeof raw !== "object" || (raw as { user?: unknown }).user !== user)) continue;
        const parsed = previewDiagnosticEventSchema.safeParse(raw);
        if (!parsed.success) continue;
        const event = parsed.data;
        if (Date.parse(event.at) < from) continue;
        if (filter.previewNodeId && event.previewNodeId !== filter.previewNodeId) continue;
        if (severityRank[event.severity] < minimumRank) continue;
        results.push(event);
        if (results.length >= limit) return results;
      }
    }
    return results;
  }

  /** Komprimiert abgeschlossene Tage und entfernt alles jenseits der Aufbewahrung. */
  async rotate(now = new Date()): Promise<void> {
    if (!this.options.enabled) return;
    await this.flush();
    await this.serializeIo(async () => {
    const today = now.toISOString().slice(0, 10);
    const oldest = new Date(now.getTime() - this.options.retentionDays * 86_400_000).toISOString().slice(0, 10);
    for (const name of await readdir(this.options.directory)) {
      const match = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/.exec(name);
      if (!match) continue;
      const day = match[1]!;
      const path = join(this.options.directory, name);
      if (day < oldest) {
        await rm(path, { force: true });
        continue;
      }
      if (day < today && !name.endsWith(".gz")) {
        await pipeline(createReadStream(path), createGzip(), createWriteStream(`${path}.gz`, { mode: 0o600 }));
        await chmod(`${path}.gz`, 0o600);
        await rm(path, { force: true });
      }
    }
    await this.rebuildIndex();
    // Die Gesamtquote ist eine harte Obergrenze. Falls alte Logs aus einer
    // früheren, großzügigeren Konfiguration stammen, werden die ältesten zuerst entfernt.
    while (this.reservedTotalBytes > this.options.maxTotalBytes! && this.index.days.length > 1) {
      const oldestEntry = this.index.days[0]!;
      await rm(join(this.options.directory, oldestEntry.file), { force: true });
      this.dropped += oldestEntry.events;
      await this.rebuildIndex();
    }
    await this.writeIndex();
    });
  }

  private async rebuildIndex() {
    const previous = new Map(this.index.days.map((entry) => [entry.day, entry.events]));
    const next: LogIndex["days"] = [];
    this.reservedDailyBytes.clear();
    this.reservedTotalBytes = 0;
    for (const name of await readdir(this.options.directory)) {
      const match = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/.exec(name);
      if (!match) continue;
      const info = await stat(join(this.options.directory, name));
      const day = match[1]!;
      next.push({ day, file: name, events: previous.get(day) ?? 0, bytes: info.size, compressed: name.endsWith(".gz") });
      this.reservedDailyBytes.set(day, info.size);
      this.reservedTotalBytes += info.size;
    }
    next.sort((left, right) => left.day.localeCompare(right.day));
    this.index.days = next;
  }

  // ── Zeitlich begrenzte Rohdiagnose ───────────────────────────────────────────

  startCapture(previewNodeId: string, durationMinutes: number, userId?: string): PreviewCaptureSession {
    this.cleanupCaptures();
    const startedAt = new Date();
    const session: PreviewCaptureSession = {
      id: randomUUID(),
      previewNodeId,
      startedAt: startedAt.toISOString(),
      expiresAt: new Date(startedAt.getTime() + Math.min(durationMinutes, 15) * 60_000).toISOString(),
      active: true,
    };
    this.captureSessions.set(session.id, session);
    if (userId) this.captureOwners.set(session.id, userId);
    return session;
  }

  stopCapture(id: string, userId?: string): PreviewCaptureSession | null {
    if (userId && this.captureOwners.get(id) !== userId) return null;
    const session = this.captureSessions.get(id);
    if (!session) return null;
    const stopped = { ...session, active: false, expiresAt: new Date().toISOString() };
    this.captureSessions.delete(id);
    this.captureOwners.delete(id);
    return stopped;
  }

  activeCapture(previewNodeId: string): PreviewCaptureSession | null {
    this.cleanupCaptures();
    const now = Date.now();
    for (const session of this.captureSessions.values()) {
      if (session.previewNodeId === previewNodeId && session.active && Date.parse(session.expiresAt) > now) return session;
    }
    return null;
  }

  private cleanupCaptures() {
    const now = Date.now();
    for (const [id, session] of this.captureSessions) {
      if (!session.active || Date.parse(session.expiresAt) <= now) {
        this.captureSessions.delete(id);
        this.captureOwners.delete(id);
      }
    }
    while (this.captureSessions.size >= 100) {
      const oldest = this.captureSessions.keys().next().value as string | undefined;
      if (!oldest) break;
      this.captureSessions.delete(oldest);
      this.captureOwners.delete(oldest);
    }
  }

  retentionDays() { return this.options.retentionDays; }

  async close() {
    await this.flush();
    await this.ioTail;
  }
}
