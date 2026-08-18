import { globSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { NotificationDatabase } from "./database.js";

interface CursorState { opencodeRowId: number; codexOffsets: Record<string, number> }
interface OpenCodeEvent { rowId: number; aggregateId: string; data: string }
interface OpenCodeSession { id: string; directory: string; title: string; timeCreated: number }
interface T3SessionMarker { title: string; directory: string | null }

function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" ? value as Record<string, unknown> : null; }
function json(value: string): Record<string, unknown> | null { try { return object(JSON.parse(value)); } catch { return null; } }
function nested(value: unknown, key: string): unknown { return object(value)?.[key]; }
function text(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function normalized(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
function sessionMarkerKey(title: string, directory: string | null): string {
  return `${normalized(directory)}\u0000${normalized(title)}`;
}
function projectLabel(directory: string): string { return basename(directory) || directory; }
function isT3OpenCodeSession(session: OpenCodeSession, t3Sessions: ReadonlySet<string>): boolean {
  return /^t3 code(?:\s|$)/i.test(session.title.trim()) || t3Sessions.has(sessionMarkerKey(session.title, session.directory));
}

/** Liest ausschließlich neue Abschlussereignisse aus den lokalen CLI-Verläufen. */
export class AgentSessionSync {
  private timer: NodeJS.Timeout | null = null;
  private state: CursorState = { opencodeRowId: 0, codexOffsets: {} };
  private initialized = false;

  constructor(private readonly options: {
    opencodeDatabasePath: string; t3DatabasePath: string; codexSessionsPath: string; cursorPath: string;
    notifications: NotificationDatabase; pollSeconds: number; completionMinimumSeconds: number;
  }) { this.load(); }

  start(): void {
    if (this.timer) return;
    this.poll(this.initialized); this.initialized = true;
    this.timer = setInterval(() => this.poll(true), this.options.pollSeconds * 1_000); this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.save(); }
  private load(): void {
    try {
      const value = JSON.parse(readFileSync(this.options.cursorPath, "utf8")) as Partial<CursorState>;
      this.state = { opencodeRowId: typeof value.opencodeRowId === "number" ? value.opencodeRowId : 0, codexOffsets: value.codexOffsets ?? {} };
      this.initialized = true;
    } catch { /* Der erste Lauf setzt nur eine Baseline. */ }
  }
  private save(): void { try { mkdirSync(dirname(this.options.cursorPath), { recursive: true }); writeFileSync(this.options.cursorPath, JSON.stringify(this.state), { mode: 0o600 }); } catch { /* Best Effort. */ } }
  private poll(emit: boolean): void { this.pollOpenCode(emit); this.pollCodex(emit); this.save(); }

  private pollOpenCode(emit: boolean): void {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.options.opencodeDatabasePath, { readOnly: true }); db.exec("PRAGMA busy_timeout=1000");
      const t3Sessions = this.t3SessionMarkers();
      const maximum = Number((db.prepare("SELECT COALESCE(MAX(rowid), 0) value FROM event").get() as { value: number }).value);
      if (!emit) { this.state.opencodeRowId = maximum; return; }
      const events = db.prepare(`SELECT rowid rowId, aggregate_id aggregateId, data FROM event
        WHERE rowid > ? AND type = 'message.updated.1' ORDER BY rowid LIMIT 500`).all(this.state.opencodeRowId) as unknown as OpenCodeEvent[];
      for (const event of events) {
        this.state.opencodeRowId = Math.max(this.state.opencodeRowId, event.rowId);
        const payload = json(event.data); const info = nested(payload, "info"); const time = nested(info, "time");
        if (nested(info, "role") !== "assistant" || number(nested(time, "completed")) === null) continue;
        const session = db.prepare("SELECT id, directory, title, time_created timeCreated FROM session WHERE id = ?").get(event.aggregateId) as OpenCodeSession | undefined;
        if (!session || isT3OpenCodeSession(session, t3Sessions)) continue;
        const messageId = text(nested(info, "id")) ?? String(event.rowId);
        const created = number(nested(time, "created")) ?? session.timeCreated; const completed = number(nested(time, "completed"))!;
        const durationSeconds = Math.max(0, Math.round((completed - created) / 1_000));
        const parts = db.prepare("SELECT data FROM part WHERE message_id = ?").all(messageId) as unknown as Array<{ data: string }>;
        const usedTool = parts.some((part) => nested(json(part.data), "type") === "tool"); const error = text(nested(info, "error"));
        if (!error && !usedTool && durationSeconds < this.options.completionMinimumSeconds) continue;
        this.options.notifications.create({ source: "opencode", category: "coding-agent", sourceIcon: "opencode",
          kind: error ? "agent.failed" : "agent.completed", severity: error ? "error" : "success",
          title: error ? "OpenCode fehlgeschlagen" : "OpenCode abgeschlossen", body: error ?? `${projectLabel(session.directory)} nach ${durationSeconds} Sekunden`,
          link: `/workbench/opencode?session=${encodeURIComponent(session.id)}&directory=${encodeURIComponent(session.directory)}`, remoteId: `opencode:${messageId}`,
          meta: { sessionId: session.id, directory: session.directory, durationSeconds, usedTool },
          report: error ? { message: error, stack: null, context: { Quelle: "OpenCode", Sitzung: session.id, Arbeitsverzeichnis: session.directory }, logs: [], environment: {} } : null });
      }
      this.state.opencodeRowId = Math.max(this.state.opencodeRowId, maximum);
    } catch { /* OpenCode ist optional oder gerade gesperrt. */ } finally { db?.close(); }
  }

  private t3SessionMarkers(): ReadonlySet<string> {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.options.t3DatabasePath, { readOnly: true }); db.exec("PRAGMA busy_timeout=1000");
      const rows = db.prepare(`SELECT t.title title, p.workspace_root directory
        FROM projection_threads t LEFT JOIN projection_projects p ON p.project_id = t.project_id
        WHERE t.title IS NOT NULL AND t.title <> ''`).all() as unknown as T3SessionMarker[];
      return new Set(rows.map((row) => sessionMarkerKey(row.title, row.directory)));
    } catch { return new Set(); }
    finally { db?.close(); }
  }

  private pollCodex(emit: boolean): void {
    try {
      const files = globSync("**/*.jsonl", { cwd: this.options.codexSessionsPath }).map((path) => join(this.options.codexSessionsPath, path))
        .map((path) => ({ path, stat: statSync(path) })).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, 200);
      const retained: Record<string, number> = {};
      for (const file of files) {
        const previous = this.state.codexOffsets[file.path]; retained[file.path] = file.stat.size;
        if (!emit || previous === undefined || previous >= file.stat.size) continue;
        const content = readFileSync(file.path);
        const lines = content.subarray(previous).toString("utf8").split("\n").filter(Boolean).map(json).filter((line): line is Record<string, unknown> => line !== null);
        const meta = json(content.subarray(0, content.indexOf(10)).toString("utf8")); const metaPayload = nested(meta, "payload");
        if (text(nested(metaPayload, "originator"))?.startsWith("t3code")) continue;
        const sessionId = text(nested(metaPayload, "id")) ?? file.path.split("/").at(-1)!.replace(/\.jsonl$/, "");
        const cwd = text(nested(metaPayload, "cwd")) ?? "unbekannt";
        const usedTool = lines.some((line) => line.type === "response_item" && ["function_call", "custom_tool_call"].includes(String(nested(nested(line, "payload"), "type"))));
        for (const line of lines) {
          if (line.type !== "event_msg") continue;
          const payload = nested(line, "payload"); const type = nested(payload, "type");
          if (type !== "task_complete" && type !== "turn_aborted") continue;
          const turnId = text(nested(payload, "turn_id")) ?? text(line.timestamp) ?? String(file.stat.mtimeMs);
          const durationSeconds = Math.max(0, Math.round((number(nested(payload, "duration_ms")) ?? 0) / 1_000)); const failed = type === "turn_aborted";
          if (!failed && !usedTool && durationSeconds < this.options.completionMinimumSeconds) continue;
          const reason = text(nested(payload, "reason"));
          this.options.notifications.create({ source: "codex", category: "coding-agent", sourceIcon: "codex",
            kind: failed ? "agent.failed" : "agent.completed", severity: failed ? "error" : "success",
            title: failed ? "Codex fehlgeschlagen" : "Codex abgeschlossen", body: failed ? reason ?? "Der Lauf wurde abgebrochen." : `${projectLabel(cwd)} nach ${durationSeconds} Sekunden`,
            link: `/workbench/codex?session=${encodeURIComponent(sessionId)}`, remoteId: `codex:${sessionId}:${turnId}`,
            meta: { sessionId, cwd, durationSeconds, usedTool }, report: failed ? { message: reason ?? "Codex-Lauf abgebrochen", stack: null, context: { Quelle: "Codex", Sitzung: sessionId, Arbeitsverzeichnis: cwd }, logs: [], environment: {} } : null });
        }
      }
      this.state.codexOffsets = retained;
    } catch { /* Codex-Verläufe sind optional. */ }
  }
}
