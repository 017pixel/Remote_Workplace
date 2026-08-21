import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { writeClipboardText } from "../../../lib/clipboard";
import { showUiToast } from "../../../lib/uiToasts";
import { attachTerminalAppearance } from "../terminal-appearance";
import { attachTerminalInput } from "../terminal-input";
import { useTerminalOutput } from "../useTerminalOutput";
import { isCompactTerminal, mouseWheelSequence, terminalFontSizeForRenderScale, terminalKeySequence, themeFromDashboard } from "../terminal-utils";
import type { ClientMessage, TerminalMeta, TerminalStatus } from "../terminal-types";
import type { TerminalSubscription } from "../transport/TerminalTransport";
import { createRendererCore } from "./rendererCore";
import type { TerminalRenderer, TerminalRendererOptions } from "./rendererTypes";

/**
 * Renderer-Engine V2: Eine xterm-Instanz pro sichtbarem Pane, verbunden über
 * den gemeinsamen multiplexten Socket. Der Server hält den autoritativen
 * Terminalzustand (Headless-xterm + Sequenz + Journal); dieser Renderer
 * synchronisiert per Snapshot/Deltas (siehe rendererCore) und beendet die
 * Subscription, sobald er unsichtbar wird — kein ANSI-Parsing im Hintergrund.
 */
export function useTerminalRenderer(options: TerminalRendererOptions): TerminalRenderer {
  const { instanceId, kind, projectId, initialCwd, mode, accountId, active, focused, renderScale, onMetaChange } = options;

  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const focusedRef = useRef(focused);
  const kindRef = useRef(kind);
  const sessionRef = useRef<string | null>(null);
  const epochRef = useRef(0);
  const sequenceRef = useRef(0);
  const ownsGeometryRef = useRef(false);
  const hasLiveStateRef = useRef(false);
  const snapshotReplayRef = useRef(false);
  const replayBufferRef = useRef<string[]>([]);
  const mouseTrackingRef = useRef(false);
  const mouseEncodingRef = useRef(false);
  const disposedRef = useRef(false);
  const closedRef = useRef(false);
  const createRetriesRef = useRef(0);
  const subscriptionRef = useRef<TerminalSubscription | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const cwdRef = useRef("–");
  activeRef.current = active;

  // Beim Antippen wird der Ref im PointerDown-Handler sofort gesetzt. Ein
  // Render darf diesen Fokus nicht mit dem alten Parent-Prop überschreiben.
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  const [status, setStatusState] = useState<TerminalStatus>("connecting");
  const [cwd, setCwdState] = useState("–");
  const [error, setErrorState] = useState<string | null>(null);
  const [restartBanner, setRestartBannerState] = useState<{ message: string } | null>(null);
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);

  const setStatus = useCallback((next: TerminalStatus) => setStatusState(next), []);
  const statusRef = useRef<TerminalStatus>(status);
  const errorRef = useRef<string | null>(error);
  statusRef.current = status;
  errorRef.current = error;
  cwdRef.current = cwd;

  const sendMessage = useCallback((message: ClientMessage): boolean => {
    return subscriptionRef.current?.send(message) ?? false;
  }, []);

  const output = useTerminalOutput({
    terminalRef, activeRef, sessionRef, replayBufferRef,
    send: (message) => sendMessage(message as ClientMessage),
    setError: setErrorState,
  });
  const { lastCommand, queueOutput, flushReplayBuffer, rememberTyping } = output;

  const reportMeta = useCallback((patch: Partial<TerminalMeta>) => {
    onMetaChange?.({
      status: statusRef.current,
      cwd: cwdRef.current,
      error: errorRef.current,
      cols: terminalRef.current?.cols ?? 0,
      rows: terminalRef.current?.rows ?? 0,
      ...patch,
    });
  }, [onMetaChange]);

  const reportSize = useCallback((cols: number, rows: number) => {
    const sessionId = sessionRef.current;
    if (sessionId && ownsGeometryRef.current) sendMessage({ type: "terminal.resize", sessionId, cols, rows });
  }, [sendMessage]);

  const fitAndReport = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal || !fitRef.current || !activeRef.current) return;
    try {
      if (ownsGeometryRef.current) {
        fitRef.current.fit();
        reportSize(terminal.cols, terminal.rows);
      } else {
        const dims = fitRef.current.proposeDimensions();
        if (dims) reportSize(dims.cols, dims.rows);
      }
    } catch { /* Versteckte Container haben kurz keine messbare Größe. */ }
  }, [reportSize]);

  const refs = {
    terminalRef, fitRef, activeRef, kindRef, sessionRef, epochRef, sequenceRef,
    ownsGeometryRef, hasLiveStateRef, snapshotReplayRef, replayBufferRef,
    mouseTrackingRef, mouseEncodingRef, disposedRef, closedRef, createRetriesRef,
    subscriptionRef, resizeFrameRef, cwdRef,
  };

  const core = createRendererCore(refs, {
    instanceId, kind, projectId, initialCwd, mode, accountId, sendMessage,
    setStatus, setCwd: setCwdState, setError: setErrorState, setRestartBanner: setRestartBannerState,
    reportMeta, queueOutput, flushReplayBuffer, fitAndReport,
  });
  const { attach, detach, resync } = core;

  // Sichtbarkeit steuert die Subscription: Sichtbar → synchronisieren,
  // unsichtbar → detach (kein Parsen im Hintergrund).
  useEffect(() => {
    if (active) attach();
    else detach();
    return () => detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // xterm-Lifecycle: erst erzeugen, wenn der Container wirklich sichtbar ist.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    disposedRef.current = false;
    const compact = isCompactTerminal(mount);
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      cursorInactiveStyle: "outline",
      convertEol: false,
      fontSize: terminalFontSizeForRenderScale(renderScale, compact),
      lineHeight: 1,
      letterSpacing: 0,
      customGlyphs: true,
      scrollback: 10_000,
      scrollSensitivity: 1,
      smoothScrollDuration: 0,
      // buffer/modes werden für den Maus-Modus gelesen (autoritative Quelle).
      allowProposedApi: true,
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
        if (next.startsWith("/")) { cwdRef.current = decodeURIComponent(next); setCwdState(cwdRef.current); reportMeta({}); }
      } catch { /* ungültig */ }
      return true;
    });

    const pasteIntoTerminal = (text: string) => {
      terminal.paste(text);
      setErrorState(null);
      window.setTimeout(() => terminal.focus(), 0);
    };
    const copySelection = () => {
      const selection = terminal.getSelection();
      if (!selection) { setErrorState("Wähle zuerst Text im Terminal aus."); return; }
      void writeClipboardText(selection)
        .then(() => showUiToast({ title: "Kopiert", severity: "success" }))
        .catch((copyError) => setErrorState(copyError instanceof Error ? copyError.message : "Kopieren wurde vom Browser nicht erlaubt."));
    };
    const receivePastedText = (text: string) => {
      if (text.length > 10_000) { setPendingPaste(text); return; }
      pasteIntoTerminal(text);
    };
    const scrollByLines = (lines: number) => {
      if (!terminal || lines === 0) return;
      if (terminal.buffer.active.type !== "alternate") { terminal.scrollLines(lines); return; }
      const sessionId = sessionRef.current;
      if (!sessionId) return;
      const steps = Math.min(Math.abs(lines), 12);
      if (terminal.modes.mouseTrackingMode !== "none") {
        const sequence = mouseWheelSequence(lines < 0 ? "up" : "down", mouseEncodingRef.current);
        for (let step = 0; step < steps; step += 1) sendMessage({ type: "terminal.input", sessionId, data: sequence });
        return;
      }
      if (kindRef.current === "shell") {
        const sequence = lines < 0 ? "\x1b[A" : "\x1b[B";
        for (let step = 0; step < steps; step += 1) sendMessage({ type: "terminal.input", sessionId, data: sequence });
      }
    };
    const disposeInput = attachTerminalInput(terminal, mount, {
      send: (message) => sendMessage(message as ClientMessage),
      setError: setErrorState,
      sessionRef, snapshotReplayRef, replayBufferRef, mouseTrackingRef, kindRef, terminalRef, focusedRef,
      rememberTyping, copySelection, receivePastedText, scrollByLines,
    });
    const disposeAppearance = attachTerminalAppearance(terminal, mount, {
      disposedRef, terminalRef,
      compactRef: { current: compact },
      renderScaleRef: { current: renderScale },
      resizeRef: { current: null },
      themeRefreshRef: { current: null },
      resize: fitAndReport,
    });

    const observer = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = window.requestAnimationFrame(fitAndReport);
    });
    observer.observe(mount);
    const onVisibility = () => { if (document.visibilityState === "visible") fitAndReport(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", fitAndReport);

    if (activeRef.current) attach();
    else detach();

    return () => {
      disposedRef.current = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", fitAndReport);
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
      disposeInput();
      disposeAppearance();
      cwdHandler.dispose();
      detach();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pasteIntoTerminal = useCallback((text: string) => {
    const terminal = terminalRef.current;
    const sessionId = sessionRef.current;
    if (!terminal || !sessionId) {
      setErrorState("Das Terminal ist noch nicht verbunden. Bitte gleich erneut einfügen.");
      return;
    }
    terminal.paste(text);
    setErrorState(null);
    window.setTimeout(() => terminal.focus(), 0);
  }, []);

  const sendKey = useCallback((key: string, modifiers: { ctrl?: boolean; alt?: boolean } = {}) => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    sendMessage({ type: "terminal.input", sessionId, data: terminalKeySequence(key, modifiers) });
  }, [sendMessage]);

  const pasteFromClipboard = useCallback(() => {
    navigator.clipboard.readText()
      .then((text) => {
        if (text.length > 10_000) { setPendingPaste(text); return; }
        pasteIntoTerminal(text);
      })
      .catch(() => {
        setErrorState("Einfügen wurde vom Browser nicht erlaubt. Nutze die Browser-Berechtigung für die Zwischenablage.");
        terminalRef.current?.focus();
      });
  }, [pasteIntoTerminal]);

  const restart = useCallback(() => {
    const sessionId = sessionRef.current;
    if (!sessionId) { setErrorState("Die Verbindung wird noch aufgebaut. Bitte gleich erneut versuchen."); return; }
    sendMessage({ type: "terminal.restart", sessionId });
    sequenceRef.current = 0;
    epochRef.current += 1;
    hasLiveStateRef.current = false;
    terminalRef.current?.reset();
    setStatus("connecting");
    reportMeta({ status: "connecting" });
  }, [reportMeta, sendMessage, setStatus]);

  const action = useCallback((type: "terminal.clear" | "terminal.restart" | "terminal.close") => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    sendMessage({ type, sessionId });
    if (type === "terminal.close") {
      closedRef.current = true;
      sessionRef.current = null;
      hasLiveStateRef.current = false;
      setStatus("exited");
    }
  }, [sendMessage, setStatus]);

  const resolvePendingPaste = useCallback((confirm: boolean) => {
    setPendingPaste((current) => {
      if (current && confirm) pasteIntoTerminal(current);
      return null;
    });
    terminalRef.current?.focus();
  }, [pasteIntoTerminal]);

  const focus = useCallback(() => {
    // PointerDown kommt vor TouchStart. Den Ref sofort setzen, damit ein
    // erster Wisch im frisch angeklickten Pane nicht vom Fokus-Gate verworfen wird.
    focusedRef.current = true;
    terminalRef.current?.focus();
    // Fokus ist echte Nutzerinteraktion: Geometrie-Controlling übernehmen.
    if (sessionRef.current && !ownsGeometryRef.current) {
      sendMessage({ type: "terminal.takeControl", runtimeId: instanceId });
    }
  }, [instanceId, sendMessage]);

  useEffect(() => {
    reportMeta({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cwd, error]);

  const terminalIsDead = status === "exited" || status === "error";

  return {
    status, cwd, error, restartBanner, lastCommand, terminalIsDead, pendingPaste,
    sendKey, pasteFromClipboard, restart, resync, action, focus, resolvePendingPaste,
    setError: setErrorState,
    setRestartBanner: setRestartBannerState,
    mountRef,
  };
}
