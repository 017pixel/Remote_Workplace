import type { MutableRefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import type { TerminalKind } from "@workbench/contracts";
import { recoverableTerminalErrorCodes } from "./terminal-constants";
import type { ServerMessage, TerminalStatus } from "./terminal-types";
import { updateMouseEncoding, updateMouseReporting } from "./terminal-utils";

interface ServerMessageRefs {
  sessionRef: MutableRefObject<string | null>;
  sequenceRef: MutableRefObject<number>;
  snapshotReplayRef: MutableRefObject<boolean>;
  mouseTrackingRef: MutableRefObject<boolean>;
  mouseEncodingRef: MutableRefObject<boolean>;
  ownsGeometryRef: MutableRefObject<boolean>;
  kindRef: MutableRefObject<TerminalKind>;
  fatalRef: MutableRefObject<boolean>;
  interruptedRetriesRef: MutableRefObject<number>;
  autoRestartCountRef: MutableRefObject<number>;
  socketRef: MutableRefObject<WebSocket | null>;
}

export interface ServerMessageContext {
  message: ServerMessage;
  terminal: Terminal | null;
  refs: ServerMessageRefs;
  send(message: object): boolean;
  setStatus(status: TerminalStatus): void;
  setCwd(cwd: string): void;
  setError(message: string | null): void;
  setRestartBanner(banner: { message: string } | null): void;
  createSession(): void;
  scheduleAutoRestart(): void;
  scheduleInterruptedRetry(): void;
  flushOutput(force?: boolean): void;
  flushReplayBuffer(): void;
  queueOutput(data: string): void;
  resize(): void;
  measurePreferred(): { cols: number; rows: number } | null;
}

/** Kürzt wiederkehrende Statuspfade von created/snapshot. */
function enterLiveStatus(context: ServerMessageContext, status: string): boolean {
  const { refs, setStatus, scheduleAutoRestart, scheduleInterruptedRetry } = context;
  if (status === "interrupted") {
    setStatus("interrupted");
    scheduleInterruptedRetry();
    return false;
  }
  if (status === "exited") {
    scheduleAutoRestart();
    return false;
  }
  refs.interruptedRetriesRef.current = 0;
  refs.autoRestartCountRef.current = 0;
  setStatus("connected");
  return true;
}

/** Verarbeitet eine Nachricht vom Server und lenkt sie an xterm beziehungsweise
 *  die Sitzungszustände weiter. Reine Funktion ohne React-Lebenszyklus. */
export function handleServerMessage(context: ServerMessageContext): void {
  const { message, terminal, refs, send, setStatus, setCwd, setError, setRestartBanner, createSession, scheduleAutoRestart, flushOutput, flushReplayBuffer, queueOutput, resize, measurePreferred } = context;
  const { sessionRef, sequenceRef, snapshotReplayRef, mouseTrackingRef, mouseEncodingRef, ownsGeometryRef, kindRef, fatalRef, socketRef } = refs;

  if (message.type === "terminal.created") {
    sessionRef.current = message.sessionId;
    setCwd(message.cwd);
    if (!enterLiveStatus(context, message.status)) return;
    // Attach trägt die gemessene Wunschgröße mit: So kann der Server die PTY
    // vor dem Snapshot auf dieses Raster setzen, statt den Snapshot im alten
    // Raster zu erzeugen und erst danach umzuschalten.
    const preferred = measurePreferred();
    send({ type: "terminal.attach", sessionId: message.sessionId, ...(preferred ? { cols: preferred.cols, rows: preferred.rows } : {}) });
    return;
  }

  if (message.type === "terminal.cwd") {
    setCwd(message.cwd);
    return;
  }

  if (message.type === "terminal.snapshot" && terminal) {
    flushOutput(true);
    sessionRef.current = message.sessionId;
    sequenceRef.current = message.sequence;
    setCwd(message.cwd);
    if (!enterLiveStatus(context, message.status)) return;
    ownsGeometryRef.current = message.ownsGeometry;
    // Das lokale Raster muss vor dem Einspielen der Server-Geometrie
    // entsprechen — sonst bricht ein Dump aus Raster A in einem xterm mit
    // Raster B um und zerreißt Boxen, Tabellen und Sidebars.
    if (terminal.cols !== message.cols || terminal.rows !== message.rows) {
      terminal.resize(message.cols, message.rows);
    }
    // Maus-Reporting nach dem Replay zuverlässig rekonstruieren. Enthält die
    // (gekürzte) History keine Modus-Sequenz, gilt bei TUI-Agenten der
    // typische Fall: Sie nutzen Maus-Reporting.
    // eslint-disable-next-line no-control-regex -- ESC (0x1b) ist beabsichtigt: erkennt Maus-Reporting-Modi in der Replay-Historie.
    const modeSeen = /\x1b\[\?[0-9;]*[hl]/.test(message.history);
    mouseTrackingRef.current = modeSeen ? updateMouseReporting(false, message.history) : kindRef.current !== "shell";
    mouseEncodingRef.current = modeSeen ? updateMouseEncoding(false, message.history) : false;
    snapshotReplayRef.current = true;
    terminal.write("\x1bc");
    // Fullscreen-TUIs leben im Alternate Screen; ohne erneutes Umschalten
    // landete der Snapshot im normalen Puffer und wäre nur eine flüchtige
    // Kopie statt des echten Zustands.
    if (message.alternate) terminal.write("\x1b[?1049h");
    terminal.write(message.history, () => {
      snapshotReplayRef.current = false;
      flushReplayBuffer();
      // Nur der Primary passt sich danach wieder an sein Fenster an.
      if (ownsGeometryRef.current) resize();
    });
    return;
  }

  if (message.type === "terminal.geometry") {
    ownsGeometryRef.current = message.ownsGeometry;
    if (message.ownsGeometry) {
      resize();
    } else if (terminal && (terminal.cols !== message.cols || terminal.rows !== message.rows)) {
      terminal.resize(message.cols, message.rows);
    }
    return;
  }

  if (message.type === "terminal.output" && message.sequence > sequenceRef.current) {
    sequenceRef.current = message.sequence;
    mouseTrackingRef.current = updateMouseReporting(mouseTrackingRef.current, message.data);
    mouseEncodingRef.current = updateMouseEncoding(mouseEncodingRef.current, message.data);
    queueOutput(message.data);
    return;
  }

  if (message.type === "terminal.cleared" && terminal) {
    flushOutput(true);
    sequenceRef.current = message.sequence;
    mouseTrackingRef.current = false;
    mouseEncodingRef.current = false;
    terminal.write("\x1bc");
    return;
  }

  if (message.type === "terminal.exited") {
    sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
    scheduleAutoRestart();
    return;
  }

  if (message.type === "terminal.restarting") {
    sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
    setRestartBanner({ message: message.reason });
    return;
  }

  if (message.type === "terminal.error") {
    if (message.code === "SESSION_NOT_FOUND") {
      sessionRef.current = null;
      createSession();
      return;
    }
    // Einmalige Fehler (Spawn-Race nach Schlaf, kurzzeitig tote PTY) behebt
    // das Wiederverbinden von selbst — die rote Box bleibt nur für echte,
    // nicht heilbare Zustände.
    if (recoverableTerminalErrorCodes.has(message.code)) {
      setError(null);
      setStatus("disconnected");
      socketRef.current?.close();
      return;
    }
    setStatus("error");
    setError(message.message);
    if (message.code === "UNAUTHORIZED" || message.code === "FORBIDDEN") fatalRef.current = true;
  }
}
