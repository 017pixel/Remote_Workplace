import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { kill } from "node:process";
import { isAbsolute, resolve, relative } from "node:path";
import { homedir } from "node:os";
import type { PtyAdapter, PtyProcess } from "./NodePtyAdapter.js";
import { nodePtyAdapter } from "./NodePtyAdapter.js";
import type { ServerTerminalMessage, TerminalErrorCode, TerminalKind } from "./protocol.js";

export type TerminalStatus = "starting" | "running" | "exited" | "closed";
export interface TerminalSession { id: string; userId: string; kind: TerminalKind; mode: "agent"|"login"; profilePath: string|null; pty: PtyProcess | null; pid: number; cwd: string; cols: number; rows: number; status: TerminalStatus; history: string; createdAt: number; updatedAt: number; exitCode: number | null; exitSignal: number | null; sequence: number; clients: Set<(message: ServerTerminalMessage) => void>; disconnectTimer: NodeJS.Timeout | null; dataListener: { dispose(): void } | null; exitListener: { dispose(): void } | null; }
export class TerminalFailure extends Error { constructor(readonly code: TerminalErrorCode, message: string) { super(message); } }

const HISTORY_LIMIT = 3 * 1024 * 1024;
const RECONNECT_GRACE_MS = 5 * 60_000;

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();
  constructor(private readonly options: {
    allowedRoots: string[];
    defaultCwd: string;
    maxSessions: number;
    cliPaths?: Partial<Record<Exclude<TerminalKind, "shell">, string>>;
    maxSessionsByKind?: Partial<Record<TerminalKind, number>>;
    adapter?: PtyAdapter;
    reconnectGraceMs?: number;
    resolveAccountProfile?: (accountId: string, kind: Exclude<TerminalKind,"shell">) => string;
  }) {}
  private get adapter() { return this.options.adapter ?? nodePtyAdapter; }
  private get graceMs() { return this.options.reconnectGraceMs ?? RECONNECT_GRACE_MS; }

  async createSession(userId: string, input: { kind?: TerminalKind; cwd?: string; cols: number; rows: number; mode?: "agent"|"login"; accountId?: string }): Promise<TerminalSession> {
    const kind = input.kind ?? "shell";
    const activeSessions = [...this.sessions.values()].filter((session) => session.userId === userId && session.status !== "closed");
    const kindLimit = this.options.maxSessionsByKind?.[kind] ?? this.options.maxSessions;
    if (activeSessions.filter((session) => session.kind === kind).length >= kindLimit) {
      throw new TerminalFailure("TOO_MANY_SESSIONS", `Die maximale Anzahl gleichzeitig geöffneter ${this.kindLabel(kind)}-Instanzen ist erreicht.`);
    }
    if (activeSessions.length >= this.options.maxSessions) throw new TerminalFailure("TOO_MANY_SESSIONS", "Die maximale Anzahl gleichzeitig geöffneter Terminals ist erreicht.");
    const cwd = await this.validateCwd(input.cwd ?? this.options.defaultCwd);
    const now = Date.now();
    if (input.mode === "login" && (kind === "shell" || !input.accountId)) throw new TerminalFailure("INVALID_MESSAGE", "Für die Anmeldung fehlt ein gültiger Account.");
    let profilePath: string|null = null;
    if (input.accountId && kind !== "shell") { try { profilePath = this.options.resolveAccountProfile?.(input.accountId, kind) ?? null; } catch { throw new TerminalFailure("INVALID_MESSAGE", "Der Anmeldeaccount wurde nicht gefunden."); } }
    const session: TerminalSession = { id: randomUUID(), userId, kind, mode: input.mode ?? "agent", profilePath, pty: null, pid: 0, cwd, cols: input.cols, rows: input.rows, status: "starting", history: "", createdAt: now, updatedAt: now, exitCode: null, exitSignal: null, sequence: 0, clients: new Set(), disconnectTimer: null, dataListener: null, exitListener: null };
    this.sessions.set(session.id, session);
    try { this.spawn(session); return session; } catch (error) { this.sessions.delete(session.id); throw error; }
  }
  attachSession(userId: string, sessionId: string, client: (message: ServerTerminalMessage) => void): () => void {
    const session = this.owned(userId, sessionId); if (session.disconnectTimer) { clearTimeout(session.disconnectTimer); session.disconnectTimer = null; }
    session.clients.add(client); client({ type: "terminal.snapshot", sessionId, kind: session.kind, status: session.status, cwd: session.cwd, history: session.history, sequence: session.sequence });
    return () => { session.clients.delete(client); if (session.clients.size === 0 && session.status === "running") this.cleanupDisconnectedSessions(session.id); };
  }
  writeToSession(userId: string, sessionId: string, data: string) { const session = this.running(userId, sessionId); try { session.pty?.write(data); session.updatedAt = Date.now(); } catch { throw new TerminalFailure("PTY_WRITE_FAILED", "Die Eingabe konnte nicht an das Terminal gesendet werden."); } }
  resizeSession(userId: string, sessionId: string, cols: number, rows: number) { const session = this.running(userId, sessionId); if (cols < 2 || cols > 500 || rows < 1 || rows > 300) throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße ist ungültig."); try { session.pty?.resize(cols, rows); session.cols = cols; session.rows = rows; } catch { throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden."); } }
  clearSessionHistory(userId: string, sessionId: string) { const session = this.owned(userId, sessionId); session.history = ""; session.sequence += 1; this.emit(session, { type: "terminal.cleared", sessionId, sequence: session.sequence }); }
  restartSession(userId: string, sessionId: string) { const session = this.owned(userId, sessionId); this.stopProcess(session); session.history = ""; session.exitCode = null; session.exitSignal = null; session.status = "starting"; this.spawn(session); return session; }
  closeSession(userId: string, sessionId: string) { this.close(this.owned(userId, sessionId)); }
  getSessionMetadata(userId: string, sessionId: string) { const session = this.owned(userId, sessionId); return { id: session.id, userId: session.userId, kind: session.kind, pid: session.pid, cwd: session.cwd, cols: session.cols, rows: session.rows, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, exitCode: session.exitCode, exitSignal: session.exitSignal, sequence: session.sequence }; }
  cleanupDisconnectedSessions(sessionId: string) { const session = this.sessions.get(sessionId); if (!session || session.disconnectTimer) return; session.disconnectTimer = setTimeout(() => this.close(session), this.graceMs); }
  shutdown() { for (const session of [...this.sessions.values()]) this.close(session); }
  private spawn(session: TerminalSession) {
    try {
      const command = this.launchCommand(session.kind, session.mode);
      const pty = this.adapter.spawn(command.file, command.args, { name: "xterm-256color", cwd: session.cwd, cols: session.cols, rows: session.rows, env: this.environment(session) });
      session.pty = pty; session.pid = pty.pid; session.status = "running"; session.updatedAt = Date.now();
      session.dataListener = pty.onData((data) => { session.history = this.limitHistory(session.history + data); session.sequence += 1; session.updatedAt = Date.now(); this.emit(session, { type: "terminal.output", sessionId: session.id, data, sequence: session.sequence }); });
      session.exitListener = pty.onExit((event) => { if (session.status === "closed") return; session.status = "exited"; session.exitCode = event.exitCode; session.exitSignal = event.signal ?? null; session.sequence += 1; this.emit(session, { type: "terminal.exited", sessionId: session.id, exitCode: session.exitCode, signal: session.exitSignal, sequence: session.sequence }); });
    } catch { throw new TerminalFailure("PTY_SPAWN_FAILED", "Die Shell konnte nicht gestartet werden."); }
  }
  private launchCommand(kind: TerminalKind, mode: "agent"|"login"): { file: string; args: string[] } {
    if (kind === "shell") return { file: "/bin/bash", args: ["--login"] };
    return { file: this.options.cliPaths?.[kind] ?? kind, args: mode === "login" ? (kind === "codex" ? ["login", "--device-auth"] : ["auth", "login"]) : [] };
  }
  private kindLabel(kind: TerminalKind): string {
    if (kind === "codex") return "Codex";
    if (kind === "opencode") return "OpenCode";
    return "Terminal";
  }
  private environment(session: TerminalSession): Record<string, string> { const env = { TERM: "xterm-256color", COLORTERM: "truecolor", HOME: process.env.HOME ?? homedir(), USER: process.env.USER ?? "bbecker", SHELL: "/bin/bash", PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", LANG: process.env.LANG ?? "C.UTF-8" }; if (session.profilePath && session.kind === "codex") return {...env,CODEX_HOME:session.profilePath}; if (session.profilePath && session.kind === "opencode") return {...env,XDG_DATA_HOME:session.profilePath}; return env; }
  private async validateCwd(value: string) { let cwd: string; try { cwd = resolve(value); } catch { throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis ist ungültig."); } if (!this.options.allowedRoots.some((root) => { const pathFromRoot = relative(root, cwd); return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot)); })) throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis liegt außerhalb der erlaubten Bereiche."); let details; try { details = await stat(cwd); } catch { throw new TerminalFailure("CWD_NOT_FOUND", "Das Arbeitsverzeichnis wurde nicht gefunden."); } if (!details.isDirectory()) throw new TerminalFailure("CWD_NOT_DIRECTORY", "Der angegebene Pfad ist kein Verzeichnis."); return cwd; }
  private owned(userId: string, sessionId: string) { const session = this.sessions.get(sessionId); if (!session) throw new TerminalFailure("SESSION_NOT_FOUND", "Die Terminalsitzung wurde nicht gefunden."); if (session.userId !== userId) throw new TerminalFailure("SESSION_NOT_OWNED", "Kein Zugriff auf diese Terminalsitzung."); return session; }
  private running(userId: string, sessionId: string) { const session = this.owned(userId, sessionId); if (session.status !== "running" || !session.pty) throw new TerminalFailure("TERMINAL_NOT_RUNNING", "Das Terminal läuft nicht."); return session; }
  private emit(session: TerminalSession, message: ServerTerminalMessage) { for (const client of session.clients) client(message); }
  private limitHistory(history: string) { return history.length <= HISTORY_LIMIT ? history : history.slice(history.length - HISTORY_LIMIT).replace(/^[^\n]*\n/, ""); }
  private stopProcess(session: TerminalSession) { const pid = session.pid; session.dataListener?.dispose(); session.exitListener?.dispose(); session.dataListener = null; session.exitListener = null; try { session.pty?.kill("SIGTERM"); } catch { /* The PTY may already have exited. */ } if (process.platform === "linux" && pid > 0) { try { kill(-pid, "SIGTERM"); } catch { /* The process group may already have exited. */ } const forceKill = setTimeout(() => { try { kill(-pid, "SIGKILL"); } catch { /* The process group exited during its grace period. */ } }, 1_000); forceKill.unref(); } session.pty = null; }
  private close(session: TerminalSession) { if (session.status === "closed") return; if (session.disconnectTimer) clearTimeout(session.disconnectTimer); this.stopProcess(session); session.status = "closed"; session.clients.clear(); session.history = ""; this.sessions.delete(session.id); }
}
