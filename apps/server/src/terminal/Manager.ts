import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { kill } from "node:process";
import { isAbsolute, relative, resolve } from "node:path";
import { homedir, userInfo } from "node:os";
import type { PtyAdapter, PtyProcess } from "./NodePtyAdapter.js";
import { nodePtyAdapter } from "./NodePtyAdapter.js";
import type { TerminalDatabase, StoredTerminalSession } from "./database.js";
import type { ServerTerminalMessage, TerminalErrorCode, TerminalKind } from "./protocol.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";

export type TerminalStatus = "starting" | "running" | "exited" | "interrupted" | "closed";
export interface TerminalSession {
  id: string;
  userId: string;
  runtimeId: string;
  kind: TerminalKind;
  mode: "agent" | "login";
  profilePath: string | null;
  supervisorName: string | null;
  projectId: string | null;
  pty: PtyProcess | null;
  pid: number;
  cwd: string;
  cols: number;
  rows: number;
  status: TerminalStatus;
  history: string;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  exitSignal: number | null;
  sequence: number;
  lastPersistedAt: number | undefined;
  clients: Set<(message: ServerTerminalMessage) => void>;
  dataListener: { dispose(): void } | null;
  exitListener: { dispose(): void } | null;
}
export class TerminalFailure extends Error { constructor(readonly code: TerminalErrorCode, message: string) { super(message); } }

const HISTORY_LIMIT = 3 * 1024 * 1024;

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly creationLocks = new Map<string, Promise<TerminalSession>>();
  constructor(private readonly options: {
    allowedRoots: string[];
    defaultCwd: string;
    maxSessions: number;
    cliPaths?: Partial<Record<Exclude<TerminalKind, "shell">, string>>;
    maxSessionsByKind?: Partial<Record<TerminalKind, number>>;
    adapter?: PtyAdapter;
    database?: TerminalDatabase;
    supervisor?: TmuxSupervisor;
    externalSessionOwnerId?: string;
    reconnectGraceMs?: number;
    resolveAccountProfile?: (accountId: string, kind: Exclude<TerminalKind, "shell">) => string;
  }) {
    if (this.options.supervisor) {
      this.options.database?.reconcileSupervisorSessions(new Set(this.options.supervisor.list().map((session) => session.name)));
    } else {
      this.options.database?.markRunningSessionsInterrupted();
    }
  }

  private get adapter() { return this.options.adapter ?? nodePtyAdapter; }

  async createSession(userId: string, input: {
    runtimeId?: string;
    projectId?: string | null;
    kind?: TerminalKind;
    cwd?: string;
    cols: number;
    rows: number;
    mode?: "agent" | "login";
    accountId?: string;
  }): Promise<TerminalSession> {
    const lockKey = input.runtimeId ? `${userId}\u0000${input.runtimeId}` : randomUUID();
    const pending = this.creationLocks.get(lockKey);
    if (pending) return pending;
    const creation = this.createSessionInternal(userId, input);
    this.creationLocks.set(lockKey, creation);
    try { return await creation; } finally { this.creationLocks.delete(lockKey); }
  }

  private async createSessionInternal(userId: string, input: {
    runtimeId?: string;
    projectId?: string | null;
    kind?: TerminalKind;
    cwd?: string;
    cols: number;
    rows: number;
    mode?: "agent" | "login";
    accountId?: string;
  }): Promise<TerminalSession> {
    const runtimeId = input.runtimeId ?? randomUUID();
    const existing = this.findByRuntime(userId, runtimeId);
    if (existing) {
      if (existing.kind !== (input.kind ?? "shell") || existing.projectId !== (input.projectId ?? null)) {
        throw new TerminalFailure("SESSION_RUNTIME_CONFLICT", "Diese Werkzeuginstanz ist bereits an eine andere Session gebunden.");
      }
      existing.cols = input.cols;
      existing.rows = input.rows;
      if (!existing.pty && this.options.supervisor && existing.supervisorName && this.options.supervisor.has(existing.supervisorName)) {
        existing.status = "starting";
        this.spawn(existing);
      } else if (!existing.pty && existing.status === "running") {
        existing.status = "interrupted";
      }
      this.persist(existing);
      return existing;
    }

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
    let profilePath: string | null = null;
    if (input.accountId && kind !== "shell") {
      try { profilePath = this.options.resolveAccountProfile?.(input.accountId, kind) ?? null; }
      catch { throw new TerminalFailure("INVALID_MESSAGE", "Der Anmeldeaccount wurde nicht gefunden."); }
    }
    const session: TerminalSession = {
      id: randomUUID(), userId, runtimeId, kind, mode: input.mode ?? "agent", profilePath,
      projectId: input.projectId ?? null, supervisorName: null, pty: null, pid: 0, cwd, cols: input.cols, rows: input.rows,
      status: "starting", history: "", createdAt: now, updatedAt: now, exitCode: null, exitSignal: null, sequence: 0,
      clients: new Set(), dataListener: null, exitListener: null, lastPersistedAt: undefined,
    };
    this.sessions.set(session.id, session);
    this.persist(session);
    try { this.spawn(session); return session; }
    catch (error) { this.sessions.delete(session.id); this.options.database?.deleteSession(userId, session.id); throw error; }
  }

  attachSession(userId: string, sessionId: string, client: (message: ServerTerminalMessage) => void): () => void {
    const session = this.owned(userId, sessionId);
    session.clients.add(client);
    client({ type: "terminal.snapshot", sessionId, runtimeId: session.runtimeId, kind: session.kind, status: session.status, projectId: session.projectId, cwd: session.cwd, history: session.history, sequence: session.sequence ?? 0 });
    return () => { session.clients.delete(client); };
  }

  writeToSession(userId: string, sessionId: string, data: string) {
    const session = this.running(userId, sessionId);
    try { session.pty?.write(data); session.updatedAt = Date.now(); this.persist(session); }
    catch { throw new TerminalFailure("PTY_WRITE_FAILED", "Die Eingabe konnte nicht an das Terminal gesendet werden."); }
  }

  resizeSession(userId: string, sessionId: string, cols: number, rows: number) {
    const session = this.running(userId, sessionId);
    if (cols < 2 || cols > 500 || rows < 1 || rows > 300) throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße ist ungültig.");
    try { session.pty?.resize(cols, rows); session.cols = cols; session.rows = rows; session.updatedAt = Date.now(); this.persist(session); }
    catch { throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden."); }
  }

  clearSessionHistory(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    if (session.status === "closed") throw new TerminalFailure("SESSION_ALREADY_CLOSED", "Die Terminalsitzung wurde bereits beendet.");
    session.history = ""; session.sequence += 1; session.updatedAt = Date.now();
    this.emit(session, { type: "terminal.cleared", sessionId, sequence: session.sequence });
  }

  restartSession(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    if (session.status === "closed") throw new TerminalFailure("SESSION_ALREADY_CLOSED", "Die Terminalsitzung wurde bereits beendet.");
    if (session.status === "running") this.stopProcess(session, true);
    session.history = ""; session.exitCode = null; session.exitSignal = null; session.status = "starting"; session.updatedAt = Date.now();
    this.persist(session); this.spawn(session);
    this.emit(session, { type: "terminal.snapshot", sessionId: session.id, runtimeId: session.runtimeId, kind: session.kind, status: session.status, projectId: session.projectId, cwd: session.cwd, history: session.history, sequence: session.sequence });
    return session;
  }

  closeSession(userId: string, sessionId: string) { this.close(this.owned(userId, sessionId)); }

  listSessions(userId: string) {
    this.importSupervisorSessions(userId);
    const stored = this.options.database?.listSessions(userId, (id) => this.sessions.get(id)?.clients.size ?? 0) ?? [];
    return stored.map((item) => {
      const session = this.sessions.get(item.id);
      return { ...item, connectedClients: session?.clients.size ?? item.connectedClients };
    });
  }

  getSessionMetadata(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    return { id: session.id, runtimeId: session.runtimeId, userId: session.userId, kind: session.kind, projectId: session.projectId, pid: session.pid, cwd: session.cwd, cols: session.cols, rows: session.rows, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, exitCode: session.exitCode, exitSignal: session.exitSignal, sequence: session.sequence, connectedClients: session.clients.size };
  }

  shutdown() {
    for (const session of this.sessions.values()) {
      if (session.status === "closed") continue;
      this.stopProcess(session, false);
      session.status = this.options.supervisor && session.supervisorName && this.options.supervisor.has(session.supervisorName) ? "running" : "interrupted";
      session.updatedAt = Date.now(); this.persist(session); session.clients.clear();
    }
    this.sessions.clear();
  }

  private findByRuntime(userId: string, runtimeId: string) {
    const live = [...this.sessions.values()].find((session) => session.userId === userId && session.runtimeId === runtimeId);
    if (live) return live;
    const stored = this.options.database?.findSession(userId, runtimeId);
    if (!stored) return undefined;
    const restored = this.fromStored(stored);
    this.sessions.set(restored.id, restored);
    return restored;
  }

  private importSupervisorSessions(userId: string) {
    if (!this.options.supervisor || !this.options.database) return;
    if (this.options.externalSessionOwnerId !== userId) return;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const discovered of this.options.supervisor.list()) {
      if (this.options.database.findSessionBySupervisor(discovered.name)) continue;
      const now = Date.now();
      this.options.database.saveSession({
        id: randomUUID(),
        userId,
        runtimeId: discovered.runtimeId && uuidPattern.test(discovered.runtimeId) ? discovered.runtimeId : randomUUID(),
        kind: discovered.kind,
        mode: "agent",
        projectId: discovered.projectId,
        profilePath: null,
        supervisorName: discovered.name,
        cwd: isAbsolute(discovered.cwd) ? discovered.cwd : this.options.defaultCwd,
        pid: 0,
        cols: 120,
        rows: 32,
        status: "running",
        createdAt: discovered.createdAt || now,
        updatedAt: now,
        exitCode: null,
        exitSignal: null,
      });
    }
  }

  private fromStored(stored: StoredTerminalSession): TerminalSession {
    return { ...stored, pty: null, history: "", clients: new Set(), dataListener: null, exitListener: null, sequence: 0, lastPersistedAt: undefined };
  }

  private persist(session: TerminalSession) {
    if (session.status === "running" && session.lastPersistedAt !== undefined && session.updatedAt - session.lastPersistedAt < 1_000) return;
    this.options.database?.updateSession({ id: session.id, userId: session.userId, runtimeId: session.runtimeId, kind: session.kind, mode: session.mode, projectId: session.projectId, profilePath: session.profilePath, supervisorName: session.supervisorName, cwd: session.cwd, pid: session.pid, cols: session.cols, rows: session.rows, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, exitCode: session.exitCode, exitSignal: session.exitSignal });
    session.lastPersistedAt = session.updatedAt;
  }

  private spawn(session: TerminalSession) {
    try {
      const launch = this.launchCommand(session.kind, session.mode);
      const environment = this.environment(session);
      const command = this.options.supervisor ? (() => {
        session.supervisorName = this.options.supervisor.ensure({ runtimeId: session.runtimeId, kind: session.kind, projectId: session.projectId, cwd: session.cwd, command: { ...launch, environment } });
        session.history = this.limitHistory(this.options.supervisor.capture(session.supervisorName));
        return this.options.supervisor.attachCommand(session.supervisorName);
      })() : launch;
      const pty = this.adapter.spawn(command.file, command.args, { name: "xterm-256color", cwd: session.cwd, cols: session.cols, rows: session.rows, env: environment });
      session.pty = pty; session.pid = pty.pid; session.status = "running"; session.updatedAt = Date.now(); session.lastPersistedAt = undefined; this.persist(session);
      session.dataListener = pty.onData((data) => { session.history = this.limitHistory(session.history + data); session.sequence += 1; session.updatedAt = Date.now(); this.persist(session); this.emit(session, { type: "terminal.output", sessionId: session.id, data, sequence: session.sequence }); });
      session.exitListener = pty.onExit((event) => {
        if (session.status === "closed" || session.status === "interrupted") return;
        session.pty = null;
        if (this.options.supervisor && session.supervisorName && this.options.supervisor.has(session.supervisorName)) {
          try {
            const launch = this.launchCommand(session.kind, session.mode);
            const environment = this.environment(session);
            this.options.supervisor.respawn(session.supervisorName, session.cwd, { ...launch, environment });
            session.history = this.limitHistory(this.options.supervisor.capture(session.supervisorName));
            session.sequence += 1;
            this.emit(session, { type: "terminal.restarting", sessionId: session.id, reason: "Der Terminalprozess wurde beendet und automatisch neu gestartet.", sequence: session.sequence });
            const newPty = this.adapter.spawn(this.options.supervisor.attachCommand(session.supervisorName).file, this.options.supervisor.attachCommand(session.supervisorName).args, { name: "xterm-256color", cwd: session.cwd, cols: session.cols, rows: session.rows, env: environment });
            session.pty = newPty; session.pid = newPty.pid; session.updatedAt = Date.now(); this.persist(session);
            const supervisorRef = this.options.supervisor;
            const supervisorName = session.supervisorName;
            if (supervisorRef && supervisorName) {
              const timer = setTimeout(() => { try { supervisorRef.sendLastCommandHint(supervisorName); } catch { /* shell may not be ready */ } }, 800);
              timer.unref();
            }
            session.dataListener = newPty.onData((data) => { session.history = this.limitHistory(session.history + data); session.sequence += 1; session.updatedAt = Date.now(); this.persist(session); this.emit(session, { type: "terminal.output", sessionId: session.id, data, sequence: session.sequence }); });
            session.exitListener = newPty.onExit((nestedEvent) => {
              if (session.status === "closed" || session.status === "interrupted") return;
              session.pty = null;
              if (this.options.supervisor && session.supervisorName && this.options.supervisor.has(session.supervisorName)) {
                session.status = "running"; session.updatedAt = Date.now(); this.persist(session); return;
              }
              session.status = "exited"; session.exitCode = nestedEvent.exitCode; session.exitSignal = nestedEvent.signal ?? null; session.sequence += 1; session.updatedAt = Date.now(); this.persist(session); this.emit(session, { type: "terminal.exited", sessionId: session.id, exitCode: session.exitCode, signal: session.exitSignal, sequence: session.sequence });
            });
            this.emit(session, { type: "terminal.snapshot", sessionId: session.id, runtimeId: session.runtimeId, kind: session.kind, status: "running", projectId: session.projectId, cwd: session.cwd, history: session.history, sequence: session.sequence });
          } catch {
            session.status = "exited"; session.exitCode = event.exitCode; session.exitSignal = event.signal ?? null; session.sequence += 1; session.updatedAt = Date.now(); this.persist(session); this.emit(session, { type: "terminal.exited", sessionId: session.id, exitCode: session.exitCode, signal: session.exitSignal, sequence: session.sequence });
          }
          return;
        }
        session.status = "exited"; session.exitCode = event.exitCode; session.exitSignal = event.signal ?? null; session.sequence += 1; session.updatedAt = Date.now(); this.persist(session); this.emit(session, { type: "terminal.exited", sessionId: session.id, exitCode: session.exitCode, signal: session.exitSignal, sequence: session.sequence });
      });
    } catch { throw new TerminalFailure("PTY_SPAWN_FAILED", "Die Shell konnte nicht gestartet werden."); }
  }

  private launchCommand(kind: TerminalKind, mode: "agent" | "login"): { file: string; args: string[] } {
    if (kind === "shell") return { file: "/bin/bash", args: ["--login"] };
    return { file: this.options.cliPaths?.[kind] ?? kind, args: mode === "login" ? (kind === "codex" ? ["login", "--device-auth"] : ["auth", "login"]) : [] };
  }
  private kindLabel(kind: TerminalKind) { return kind === "codex" ? "Codex" : kind === "opencode" ? "OpenCode" : kind === "claude" ? "Claude Code" : "Terminal"; }
  private environment(session: TerminalSession): Record<string, string> { const env = { TERM: "xterm-256color", COLORTERM: "truecolor", HOME: process.env.HOME ?? homedir(), USER: process.env.USER ?? userInfo().username, SHELL: "/bin/bash", PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", LANG: process.env.LANG ?? "C.UTF-8" }; if (session.profilePath && session.kind === "codex") return { ...env, CODEX_HOME: session.profilePath }; if (session.profilePath && session.kind === "opencode") return { ...env, XDG_DATA_HOME: session.profilePath }; if (session.profilePath && session.kind === "claude" && resolve(session.profilePath) !== resolve(homedir(), ".claude")) return { ...env, CLAUDE_CONFIG_DIR: session.profilePath }; return env; }
  private owned(userId: string, sessionId: string) { let session = this.sessions.get(sessionId); if (!session) { const stored = this.options.database?.findSessionById(userId, sessionId); if (stored) { session = this.fromStored(stored); this.sessions.set(session.id, session); } } if (!session) throw new TerminalFailure("SESSION_NOT_FOUND", "Die Terminalsitzung wurde nicht gefunden."); if (session.userId !== userId) throw new TerminalFailure("SESSION_NOT_OWNED", "Kein Zugriff auf diese Terminalsitzung."); return session; }
  private running(userId: string, sessionId: string) { const session = this.owned(userId, sessionId); if (session.status !== "running" || !session.pty) throw new TerminalFailure(session.status === "interrupted" ? "SESSION_INTERRUPTED" : "TERMINAL_NOT_RUNNING", "Das Terminal läuft nicht."); return session; }
  private emit(session: TerminalSession, message: ServerTerminalMessage) { for (const client of session.clients) client(message); }
  private limitHistory(history: string) { return history.length <= HISTORY_LIMIT ? history : history.slice(history.length - HISTORY_LIMIT).replace(/^[^\n]*\n/, ""); }
  private stopProcess(session: TerminalSession, terminateRuntime: boolean) { const pid = session.pid; session.dataListener?.dispose(); session.exitListener?.dispose(); session.dataListener = null; session.exitListener = null; try { session.pty?.kill("SIGTERM"); } catch { /* already exited */ } if (process.platform === "linux" && pid > 0) { try { kill(-pid, "SIGTERM"); } catch { /* process group already exited */ } const forceKill = setTimeout(() => { try { kill(-pid, "SIGKILL"); } catch { /* process group exited */ } }, 1_000); forceKill.unref(); } session.pty = null; if (terminateRuntime && this.options.supervisor && session.supervisorName) { this.options.supervisor.terminate(session.supervisorName); session.supervisorName = null; } }
  private async validateCwd(value: string) { let cwd: string; try { cwd = resolve(value); } catch { throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis ist ungültig."); } if (!this.options.allowedRoots.some((root) => { const pathFromRoot = relative(root, cwd); return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot)); })) throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis liegt außerhalb der erlaubten Bereiche."); let details; try { details = await stat(cwd); } catch { throw new TerminalFailure("CWD_NOT_FOUND", "Das Arbeitsverzeichnis wurde nicht gefunden."); } if (!details.isDirectory()) throw new TerminalFailure("CWD_NOT_DIRECTORY", "Der angegebene Pfad ist kein Verzeichnis."); return cwd; }
  private close(session: TerminalSession) { if (session.status === "closed") return; session.status = "closed"; this.stopProcess(session, true); session.clients.clear(); this.options.database?.deleteSession(session.userId, session.id); this.sessions.delete(session.id); }
}
