import type { MutableRefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import { splitTerminalInput, terminalClipboardAction } from "../../lib/clipboard";
import type { TerminalKind } from "@wrapt/contracts";
import { isDeviceAnswer, shouldForwardTerminalData, touchScrollLines, wheelScrollLines } from "./terminal-utils";

/** Gemeinsame Zustände und Callbacks, die die Eingabe-Handler benötigen. */
export interface TerminalInputContext {
  send(message: object): boolean;
  setError(message: string | null): void;
  sessionRef: MutableRefObject<string | null>;
  snapshotReplayRef: MutableRefObject<boolean>;
  replayBufferRef: MutableRefObject<string[]>;
  mouseTrackingRef: MutableRefObject<boolean>;
  kindRef: MutableRefObject<TerminalKind>;
  terminalRef: MutableRefObject<Terminal | null>;
  focusedRef: MutableRefObject<boolean>;
  rememberTyping(data: string): void;
  copySelection(): void;
  receivePastedText(text: string): void;
  scrollByLines(lines: number): void;
}

/**
 * Hängt alle Eingabe-Handler (Tastatur, Maus, Paste, Touch) an eine laufende
 * xterm-Instanz. Gibt eine Aufräumfunktion zurück, die exakt diese Handler
 * wieder entfernt — ohne den Terminal selbst zu zerstören.
 */
export function attachTerminalInput(terminal: Terminal, mount: HTMLElement, context: TerminalInputContext): () => void {
  const {
    send, setError, sessionRef, snapshotReplayRef, replayBufferRef,
    mouseTrackingRef, kindRef, terminalRef, focusedRef,
    rememberTyping, copySelection, receivePastedText, scrollByLines,
  } = context;

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== "keydown") return true;
    if (!focusedRef.current) return false;
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
  let selectionDrag: { col: number; row: number } | null = null;
  let dragSelectActive = false;
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
    if (!focusedRef.current || event.altKey || !mouseTrackingRef.current) return;
    if (event.type === "mousedown") {
      if (event.button !== 0) return;
      selectionDrag = event.shiftKey ? null : cellFromEvent(event);
      dragSelectActive = false;
      return;
    }
    if (event.type === "mousemove") {
      const start = selectionDrag;
      if (!start || event.shiftKey) return;
      if ((event.buttons & 1) === 0) { selectionDrag = null; dragSelectActive = false; return; }
      const cell = cellFromEvent(event);
      if (!cell || (cell.col === start.col && cell.row === start.row)) return;
      selectCells(start, cell);
      dragSelectActive = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.type === "mouseup") {
      const wasDrag = dragSelectActive;
      selectionDrag = null;
      dragSelectActive = false;
      if (wasDrag) {
        event.preventDefault();
        event.stopPropagation();
        copySelection();
      }
    }
  };

  // Antworten, die xterm auf Geräteabfragen erzeugt (z. B. „1;1R"), sind
  // keine Nutzereingabe und dürfen nie zurück in die PTY wandern.
  const dataHandler = terminal.onData((data) => {
    if (isDeviceAnswer(data)) return;
    if (!focusedRef.current) return;
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

  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text/plain");
    if (!text || !focusedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    receivePastedText(text);
  };

  // Copy on Select: Eine mit der Maus getroffene Auswahl landet nach dem
  // Loslassen automatisch in der Zwischenablage (siehe copySelection).
  const onMouseUp = () => {
    if (!focusedRef.current || !terminalRef.current?.hasSelection()) return;
    copySelection();
  };

  const wheelState = { restLines: 0 };

  // Mausrad im Alternate Screen: xterm würde ohne Maus-Reporting der App
  // Pfeiltasten (ESC O A/B) senden. TUI-Agenten wie Codex oder Claude Code
  // interpretieren die als Tastatureingabe (Cursor-Sprünge, unbeabsichtigte
  // Aktionen) — dort wird das Rad im Alternate Screen geschluckt. Shell-
  // Terminals behalten das Verhalten, weil less/vim/man die Pfeiltasten als
  // Scrollen nutzen. Maus-fähige Apps (OpenCode) bleiben unberührt.
  const onWheelCapture = (event: WheelEvent) => {
    if (!focusedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.ctrlKey || event.metaKey) return;
    if (!terminalRef.current || !sessionRef.current) return;
    if (mouseTrackingRef.current) return;
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;

    const alternate = terminalRef.current.buffer.active.type === "alternate";
    if (alternate && kindRef.current === "shell") return;

    const height = lineHeight();
    const step = wheelScrollLines(event.deltaY, event.deltaMode, height, mount.clientHeight, wheelState.restLines);
    wheelState.restLines = step.carry;
    event.preventDefault();
    event.stopPropagation();
    if (step.lines !== 0) scrollByLines(step.lines);
  };

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
    if (!focusedRef.current) { touchState.active = false; return; }
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
    if (!focusedRef.current) { touchState.active = false; return; }
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

  mount.addEventListener("mousedown", onMouseCapture, { capture: true });
  mount.addEventListener("mousemove", onMouseCapture, { capture: true });
  mount.addEventListener("mouseup", onMouseCapture, { capture: true });
  mount.addEventListener("paste", onPaste, { capture: true });
  mount.addEventListener("mouseup", onMouseUp);
  mount.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });
  mount.addEventListener("touchstart", onTouchStart, { passive: true });
  mount.addEventListener("touchmove", onTouchMove, { passive: false });
  mount.addEventListener("touchend", endTouch, { passive: true });
  mount.addEventListener("touchcancel", endTouch, { passive: true });

  return () => {
    dataHandler.dispose();
    mount.removeEventListener("mousedown", onMouseCapture, { capture: true });
    mount.removeEventListener("mousemove", onMouseCapture, { capture: true });
    mount.removeEventListener("mouseup", onMouseCapture, { capture: true });
    mount.removeEventListener("paste", onPaste, { capture: true });
    mount.removeEventListener("mouseup", onMouseUp);
    mount.removeEventListener("wheel", onWheelCapture, { capture: true });
    mount.removeEventListener("touchstart", onTouchStart);
    mount.removeEventListener("touchmove", onTouchMove);
    mount.removeEventListener("touchend", endTouch);
    mount.removeEventListener("touchcancel", endTouch);
  };
}
