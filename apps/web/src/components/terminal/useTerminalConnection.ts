import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import type { TerminalKind } from "@workbench/contracts";
import { handleServerMessage } from "./terminal-protocol";
import type { ServerMessage, TerminalMeta, TerminalStatus } from "./terminal-types";
import { createUuid, websocketUrl } from "./terminal-utils";
import { useTerminalOutput } from "./useTerminalOutput";

/** Vom xterm-Engine-Hook bereitgestellte Geometrie-Operationen. */
export interface TerminalEngineApi {
  resize(): void;
  measurePreferred(): { cols: number; rows: number } | null;
}

export interface TerminalConnectionOptions {
  instanceId: string;
  kind: TerminalKind;
  mode: "agent" | "login";
  projectId: string | null;
  initialCwd: string | null;
  accountId: string | undefined;
  active: boolean;
  keepAlive: boolean;
  send(message: object): boolean;
  onMetaChange: ((meta: TerminalMeta) => void) | undefined;
  terminalRef: MutableRefObject<Terminal | null>;
  socketRef: MutableRefObject<WebSocket | null>;
  sessionRef: MutableRefObject<string | null>;
  snapshotReplayRef: MutableRefObject<boolean>;
  replayBufferRef: MutableRefObject<string[]>;
  mouseTrackingRef: MutableRefObject<boolean>;
  mouseEncodingRef: MutableRefObject<boolean>;
  ownsGeometryRef: MutableRefObject<boolean>;
  activeRef: MutableRefObject<boolean>;
  keepAliveRef: MutableRefObject<boolean>;
  kindRef: MutableRefObject<TerminalKind>;
  disposedRef: MutableRefObject<boolean>;
  fatalRef: MutableRefObject<boolean>;
  engineApiRef: MutableRefObject<TerminalEngineApi>;
}

export interface TerminalConnection {
  status: TerminalStatus;
  cwd: string;
  error: string | null;
  size: { cols: number; rows: number };
  restartBanner: { message: string } | null;
  lastCommand: string;
  disconnectedTooLong: boolean;
  terminalIsDead: boolean;
  setError(message: string | null): void;
  setRestartBanner(banner: { message: string } | null): void;
  setCwd(cwd: string): void;
  connect(): void;
  createSession(): void;
  reportSize(cols: number, rows: number): void;
  rememberTyping(data: string): void;
  restart(): void;
  action(type: "terminal.clear" | "terminal.restart" | "terminal.close"): void;
}

/** Verwaltet WebSocket, Sitzungszustand und Ausgabepufferung für eine
 *  Terminal-Instanz. Kennt das xterm-Raster nur über Refs und die Engine-API. */
export function useTerminalConnection(options: TerminalConnectionOptions): TerminalConnection {
  const {
    instanceId, kind, mode, projectId, initialCwd, accountId,
    active, keepAlive, send, onMetaChange, terminalRef, socketRef, sessionRef,
    snapshotReplayRef, replayBufferRef, mouseTrackingRef, mouseEncodingRef,
    ownsGeometryRef, activeRef, keepAliveRef, kindRef, disposedRef, fatalRef, engineApiRef,
  } = options;

  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [cwd, setCwd] = useState("–");
  const [size, setSize] = useState({ cols: 0, rows: 0 });
  const [error, setError] = useState<string | null>(null);
  const [restartBanner, setRestartBanner] = useState<{ message: string } | null>(null);

  const sequenceRef = useRef(0);
  const reconnectRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const retriesRef = useRef(0);
  const autoRestartCountRef = useRef(0);
  const interruptedRetriesRef = useRef(0);

  const output = useTerminalOutput({ terminalRef, activeRef, sessionRef, replayBufferRef, send, setError });
  const { lastCommand, currentLineRef, flushOutput, queueOutput, flushReplayBuffer, rememberTyping } = output;

  useEffect(() => {
    onMetaChange?.({ status, cwd, error, cols: size.cols, rows: size.rows });
  }, [cwd, error, onMetaChange, size.cols, size.rows, status]);

  // "exited" und "error" sind endgültig. Eine Trennung behebt das
  // Wiederverbinden meist von selbst; erst nach einigen Sekunden erscheint der
  // Neustart-Knopf, damit er bei jedem Backend-Neustart nicht kurz aufblitzt.
  const [disconnectedTooLong, setDisconnectedTooLong] = useState(false);
  useEffect(() => {
    if (status !== "disconnected") {
      setDisconnectedTooLong(false);
      return;
    }
    const handle = window.setTimeout(() => setDisconnectedTooLong(true), 8_000);
    return () => window.clearTimeout(handle);
  }, [status]);
  const terminalIsDead = status === "exited" || status === "error" || (status === "disconnected" && disconnectedTooLong);

  const reportSize = useCallback((cols: number, rows: number) => {
    setSize((current) => (current.cols === cols && current.rows === rows ? current : { cols, rows }));
    const sessionId = sessionRef.current;
    if (sessionId) send({ type: "terminal.resize", sessionId, cols, rows });
  }, [send, sessionRef]);

  const createSession = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    sessionRef.current = null;
    sequenceRef.current = 0;
    setError(null);
    const preferred = engineApiRef.current.measurePreferred();
    if (!send({
      type: "terminal.create",
      requestId: createUuid(),
      runtimeId: instanceId,
      kind,
      mode,
      ...(accountId ? { accountId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(initialCwd ? { cwd: initialCwd } : {}),
      cols: preferred?.cols ?? (terminal.cols || 120),
      rows: preferred?.rows ?? (terminal.rows || 30),
    })) setError("Die Verbindung wird noch aufgebaut. Bitte gleich erneut versuchen.");
  }, [accountId, engineApiRef, initialCwd, instanceId, kind, mode, projectId, send, sessionRef, terminalRef]);

  /** Wiederholt den Verbindungsaufbau, wenn die Session kurz nach einem
   *  Aufwachen noch nicht anhängbar war (maximal drei Versuche). */
  const scheduleInterruptedRetry = useCallback(() => {
    if (interruptedRetriesRef.current >= 3) return;
    interruptedRetriesRef.current += 1;
    window.setTimeout(() => {
      if (disposedRef.current) return;
      createSession();
    }, 700);
  }, [createSession, disposedRef]);

  /** Startet eine beendete Sitzung automatisch neu (maximal drei Versuche). */
  const scheduleAutoRestart = useCallback(() => {
    if (autoRestartCountRef.current >= 3) {
      setStatus("exited");
      setRestartBanner(null);
      return;
    }
    autoRestartCountRef.current += 1;
    window.setTimeout(() => {
      if (disposedRef.current) return;
      send({ type: "terminal.restart", sessionId: sessionRef.current ?? "" });
      sequenceRef.current = 0;
      terminalRef.current?.write("\x1bc");
      setStatus("connected");
      setRestartBanner({ message: "Das Terminal wurde beendet und automatisch neu gestartet." });
    }, 1_500);
  }, [disposedRef, send, sessionRef, terminalRef]);

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return;
    fatalRef.current = false;
    setStatus("connecting");
    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      // Ohne keepAlive schließt ein geparktes oder verstecktes Terminal den
      // Socket; mit keepAlive bleibt die Verbindung im Hintergrund offen.
      if (!activeRef.current && !keepAliveRef.current) {
        socket.close();
        return;
      }
      retriesRef.current = 0;
      setError(null);
      setStatus("connected");
      // terminal.create ist idempotent für eine Runtime-ID: Es verbindet die
      // bestehende PTY neu oder hängt einen neuen Client an dieselbe tmux-Instanz.
      createSession();
      heartbeatRef.current = window.setInterval(() => {
        if (activeRef.current || keepAliveRef.current) send({ type: "terminal.ping" });
      }, 25_000);
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      handleServerMessage({
        message,
        terminal: terminalRef.current,
        refs: {
          sessionRef, sequenceRef, snapshotReplayRef, mouseTrackingRef, mouseEncodingRef,
          ownsGeometryRef, kindRef, fatalRef, interruptedRetriesRef, autoRestartCountRef, socketRef,
        },
        send, setStatus, setCwd, setError, setRestartBanner, createSession,
        scheduleAutoRestart, scheduleInterruptedRetry, flushOutput, flushReplayBuffer, queueOutput,
        resize: () => engineApiRef.current.resize(),
        measurePreferred: () => engineApiRef.current.measurePreferred(),
      });
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      if (disposedRef.current || fatalRef.current || !keepAliveRef.current) return;
      setStatus("disconnected");
      reconnectRef.current = window.setTimeout(connect, Math.min(10_000, 500 * (2 ** retriesRef.current++)));
    };
    socket.onerror = () => socket.close();
  }, [activeRef, createSession, disposedRef, engineApiRef, fatalRef, flushOutput, flushReplayBuffer, keepAliveRef, kindRef, mouseEncodingRef, mouseTrackingRef, ownsGeometryRef, queueOutput, scheduleAutoRestart, scheduleInterruptedRetry, send, sessionRef, snapshotReplayRef, socketRef, terminalRef]);

  useEffect(() => {
    const updateActivity = () => {
      activeRef.current = active && globalThis.document.visibilityState !== "hidden";
      const connectionAllowed = activeRef.current || keepAlive;
      if (activeRef.current) flushOutput();
      if (connectionAllowed) {
        if (!socketRef.current) connect();
      } else {
        socketRef.current?.close();
      }
    };
    updateActivity();
    globalThis.document.addEventListener("visibilitychange", updateActivity);
    return () => globalThis.document.removeEventListener("visibilitychange", updateActivity);
  }, [active, activeRef, connect, flushOutput, keepAlive, socketRef]);

  useEffect(() => () => {
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
  }, []);

  const action = useCallback((type: "terminal.clear" | "terminal.restart" | "terminal.close") => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    send({ type, sessionId });
    if (type === "terminal.close") {
      sessionRef.current = null;
      setStatus("exited");
    } else if (type === "terminal.restart") {
      sequenceRef.current = 0;
      terminalRef.current?.write("\x1bc");
      setStatus("connected");
    }
  }, [send, sessionRef, terminalRef]);

  /** Startet die Sitzung von Hand neu. Die Sitzungs-ID bleibt dieselbe; der
   *  zuletzt abgeschickte Befehl wird ohne Enter in die Eingabe gelegt. */
  const restart = useCallback(() => {
    autoRestartCountRef.current = 0;
    retriesRef.current = 0;
    fatalRef.current = false;
    sequenceRef.current = 0;
    setError(null);
    setRestartBanner(null);
    setStatus("connecting");
    terminalRef.current?.write("\x1bc");

    const primeLastCommand = () => {
      if (!lastCommand) return;
      window.setTimeout(() => {
        const active = sessionRef.current;
        if (disposedRef.current || !active) return;
        send({ type: "terminal.input", sessionId: active, data: lastCommand });
        currentLineRef.current = lastCommand;
        terminalRef.current?.focus();
      }, 800);
    };

    const sessionId = sessionRef.current;
    const socketOpen = socketRef.current?.readyState === WebSocket.OPEN;
    if (!socketOpen) {
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
      connect();
      primeLastCommand();
      return;
    }
    if (!sessionId) {
      createSession();
      primeLastCommand();
      return;
    }
    if (!send({ type: "terminal.restart", sessionId })) {
      setError("Der Neustart konnte nicht gesendet werden — die Verbindung fehlt.");
      setStatus("disconnected");
      return;
    }
    setStatus("connected");
    primeLastCommand();
  }, [connect, createSession, currentLineRef, disposedRef, fatalRef, lastCommand, send, sessionRef, socketRef, terminalRef]);

  return {
    status, cwd, error, size, restartBanner, lastCommand, disconnectedTooLong, terminalIsDead,
    setError, setRestartBanner, setCwd, connect, createSession, reportSize, rememberTyping, restart, action,
  };
}
