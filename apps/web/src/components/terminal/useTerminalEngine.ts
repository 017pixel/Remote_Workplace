import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { TerminalKind } from "@workbench/contracts";
import { writeClipboardText } from "../../lib/clipboard";
import { showUiToast } from "../../lib/uiToasts";
import { attachTerminalAppearance } from "./terminal-appearance";
import { attachTerminalInput } from "./terminal-input";
import { isCompactTerminal, mouseWheelSequence, terminalFontSizeForRenderScale, themeFromDashboard } from "./terminal-utils";
import type { TerminalEngineApi } from "./useTerminalConnection";

export interface TerminalEngineOptions {
  renderScale: number;
  active: boolean;
  keepAlive: boolean;
  send(message: object): boolean;
  setError(message: string | null): void;
  setCwd(cwd: string): void;
  rememberTyping(data: string): void;
  reportSize(cols: number, rows: number): void;
  connect(): void;
  setPendingPaste(text: string | null): void;
  mountRef: MutableRefObject<HTMLDivElement | null>;
  terminalRef: MutableRefObject<Terminal | null>;
  fitRef: MutableRefObject<FitAddon | null>;
  socketRef: MutableRefObject<WebSocket | null>;
  activeRef: MutableRefObject<boolean>;
  kindRef: MutableRefObject<TerminalKind>;
  sessionRef: MutableRefObject<string | null>;
  snapshotReplayRef: MutableRefObject<boolean>;
  replayBufferRef: MutableRefObject<string[]>;
  mouseTrackingRef: MutableRefObject<boolean>;
  mouseEncodingRef: MutableRefObject<boolean>;
  ownsGeometryRef: MutableRefObject<boolean>;
  disposedRef: MutableRefObject<boolean>;
  engineApiRef: MutableRefObject<TerminalEngineApi>;
}

export interface TerminalEngine {
  resize(): void;
  measurePreferred(): { cols: number; rows: number } | null;
  scrollByLines(lines: number): void;
  copySelection(): void;
  pasteIntoTerminal(text: string): void;
  receivePastedText(text: string): void;
  focus(): void;
}

/** Erstellt und verwaltet die xterm-Instanz: Raster, Scrollen, Zwischenablage,
 *  Eingabe und Anpassungs-Observer. Meldet die Geometrie-Operationen über die
 *  Engine-API, damit die Verbindungslogik sie ohne direkte Kopplung nutzt. */
export function useTerminalEngine(options: TerminalEngineOptions): TerminalEngine {
  const {
    renderScale, active, keepAlive, send, setError, setCwd, rememberTyping, reportSize,
    connect, setPendingPaste, mountRef, terminalRef, fitRef, socketRef, activeRef,
    kindRef, sessionRef, snapshotReplayRef, replayBufferRef, mouseTrackingRef,
    mouseEncodingRef, ownsGeometryRef, disposedRef, engineApiRef,
  } = options;

  const compactRef = useRef(false);
  const resizeRef = useRef<number | null>(null);
  const themeRefreshRef = useRef<number | null>(null);
  const initialRenderScaleRef = useRef(renderScale);
  const renderScaleRef = useRef(renderScale);
  renderScaleRef.current = renderScale;

  const measurePreferred = useCallback(() => {
    if (!fitRef.current || !terminalRef.current) return null;
    try {
      const dims = fitRef.current.proposeDimensions();
      return dims ?? null;
    } catch { return null; }
  }, [fitRef, terminalRef]);

  const resize = useCallback(() => {
    if (!fitRef.current || !terminalRef.current || !activeRef.current) return;
    try {
      if (ownsGeometryRef.current) {
        fitRef.current.fit();
        const { cols, rows } = terminalRef.current;
        reportSize(cols, rows);
      } else {
        const dims = measurePreferred();
        if (dims) reportSize(dims.cols, dims.rows);
      }
    } catch { /* Hidden containers briefly have no measurable size. */ }
  }, [activeRef, fitRef, measurePreferred, ownsGeometryRef, reportSize, terminalRef]);

  engineApiRef.current = { resize, measurePreferred };

  /** Scrollt das Terminal um eine Anzahl Zeilen. Negative Werte gehen zurück in
   *  den Verlauf. Drei Fälle: normaler Puffer (xterm scrollt selbst), Alternate
   *  Screen mit Maus-Reporting (App führt ihren Verlauf), Alternate Screen ohne
   *  Maus-Reporting (nur Shell-Werkzeuge verstehen die Pfeiltasten). */
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
  }, [kindRef, mouseEncodingRef, mouseTrackingRef, send, sessionRef, terminalRef]);

  /** Kopiert die aktuelle xterm-Auswahl in die Zwischenablage und bestätigt
   *  den Erfolg mit einem Toast (Copy on Select). */
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
  }, [setError, terminalRef]);

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
  }, [sessionRef, setError, terminalRef]);

  const receivePastedText = useCallback((text: string) => {
    if (!text) return;
    if (text.length > 10_000) {
      setPendingPaste(text);
      setError(null);
      return;
    }
    pasteIntoTerminal(text);
  }, [pasteIntoTerminal, setError, setPendingPaste]);

  const focus = useCallback(() => terminalRef.current?.focus(), [terminalRef]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    disposedRef.current = false;
    compactRef.current = isCompactTerminal(mount);
    const terminal = new Terminal({
      cursorBlink: true,
      // Blockcursor statt Strich: die vertraute Form eines Terminals.
      cursorStyle: "block",
      cursorInactiveStyle: "outline",
      convertEol: false,
      fontSize: terminalFontSizeForRenderScale(initialRenderScaleRef.current, compactRef.current),
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
    terminalRef.current = terminal;
    fitRef.current = fit;
    const cwdHandler = terminal.parser.registerOscHandler(7, (value) => {
      try {
        const next = new URL(value).pathname;
        if (next.startsWith("/")) setCwd(decodeURIComponent(next));
      } catch { /* Ungültige OSC-7-Werte ignorieren. */ }
      return true;
    });
    const disposeInput = attachTerminalInput(terminal, mount, {
      send, setError, sessionRef, snapshotReplayRef, replayBufferRef, mouseTrackingRef,
      kindRef, terminalRef, rememberTyping, copySelection,
      receivePastedText, scrollByLines,
    });
    const disposeAppearance = attachTerminalAppearance(terminal, mount, {
      disposedRef, terminalRef, compactRef, renderScaleRef, resizeRef, themeRefreshRef, resize,
    });

    if (activeRef.current || keepAlive) connect();

    return () => {
      disposedRef.current = true;
      disposeInput();
      disposeAppearance();
      cwdHandler.dispose();
      snapshotReplayRef.current = false;
      socketRef.current?.close();
      socketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // Alle Abhängigkeiten sind stabile Callbacks beziehungsweise Refs, sodass
    // das Terminal nur bei echtem keepAlive-Wechsel neu aufgebaut wird.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect, copySelection, keepAlive, receivePastedText, rememberTyping, resize, scrollByLines, send]);

  // Orbit-Knoten werden mit CSS transform skaliert. xterm zeichnet deshalb im
  // gesamten erlaubten Zoombereich mit dem exakten Gegenfaktor. Sichtbar bleibt
  // die Schrift so bei 14 px, statt an den früheren Grenzwerten mitzuzoomen.
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const fontSize = terminalFontSizeForRenderScale(renderScale, compactRef.current);
    if (terminal.options.fontSize === fontSize) return;
    terminal.options.fontSize = fontSize;
    terminal.options.lineHeight = 1;
    terminal.options.letterSpacing = 0;
    terminal.refresh(0, terminal.rows - 1);
    resize();
  }, [renderScale, resize, terminalRef]);

  useEffect(() => { if (active) window.setTimeout(resize, 0); }, [active, resize]);

  return { resize, measurePreferred, scrollByLines, copySelection, pasteIntoTerminal, receivePastedText, focus };
}
