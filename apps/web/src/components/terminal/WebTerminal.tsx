import { FitAddon } from "@xterm/addon-fit";
import { Terminal, type ITheme } from "@xterm/xterm";
import { CloseIcon, RefreshIcon } from "../icons";
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
import { splitTerminalInput, terminalClipboardAction, writeClipboardText } from "../../lib/clipboard";
import { showUiToast } from "../../lib/uiToasts";

export type TerminalStatus = "connecting" | "connected" | "disconnected" | "exited" | "interrupted" | "error";

type ServerMessage =
  | { type: "terminal.created"; requestId: string; sessionId: string; runtimeId: string; kind: TerminalKind; projectId: string | null; status: string; cwd: string; pid: number }
  | { type: "terminal.snapshot"; sessionId: string; runtimeId: string; kind: TerminalKind; status: string; projectId: string | null; cwd: string; history: string; sequence: number }
  | { type: "terminal.output"; sessionId: string; data: string; sequence: number }
  | { type: "terminal.cwd"; sessionId: string; cwd: string }
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
  /** Schickt eine Sondertaste (Esc, Tab, Pfeile, Strg-Kombination) an die Sitzung. */
  sendKey(key: string, modifiers?: { ctrl?: boolean; alt?: boolean }): void;
  /** Fügt den Inhalt der Zwischenablage ein, mit Rückfrage bei sehr großem Text. */
  pasteFromClipboard(): void;
}

/** Sondertasten der mobilen Bedienleiste und ihre Terminalsequenzen. */
export const terminalSpecialKeys: Record<string, string> = {
  Esc: "\x1b",
  Tab: "\t",
  "↑": "\x1b[A",
  "↓": "\x1b[B",
  "←": "\x1b[D",
  "→": "\x1b[C",
  Pos1: "\x1b[H",
  Ende: "\x1b[F",
};

/**
 * Übersetzt eine Taste der Bedienleiste in die Bytes, die an die Sitzung gehen.
 * Strg wirkt nur auf Buchstaben (Strg-C = 0x03), Alt stellt ein ESC voran.
 */
export function terminalKeySequence(key: string, modifiers: { ctrl?: boolean; alt?: boolean } = {}): string {
  let data = terminalSpecialKeys[key] ?? key;
  if (modifiers.ctrl && /^[a-zA-Z]$/.test(data)) {
    data = String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64);
  }
  if (modifiers.alt) data = `\x1b${data}`;
  return data;
}

export interface WebTerminalProps {
  instanceId: string;
  kind?: TerminalKind;
  projectId?: string | null;
  /** Startverzeichnis für eine neue Sitzung, etwa bei einem Split im aktuellen Unterordner. */
  initialCwd?: string | null;
  active?: boolean;
  /** Hält die PTY-Verbindung für eine geparkte, aber gecachte Route offen. */
  keepAlive?: boolean;
  /** Bildschirm-Zoom des umgebenden Orbit-Knotens. 1 bedeutet keine Skalierung. */
  renderScale?: number;
  mode?: "agent" | "login";
  accountId?: string;
  onMetaChange?: (meta: { status: TerminalStatus; cwd: string; error: string | null; cols: number; rows: number }) => void;
}

const baseTerminalFontSize = 14;
const minimumCompensatedRenderScale = 0.1;
const maximumCompensatedRenderScale = 2.2;

/**
 * xterm rendert Zeichen in einen Canvas. In einem gezoomten Orbit-Knoten wird
 * dieser Canvas anschließend erneut skaliert. Eine umgekehrt skalierte
 * Schriftgröße hält die sichtbare Zellgröße konstant und liefert dem Browser
 * mehr Rasterauflösung, bevor der Knoten verkleinert wird.
 */
export function terminalFontSizeForRenderScale(renderScale = 1): number {
  const scale = Number.isFinite(renderScale)
    ? Math.min(maximumCompensatedRenderScale, Math.max(minimumCompensatedRenderScale, renderScale))
    : 1;
  return Number((baseTerminalFontSize / scale).toFixed(2));
}

export function shouldForwardTerminalData(replayingSnapshot: boolean, sessionId: string | null): sessionId is string {
  return !replayingSnapshot && sessionId !== null;
}

const mouseReportingModes = ["1000", "1002", "1003"];
const maximumParkedOutputBytes = 256_000;

// eslint-disable-next-line no-control-regex -- Terminal-Sequenzen (DECSET/DECRST) müssen erkannt werden.
const modeSettingsPattern = /\x1b\[\?([0-9;]*)([hl])/g;

/**
 * Verfolgt, ob die laufende Anwendung Maus-Reporting aktiviert hat (DECSET
 * 1000/1002/1003 für Wheel-Scrollen, optional mit SGR-Encoding 1006). tmux
 * reicht die Modes der App an den Client weiter — die zuletzt gesehene
 * Sequenz entscheidet.
 */
export function updateMouseReporting(active: boolean, data: string): boolean {
  let next = active;
  const pattern = new RegExp(modeSettingsPattern.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(data))) {
    const modes = match[1] ? match[1].split(";") : [];
    if (modes.some((mode) => mouseReportingModes.includes(mode))) {
      next = match[2] === "h";
    }
  }
  return next;
}

/**
 * Verfolgt zusätzlich das SGR-Encoding (DECSET 1006). Nur damit dürfen
 * Mausereignisse im erweiterten Format gemeldet werden; ohne 1006 gilt das
 * alte Format mit auf 223 begrenzten Koordinaten.
 */
export function updateMouseEncoding(sgr: boolean, data: string): boolean {
  let next = sgr;
  const pattern = new RegExp(modeSettingsPattern.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(data))) {
    const modes = match[1] ? match[1].split(";") : [];
    if (modes.includes("1006")) next = match[2] === "h";
  }
  return next;
}

/**
 * Baut ein Mausrad-Ereignis, wie es eine Anwendung mit aktivem Maus-Reporting
 * erwartet. Damit scrollt ein Wisch auf dem Handy auch in Anwendungen, die den
 * Alternate Screen mit eigenem Verlauf verwenden (tmux, OpenCode, Codex).
 */
/**
 * Rechnet eine Wischbewegung in ganze Terminalzeilen um. Der Rest unter einer
 * Zeile bleibt erhalten, sonst würde langsames Wischen nie etwas bewegen,
 * weil jeder einzelne Schritt abgeschnitten würde.
 */
export function touchScrollLines(movedPixels: number, lineHeight: number, carry = 0): { lines: number; carry: number } {
  const height = lineHeight > 0 ? lineHeight : 18;
  const raw = movedPixels / height + carry;
  const lines = Math.trunc(raw);
  return { lines, carry: raw - lines };
}

export function mouseWheelSequence(direction: "up" | "down", sgr: boolean, column = 1, row = 1): string {
  const button = direction === "up" ? 64 : 65;
  if (sgr) return `\x1b[<${button};${column};${row}M`;
  // Das alte Format kodiert Knopf und Koordinaten als Zeichen ab Wert 32.
  const clamp = (value: number) => Math.min(223, Math.max(1, Math.round(value)));
  return `\x1b[M${String.fromCharCode(button + 32, clamp(column) + 32, clamp(row) + 32)}`;
}

function themeFromDashboard(mount: HTMLElement | null): ITheme {
  const styles = getComputedStyle(mount ?? document.documentElement);
  // Alle Farben kommen ausschließlich aus dem @theme-Block (F01-13). Leere
  // Werte können nur bei einem defekten Theme auftreten; dann greift xterm
  // auf seine Standardpalette zurück.
  const value = (name: string) => styles.getPropertyValue(name).trim();
  return {
    background: value("--color-ink-950"),
    foreground: value("--color-text"),
    cursor: value("--ansi-green"),
    selectionBackground: value("--ansi-selection"),
    black: value("--ansi-black"), red: value("--ansi-red"), green: value("--ansi-green"), yellow: value("--ansi-yellow"),
    blue: value("--ansi-blue"), magenta: value("--ansi-magenta"), cyan: value("--ansi-cyan"), white: value("--ansi-white"),
    brightBlack: value("--ansi-bright-black"), brightRed: value("--ansi-bright-red"), brightGreen: value("--ansi-bright-green"),
    brightYellow: value("--ansi-bright-yellow"), brightBlue: value("--ansi-bright-blue"), brightMagenta: value("--ansi-bright-magenta"),
    brightCyan: value("--ansi-bright-cyan"), brightWhite: value("--ansi-bright-white"),
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
  { instanceId, kind = "shell", projectId = null, initialCwd = null, active = true, keepAlive = false, renderScale = 1, mode = "agent", accountId, onMetaChange },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const activeRef = useRef(active);
  const keepAliveRef = useRef(keepAlive);
  keepAliveRef.current = keepAlive;
  const outputBufferRef = useRef("");
  const outputFlushRef = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  // Ein Snapshot ist reine Anzeige. Während xterm ihn parst, kann es enthaltene
  // Geräteabfragen automatisch über onData beantworten. Diese Antworten dürfen
  // nie als neue Nutzereingabe in der PTY landen.
  const snapshotReplayRef = useRef(false);
  // Echte Tastatureingaben während des Snapshot-Replays: Sie dürfen nicht
  // verloren gehen, nur weil xterm gerade die Historie einspielt. Antworten
  // auf Geräteabfragen (DA1, DSR) enthalten Escape-Sequenzen und werden
  // aussortiert — Nutzereingaben enthalten keine.
  const replayBufferRef = useRef<string[]>([]);
  const reconnectRef = useRef<number | null>(null);
  const resizeRef = useRef<number | null>(null);
  const themeRefreshRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const retriesRef = useRef(0);
  const disposedRef = useRef(false);
  const fatalRef = useRef(false);
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [cwd, setCwd] = useState("–");
  // Sichtbares Raster der Sitzung. Die Statuszeile zeigt es an, damit man
  // Umbrüche einer Ausgabe einordnen kann.
  const [size, setSize] = useState({ cols: 0, rows: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);
  const [restartBanner, setRestartBanner] = useState<{ message: string } | null>(null);
  const autoRestartCountRef = useRef(0);
  // Aktuell getippte Zeile und der zuletzt abgeschickte Befehl. Stirbt das
  // Terminal, kann der Befehl nach dem Neustart wieder vorgelegt werden.
  const currentLineRef = useRef("");
  const [lastCommand, setLastCommand] = useState("");
  const initialRenderScaleRef = useRef(renderScale);
  // Merkt sich, ob die laufende Anwendung Maus-Reporting aktiviert hat — nur
  // dann darf das Mausrad als Maus-Ereignis an die App gehen. Sonst übersetzt
  // xterm das Rad im Alternate Screen in Pfeiltasten und die App interpretiert
  // das als Tastatur-Eingabe (falsche Cursor-Sprünge, unbeabsichtigte Aktionen).
  const mouseTrackingRef = useRef(false);
  const mouseEncodingRef = useRef(false);
  // Startzelle einer Drag-Auswahl bei aktivem Maus-Reporting (siehe
  // onMouseCapture im mount-Effect).
  const selectionDragRef = useRef<{ col: number; row: number } | null>(null);
  // Merkt, ob aus einer Ziehbewegung eine echte Auswahl entstanden ist.
  const dragSelectActiveRef = useRef(false);
  const kindRef = useRef(kind);
  kindRef.current = kind;

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

  useEffect(() => { onMetaChange?.({ status, cwd, error, cols: size.cols, rows: size.rows }); }, [cwd, error, onMetaChange, size.cols, size.rows, status]);

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

  /**
   * Sendet zwischengespeicherte Nutzereingaben, sobald der Snapshot-Replay
   * fertig ist. Geräteantworten (Escape-Sequenzen) werden verworfen.
   */
  const flushReplayBuffer = useCallback(() => {
    const buffered = replayBufferRef.current
      .filter((chunk) => !chunk.includes("\x1b"))
      .join("");
    replayBufferRef.current = [];
    if (!buffered) return;
    const sessionId = sessionRef.current;
    if (sessionId === null) return;
    rememberTyping(buffered);
    for (const chunk of splitTerminalInput(buffered)) {
      if (!send({ type: "terminal.input", sessionId, data: chunk })) {
        setError("Die Terminaleingabe konnte nicht vollständig gesendet werden.");
        break;
      }
    }
  }, [send]);

  // xterm emuliert jeden write synchron. Bei Build-Ausgaben kommen jedoch
  // häufig sehr viele kleine WebSocket-Nachrichten hintereinander an. Die
  // Bytes bleiben unverändert, werden aber höchstens einmal pro Frame an xterm
  // übergeben. Geparkte Knoten halten nur einen begrenzten Schwanz der Ausgabe,
  // damit ein laufender Build den Browser nicht mit verstecktem Output flutet.
  const flushOutput = useCallback((force = false) => {
    if (outputFlushRef.current !== null) {
      window.clearTimeout(outputFlushRef.current);
      outputFlushRef.current = null;
    }
    const terminal = terminalRef.current;
    if (!terminal || (!force && !activeRef.current)) return;
    const data = outputBufferRef.current;
    if (!data) return;
    outputBufferRef.current = "";
    terminal.write(data);
  }, []);

  const queueOutput = useCallback((data: string) => {
    if (!data) return;
    outputBufferRef.current += data;
    if (!activeRef.current) {
      if (outputBufferRef.current.length > maximumParkedOutputBytes) {
        outputBufferRef.current = outputBufferRef.current.slice(-maximumParkedOutputBytes);
      }
      return;
    }
    if (outputFlushRef.current === null) {
      outputFlushRef.current = window.setTimeout(() => flushOutput(!activeRef.current), 16);
    }
  }, [flushOutput]);

  /**
   * Scrollt das Terminal um eine Anzahl Zeilen. Negative Werte gehen zurück in
   * den Verlauf.
   *
   * Drei Fälle, weil ein Terminal keinen einheitlichen Verlauf hat:
   *  - Normaler Puffer: xterm hat den Verlauf selbst und scrollt direkt.
   *  - Alternate Screen mit Maus-Reporting: die Anwendung führt ihren eigenen
   *    Verlauf, sie bekommt ein Mausrad-Ereignis.
   *  - Alternate Screen ohne Maus-Reporting: nur die Shell-Werkzeuge (less,
   *    man, vim) verstehen hier Pfeiltasten. Bei den CLI-Agenten würden sie als
   *    Tastatureingabe ankommen, deshalb passiert dort bewusst nichts.
   */
  const scrollByLines = useCallback((lines: number) => {
    const terminal = terminalRef.current;
    if (!terminal || lines === 0) return;
    if (terminal.buffer.active.type !== "alternate") {
      terminal.scrollLines(lines);
      return;
    }
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    const steps = Math.min(Math.abs(lines), 12);
    if (mouseTrackingRef.current) {
      const sequence = mouseWheelSequence(lines < 0 ? "up" : "down", mouseEncodingRef.current);
      for (let step = 0; step < steps; step += 1) send({ type: "terminal.input", sessionId, data: sequence });
      return;
    }
    if (kindRef.current !== "shell") return;
    const sequence = lines < 0 ? "\x1b[A" : "\x1b[B";
    for (let step = 0; step < steps; step += 1) send({ type: "terminal.input", sessionId, data: sequence });
  }, [send]);

  /** Kopiert die aktuelle xterm-Auswahl in die Zwischenablage und bestätigt
   *  den Erfolg mit einem Toast (F04-10: Copy on Select). */
  const copySelection = useCallback(() => {
    const terminal = terminalRef.current;
    const selection = terminal?.getSelection();
    if (!selection) {
      setError("Wähle zuerst Text im Terminal aus.");
      return;
    }
    void writeClipboardText(selection)
      .then(() => showUiToast({ title: "Kopiert", severity: "success" }))
      .catch((copyError) => setError(copyError instanceof Error ? copyError.message : "Kopieren wurde vom Browser nicht erlaubt."));
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
    if (!fitRef.current || !terminalRef.current || !activeRef.current) return;
    try {
      fitRef.current.fit();
      const { cols, rows } = terminalRef.current;
      setSize((current) => (current.cols === cols && current.rows === rows ? current : { cols, rows }));
      const sessionId = sessionRef.current;
      if (sessionId) send({ type: "terminal.resize", sessionId, cols, rows });
    } catch { /* Hidden containers briefly have no measurable size. */ }
  }, [send]);

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
      ...(initialCwd ? { cwd: initialCwd } : {}),
      cols: terminal.cols || 120,
      rows: terminal.rows || 30,
    })) setError("Die Verbindung wird noch aufgebaut. Bitte gleich erneut versuchen.");
  }, [accountId, initialCwd, instanceId, kind, mode, projectId, send]);

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) return;
    fatalRef.current = false;
    setStatus("connecting");
    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
     socket.onopen = () => {
       if (!activeRef.current && !(keepAliveRef.current && globalThis.document.visibilityState !== "hidden")) {
         socket.close();
         return;
       }
       retriesRef.current = 0;
      setError(null);
      setStatus("connected");
      // Always resolve the stable runtime ID after a socket opens.  Attaching a
      // remembered session ID works while this server process is alive, but it
      // cannot recreate its local tmux client after the server itself restarted.
      // `terminal.create` is idempotent for a runtime ID: it either reconnects
      // the existing PTY or attaches a new client to the same tmux runtime.
      createSession();
      heartbeatRef.current = window.setInterval(() => {
        if (activeRef.current || (keepAliveRef.current && globalThis.document.visibilityState !== "hidden")) send({ type: "terminal.ping" });
      }, 25_000);
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
      } else if (message.type === "terminal.cwd") {
        setCwd(message.cwd);
      } else if (message.type === "terminal.snapshot" && terminal) {
        flushOutput(true);
        sessionRef.current = message.sessionId;
        sequenceRef.current = message.sequence;
        setCwd(message.cwd);
        setStatus(message.status === "running" ? "connected" : message.status === "interrupted" ? "interrupted" : "exited");
        autoRestartCountRef.current = 0;
        mouseTrackingRef.current = updateMouseReporting(false, message.history);
        mouseEncodingRef.current = updateMouseEncoding(false, message.history);
        snapshotReplayRef.current = true;
        terminal.write("\x1bc");
        terminal.write(message.history, () => {
          snapshotReplayRef.current = false;
          flushReplayBuffer();
          resize();
        });
      } else if (message.type === "terminal.output" && message.sequence > sequenceRef.current) {
        sequenceRef.current = message.sequence;
        mouseTrackingRef.current = updateMouseReporting(mouseTrackingRef.current, message.data);
        mouseEncodingRef.current = updateMouseEncoding(mouseEncodingRef.current, message.data);
        queueOutput(message.data);
      } else if (message.type === "terminal.cleared" && terminal) {
        flushOutput(true);
        sequenceRef.current = message.sequence;
        mouseTrackingRef.current = false;
        mouseEncodingRef.current = false;
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
       if (disposedRef.current || fatalRef.current || (!activeRef.current && !(keepAliveRef.current && globalThis.document.visibilityState !== "hidden"))) return;
       setStatus("disconnected");
      reconnectRef.current = window.setTimeout(connect, Math.min(10_000, 500 * (2 ** retriesRef.current++)));
    };
    socket.onerror = () => socket.close();
  }, [createSession, flushOutput, flushReplayBuffer, queueOutput, resize, send]);

  useEffect(() => {
    const updateActivity = () => {
      activeRef.current = active && globalThis.document.visibilityState !== "hidden";
      const connectionAllowed = activeRef.current || (keepAlive && globalThis.document.visibilityState !== "hidden");
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
  }, [active, connect, flushOutput, keepAlive]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    disposedRef.current = false;
    const terminal = new Terminal({
      cursorBlink: true,
      // Blockcursor statt Strich: die vertraute Form eines Terminals.
      cursorStyle: "block",
      cursorInactiveStyle: "outline",
      convertEol: false,
      fontSize: terminalFontSizeForRenderScale(initialRenderScaleRef.current),
      lineHeight: 1,
      letterSpacing: 0,
      customGlyphs: true,
      scrollback: 10_000,
      // xterm 6 unterscheidet selbst zwischen Mausrad- und Trackpad-Pixeln.
      // Faktor 1 verhindert das bisherige Überspringen mehrerer Ausgabezeilen.
      scrollSensitivity: 1,
      // Weiches Scrollen würde die Ausgabe eines laufenden Builds verzögern.
      smoothScrollDuration: 0,
      fontFamily: '"SF Mono", "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace',
      theme: themeFromDashboard(mount),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mount);
    const cwdHandler = terminal.parser.registerOscHandler(7, (value) => {
      try {
        const next = new URL(value).pathname;
        if (next.startsWith("/")) setCwd(decodeURIComponent(next));
      } catch { /* Ungültige OSC-7-Werte ignorieren. */ }
      return true;
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const clipboardAction = terminalClipboardAction(event);
      if (clipboardAction === "paste") return true;
      if (clipboardAction === "copy") {
        copySelection();
        return false;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return true;
      const sessionId = sessionRef.current;
      if (!sessionId) return true;
      if (event.key === "Backspace") { send({ type: "terminal.input", sessionId, data: "\x7f" }); return false; }
      if (event.key === "Delete") { send({ type: "terminal.input", sessionId, data: "\x1b[3~" }); return false; }
      return true;
    });
    // Pinch-Zoom am Trackpad (Strg/⌘ + Rad) darf nie als Terminal-Scroll an
    // die App gehen — das wäre beim Zoomen ein ungewolltes Mausrad-Signal.
    terminal.attachCustomWheelEventHandler((event) => {
      if (event.ctrlKey || event.metaKey) return false;
      return true;
    });
    // Drag-Auswahl auch bei Maus-Reporting: tmux und ähnliche Apps schalten
    // Maus-Reporting ein, damit blockiert xterm die Textauswahl. Hier wählt
    // eine Ziehbewegung (ohne Shift) trotzdem Text aus und kopiert ihn beim
    // Loslassen; ein reiner Klick geht weiter an die App (z. B. tmux-Pane).
    // Das Mausrad bleibt unberührt, Shift+Drag funktioniert wie gehabt.
    const cellFromEvent = (event: MouseEvent): { col: number; row: number } | null => {
      const terminal = terminalRef.current;
      if (!terminal) return null;
      const screen = (terminal.element ?? mount).querySelector<HTMLElement>(".xterm-screen") ?? terminal.element ?? mount;
      const rect = screen.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const col = Math.floor((event.clientX - rect.left) / (rect.width / terminal.cols));
      const visibleRow = Math.floor((event.clientY - rect.top) / (rect.height / terminal.rows));
      return {
        col: Math.max(0, Math.min(terminal.cols - 1, col)),
        row: Math.max(0, Math.min(terminal.rows - 1, visibleRow)) + terminal.buffer.active.baseY,
      };
    };
    const selectCells = (start: { col: number; row: number }, end: { col: number; row: number }) => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      const first = start.row <= end.row ? start : end;
      const last = start.row <= end.row ? end : start;
      const length = (last.row - first.row) * terminal.cols + (last.col - first.col) + 1;
      terminal.select(first.col, first.row, length);
    };
    const onMouseCapture = (event: MouseEvent) => {
      if (event.altKey || !mouseTrackingRef.current) return;
      if (event.type === "mousedown") {
        if (event.button !== 0) return;
        selectionDragRef.current = event.shiftKey ? null : cellFromEvent(event);
        dragSelectActiveRef.current = false;
        return;
      }
      if (event.type === "mousemove") {
        const start = selectionDragRef.current;
        if (!start || event.shiftKey) return;
        if ((event.buttons & 1) === 0) { selectionDragRef.current = null; dragSelectActiveRef.current = false; return; }
        const cell = cellFromEvent(event);
        if (!cell || (cell.col === start.col && cell.row === start.row)) return;
        selectCells(start, cell);
        dragSelectActiveRef.current = true;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.type === "mouseup") {
        const wasDrag = dragSelectActiveRef.current;
        selectionDragRef.current = null;
        dragSelectActiveRef.current = false;
        if (wasDrag) {
          event.preventDefault();
          event.stopPropagation();
          copySelection();
        }
      }
    };
    mount.addEventListener("mousedown", onMouseCapture, { capture: true });
    mount.addEventListener("mousemove", onMouseCapture, { capture: true });
    mount.addEventListener("mouseup", onMouseCapture, { capture: true });
    terminalRef.current = terminal;
    fitRef.current = fit;
    const input = terminal.onData((data) => {
      const sessionId = sessionRef.current;
      if (snapshotReplayRef.current) {
        replayBufferRef.current.push(data);
        return;
      }
      if (!shouldForwardTerminalData(snapshotReplayRef.current, sessionId)) return;
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
    const viewport = window.visualViewport;
    const onViewportChange = () => {
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      resizeRef.current = window.setTimeout(resize, 50);
    };
    viewport?.addEventListener("resize", onViewportChange);
    viewport?.addEventListener("scroll", onViewportChange);
    const themes = new MutationObserver(() => {
      if (themeRefreshRef.current !== null) return;
      themeRefreshRef.current = window.setTimeout(() => {
        themeRefreshRef.current = null;
        terminal.options.theme = themeFromDashboard(mount);
        terminal.refresh(0, terminal.rows - 1);
      }, 16);
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
    // Copy on Select: Eine mit der Maus getroffene Auswahl landet nach dem
    // Loslassen automatisch in der Zwischenablage (siehe copySelection).
    const onMouseUp = () => {
      const terminal = terminalRef.current;
      if (!terminal?.hasSelection()) return;
      copySelection();
    };
    mount.addEventListener("mouseup", onMouseUp);
    // Mausrad im Alternate Screen: xterm würde ohne Maus-Reporting der App
    // Pfeiltasten (ESC O A/B) senden. TUI-Agenten wie Codex oder Claude Code
    // interpretieren die als Tastatureingabe (Cursor-Sprünge, unbeabsichtigte
    // Aktionen) — dort wird das Rad im Alternate Screen geschluckt. Shell-
    // Terminals behalten das Verhalten, weil less/vim/man die Pfeiltasten als
    // Scrollen nutzen. Maus-fähige Apps (OpenCode) bleiben unberührt.
    const onWheelCapture = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      const terminal = terminalRef.current;
      if (!terminal || !sessionRef.current) return;
      if (terminal.buffer.active.type !== "alternate") return;
      if (mouseTrackingRef.current) return;
      if (kindRef.current === "shell") return;
      event.preventDefault();
      event.stopPropagation();
    };
    mount.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });

    // xterm bringt kein Scrollen per Finger mit: Die Zeichenfläche liegt über
    // dem scrollbaren Bereich und schluckt die Berührung. Ein Wisch wird
    // deshalb selbst in Zeilen umgerechnet. Erst ab einer klaren vertikalen
    // Bewegung greift die Geste, damit Antippen und Textauswahl erhalten
    // bleiben. Mehrfinger-Gesten (Zoom) bleiben ebenfalls unangetastet.
    const touchState = { active: false, lastY: 0, restLines: 0, decided: false, startX: 0, startY: 0 };
    const lineHeight = () => {
      const terminal = terminalRef.current;
      const rows = terminal?.rows ?? 0;
      const screenHeight = mount.querySelector<HTMLElement>(".xterm-screen")?.getBoundingClientRect().height ?? mount.clientHeight;
      return rows > 0 ? screenHeight / rows : 18;
    };
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) { touchState.active = false; return; }
      touchState.active = true;
      touchState.decided = false;
      touchState.restLines = 0;
      touchState.lastY = touch.clientY;
      touchState.startX = touch.clientX;
      touchState.startY = touch.clientY;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touchState.active || event.touches.length !== 1 || !touch) return;
      if (!touchState.decided) {
        const dx = Math.abs(touch.clientX - touchState.startX);
        const dy = Math.abs(touch.clientY - touchState.startY);
        if (dy < 12 || dy <= dx) return;
        touchState.decided = true;
        touchState.lastY = touch.clientY;
      }
      // Der Inhalt folgt dem Finger: nach oben wischen zeigt spätere Zeilen.
      const moved = touchState.lastY - touch.clientY;
      touchState.lastY = touch.clientY;
      const step = touchScrollLines(moved, lineHeight(), touchState.restLines);
      touchState.restLines = step.carry;
      event.preventDefault();
      if (step.lines !== 0) scrollByLines(step.lines);
    };
    const endTouch = () => { touchState.active = false; touchState.decided = false; touchState.restLines = 0; };
    mount.addEventListener("touchstart", onTouchStart, { passive: true });
    mount.addEventListener("touchmove", onTouchMove, { passive: false });
    mount.addEventListener("touchend", endTouch, { passive: true });
    mount.addEventListener("touchcancel", endTouch, { passive: true });

    if (activeRef.current || (keepAlive && globalThis.document.visibilityState !== "hidden")) connect();
    return () => {
      disposedRef.current = true;
      input.dispose(); cwdHandler.dispose(); observer.disconnect(); viewport?.removeEventListener("resize", onViewportChange); viewport?.removeEventListener("scroll", onViewportChange); themes.disconnect(); mount.removeEventListener("paste", onPaste, { capture: true }); mount.removeEventListener("wheel", onWheelCapture, { capture: true }); mount.removeEventListener("mouseup", onMouseUp); mount.removeEventListener("mousedown", onMouseCapture, { capture: true }); mount.removeEventListener("mousemove", onMouseCapture, { capture: true }); mount.removeEventListener("mouseup", onMouseCapture, { capture: true });
      mount.removeEventListener("touchstart", onTouchStart);
      mount.removeEventListener("touchmove", onTouchMove);
      mount.removeEventListener("touchend", endTouch);
      mount.removeEventListener("touchcancel", endTouch);
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      if (themeRefreshRef.current) window.clearTimeout(themeRefreshRef.current);
      themeRefreshRef.current = null;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      if (outputFlushRef.current) window.clearTimeout(outputFlushRef.current);
      outputFlushRef.current = null;
      outputBufferRef.current = "";
      snapshotReplayRef.current = false;
      socketRef.current?.close(); terminal.dispose();
      socketRef.current = null; terminalRef.current = null; fitRef.current = null;
    };
  }, [connect, copySelection, keepAlive, receivePastedText, resize, scrollByLines, send]);

  // Orbit-Knoten werden mit CSS transform skaliert. xterm zeichnet deshalb im
  // gesamten erlaubten Zoombereich mit dem exakten Gegenfaktor. Sichtbar bleibt
  // die Schrift so bei 14 px, statt an den früheren Grenzwerten mitzuzoomen.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const fontSize = terminalFontSizeForRenderScale(renderScale);
    if (terminal.options.fontSize === fontSize) return;
    terminal.options.fontSize = fontSize;
    terminal.options.lineHeight = 1;
    terminal.options.letterSpacing = 0;
    terminal.refresh(0, terminal.rows - 1);
    resize();
  }, [renderScale, resize]);

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

  const sendKey = useCallback((key: string, modifiers: { ctrl?: boolean; alt?: boolean } = {}) => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    send({ type: "terminal.input", sessionId, data: terminalKeySequence(key, modifiers) });
  }, [send]);

  const pasteFromClipboard = useCallback(() => {
    navigator.clipboard.readText()
      .then((text) => receivePastedText(text))
      .catch(() => {
        setError("Einfügen wurde vom Browser nicht erlaubt. Nutze die Browser-Berechtigung für die Zwischenablage.");
        terminalRef.current?.focus();
      });
  }, [receivePastedText]);

  useImperativeHandle(ref, () => ({
    clear: () => action("terminal.clear"),
    restart: () => action("terminal.restart"),
    close: () => action("terminal.close"),
    focus: () => terminalRef.current?.focus(),
    sendKey,
    pasteFromClipboard,
  }), [action, pasteFromClipboard, sendKey]);

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

  return (
    <section className="terminal-session" onKeyDown={(event) => event.stopPropagation()}>
      {restartBanner ? <div className="terminal-restart-banner" role="status"><span>{restartBanner.message}</span><button type="button" onClick={() => setRestartBanner(null)} aria-label="Banner schliessen"><CloseIcon className="h-3.5 w-3.5" /></button></div> : null}
      {/* Bei totem Terminal wandert der Fehlertext in das Banner darunter —
          sonst stünden zwei Meldungen mit derselben Aussage untereinander. */}
      {error && !terminalIsDead ? <div className="terminal-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Fehlermeldung schließen" title="Schließen"><CloseIcon className="h-3.5 w-3.5" /></button></div> : null}
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
            <RefreshIcon className="h-4 w-4" /> Neu starten
          </button>
        </div>
      ) : null}
      {/* Die Sondertasten stehen nicht mehr hier, sondern in der gemeinsamen
          Bedienleiste der Terminalfläche — zusammen mit den Sitzungsaktionen. */}
      <div className="terminal-viewport" ref={mountRef} onClick={() => terminalRef.current?.focus()} />
      <ConfirmDialog open={pendingPaste !== null} title="Großen Text einfügen?" description={`Der Inhalt umfasst ${pendingPaste?.length.toLocaleString("de-DE") ?? 0} Zeichen. Prüfe vorher, ob dadurch unbeabsichtigt Befehle ausgeführt werden könnten.`} confirmLabel="Trotzdem einfügen" onConfirm={() => { if (pendingPaste) pasteIntoTerminal(pendingPaste); setPendingPaste(null); }} onClose={() => { setPendingPaste(null); terminalRef.current?.focus(); }} />
    </section>
  );
});
