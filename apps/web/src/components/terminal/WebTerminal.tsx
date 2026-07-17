import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import { Clipboard, SendHorizontal } from "lucide-react";
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

export type TerminalStatus = "connecting" | "connected" | "disconnected" | "exited" | "error";

type ServerMessage =
  | { type: "terminal.created"; requestId: string; sessionId: string; kind: TerminalKind; cwd: string; pid: number }
  | { type: "terminal.snapshot"; sessionId: string; kind: TerminalKind; status: string; cwd: string; history: string; sequence: number }
  | { type: "terminal.output"; sessionId: string; data: string; sequence: number }
  | { type: "terminal.exited"; sessionId: string; exitCode: number | null; signal: number | null; sequence: number }
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
  return {
    background: value("--color-ink-950", "#121212"),
    foreground: value("--color-text", "#f5f5f5"),
    cursor: value("--color-accent", "#8ab4f8"),
    selectionBackground: "rgba(138, 180, 248, .25)",
    black: "#15171a", red: "#ef6b73", green: "#8bcf7c", yellow: "#e8c56d",
    blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#c0caf5",
    brightBlack: "#5c6370", brightRed: "#ff8b94", brightGreen: "#a9dc9f",
    brightYellow: "#f5d98c", brightBlue: "#9bbcff", brightMagenta: "#d2b5ff",
    brightCyan: "#9de3ff", brightWhite: "#ffffff",
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

function readSession(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

function storeSession(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch { /* The terminal remains usable when browser storage is blocked. */ }
}

export const WebTerminal = forwardRef<WebTerminalHandle, WebTerminalProps>(function WebTerminal(
  { instanceId, kind = "shell", projectId = null, active = true, mode = "agent", accountId, onMetaChange },
  ref,
) {
  const storageKey = `workbench-terminal-session:${instanceId}`;
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<string | null>(readSession(storageKey));
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

  useEffect(() => { onMetaChange?.({ status, cwd, error }); }, [cwd, error, onMetaChange, status]);

  const send = useCallback((message: object): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

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
    storeSession(storageKey, null);
    sequenceRef.current = 0;
    setError(null);
    if (!send({
      type: "terminal.create",
      requestId: createUuid(),
      kind,
      mode,
      ...(accountId ? { accountId } : {}),
      ...(projectId ? { projectId } : {}),
      cols: terminal.cols || 120,
      rows: terminal.rows || 30,
    })) setError("Die Verbindung wird noch aufgebaut. Bitte gleich erneut versuchen.");
  }, [accountId, kind, mode, projectId, send, storageKey]);

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
      const sessionId = sessionRef.current;
      if (sessionId) send({ type: "terminal.attach", sessionId });
      else createSession();
      heartbeatRef.current = window.setInterval(() => send({ type: "terminal.ping" }), 25_000);
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      const terminal = terminalRef.current;
      if (message.type === "terminal.created") {
        sessionRef.current = message.sessionId;
        storeSession(storageKey, message.sessionId);
        setCwd(message.cwd);
        send({ type: "terminal.attach", sessionId: message.sessionId });
        resize();
      } else if (message.type === "terminal.snapshot" && terminal) {
        sessionRef.current = message.sessionId;
        storeSession(storageKey, message.sessionId);
        sequenceRef.current = message.sequence;
        setCwd(message.cwd);
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
        setStatus("exited");
      } else if (message.type === "terminal.error") {
        if (message.code === "SESSION_NOT_FOUND") {
          sessionRef.current = null;
          storeSession(storageKey, null);
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
  }, [createSession, resize, send, storageKey]);

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
      if (event.type !== "keydown" || event.ctrlKey || event.metaKey || event.altKey) return true;
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
      if (sessionId) send({ type: "terminal.input", sessionId, data });
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
      if (text.length > 10_000 && !window.confirm("Der einzufügende Text ist sehr groß. Trotzdem einfügen?")) return;
      const sessionId = sessionRef.current;
      if (sessionId) send({ type: "terminal.input", sessionId, data: text });
    };
    mount.addEventListener("paste", onPaste);
    connect();
    return () => {
      disposedRef.current = true;
      input.dispose(); observer.disconnect(); themes.disconnect(); mount.removeEventListener("paste", onPaste);
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      socketRef.current?.close(); terminal.dispose();
      socketRef.current = null; terminalRef.current = null; fitRef.current = null;
    };
  }, [connect, resize, send]);

  useEffect(() => { if (active) window.setTimeout(resize, 0); }, [active, resize]);

  const action = useCallback((type: "terminal.clear" | "terminal.restart" | "terminal.close") => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    send({ type, sessionId });
    if (type === "terminal.close") {
      sessionRef.current = null;
      storeSession(storageKey, null);
      setStatus("exited");
    } else if (type === "terminal.restart") {
      sequenceRef.current = 0;
      terminalRef.current?.write("\x1bc");
      setStatus("connected");
    }
  }, [send, storageKey]);

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

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const sessionId = sessionRef.current;
      if (text && sessionId) send({ type: "terminal.input", sessionId, data: text });
    } catch { terminalRef.current?.focus(); }
  };

  return (
    <section className="terminal-session" onKeyDown={(event) => event.stopPropagation()}>
      {error ? <p className="terminal-error">{error}</p> : null}
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
    </section>
  );
});
