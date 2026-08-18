import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import { splitTerminalInput } from "../../lib/clipboard";
import { maximumParkedOutputBytes } from "./terminal-constants";

interface TerminalOutputOptions {
  terminalRef: MutableRefObject<Terminal | null>;
  activeRef: MutableRefObject<boolean>;
  sessionRef: MutableRefObject<string | null>;
  replayBufferRef: MutableRefObject<string[]>;
  send(message: object): boolean;
  setError(message: string | null): void;
}

export interface TerminalOutput {
  lastCommand: string;
  currentLineRef: MutableRefObject<string>;
  flushOutput(force?: boolean): void;
  queueOutput(data: string): void;
  flushReplayBuffer(): void;
  rememberTyping(data: string): void;
}

/** Puffert die Terminalausgabe (maximal einmal pro Frame an xterm) und merkt
 *  sich die zuletzt getippte Zeile, um sie nach einem Neustart vorzulegen. */
export function useTerminalOutput(options: TerminalOutputOptions): TerminalOutput {
  const { terminalRef, activeRef, sessionRef, replayBufferRef, send, setError } = options;
  const outputBufferRef = useRef("");
  const outputFlushRef = useRef<number | null>(null);
  const currentLineRef = useRef("");
  const [lastCommand, setLastCommand] = useState("");

  // xterm emuliert jeden write synchron. Bei Build-Ausgaben kommen jedoch
  // häufig sehr viele kleine WebSocket-Nachrichten hintereinander an. Die
  // Bytes bleiben unverändert, werden aber höchstens einmal pro Frame an xterm
  // übergeben. Geparkte Knoten halten nur einen begrenzten Schwanz der Ausgabe.
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
  }, [activeRef, terminalRef]);

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
  }, [activeRef, flushOutput]);

  /**
   * Verfolgt die Eingabe zeichenweise mit. Nur so viel Terminal-Emulation wie
   * nötig: sichtbare Zeichen sammeln, Backspace entfernt eines, Enter schließt
   * die Zeile ab, Steuerzeichen (Strg-C, Pfeiltasten) verwerfen sie.
   */
  const rememberTyping = useCallback((data: string) => {
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
  }, [rememberTyping, replayBufferRef, send, sessionRef, setError]);

  useEffect(() => () => {
    if (outputFlushRef.current) window.clearTimeout(outputFlushRef.current);
    outputFlushRef.current = null;
    outputBufferRef.current = "";
  }, []);

  return { lastCommand, currentLineRef, flushOutput, queueOutput, flushReplayBuffer, rememberTyping };
}
