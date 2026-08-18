import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { CloseIcon, RefreshIcon } from "../icons";
import { ConfirmDialog } from "../ModalDialog";
import { terminalKeySequence } from "./terminal-utils";
import type { WebTerminalHandle, WebTerminalProps } from "./terminal-types";
import { useTerminalConnection, type TerminalEngineApi } from "./useTerminalConnection";
import { useTerminalEngine } from "./useTerminalEngine";

/**
 * Browser-Terminal für eine stabile Runtime-ID. Verbindet die xterm-Engine
 * (Raster, Scrollen, Eingabe) mit der Sitzungslogik (WebSocket, Snapshot,
 * Ausgabepufferung) über gemeinsame Refs. Mehrere Instanzen teilen dieselbe
 * PTY; die Engine bleibt beim Werkzeugwechsel montiert und hält die Verbindung
 * im Hintergrund offen, damit der Inhalt beim Zurückkehren sofort da ist.
 */
export const WebTerminal = forwardRef<WebTerminalHandle, WebTerminalProps>(function WebTerminal(
  {
    instanceId,
    kind = "shell",
    projectId = null,
    initialCwd = null,
    active = true,
    keepAlive = false,
    renderScale = 1,
    mode = "agent",
    accountId,
    onMetaChange,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<string | null>(null);
  const snapshotReplayRef = useRef(false);
  const replayBufferRef = useRef<string[]>([]);
  const mouseTrackingRef = useRef(false);
  const mouseEncodingRef = useRef(false);
  const ownsGeometryRef = useRef(true);
  const activeRef = useRef(active);
  const keepAliveRef = useRef(keepAlive);
  const kindRef = useRef(kind);
  const disposedRef = useRef(false);
  const fatalRef = useRef(false);
  const engineApiRef = useRef<TerminalEngineApi>({ resize: () => {}, measurePreferred: () => null });

  keepAliveRef.current = keepAlive;
  kindRef.current = kind;

  const [pendingPaste, setPendingPaste] = useState<string | null>(null);

  const send = useCallback((message: object): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const connection = useTerminalConnection({
    instanceId, kind, mode, projectId, initialCwd, accountId,
    active, keepAlive, send, onMetaChange,
    terminalRef, socketRef, sessionRef, snapshotReplayRef, replayBufferRef,
    mouseTrackingRef, mouseEncodingRef, ownsGeometryRef, activeRef, keepAliveRef,
    kindRef, disposedRef, fatalRef, engineApiRef,
  });

  const engine = useTerminalEngine({
    renderScale, active, keepAlive, send,
    setError: connection.setError,
    setCwd: connection.setCwd,
    rememberTyping: connection.rememberTyping,
    reportSize: connection.reportSize,
    connect: connection.connect,
    setPendingPaste,
    mountRef, terminalRef, fitRef, socketRef, activeRef, kindRef,
    sessionRef, snapshotReplayRef, replayBufferRef, mouseTrackingRef,
    mouseEncodingRef, ownsGeometryRef, disposedRef, engineApiRef,
  });

  const sendKey = useCallback((key: string, modifiers: { ctrl?: boolean; alt?: boolean } = {}) => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    send({ type: "terminal.input", sessionId, data: terminalKeySequence(key, modifiers) });
  }, [send]);

  const pasteFromClipboard = useCallback(() => {
    navigator.clipboard.readText()
      .then((text) => engine.receivePastedText(text))
      .catch(() => {
        connection.setError("Einfügen wurde vom Browser nicht erlaubt. Nutze die Browser-Berechtigung für die Zwischenablage.");
        terminalRef.current?.focus();
      });
  }, [connection, engine]);

  useImperativeHandle(ref, () => ({
    clear: () => connection.action("terminal.clear"),
    restart: () => connection.action("terminal.restart"),
    close: () => connection.action("terminal.close"),
    focus: () => engine.focus(),
    sendKey,
    pasteFromClipboard,
  }), [connection, engine, pasteFromClipboard, sendKey]);

  const { error, restartBanner, lastCommand, terminalIsDead } = connection;

  return (
    <section className="terminal-session" onKeyDown={(event) => event.stopPropagation()}>
      {restartBanner ? <div className="terminal-restart-banner" role="status"><span>{restartBanner.message}</span><button type="button" onClick={() => connection.setRestartBanner(null)} aria-label="Banner schliessen"><CloseIcon className="h-3.5 w-3.5" /></button></div> : null}
      {/* Bei totem Terminal wandert der Fehlertext in das Banner darunter —
          sonst stünden zwei Meldungen mit derselben Aussage untereinander. */}
      {error && !terminalIsDead ? <div className="terminal-error" role="alert"><span>{error}</span><button type="button" onClick={() => connection.setError(null)} aria-label="Fehlermeldung schließen" title="Schließen"><CloseIcon className="h-3.5 w-3.5" /></button></div> : null}
      {/* Nicht nur bei "exited": Auch ein Sitzungsfehler oder eine dauerhafte
          Trennung lässt das Terminal tot zurück (siehe terminalIsDead). */}
      {terminalIsDead ? (
        <div className="terminal-dead" role="alert">
          <div>
            <strong>Das Terminal läuft nicht.</strong>
            {error ? <span>{error}</span> : null}
            {lastCommand ? <span>Nach dem Neustart steht „{lastCommand}“ wieder in der Eingabe — Enter führt ihn aus.</span> : null}
          </div>
          <button type="button" onClick={connection.restart} className="terminal-dead-restart">
            <RefreshIcon className="h-4 w-4" /> Neu starten
          </button>
        </div>
      ) : null}
      <div className="terminal-viewport" ref={mountRef} onClick={() => terminalRef.current?.focus()} />
      <ConfirmDialog open={pendingPaste !== null} title="Großen Text einfügen?" description={`Der Inhalt umfasst ${pendingPaste?.length.toLocaleString("de-DE") ?? 0} Zeichen. Prüfe vorher, ob dadurch unbeabsichtigt Befehle ausgeführt werden könnten.`} confirmLabel="Trotzdem einfügen" onConfirm={() => { if (pendingPaste) engine.pasteIntoTerminal(pendingPaste); setPendingPaste(null); }} onClose={() => { setPendingPaste(null); terminalRef.current?.focus(); }} />
    </section>
  );
});

// Re-Exporte halten die öffentliche API stabil: TerminalArea und Views
// importieren diese Typen weiterhin aus "./WebTerminal".
export type { TerminalStatus, WebTerminalHandle } from "./terminal-types";
