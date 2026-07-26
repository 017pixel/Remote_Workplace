import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import { Clipboard, RefreshCw, SendHorizontal, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import "@xterm/xterm/css/xterm.css";
import type { TerminalKind } from "@workbench/contracts";
import { ConfirmDialog } from "../ModalDialog";
import { copyDocumentSelectionFallback, splitTerminalInput, terminalClipboardAction, writeClipboardText } from "../../lib/clipboard";

export type TerminalStatus = "connecting" | "connected" | "disconnected" | "exited" | "interrupted" | "error";

type ServerMessage =
  | { type: "terminal.created"; requestId: string; sessionId: string; runtimeId: string; kind: TerminalKind; projectId: string | null; status: string; cwd: string; pid: number }
  | { type: "terminal.snapshot"; sessionId: string; runtimeId: string; kind: TerminalKind; status: string; projectId: string | null; cwd: string; history: string; sequence: number }
  | { type: "terminal.output"; sessionId: string; data: string; sequence: number }
  | { type: "terminal.exited"; sessionId: string; exitCode: number | null; signal: number | null; sequence: number }
  | { type: "terminal.restarting"; sessionId: string; reason: string; sequence: number }
  | { type: "terminal.cleared"; sessionId: string; sequence: number }
  | { type: "terminal.error"; code: string; message: string; sessionId?: string }
  | { type: "terminal.pong" };

export interface WebTerminalHandle {
  clear(): void;
  restart(): void;
  close(): void;
  focus(): void;
}

export interface WebTerminalProps {
  instanceId: string;
  kind?: TerminalKind;
  projectId?: string | null;
  active?: boolean;
  mode?: "agent" | "login";
  accountId?: string;
  onMetaChange?: (meta: { status: TerminalStatus; cwd: string; error: string | null }) => void;
}

function themeFromDashboard(mount: HTMLElement | null): ITheme {
  const styles = getComputedStyle(mount ?? document.documentElement);
  const value = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  // ANSI-Palette wie in T3 Code Nightly: kräftige Tailwind-Töne (400/500) auf
  // neutralem Schwarz, statt der früheren entsättigten Tokyo-Night-Variante.
  return {
    background: value("--color-ink-950", "#0a0a0a"),
    foreground: value("--color-text", "#f5f5f5"),
    cursor: value("--color-accent", "#366ffb"),
    selectionBackground: "rgb(54 111 251 / .3)",
    black: "#171717", red: "#fb2c36", green: "#00bc7d", yellow: "#fe9a00",
    blue: "#2b7fff", magenta: "#ad46ff", cyan: "#00b8db", white: "#d4d4d4",
    brightBlack: "#737373", brightRed: "#ff6467", brightGreen: "#00d492",
    brightYellow: "#ffb900", brightBlue: "#51a2ff", brightMagenta: "#c27aff",
    brightCyan: "#00d3f2", brightWhite: "#fafafa",
  };
}

function websocketUrl(): string {
  const url = new URL("/api/v1/terminal", window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function createUuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

export const WebTerminal = forwardRef<WebTerminalHandle, WebTerminalProps>(function WebTerminal(
  { instanceId, kind = "shell", projectId = null, active = true, mode = "agent", accountId, onMetaChange },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const reconnectRef = useRef<number | null>(null);
  const resizeRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const retriesRef = useRef(0);
  const disposedRef = useRef(false);
  const fatalRef = useRef(false);
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [cwd, setCwd] = useState("–");
  const [error, setError] = useState<string | null>(null);
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [restartBanner, setRestartBanner] = useState<{ message: string } | null>(null);
  const autoRestartCountRef = useRef(0);
  // Aktuell getippte Zeile und der zuletzt abgeschickte Befehl. Stirbt das
  // Terminal, kann der Befehl nach dem Neustart wieder vorgelegt werden.
  const currentLineRef = useRef("");
  const [lastCommand, setLastCommand] = useState("");

  /**
   * Verfolgt die Eingabe zeichenweise mit. Nur so viel Terminal-Emulation wie
   * nötig: sichtbare Zeichen sammeln, Backspace entfernt eines, Enter schließt
   * die Zeile ab, Steuerzeichen (Strg-C, Pfeiltasten) verwerfen sie.
   */
  function rememberTyping(data: string) {
    for (const character of data) {
      if (character === "\r" || character === "\n") {
        const command = currentLineRef.current.trim();
        currentLineRef.current = "";
        if (command) setLastCommand(command);
      } else if (character === "\x7f" || character === "\b") {
        currentLineRef.current = currentLineRef.current.slice(0, -1);
      } else if (character < " ") {
        currentLineRef.current = "";
      } else {
        currentLineRef.current += character;
      }
    }
  }

  useEffect(() => { onMetaChange?.({ status, cwd, error }); }, [cwd, error, onMetaChange, status]);

  // "exited" und "error" sind endgültig — da darf der Neustart-Knopf sofort
  // erscheinen. Eine Trennung dagegen behebt der Wiederverbinden-Versuch meist
  // von selbst; erst wenn das ein paar Sekunden nichts bringt, ist der Knopf
  // die richtige Antwort. Sonst blitzt er bei jedem Backend-Neustart kurz auf.
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

  const send = useCallback((message: object): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const pasteIntoTerminal = useCallback((text: string) => {
    if (!text) return;
    const sessionId = sessionRef.current;
    const terminal = terminalRef.current;
    if (!sessionId || !terminal) {
      setError("Das Terminal ist noch nicht verbunden. Bitte gleich erneut einfügen.");
      return;
    }
    terminal.paste(text);
    setError(null);
    window.setTimeout(() => terminal.focus(), 0);
  }, []);

  const receivePastedText = useCallback((text: string) => {
    if (!text) return;
    if (text.length > 10_000) {
      setPendingPaste(text);
      setError(null);
      return;
    }
    pasteIntoTerminal(text);
  }, [pasteIntoTerminal]);

  const resize = useCallback(() => {
    if (!fitRef.current || !terminalRef.current || !active) return;
    try {
      fitRef.current.fit();
      const sessionId = sessionRef.current;
      if (sessionId) send({
        type: "terminal.resize",
        sessionId,
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      });
    } catch { /* Hidden containers briefly have no measurable size. */ }
  }, [active, send]);

  const createSession = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    sessionRef.current = null;
    sequenceRef.current = 0;
    setError(null);
    if (!send({
      type: "terminal.create",
      requestId: createUuid(),
      runtimeId: instanceId,
      kind,
      mode,
      ...(accountId ? { accountId } : {}),
      ...(projectId ? { projectId } : {}),
      cols: terminal.cols || 120,
      rows: terminal.rows || 30,
    })) setError("Die Verbindung wird noch aufgebaut. Bitte gleich erneut versuchen.");
  }, [accountId, instanceId, kind, mode, projectId, send]);

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return;
    fatalRef.current = false;
    setStatus("connecting");
    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      retriesRef.current = 0;
      setError(null);
      setStatus("connected");
      // Always resolve the stable runtime ID after a socket opens.  Attaching a
      // remembered session ID works while this server process is alive, but it
      // cannot recreate its local tmux client after the server itself restarted.
      // `terminal.create` is idempotent for a runtime ID: it either reconnects
      // the existing PTY or attaches a new client to the same tmux runtime.
      createSession();
      heartbeatRef.current = window.setInterval(() => send({ type: "terminal.ping" }), 25_000);
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      const terminal = terminalRef.current;
      if (message.type === "terminal.created") {
        sessionRef.current = message.sessionId;
        setCwd(message.cwd);
        setStatus(message.status === "running" ? "connected" : message.status === "interrupted" ? "interrupted" : "exited");
        autoRestartCountRef.current = 0;
        send({ type: "terminal.attach", sessionId: message.sessionId });
        resize();
      } else if (message.type === "terminal.snapshot" && terminal) {
        sessionRef.current = message.sessionId;
        sequenceRef.current = message.sequence;
        setCwd(message.cwd);
        setStatus(message.status === "running" ? "connected" : message.status === "interrupted" ? "interrupted" : "exited");
        autoRestartCountRef.current = 0;
        terminal.write("\x1bc");
        terminal.write(message.history);
        resize();
      } else if (message.type === "terminal.output" && terminal && message.sequence > sequenceRef.current) {
        sequenceRef.current = message.sequence;
        terminal.write(message.data);
      } else if (message.type === "terminal.cleared" && terminal) {
        sequenceRef.current = message.sequence;
        terminal.write("\x1bc");
      } else if (message.type === "terminal.exited") {
        sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
        if (autoRestartCountRef.current < 3) {
          autoRestartCountRef.current += 1;
          window.setTimeout(() => {
            if (disposedRef.current) return;
            send({ type: "terminal.restart", sessionId: sessionRef.current ?? "" });
            sequenceRef.current = 0;
            terminalRef.current?.write("\x1bc");
            setStatus("connected");
            setRestartBanner({ message: "Das Terminal wurde beendet und automatisch neu gestartet." });
          }, 1_500);
        } else {
          // Nach drei erfolglosen Versuchen nicht weiter automatisch neu starten,
          // sondern den Neustart dem Nutzer überlassen (siehe .terminal-dead).
          setStatus("exited");
          setRestartBanner(null);
        }
      } else if (message.type === "terminal.restarting") {
        sequenceRef.current = Math.max(sequenceRef.current, message.sequence);
        setRestartBanner({ message: message.reason });
      } else if (message.type === "terminal.error") {
        if (message.code === "SESSION_NOT_FOUND") {
          sessionRef.current = null;
          createSession();
          return;
        }
        setStatus("error");
        setError(message.message);
        if (message.code === "UNAUTHORIZED" || message.code === "FORBIDDEN") fatalRef.current = true;
      }
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      if (disposedRef.current || fatalRef.current) return;
      setStatus("disconnected");
      reconnectRef.current = window.setTimeout(connect, Math.min(10_000, 500 * (2 ** retriesRef.current++)));
    };
    socket.onerror = () => socket.close();
  }, [createSession, resize, send]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    disposedRef.current = false;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontSize: 13,
      lineHeight: 1.1,
      scrollback: 5_000,
      fontFamily: '"SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace',
      theme: themeFromDashboard(mount),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mount);
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const clipboardAction = terminalClipboardAction(event);
      if (clipboardAction === "paste") return true;
      if (clipboardAction === "copy") {
        const selection = terminal.getSelection();
        if (!selection) {
          setError("Wähle zuerst Text im Terminal aus.");
          return false;
        }
        if (copyDocumentSelectionFallback()) setError(null);
        else void writeClipboardText(selection).then(() => setError(null)).catch((copyError) => setError(copyError instanceof Error ? copyError.message : "Kopieren wurde vom Browser nicht erlaubt."));
        return false;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return true;
      const sessionId = sessionRef.current;
      if (!sessionId) return true;
      if (event.key === "Backspace") { send({ type: "terminal.input", sessionId, data: "\x7f" }); return false; }
      if (event.key === "Delete") { send({ type: "terminal.input", sessionId, data: "\x1b[3~" }); return false; }
      return true;
    });
    terminalRef.current = terminal;
    fitRef.current = fit;
    const input = terminal.onData((data) => {
      const sessionId = sessionRef.current;
      if (!sessionId) return;
      rememberTyping(data);
      for (const chunk of splitTerminalInput(data)) {
        if (!send({ type: "terminal.input", sessionId, data: chunk })) {
          setError("Die Terminaleingabe konnte nicht vollständig gesendet werden.");
          break;
        }
      }
    });
    const observer = new ResizeObserver(() => {
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      resizeRef.current = window.setTimeout(resize, 75);
    });
    observer.observe(mount);
    const themes = new MutationObserver(() => {
      terminal.options.theme = themeFromDashboard(mount);
      terminal.refresh(0, terminal.rows - 1);
    });
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      event.stopPropagation();
      receivePastedText(text);
    };
    mount.addEventListener("paste", onPaste, { capture: true });
    connect();
    return () => {
      disposedRef.current = true;
      input.dispose(); observer.disconnect(); themes.disconnect(); mount.removeEventListener("paste", onPaste, { capture: true });
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      socketRef.current?.close(); terminal.dispose();
      socketRef.current = null; terminalRef.current = null; fitRef.current = null;
    };
  }, [connect, receivePastedText, resize, send]);

  useEffect(() => { if (active) window.setTimeout(resize, 0); }, [active, resize]);

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
  }, [send]);

  useImperativeHandle(ref, () => ({
    clear: () => action("terminal.clear"),
    restart: () => action("terminal.restart"),
    close: () => action("terminal.close"),
    focus: () => terminalRef.current?.focus(),
  }), [action]);

  const special = (key: string) => {
    const controls: Record<string, string> = { Esc: "\x1b", Tab: "\t", "↑": "\x1b[A", "↓": "\x1b[B", "←": "\x1b[D", "→": "\x1b[C", C: "\x03", D: "\x04", L: "\x0c" };
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    let data = controls[key] ?? key;
    if (alt) data = `\x1b${data}`;
    send({ type: "terminal.input", sessionId, data });
    setCtrl(false); setAlt(false);
  };

  /**
   * Startet die Sitzung von Hand neu. Die Sitzungs-ID bleibt dieselbe, damit der
   * Server im selben Arbeitsverzeichnis startet. Der zuletzt abgeschickte Befehl
   * wird anschließend in die Eingabe gelegt — ohne Enter, damit der Nutzer die
   * Ausführung bewusst auslöst.
   */
  const restartTerminal = () => {
    autoRestartCountRef.current = 0;
    retriesRef.current = 0;
    // Ein früherer Auth-Fehler hat den Wiederverbinden-Pfad stillgelegt; der
    // bewusste Klick hebt das auf.
    fatalRef.current = false;
    sequenceRef.current = 0;
    setError(null);
    setRestartBanner(null);
    setStatus("connecting");
    terminalRef.current?.write("\x1bc");

    // Den zuletzt abgeschickten Befehl vorlegen, sobald die Sitzung wieder steht.
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

    // Steht die Verbindung nicht mehr, hilft kein Restart-Befehl — dann neu verbinden.
    if (!socketOpen) {
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
      connect();
      primeLastCommand();
      return;
    }
    // Ohne Sitzung (etwa nach SESSION_NOT_FOUND) eine neue anlegen.
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
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      receivePastedText(text);
    } catch { setError("Einfügen wurde vom Browser nicht erlaubt. Nutze die Browser-Berechtigung für die Zwischenablage."); terminalRef.current?.focus(); }
  };

  return (
    <section className="terminal-session" onKeyDown={(event) => event.stopPropagation()}>
      {restartBanner ? <div className="terminal-restart-banner" role="status"><span>{restartBanner.message}</span><button type="button" onClick={() => setRestartBanner(null)} aria-label="Banner schliessen"><X className="h-3.5 w-3.5" /></button></div> : null}
      {/* Bei totem Terminal wandert der Fehlertext in das Banner darunter —
          sonst stünden zwei Meldungen mit derselben Aussage untereinander. */}
      {error && !terminalIsDead ? <p className="terminal-error">{error}</p> : null}
      {/* Nicht nur bei "exited": Auch ein Sitzungsfehler oder eine dauerhafte
          Trennung lässt das Terminal tot zurück (siehe terminalIsDead). */}
      {terminalIsDead ? (
        <div className="terminal-dead" role="alert">
          <div>
            <strong>Das Terminal läuft nicht.</strong>
            {error ? <span>{error}</span> : null}
            {lastCommand ? <span>Nach dem Neustart steht „{lastCommand}“ wieder in der Eingabe — Enter führt ihn aus.</span> : null}
          </div>
          <button type="button" onClick={restartTerminal} className="terminal-dead-restart">
            <RefreshCw className="h-4 w-4" /> Neu starten
          </button>
        </div>
      ) : null}
      <div className="terminal-viewport" ref={mountRef} onClick={() => terminalRef.current?.focus()} />
      {active ? (
        <div className="terminal-mobile-keys" aria-label="Terminal-Sondertasten">
          <button type="button" className={ctrl ? "is-active" : ""} onClick={() => setCtrl(!ctrl)}>Ctrl</button>
          <button type="button" className={alt ? "is-active" : ""} onClick={() => setAlt(!alt)}>Alt</button>
          {["Esc", "Tab", "↑", "↓", "←", "→", "C", "D", "L"].map((key) => <button type="button" key={key} onClick={() => special(key)}>{key}</button>)}
          <button type="button" onClick={() => void pasteFromClipboard()} aria-label="Einfügen"><Clipboard className="h-4 w-4" /></button>
          <button type="button" onClick={() => terminalRef.current?.focus()} aria-label="Terminal fokussieren"><SendHorizontal className="h-4 w-4" /></button>
        </div>
      ) : null}
      <ConfirmDialog open={pendingPaste !== null} title="Großen Text einfügen?" description={`Der Inhalt umfasst ${pendingPaste?.length.toLocaleString("de-DE") ?? 0} Zeichen. Prüfe vorher, ob dadurch unbeabsichtigt Befehle ausgeführt werden könnten.`} confirmLabel="Trotzdem einfügen" onConfirm={() => { if (pendingPaste) pasteIntoTerminal(pendingPaste); setPendingPaste(null); }} onClose={() => { setPendingPaste(null); terminalRef.current?.focus(); }} />
    </section>
  );
});
