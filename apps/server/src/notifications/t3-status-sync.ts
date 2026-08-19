import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { redactText } from "../hermes/redaction.js";
import type { NotificationDatabase } from "./database.js";

const execFileAsync = promisify(execFile);

export interface ThreadRow {
  threadId: string; title: string; projectId: string; projectTitle: string | null; updatedAt: string;
  pendingApprovalCount: number; pendingUserInputCount: number; hasActionableProposedPlan: number;
  settledAt: string | null; sessionStatus: string | null; lastError: string | null;
  turnId: string | null; turnState: string | null; startedAt: string | null; completedAt: string | null;
  toolCount: number;
}

export interface RemoteT3Source {
  /** SSH-Host, über den die entfernte T3-Instanz erreichbar ist. */
  host: string;
  /** Remote-Pfad zur state.sqlite der T3-Instanz. */
  databasePath: string;
  /** Remote-Pfad zur environment-id der T3-Instanz. */
  environmentIdPath: string;
  /** Optionaler Anzeigename; ohne Angabe wird der Host verwendet. */
  label?: string | undefined;
}

interface RemoteSnapshot {
  environmentId: string;
  currentSequence: number;
  touched: string[];
  rows: ThreadRow[];
  activities: Record<string, string[]>;
}

function durationSeconds(row: ThreadRow): number {
  if (!row.startedAt) return 0;
  return Math.max(0, (Date.parse(row.completedAt ?? row.settledAt ?? row.updatedAt) - Date.parse(row.startedAt)) / 1_000);
}

// Liest die T3-Projektion auf einer entfernten Instanz read-only und liefert
// dieselben Felder wie die lokale Abfrage als JSON. Läuft über python3, weil
// die sqlite3-CLI auf den Zielrechnern nicht installiert ist; die Server-T3
// selbst bleibt unberührt (nur Lesen, busy_timeout statt eigenem Lock).
export const REMOTE_READER_SCRIPT = `
import json, sqlite3, sys

db_path, env_path = sys.argv[1], sys.argv[2]
last_seq = int(sys.argv[3])
initialized = sys.argv[4] == "1"
out = {"environmentId": "", "currentSequence": 0, "touched": [], "rows": [], "activities": {}}
try:
    with open(env_path, encoding="utf-8") as f:
        raw = f.read().strip()
    out["environmentId"] = json.loads(raw).get("id", raw) if raw.startswith("{") else raw
except Exception:
    pass
try:
    db = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
    db.execute("PRAGMA busy_timeout=1500")
    cols = {r[1] for r in db.execute("PRAGMA table_info(projection_threads)")}
    required = {"thread_id", "title", "project_id", "pending_approval_count", "pending_user_input_count", "has_actionable_proposed_plan"}
    if required <= cols:
        current = db.execute("SELECT COALESCE(MAX(sequence),0) FROM orchestration_events").fetchone()[0]
        out["currentSequence"] = current
        touched = [r[0] for r in db.execute("SELECT DISTINCT stream_id FROM orchestration_events WHERE sequence > ? AND aggregate_kind = 'thread'", (last_seq,))] if initialized else []
        out["touched"] = touched
        if initialized and not touched:
            filter_sql = "AND 0"
            params = []
        elif initialized:
            filter_sql = "AND t.thread_id IN (" + ",".join("?" * len(touched)) + ")"
            params = touched
        else:
            filter_sql = ""
            params = []
        rows = db.execute("""
            SELECT t.thread_id, t.title, t.project_id, p.title, t.updated_at,
              t.pending_approval_count, t.pending_user_input_count, t.has_actionable_proposed_plan,
              t.settled_at, s.status, s.last_error, v.turn_id, v.state, v.started_at, v.completed_at,
              (SELECT COUNT(*) FROM projection_thread_activities a WHERE a.thread_id=t.thread_id AND a.kind LIKE 'tool.%' AND (a.turn_id=v.turn_id OR v.turn_id IS NULL))
            FROM projection_threads t
            LEFT JOIN projection_projects p ON p.project_id = t.project_id
            LEFT JOIN projection_thread_sessions s ON s.thread_id=t.thread_id
            LEFT JOIN projection_turns v ON v.row_id=(SELECT MAX(v2.row_id) FROM projection_turns v2 WHERE v2.thread_id=t.thread_id)
            WHERE t.deleted_at IS NULL """ + filter_sql, params).fetchall()
        keys = ["threadId", "title", "projectId", "projectTitle", "updatedAt", "pendingApprovalCount", "pendingUserInputCount", "hasActionableProposedPlan", "settledAt", "sessionStatus", "lastError", "turnId", "turnState", "startedAt", "completedAt", "toolCount"]
        out["rows"] = [dict(zip(keys, r)) for r in rows]
        for tid in [r[0] for r in rows]:
            acts = db.execute("SELECT summary FROM projection_thread_activities WHERE thread_id=? ORDER BY created_at DESC LIMIT 20", (tid,)).fetchall()
            out["activities"][tid] = [a[0] for a in reversed(acts)]
    db.close()
except Exception:
    pass
print(json.dumps(out))
`;

export class T3StatusSync {
  private timer: NodeJS.Timeout | null = null;
  private initialized = false;
  private lastSequence = 0;
  private readonly remoteStates: Map<string, { lastSequence: number; initialized: boolean }> = new Map();

  constructor(private readonly options: {
    databasePath: string; environmentIdPath: string; notifications: NotificationDatabase;
    pollSeconds: number; completionMinimumSeconds: number; miniTaskSeconds: number; cursorPath: string;
    remoteSources?: RemoteT3Source[];
  }) {
    try {
      const cursor = JSON.parse(readFileSync(options.cursorPath, "utf8")) as { lastSequence?: unknown };
      if (typeof cursor.lastSequence === "number" && Number.isSafeInteger(cursor.lastSequence)) { this.lastSequence = cursor.lastSequence; this.initialized = true; }
    } catch { /* Beim ersten Start existiert noch kein Cursor. */ }
    for (const source of options.remoteSources ?? []) {
      const state = { lastSequence: 0, initialized: false };
      try {
        const cursor = JSON.parse(readFileSync(this.remoteCursorPath(source), "utf8")) as { lastSequence?: unknown };
        if (typeof cursor.lastSequence === "number" && Number.isSafeInteger(cursor.lastSequence)) { state.lastSequence = cursor.lastSequence; state.initialized = true; }
      } catch { /* Noch kein Remote-Cursor vorhanden. */ }
      this.remoteStates.set(source.host, state);
    }
  }

  start(): void { if (this.timer) return; this.timer = setInterval(() => void this.poll(), this.options.pollSeconds * 1_000); this.timer.unref(); void this.poll(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private remoteCursorPath(source: RemoteT3Source): string {
    return `${this.options.cursorPath}.remote-${source.host}`;
  }

  async poll(): Promise<void> {
    this.pollLocal();
    await this.pollRemote();
  }

  private pollLocal(): void {
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
      const database = db;
      for (const row of rows) this.process(row, environmentId, (threadId) => {
        const logs = (database.prepare("SELECT summary FROM projection_thread_activities WHERE thread_id=? ORDER BY created_at DESC LIMIT 20").all(threadId) as unknown as Array<{ summary: string }>).map((item) => redactText(item.summary, 1_000)).reverse();
        return logs;
      }, this.initialized);
      this.initialized = true;
      this.lastSequence = currentSequence;
      this.saveCursor();
    } catch {
      // T3 kann während eines Kanalwechsels migrieren oder seine DB kurz sperren. Der nächste Poll versucht es erneut.
    } finally { db?.close(); }
  }

  private async pollRemote(): Promise<void> {
    for (const source of this.options.remoteSources ?? []) {
      try {
        const state = this.remoteStates.get(source.host);
        if (!state) continue;
        // Das Skript Base64-encodiert über die Remote-Shell ausführen: Die
        // Remote-Shell bekommt nur einen einzigen einfachen Befehl, Argumente
        // und Skript enthalten keine Sonderzeichen mehr, die sie umdeuten könnte.
        const encoded = Buffer.from(REMOTE_READER_SCRIPT, "utf8").toString("base64");
        const command = `echo ${encoded} | base64 -d | python3 - '${source.databasePath.replaceAll("'", "'\\''")}' '${source.environmentIdPath.replaceAll("'", "'\\''")}' ${state.lastSequence} ${state.initialized ? 1 : 0}`;
        const { stdout } = await execFileAsync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", source.host, command], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
        const snapshot = JSON.parse(stdout) as RemoteSnapshot;
        const environmentId = snapshot.environmentId;
        const currentSequence = snapshot.currentSequence;
        if (currentSequence < state.lastSequence) state.lastSequence = 0;
        for (const row of snapshot.rows) {
          this.process(row, environmentId, (threadId) => snapshot.activities[threadId] ?? [], state.initialized);
        }
        state.initialized = true;
        state.lastSequence = currentSequence;
        this.saveRemoteCursor(source);
      } catch {
        // Remote nicht erreichbar oder Schema-Migration: Der nächste Poll versucht es erneut.
      }
    }
  }

  private saveCursor(): void {
    this.writeCursor(this.options.cursorPath, this.lastSequence);
  }

  private saveRemoteCursor(source: RemoteT3Source): void {
    const state = this.remoteStates.get(source.host);
    if (state) this.writeCursor(this.remoteCursorPath(source), state.lastSequence);
  }

  private writeCursor(path: string, lastSequence: number): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ lastSequence })}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, path);
  }

  private environmentId(): string {
    try {
      const raw = readFileSync(this.options.environmentIdPath, "utf8").trim();
      const parsed = raw.startsWith("{") ? JSON.parse(raw) as { id?: unknown } : null;
      return parsed && typeof parsed.id === "string" ? parsed.id : raw;
    } catch { return ""; }
  }

  private process(row: ThreadRow, environmentId: string, summaries: (threadId: string) => string[], allowCompletion: boolean): void {
    const prefix = `thread:${row.threadId}:`;
    // Tiefenlink in die Workbench-SPA: Sie öffnet das T3-Panel mit genau
    // diesem Thread (Umgebung für eine zuverlässige Routenauflösung).
    const query = new URLSearchParams({ thread: row.threadId });
    if (environmentId) query.set("env", environmentId);
    const link = `/wrapt/t3-code?${query.toString()}`;
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
    const logs = summaries(row.threadId).map((item) => redactText(item, 1_000));
    this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.failed", severity: row.turnState === "error" ? "error" : "warning",
      title: row.turnState === "error" ? "T3-Aufgabe fehlgeschlagen" : "T3-Aufgabe abgebrochen", body, link,
      remoteId: `${prefix}failed:${row.turnId}`, meta: { threadId: row.threadId, projectId: row.projectId, durationSeconds: Math.round(duration) },
      report: { message: redactText(rawError, 4_000), stack: null, context: { Quelle: "T3 Code", Aufgabe: row.title, Projekt: row.projectId, Thread: row.threadId }, logs, environment: {} } });
  }
}