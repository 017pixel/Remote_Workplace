import { homedir, userInfo } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { kill } from "node:process";
import type { PtyAdapter } from "./NodePtyAdapter.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ServerTerminalMessage, TerminalKind } from "./protocol.js";
import { createHeadlessTerminal } from "./runtime/HeadlessTerminal.js";
import { TerminalFailure, type TerminalSession } from "./session.js";
import { broadcastSnapshot, limitHistory } from "./snapshots.js";

export interface ProcessRuntimeDependencies {
  adapter: PtyAdapter;
  supervisor: TmuxSupervisor | undefined;
  cliPaths: Partial<Record<Exclude<TerminalKind, "shell">, string>> | undefined;
  onOutput: ((session: Readonly<TerminalSession>, data: string) => void) | undefined;
  persist(session: TerminalSession): void;
  emit(session: TerminalSession, message: ServerTerminalMessage): void;
  cwdRefreshTimers: Map<string, NodeJS.Timeout>;
}

export interface ProcessRuntime {
  kindLabel(kind: TerminalKind): string;
  launchCommand(kind: TerminalKind, mode: "agent" | "login"): { file: string; args: string[] };
  environment(session: TerminalSession): Record<string, string>;
  spawn(session: TerminalSession): void;
  attachPty(session: TerminalSession, command: { file: string; args: string[] }, environment: Record<string, string>): void;
  handlePtyExit(session: TerminalSession, event: { exitCode: number; signal?: number }): void;
  stopProcess(session: TerminalSession, terminateRuntime: boolean): void;
  scheduleCwdRefresh(session: TerminalSession): void;
}

/** Bündelt den PTY-Prozesslebenszyklus (spawn, attach, exit, stop) mit den
 *  dazugehörigen Befehls- und Umgebungs-Helfern. Die Funktionen hängen über
 *  den gemeinsamen Dependency-Kontext zusammen, damit der Manager schlank
 *  bleibt und keine zirkulären Imports entstehen. */
export function createProcessRuntime(deps: ProcessRuntimeDependencies): ProcessRuntime {
  const { adapter, supervisor, cliPaths, onOutput, persist, emit, cwdRefreshTimers } = deps;

  function kindLabel(kind: TerminalKind) {
    return kind === "codex" ? "Codex" : kind === "opencode" ? "OpenCode" : kind === "claude" ? "Claude Code" : "Terminal";
  }

  function launchCommand(kind: TerminalKind, mode: "agent" | "login"): { file: string; args: string[] } {
    if (kind === "shell") return { file: "/bin/bash", args: ["--login"] };
    return { file: cliPaths?.[kind] ?? kind, args: mode === "login" ? (kind === "codex" ? ["login", "--device-auth"] : ["auth", "login"]) : [] };
  }

  function environment(session: TerminalSession): Record<string, string> {
    const env: Record<string, string> = {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      HOME: process.env.HOME ?? homedir(),
      USER: process.env.USER ?? userInfo().username,
      SHELL: "/bin/bash",
      PATH: process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      LANG: process.env.LANG ?? "C.UTF-8",
      ...(session.kind === "shell" ? { PROMPT_COMMAND: `printf '\\e]7;file://%s%s\\e\\' "$HOSTNAME" "$PWD"` } : {}),
    };
    if (session.profilePath && session.kind === "codex") return { ...env, CODEX_HOME: session.profilePath };
    if (session.profilePath && session.kind === "opencode") return { ...env, XDG_DATA_HOME: session.profilePath };
    if (session.profilePath && session.kind === "claude" && resolve(session.profilePath) !== resolve(homedir(), ".claude")) return { ...env, CLAUDE_CONFIG_DIR: session.profilePath };
    return env;
  }

  function attachPty(session: TerminalSession, command: { file: string; args: string[] }, environment: Record<string, string>): void {
    session.dataListener?.dispose();
    session.exitListener?.dispose();
    // Der autoritative Terminalzustand muss vor dem Spawn in der Zielgeometrie
    // stehen, damit der erste Output bereits korrekt eingeordnet wird.
    if (!session.headless) session.headless = createHeadlessTerminal(session.cols, session.rows);
    else if (session.headless.cols !== session.cols || session.headless.rows !== session.rows) session.headless.resize(session.cols, session.rows);
    const pty = adapter.spawn(command.file, command.args, {
      name: "xterm-256color",
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      env: environment,
    });
    session.pty = pty;
    session.pid = pty.pid;
    session.status = "running";
    session.updatedAt = Date.now();
    session.lastPersistedAt = undefined;
    persist(session);
    session.dataListener = pty.onData((data) => {
      if (session.pty !== pty) return;
      session.history = limitHistory(session.history + data);
      session.sequence += 1;
      session.updatedAt = Date.now();
      // Jedes Byte fließt zuerst in den autoritativen Terminalzustand.
      session.headless?.write(data);
      session.journal.push({ sequence: session.sequence, data });
      persist(session);
      emit(session, { type: "terminal.output", sessionId: session.id, data, sequence: session.sequence });
      scheduleCwdRefresh(session);
      onOutput?.(session, data);
    });
    session.exitListener = pty.onExit((event) => {
      if (session.pty !== pty || session.status === "closed" || session.status === "interrupted") return;
      session.pty = null;
      handlePtyExit(session, event);
    });
  }

  function handlePtyExit(session: TerminalSession, event: { exitCode: number; signal?: number }): void {
    const supervisorName = session.supervisorName;
    if (supervisor && supervisorName && supervisor.has(supervisorName)) {
      try {
        const launch = launchCommand(session.kind, session.mode);
        const nextEnvironment = environment(session);
        supervisor.respawn(supervisorName, session.cwd, { ...launch, environment: nextEnvironment });
        session.history = limitHistory(supervisor.capture(supervisorName));
        session.sequence += 1;
        emit(session, {
          type: "terminal.restarting",
          sessionId: session.id,
          reason: "Der Terminalprozess wurde beendet und automatisch neu gestartet.",
          sequence: session.sequence,
        });
        attachPty(session, supervisor.attachCommand(supervisorName), nextEnvironment);
        const timer = setTimeout(() => {
          try { supervisor.sendLastCommandHint(supervisorName); } catch { /* shell may not be ready */ }
        }, 800);
        timer.unref();
        broadcastSnapshot(session, supervisor);
        return;
      } catch {
        // Der gemeinsame Exitpfad setzt einen ehrlichen, nicht beschreibbaren Zustand.
      }
    }
    session.status = "exited";
    session.exitCode = event.exitCode;
    session.exitSignal = event.signal ?? null;
    session.sequence += 1;
    session.updatedAt = Date.now();
    persist(session);
    emit(session, {
      type: "terminal.exited",
      sessionId: session.id,
      exitCode: session.exitCode,
      signal: session.exitSignal,
      sequence: session.sequence,
    });
  }

  function spawn(session: TerminalSession): void {
    try {
      const launch = launchCommand(session.kind, session.mode);
      const nextEnvironment = environment(session);
      const command = supervisor ? (() => {
        session.supervisorName = supervisor.ensure({ runtimeId: session.runtimeId, kind: session.kind, projectId: session.projectId, cwd: session.cwd, command: { ...launch, environment: nextEnvironment } });
        session.history = limitHistory(supervisor.capture(session.supervisorName));
        return supervisor.attachCommand(session.supervisorName);
      })() : launch;
      attachPty(session, command, nextEnvironment);
    } catch (error) {
      // Fehlendes CLI-Binary (ENOENT) ist ein klarer Installationszustand.
      if (session.kind !== "shell" && (error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new TerminalFailure("CLI_NOT_FOUND", `${kindLabel(session.kind)} ist nicht installiert oder nicht im PATH auffindbar.`);
      }
      throw new TerminalFailure("PTY_SPAWN_FAILED", "Die Shell konnte nicht gestartet werden.");
    }
  }

  function stopProcess(session: TerminalSession, terminateRuntime: boolean): void {
    const pid = session.pid;
    session.dataListener?.dispose();
    session.exitListener?.dispose();
    session.dataListener = null;
    session.exitListener = null;
    try { session.pty?.kill("SIGTERM"); } catch { /* already exited */ }
    if (process.platform === "linux" && pid > 0) {
      try { kill(-pid, "SIGTERM"); } catch { /* process group already exited */ }
      const forceKill = setTimeout(() => { try { kill(-pid, "SIGKILL"); } catch { /* process group exited */ } }, 1_000);
      forceKill.unref();
    }
    session.pty = null;
    if (terminateRuntime && supervisor && session.supervisorName) {
      supervisor.terminate(session.supervisorName);
      session.supervisorName = null;
    }
  }

  function scheduleCwdRefresh(session: TerminalSession): void {
    if (!supervisor || !session.supervisorName || session.kind !== "shell") return;
    const pending = cwdRefreshTimers.get(session.id);
    if (pending) clearTimeout(pending);
    const timer = setTimeout(() => {
      cwdRefreshTimers.delete(session.id);
      if (!session.supervisorName) return;
      const cwd = supervisor?.currentPath(session.supervisorName);
      if (!cwd || cwd === session.cwd || !isAbsolute(cwd)) return;
      session.cwd = cwd;
      session.updatedAt = Date.now();
      session.lastPersistedAt = undefined;
      persist(session);
      emit(session, { type: "terminal.cwd", sessionId: session.id, cwd });
    }, 80);
    timer.unref();
    cwdRefreshTimers.set(session.id, timer);
  }

  return { kindLabel, launchCommand, environment, spawn, attachPty, handlePtyExit, stopProcess, scheduleCwdRefresh };
}
