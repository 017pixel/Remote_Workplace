import { DatabaseSync } from "node:sqlite";
import type { TerminalKind } from "@workbench/contracts";
import type { NotificationDatabase } from "./database.js";

interface TerminalRow {
  id: string; runtimeId: string; kind: TerminalKind; projectId: string | null; cwd: string;
  status: string; createdAt: number; updatedAt: number; exitCode: number | null; exitSignal: number | null;
}

function source(kind: TerminalKind): "terminal" | "codex" | "opencode" | "claude" { return kind === "shell" ? "terminal" : kind; }
function icon(kind: TerminalKind): "terminal" | "codex" | "opencode" | "claude" { return kind === "shell" ? "terminal" : kind; }
function label(kind: TerminalKind): string { return kind === "codex" ? "Codex" : kind === "opencode" ? "OpenCode" : kind === "claude" ? "Claude Code" : "Befehl"; }
function link(row: TerminalRow): string {
  const session = encodeURIComponent(row.id);
  if (row.kind === "codex") return `/workbench/codex?session=${session}`;
  if (row.kind === "opencode") return `/workbench/opencode?session=${session}`;
  return `/workbench/terminal?session=${session}${row.kind === "claude" ? "&kind=claude" : ""}`;
}

export class TerminalStatusSync {
  private timer: NodeJS.Timeout | null = null;
  private readonly seen = new Map<string, string>();
  constructor(private readonly options: { databasePath: string; notifications: NotificationDatabase; pollSeconds: number; terminalMinimumSeconds: number; agentMinimumSeconds: number }) {}
  start(): void { if (this.timer) return; this.snapshot(false); this.timer = setInterval(() => this.snapshot(true), this.options.pollSeconds * 1_000); this.timer.unref(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  noteWaiting(row: Pick<TerminalRow, "id" | "kind" | "projectId" | "cwd" | "createdAt">): void {
    if (row.kind === "shell") return;
    this.options.notifications.create({ source: source(row.kind), category: "coding-agent", sourceIcon: icon(row.kind), kind: "agent.input-required", severity: "warning",
      title: `${label(row.kind)} braucht Input`, body: row.projectId ? `Projekt ${row.projectId}` : row.cwd, link: link({ ...row, runtimeId: "", status: "running", updatedAt: Date.now(), exitCode: null, exitSignal: null }),
      remoteId: `terminal:${row.id}:input`, meta: { sessionId: row.id, projectId: row.projectId } });
  }
  resolveWaiting(kind: TerminalKind, sessionId: string): void { this.options.notifications.resolveByRemoteId(source(kind), "agent.input-required", `terminal:${sessionId}:input`); }

  private snapshot(emit: boolean): void {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.options.databasePath, { readOnly: true });
      db.exec("PRAGMA busy_timeout=1500");
      const rows = db.prepare(`SELECT id, runtime_id runtimeId, kind, project_id projectId, cwd, status,
        created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal FROM terminal_sessions`).all() as unknown as TerminalRow[];
      for (const row of rows) {
        const fingerprint = `${row.status}:${row.exitCode ?? ""}:${row.updatedAt}`;
        const previous = this.seen.get(row.id); this.seen.set(row.id, fingerprint);
        if (!emit || previous === fingerprint || (row.status !== "exited" && row.status !== "interrupted" && row.status !== "closed")) continue;
        this.resolveWaiting(row.kind, row.id);
        const durationSeconds = Math.max(0, Math.round((row.updatedAt - row.createdAt) / 1_000));
        const failed = row.exitCode !== null && row.exitCode !== 0;
        const minimum = row.kind === "shell" ? this.options.terminalMinimumSeconds : this.options.agentMinimumSeconds;
        if (!failed && durationSeconds < minimum) continue;
        const title = failed ? `${label(row.kind)} fehlgeschlagen` : row.kind === "shell" ? "Befehl abgeschlossen" : `${label(row.kind)} abgeschlossen`;
        const body = failed ? `Exit-Code ${row.exitCode ?? "unbekannt"} nach ${durationSeconds} Sekunden` : `Laufzeit ${durationSeconds} Sekunden`;
        this.options.notifications.create({ source: source(row.kind), category: row.kind === "shell" ? "terminal" : "coding-agent", sourceIcon: icon(row.kind),
          kind: failed ? "terminal.failed" : "agent.completed", severity: failed ? "error" : "success", title, body, link: link(row),
          remoteId: `terminal:${row.id}:exit:${row.updatedAt}`, meta: { sessionId: row.id, runtimeId: row.runtimeId, projectId: row.projectId, cwd: row.cwd, durationSeconds, exitCode: row.exitCode, signal: row.exitSignal },
          report: failed ? { message: `${title}: ${body}`, stack: null, context: { Quelle: label(row.kind), Sitzung: row.id, Arbeitsverzeichnis: row.cwd }, logs: [], environment: {} } : null });
      }
    } catch { /* Beim Serverstart kann die Tabelle noch nicht vorhanden sein. */ } finally { db?.close(); }
  }
}
