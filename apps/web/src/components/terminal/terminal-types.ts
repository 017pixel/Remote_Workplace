import type { TerminalKind } from "@wrapt/contracts";

export type TerminalStatus = "connecting" | "connected" | "disconnected" | "exited" | "interrupted" | "error";

export interface TerminalDelta { sequence: number; data: string; }

/** Nachrichten, die der Server über den multiplexten Terminal-WebSocket sendet. */
export type ServerMessage =
  | { type: "terminal.created"; requestId: string; sessionId: string; runtimeId: string; kind: TerminalKind; projectId: string | null; status: string; cwd: string; pid: number }
  | { type: "terminal.snapshot"; sessionId: string; runtimeId: string; kind: TerminalKind; status: string; projectId: string | null; cwd: string; epoch: number; sequence: number; cols: number; rows: number; ownsGeometry: boolean; alternate: boolean; mouseTracking: boolean; serialized: string }
  | { type: "terminal.deltas"; sessionId: string; runtimeId: string; epoch: number; startSequence: number; deltas: TerminalDelta[] }
  | { type: "terminal.geometry"; sessionId: string; cols: number; rows: number; ownsGeometry: boolean }
  | { type: "terminal.output"; sessionId: string; data: string; sequence: number }
  | { type: "terminal.cwd"; sessionId: string; cwd: string }
  | { type: "terminal.exited"; sessionId: string; exitCode: number | null; signal: number | null; sequence: number }
  | { type: "terminal.restarting"; sessionId: string; reason: string; sequence: number }
  | { type: "terminal.cleared"; sessionId: string; sequence: number }
  | { type: "terminal.error"; code: string; message: string; sessionId?: string; runtimeId?: string }
  | { type: "terminal.pong" };

/** Nachrichten, die der Client über den multiplexten Terminal-WebSocket sendet. */
export type ClientMessage =
  | { type: "terminal.create"; requestId: string; runtimeId?: string; kind: TerminalKind; projectId?: string; cwd?: string; mode?: "agent" | "login"; accountId?: string; cols: number; rows: number }
  | { type: "terminal.subscribe"; runtimeId: string; sessionId?: string; cols?: number; rows?: number; state?: { epoch: number; lastSequence: number } }
  | { type: "terminal.unsubscribe"; runtimeId: string }
  | { type: "terminal.sync"; runtimeId: string; state: { epoch: number; lastSequence: number } }
  | { type: "terminal.takeControl"; runtimeId: string; cols?: number; rows?: number }
  | { type: "terminal.input"; sessionId: string; data: string }
  | { type: "terminal.resize"; sessionId: string; cols: number; rows: number }
  | { type: "terminal.clear"; sessionId: string }
  | { type: "terminal.restart"; sessionId: string }
  | { type: "terminal.close"; sessionId: string }
  | { type: "terminal.ping" };

/** Imperative Methoden, die der Terminal-Bereich über eine Ref aufruft. */
export interface WebTerminalHandle {
  clear(): void;
  restart(): void;
  close(): void;
  /** Renderer-Resync: fordert vom Server einen frischen Snapshot an. */
  resync(): void;
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
  /** Erlaubt Eingabe und Scrollen nur im aktuell fokussierten Pane. */
  focused?: boolean;
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

/** Transport-Status eines Renderers. */
export type RendererStatus = "idle" | "connecting" | "syncing" | "ready" | "resyncing" | "error";
