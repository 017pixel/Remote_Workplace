import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { redactText } from "../hermes/redaction.js";
import type { NotificationDatabase } from "./database.js";

interface ThreadRow {
  threadId: string; title: string; projectId: string; projectTitle: string | null; updatedAt: string;
  pendingApprovalCount: number; pendingUserInputCount: number; hasActionableProposedPlan: number;
  settledAt: string | null; sessionStatus: string | null; lastError: string | null;
  turnId: string | null; turnState: string | null; startedAt: string | null; completedAt: string | null;
  toolCount: number;
}

function durationSeconds(row: ThreadRow): number {
  if (!row.startedAt) return 0;
  return Math.max(0, (Date.parse(row.completedAt ?? row.settledAt ?? row.updatedAt) - Date.parse(row.startedAt)) / 1_000);
}

export class T3StatusSync {
  private timer: NodeJS.Timeout | null = null;
  private initialized = false;
  private lastSequence = 0;

  constructor(private readonly options: {
    databasePath: string; environmentIdPath: string; notifications: NotificationDatabase;
    pollSeconds: number; completionMinimumSeconds: number; miniTaskSeconds: number; cursorPath: string;
  }) {
    try {
      const cursor = JSON.parse(readFileSync(options.cursorPath, "utf8")) as { lastSequence?: unknown };
      if (typeof cursor.lastSequence === "number" && Number.isSafeInteger(cursor.lastSequence)) { this.lastSequence = cursor.lastSequence; this.initialized = true; }
    } catch { /* Beim ersten Start existiert noch kein Cursor. */ }
  }

  start(): void { if (this.timer) return; this.timer = setInterval(() => this.poll(), this.options.pollSeconds * 1_000); this.timer.unref(); this.poll(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  poll(): void {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.options.databasePath, { readOnly: true });
      db.exec("PRAGMA busy_timeout=1500");
      // Spalten werden absichtlich über Runtime-Prüfung gelesen. T3 Nightly darf sein Schema migrieren.
      const columns = new Set((db.prepare("PRAGMA table_info(projection_threads)").all() as unknown as Array<{ name: string }>).map((item) => item.name));
      if (!["thread_id", "title", "pending_approval_count", "pending_user_input_count", "has_actionable_proposed_plan"].every((name) => columns.has(name))) return;
      const currentSequence = Number((db.prepare("SELECT COALESCE(MAX(sequence),0) sequence FROM orchestration_events").get() as { sequence: number }).sequence);
      if (currentSequence < this.lastSequence) this.lastSequence = 0;
      const touched = this.initialized
        ? (db.prepare("SELECT DISTINCT stream_id threadId FROM orchestration_events WHERE sequence > ? AND aggregate_kind = 'thread'").all(this.lastSequence) as unknown as Array<{ threadId: string }>).map((item) => item.threadId)
        : [];
      const filter = this.initialized ? (touched.length ? `AND t.thread_id IN (${touched.map(() => "?").join(",")})` : "AND 0") : "";
      const rows = db.prepare(`SELECT t.thread_id threadId, t.title, t.project_id projectId, p.title projectTitle, t.updated_at updatedAt,
        t.pending_approval_count pendingApprovalCount, t.pending_user_input_count pendingUserInputCount,
        t.has_actionable_proposed_plan hasActionableProposedPlan, t.settled_at settledAt,
        s.status sessionStatus, s.last_error lastError, v.turn_id turnId, v.state turnState,
        v.started_at startedAt, v.completed_at completedAt,
        (SELECT COUNT(*) FROM projection_thread_activities a WHERE a.thread_id=t.thread_id AND a.kind LIKE 'tool.%' AND (a.turn_id=v.turn_id OR v.turn_id IS NULL)) toolCount
        FROM projection_threads t
        LEFT JOIN projection_projects p ON p.project_id = t.project_id
        LEFT JOIN projection_thread_sessions s ON s.thread_id=t.thread_id
        LEFT JOIN projection_turns v ON v.row_id=(SELECT MAX(v2.row_id) FROM projection_turns v2 WHERE v2.thread_id=t.thread_id)
        WHERE t.deleted_at IS NULL ${filter}`).all(...touched) as unknown as ThreadRow[];
      const environmentId = this.environmentId();
      for (const row of rows) this.process(row, environmentId, db, this.initialized);
      this.initialized = true;
      this.lastSequence = currentSequence;
      this.saveCursor();
    } catch {
      // T3 kann während eines Kanalwechsels migrieren oder seine DB kurz sperren. Der nächste Poll versucht es erneut.
    } finally { db?.close(); }
  }

  private saveCursor(): void {
    mkdirSync(dirname(this.options.cursorPath), { recursive: true });
    const temporary = `${this.options.cursorPath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ lastSequence: this.lastSequence })}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.options.cursorPath);
  }

  private environmentId(): string {
    try {
      const raw = readFileSync(this.options.environmentIdPath, "utf8").trim();
      const parsed = raw.startsWith("{") ? JSON.parse(raw) as { id?: unknown } : null;
      return parsed && typeof parsed.id === "string" ? parsed.id : raw;
    } catch { return ""; }
  }

  private process(row: ThreadRow, environmentId: string, db: DatabaseSync, allowCompletion: boolean): void {
    const prefix = `thread:${row.threadId}:`;
    // Tiefenlink in die Workbench-SPA: Sie öffnet das T3-Panel mit genau
    // diesem Thread (Umgebung für eine zuverlässige Routenauflösung).
    const query = new URLSearchParams({ thread: row.threadId });
    if (environmentId) query.set("env", environmentId);
    const link = `/workbench/t3-code?${query.toString()}`;
    const body = row.projectTitle ? `${row.projectTitle} · ${row.title}` : row.title;
    if (row.pendingUserInputCount > 0) {
      const remoteId = this.options.notifications.activeRemoteId("t3", "agent.input-required", `${prefix}input`) ?? `${prefix}input:${row.updatedAt}`;
      this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.input-required", severity: "warning",
        title: "T3 Code braucht Input", body, link, remoteId, meta: { threadId: row.threadId, projectId: row.projectId } });
    } else this.options.notifications.resolveMatching("t3", ["agent.input-required"], `${prefix}input`);
    if (row.pendingApprovalCount > 0 || row.hasActionableProposedPlan > 0) {
      const remoteId = this.options.notifications.activeRemoteId("t3", "agent.plan-ready", `${prefix}plan`) ?? `${prefix}plan:${row.updatedAt}`;
      // Info statt Warning: Zwischenpläne ohne echte Freigabe sind normal und
      // dürfen weder Push auslösen noch wie ein Fehler wirken.
      this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.plan-ready", severity: "info",
        title: "T3-Plan ist bereit", body, link, remoteId, meta: { threadId: row.threadId, projectId: row.projectId } });
    } else this.options.notifications.resolveMatching("t3", ["agent.plan-ready"], `${prefix}plan`);

    if (!allowCompletion) return;
    const finished = row.turnState === "completed" || row.turnState === "error" || row.turnState === "interrupted";
    if (!finished || !row.turnId) return;
    const duration = durationSeconds(row);
    const usedTools = row.toolCount > 0;
    if (row.turnState === "completed") {
      if (duration < this.options.miniTaskSeconds || (duration < this.options.completionMinimumSeconds && !usedTools)) return;
      this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.completed", severity: "success",
        title: "T3-Aufgabe abgeschlossen", body, link, remoteId: `${prefix}complete:${row.turnId}`,
        meta: { threadId: row.threadId, projectId: row.projectId, durationSeconds: Math.round(duration), usedTools } });
      return;
    }
    const rawError = row.lastError || (row.turnState === "interrupted" ? "Die T3-Aufgabe wurde abgebrochen." : "Die T3-Aufgabe ist fehlgeschlagen.");
    const logs = (db.prepare("SELECT summary FROM projection_thread_activities WHERE thread_id=? ORDER BY created_at DESC LIMIT 20").all(row.threadId) as unknown as Array<{ summary: string }>).map((item) => redactText(item.summary, 1_000)).reverse();
    this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.failed", severity: row.turnState === "error" ? "error" : "warning",
      title: row.turnState === "error" ? "T3-Aufgabe fehlgeschlagen" : "T3-Aufgabe abgebrochen", body, link,
      remoteId: `${prefix}failed:${row.turnId}`, meta: { threadId: row.threadId, projectId: row.projectId, durationSeconds: Math.round(duration) },
      report: { message: redactText(rawError, 4_000), stack: null, context: { Quelle: "T3 Code", Aufgabe: row.title, Projekt: row.projectId, Thread: row.threadId }, logs, environment: {} } });
  }
}
