import type { TerminalKind } from "@workbench/contracts";

export type TerminalStatus = "connecting" | "connected" | "disconnected" | "exited" | "interrupted" | "error";

/** Nachrichten, die der Server über den Terminal-WebSocket an den Client sendet. */
export type ServerMessage =
  | { type: "terminal.created"; requestId: string; sessionId: string; runtimeId: string; kind: TerminalKind; projectId: string | null; status: string; cwd: string; pid: number }
  | { type: "terminal.snapshot"; sessionId: string; runtimeId: string; kind: TerminalKind; status: string; projectId: string | null; cwd: string; history: string; sequence: number; cols: number; rows: number; ownsGeometry: boolean; alternate: boolean }
  | { type: "terminal.geometry"; sessionId: string; cols: number; rows: number; ownsGeometry: boolean }
  | { type: "terminal.output"; sessionId: string; data: string; sequence: number }
  | { type: "terminal.cwd"; sessionId: string; cwd: string }
  | { type: "terminal.exited"; sessionId: string; exitCode: number | null; signal: number | null; sequence: number }
  | { type: "terminal.restarting"; sessionId: string; reason: string; sequence: number }
  | { type: "terminal.cleared"; sessionId: string; sequence: number }
  | { type: "terminal.error"; code: string; message: string; sessionId?: string }
  | { type: "terminal.pong" };

/** Imperative Methoden, die der Terminal-Bereich über eine Ref aufruft. */
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
  onMetaChange?: (meta: TerminalMeta) => void;
}

export interface TerminalMeta {
  status: TerminalStatus;
  cwd: string;
  error: string | null;
  cols: number;
  rows: number;
}
