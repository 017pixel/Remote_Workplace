import { randomUUID } from "node:crypto";
import type { PtyAdapter } from "./NodePtyAdapter.js";
import { nodePtyAdapter } from "./NodePtyAdapter.js";
import type { TerminalDatabase } from "./database.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ServerTerminalMessage, TerminalKind } from "./protocol.js";
import { createProcessRuntime, type ProcessRuntime } from "./process.js";
import { fromStored, importSupervisorSessions, validateCwd } from "./restore.js";
import { EXITED_SESSION_TTL_MS, TerminalFailure, type TerminalClientViewport, type TerminalSession } from "./session.js";
import { applyResize, broadcastSnapshot, snapshotMessage } from "./snapshots.js";

// Behält den öffentlichen Export bei, damit bestehende Importe stabil bleiben.
export { TerminalFailure } from "./session.js";

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly creationLocks = new Map<string, Promise<TerminalSession>>();
  private readonly cwdRefreshTimers = new Map<string, NodeJS.Timeout>();
  private readonly process: ProcessRuntime;

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
    onOutput?: (session: Readonly<TerminalSession>, data: string) => void;
    onInput?: (session: Readonly<TerminalSession>, data: string) => void;
    resolveAccountProfile?: (accountId: string, kind: Exclude<TerminalKind, "shell">) => string;
  }) {
    this.process = createProcessRuntime({
      adapter: this.adapter,
      supervisor: this.options.supervisor,
      cliPaths: this.options.cliPaths,
      onOutput: this.options.onOutput,
      persist: (session) => this.persist(session),
      emit: (session, message) => this.emit(session, message),
      cwdRefreshTimers: this.cwdRefreshTimers,
    });
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
    clientId?: string;
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
    clientId?: string;
  }): Promise<TerminalSession> {
    const runtimeId = input.runtimeId ?? randomUUID();
    const existing = this.findByRuntime(userId, runtimeId);
    if (existing) {
      if (existing.kind !== (input.kind ?? "shell") || existing.projectId !== (input.projectId ?? null)) {
        throw new TerminalFailure("SESSION_RUNTIME_CONFLICT", "Diese Werkzeuginstanz ist bereits an eine andere Session gebunden.");
      }
      // Wenn kein Gerät mehr verbunden ist, gehört die PTY-Geometrie dem
      // wiederkehrenden Client. Wichtig: Nicht nur die Metadaten aktualisieren,
      // sondern eine noch lebende PTY wirklich resizen, damit Fullscreen-TUIs
      // vor dem Snapshot bereits im neuen Raster zeichnen.
      const ownsInitialGeometry = existing.clients.size === 0
        && (existing.primaryClientId === null || existing.primaryClientId === input.clientId);
      if (ownsInitialGeometry) {
        if (existing.primaryClientId === null && input.clientId) existing.primaryClientId = input.clientId;
        if (existing.status === "running" && existing.pty) {
          try { applyResize(existing, input.cols, input.rows, (session) => this.persist(session)); }
          catch { throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden."); }
        } else {
          existing.cols = input.cols;
          existing.rows = input.rows;
        }
      }
      if (!existing.pty) {
        const supervisorAlive = this.options.supervisor && existing.supervisorName && this.options.supervisor.has(existing.supervisorName);
        // Jede pty-lose, nicht geschlossene Session wird beim nächsten
        // Verbinden wieder in den laufenden Zustand gebracht.
        if (existing.status !== "running" || supervisorAlive) {
          existing.status = "starting";
          this.process.spawn(existing);
        } else if (existing.status === "running") {
          existing.status = "interrupted";
        }
      }
      this.persist(existing);
      return existing;
    }

    const kind = input.kind ?? "shell";
    // Beendete Sessions, deren TTL abgelaufen ist, räumen sich selbst auf.
    const now = Date.now();
    for (const session of [...this.sessions.values()]) {
      if (session.status === "exited" && now - session.updatedAt > EXITED_SESSION_TTL_MS) {
        this.close(session);
      }
    }
    const activeSessions = [...this.sessions.values()].filter((session) => session.userId === userId && session.status !== "closed");
    const kindLimit = this.options.maxSessionsByKind?.[kind] ?? this.options.maxSessions;
    if (activeSessions.filter((session) => session.kind === kind).length >= kindLimit) {
      throw new TerminalFailure("TOO_MANY_SESSIONS", `Die maximale Anzahl gleichzeitig geöffneter ${this.process.kindLabel(kind)}-Instanzen ist erreicht.`);
    }
    if (activeSessions.length >= this.options.maxSessions) throw new TerminalFailure("TOO_MANY_SESSIONS", "Die maximale Anzahl gleichzeitig geöffneter Terminals ist erreicht.");
    const cwd = await validateCwd(input.cwd ?? this.options.defaultCwd, this.options.allowedRoots);
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
      clients: new Map(), clientViewports: new Map(), primaryClientId: input.clientId ?? null,
      dataListener: null, exitListener: null, lastPersistedAt: undefined,
    };
    this.sessions.set(session.id, session);
    this.persist(session);
    try { this.process.spawn(session); return session; }
    catch (error) {
      // Schlägt nur das Anhängen fehl (etwa direkt nach dem Aufwachen aus dem
      // Schlaf), während die tmux-Session weiterlebt, bleibt die Session bestehen.
      if (this.options.supervisor && session.supervisorName && this.options.supervisor.has(session.supervisorName)) {
        session.status = "interrupted";
        session.updatedAt = Date.now();
        this.persist(session);
        return session;
      }
      this.sessions.delete(session.id); this.options.database?.deleteSession(userId, session.id); throw error;
    }
  }

  attachSession(userId: string, sessionId: string, client: (message: ServerTerminalMessage) => void, clientId: string = randomUUID(), viewport?: TerminalClientViewport): () => void {
    const session = this.owned(userId, sessionId);
    session.clients.set(clientId, client);
    if (viewport) {
      this.validateViewport(viewport.cols, viewport.rows);
      session.clientViewports.set(clientId, viewport);
    } else {
      session.clientViewports.set(clientId, { cols: session.cols, rows: session.rows });
    }
    if (session.primaryClientId === null) session.primaryClientId = clientId;
    // Die Geometrie muss vor dem Snapshot stimmen: Wird dieser Client Primary,
    // bekommt die PTY sofort seinen Viewport. Sonst entsteht der Snapshot im
    // Raster des Vorgängers und wird danach in einem anders großen xterm
    // eingespielt — genau das zerreißt Fullscreen-TUIs.
    if (session.primaryClientId === clientId && viewport && session.status === "running" && session.pty) {
      try { applyResize(session, viewport.cols, viewport.rows, (s) => this.persist(s)); }
      catch { throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden."); }
    }
    client(snapshotMessage(session, clientId, this.options.supervisor));
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      this.detachClientFromSession(session, clientId);
    };
  }

  /** Entfernt auch einen Client, der nach `create` vor `attach` getrennt wurde. */
  detachClient(userId: string, clientId: string) {
    for (const session of this.sessions.values()) {
      if (session.userId !== userId) continue;
      if (session.clients.has(clientId) || session.primaryClientId === clientId) this.detachClientFromSession(session, clientId);
    }
  }

  /** Markiert den aktuell interagierenden Browser als Geometrie-Eigentümer. */
  activateClient(userId: string, sessionId: string, clientId: string, viewport?: TerminalClientViewport) {
    const session = this.running(userId, sessionId);
    if (!session.clients.has(clientId)) return;
    const changedOwner = session.primaryClientId !== clientId;
    if (viewport) {
      this.validateViewport(viewport.cols, viewport.rows);
      session.clientViewports.set(clientId, viewport);
    }
    session.primaryClientId = clientId;
    const target = viewport ?? (changedOwner ? session.clientViewports.get(clientId) : undefined);
    if (!target) return;
    try { applyResize(session, target.cols, target.rows, (s) => this.persist(s)); }
    catch { throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden."); }
  }

  writeToSession(userId: string, sessionId: string, data: string) {
    const session = this.running(userId, sessionId);
    this.options.onInput?.(session, data);
    try { session.pty?.write(data); session.updatedAt = Date.now(); this.persist(session); }
    catch { throw new TerminalFailure("PTY_WRITE_FAILED", "Die Eingabe konnte nicht an das Terminal gesendet werden."); }
  }

  resizeSession(userId: string, sessionId: string, cols: number, rows: number, clientId?: string) {
    const session = this.running(userId, sessionId);
    this.validateViewport(cols, rows);
    if (clientId) {
      if (!session.clients.has(clientId)) return;
      session.clientViewports.set(clientId, { cols, rows });
      if (session.primaryClientId !== clientId) return;
    }
    try { applyResize(session, cols, rows, (s) => this.persist(s)); }
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
    if (session.status === "running") this.process.stopProcess(session, true);
    session.history = ""; session.exitCode = null; session.exitSignal = null; session.status = "starting"; session.updatedAt = Date.now();
    this.persist(session); this.process.spawn(session);
    broadcastSnapshot(session, this.options.supervisor);
    return session;
  }

  closeSession(userId: string, sessionId: string) { this.close(this.owned(userId, sessionId)); }

  listSessions(userId: string) {
    importSupervisorSessions(userId, { supervisor: this.options.supervisor, database: this.options.database, externalSessionOwnerId: this.options.externalSessionOwnerId, defaultCwd: this.options.defaultCwd });
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
    for (const timer of this.cwdRefreshTimers.values()) clearTimeout(timer);
    this.cwdRefreshTimers.clear();
    for (const session of this.sessions.values()) {
      if (session.status === "closed") continue;
      this.process.stopProcess(session, false);
      session.status = this.options.supervisor && session.supervisorName && this.options.supervisor.has(session.supervisorName) ? "running" : "interrupted";
      session.updatedAt = Date.now(); this.persist(session); session.clients.clear(); session.clientViewports.clear(); session.primaryClientId = null;
    }
    this.sessions.clear();
  }

  private findByRuntime(userId: string, runtimeId: string) {
    const live = [...this.sessions.values()].find((session) => session.userId === userId && session.runtimeId === runtimeId);
    if (live) return live;
    const stored = this.options.database?.findSession(userId, runtimeId);
    if (!stored) return undefined;
    const restored = fromStored(stored);
    this.sessions.set(restored.id, restored);
    return restored;
  }

  private persist(session: TerminalSession) {
    if (session.status === "running" && session.lastPersistedAt !== undefined && session.updatedAt - session.lastPersistedAt < 1_000) return;
    this.options.database?.updateSession({ id: session.id, userId: session.userId, runtimeId: session.runtimeId, kind: session.kind, mode: session.mode, projectId: session.projectId, profilePath: session.profilePath, supervisorName: session.supervisorName, cwd: session.cwd, pid: session.pid, cols: session.cols, rows: session.rows, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, exitCode: session.exitCode, exitSignal: session.exitSignal });
    session.lastPersistedAt = session.updatedAt;
  }

  private owned(userId: string, sessionId: string) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      const stored = this.options.database?.findSessionById(userId, sessionId);
      if (stored) { session = fromStored(stored); this.sessions.set(session.id, session); }
    }
    if (!session) throw new TerminalFailure("SESSION_NOT_FOUND", "Die Terminalsitzung wurde nicht gefunden.");
    if (session.userId !== userId) throw new TerminalFailure("SESSION_NOT_OWNED", "Kein Zugriff auf diese Terminalsitzung.");
    return session;
  }

  private running(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    if (session.status !== "running" || !session.pty) throw new TerminalFailure(session.status === "interrupted" ? "SESSION_INTERRUPTED" : "TERMINAL_NOT_RUNNING", "Das Terminal läuft nicht.");
    return session;
  }

  private emit(session: TerminalSession, message: ServerTerminalMessage) {
    for (const client of session.clients.values()) client(message);
  }

  private detachClientFromSession(session: TerminalSession, clientId: string) {
    const wasPrimary = session.primaryClientId === clientId;
    session.clients.delete(clientId);
    session.clientViewports.delete(clientId);
    if (!wasPrimary) return;
    const next = session.clients.keys().next().value as string | undefined;
    session.primaryClientId = next ?? null;
    const viewport = next ? session.clientViewports.get(next) : undefined;
    if (!viewport || session.status !== "running" || !session.pty) return;
    try { applyResize(session, viewport.cols, viewport.rows, (s) => this.persist(s)); } catch { /* Der neue Primary passt beim nächsten Resize erneut an. */ }
  }

  private validateViewport(cols: number, rows: number) {
    if (cols < 2 || cols > 500 || rows < 1 || rows > 300) throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße ist ungültig.");
  }

  private close(session: TerminalSession) {
    if (session.status === "closed") return;
    session.status = "closed";
    this.process.stopProcess(session, true);
    session.clients.clear();
    session.clientViewports.clear();
    session.primaryClientId = null;
    this.options.database?.deleteSession(session.userId, session.id);
    this.sessions.delete(session.id);
  }
}
