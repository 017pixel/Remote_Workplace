import { DatabaseSync } from "node:sqlite";
import { basename } from "node:path";
import type { TerminalKind } from "@workbench/contracts";
import type { NotificationDatabase } from "./database.js";

interface TerminalRow {
  id: string; runtimeId: string; kind: TerminalKind; projectId: string | null; cwd: string;
  status: string; createdAt: number; updatedAt: number; exitCode: number | null; exitSignal: number | null;
}

interface PendingInput { buffer: string; timer: NodeJS.Timeout }

// Typische Warte-Muster am Ende eines Agenten-Ausgabepuffers. Nur wenn der
// Agent anschließend eine Weile nichts mehr schreibt, gilt Input als nötig.
const inputPattern = /\b(?:approval required|needs? (?:your )?input|permission required|press enter|type (?:yes|no)|do you want to (?:continue|proceed|run|install|allow|start|stop|delete|remove|revert)|continue\?|(?:^|\s)\((?:y|yes)\/(?:n|no)\)|\[(?:y|yes)\/(?:n|no)\]|select (?:an? )?option|please choose|choose (?:an? option|a number)|waiting for (?:your )?(?:input|response|confirmation)|is this ok\?|run (?:this )?command\?)\b/i;

function source(kind: TerminalKind): "terminal" | "codex" | "opencode" | "claude" { return kind === "shell" ? "terminal" : kind; }
function icon(kind: TerminalKind): "terminal" | "codex" | "opencode" | "claude" { return kind === "shell" ? "terminal" : kind; }
function label(kind: TerminalKind): string { return kind === "codex" ? "Codex" : kind === "opencode" ? "OpenCode" : kind === "claude" ? "Claude Code" : "Befehl"; }
function projectLabel(cwd: string): string { return basename(cwd) || cwd; }
function link(row: TerminalRow): string {
  const session = encodeURIComponent(row.id);
  if (row.kind === "codex") return `/workbench/codex?session=${session}`;
  if (row.kind === "opencode") return `/workbench/opencode?session=${session}`;
  return `/workbench/terminal?session=${session}${row.kind === "claude" ? "&kind=claude" : ""}`;
}

export class TerminalStatusSync {
  private timer: NodeJS.Timeout | null = null;
  private readonly seen = new Map<string, string>();
  private readonly pending = new Map<string, PendingInput>();
  constructor(private readonly options: { databasePath: string; notifications: NotificationDatabase; pollSeconds: number; terminalMinimumSeconds: number; agentMinimumSeconds: number; inputIdleMilliseconds?: number }) {}
  start(): void { if (this.timer) return; this.snapshot(false); this.timer = setInterval(() => this.snapshot(true), this.options.pollSeconds * 1_000); this.timer.unref(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; for (const { timer } of this.pending.values()) clearTimeout(timer); this.pending.clear(); }

  /**
   * Agenten-Ausgabe auf Warte-Muster prüfen. Ein Treffer allein löst noch
   * nichts aus: Erst wenn der Agent danach `inputIdleMilliseconds` lang nichts
   * mehr schreibt (Pause), gilt Input als nötig. Schreibt er weiter, ohne dass
   * der letzte Ausgabeschwanz ein Warte-Muster enthält, verfällt der Verdacht.
   * So verschwinden Zwischenschritt-Texte, die zufällig ein Muster enthalten.
   */
  noteOutput(row: Pick<TerminalRow, "id" | "kind" | "projectId" | "cwd" | "createdAt">, data: string): void {
    if (row.kind === "shell") return;
    const previous = this.pending.get(row.id);
    // Der neue Chunk zählt voll (lange Prompts in einem Schub); zusätzlich ein
    // kurzer Schwanz der vorherigen Ausgabe für Prompt-Enden über Chunks.
    // Ein alter Warte-Prompt, über den der Agent hinwegschreibt, fällt damit
    // schnell aus dem Fenster.
    const buffer = `${previous?.buffer ?? ""}${data}`.slice(-24);
    if (previous?.timer) clearTimeout(previous.timer);
    if (!inputPattern.test(data) && !inputPattern.test(buffer)) { this.pending.delete(row.id); return; }
    const timer = setTimeout(() => {
      this.pending.delete(row.id);
      this.noteWaiting(row);
    }, this.options.inputIdleMilliseconds ?? 8_000);
    if (typeof timer.unref === "function") timer.unref();
    this.pending.set(row.id, { buffer, timer });
  }

  noteWaiting(row: Pick<TerminalRow, "id" | "kind" | "projectId" | "cwd" | "createdAt">): void {
    if (row.kind === "shell") return;
    this.options.notifications.create({ source: source(row.kind), category: "coding-agent", sourceIcon: icon(row.kind), kind: "agent.input-required", severity: "warning",
      title: `${label(row.kind)} braucht Input`, body: projectLabel(row.cwd) || (row.projectId ? `Projekt ${row.projectId}` : row.cwd), link: link({ ...row, runtimeId: "", status: "running", updatedAt: Date.now(), exitCode: null, exitSignal: null }),
      remoteId: `terminal:${row.id}:input`, meta: { sessionId: row.id, projectId: row.projectId } });
  }
  resolveWaiting(kind: TerminalKind, sessionId: string): void {
    const pending = this.pending.get(sessionId);
    if (pending) { clearTimeout(pending.timer); this.pending.delete(sessionId); }
    this.options.notifications.resolveByRemoteId(source(kind), "agent.input-required", `terminal:${sessionId}:input`);
  }

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
        const body = failed ? `${projectLabel(row.cwd)} · Exit-Code ${row.exitCode ?? "unbekannt"} nach ${durationSeconds} Sekunden` : `${projectLabel(row.cwd)} · Laufzeit ${durationSeconds} Sekunden`;
        this.options.notifications.create({ source: source(row.kind), category: row.kind === "shell" ? "terminal" : "coding-agent", sourceIcon: icon(row.kind),
          kind: failed ? "terminal.failed" : "agent.completed", severity: failed ? "error" : "success", title, body, link: link(row),
          remoteId: `terminal:${row.id}:exit:${row.updatedAt}`, meta: { sessionId: row.id, runtimeId: row.runtimeId, projectId: row.projectId, cwd: row.cwd, durationSeconds, exitCode: row.exitCode, signal: row.exitSignal },
          report: failed ? { message: `${title}: ${body}`, stack: null, context: { Quelle: label(row.kind), Sitzung: row.id, Arbeitsverzeichnis: row.cwd }, logs: [], environment: {} } : null });
      }
    } catch { /* Beim Serverstart kann die Tabelle noch nicht vorhanden sein. */ } finally { db?.close(); }
  }
}
