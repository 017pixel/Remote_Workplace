import type { MutableRefObject } from "react";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import type { TerminalKind } from "@wrapt/contracts";
import type { TerminalMeta, TerminalStatus } from "../terminal-types";
import type { TerminalSubscription } from "../transport/TerminalTransport";

export interface TerminalRendererOptions {
  instanceId: string;
  kind: TerminalKind;
  projectId: string | null;
  initialCwd: string | null;
  mode: "agent" | "login";
  accountId: string | undefined;
  active: boolean;
  renderScale: number;
  onMetaChange: ((meta: TerminalMeta) => void) | undefined;
}

export interface TerminalRenderer {
  status: TerminalStatus;
  cwd: string;
  error: string | null;
  restartBanner: { message: string } | null;
  lastCommand: string;
  terminalIsDead: boolean;
  pendingPaste: string | null;
  sendKey(key: string, modifiers?: { ctrl?: boolean; alt?: boolean }): void;
  pasteFromClipboard(): void;
  restart(): void;
  /** Fordert beim Server eine erneute Synchronisation an (Renderer-Resync). */
  resync(): void;
  action(type: "terminal.clear" | "terminal.restart" | "terminal.close"): void;
  setError(message: string | null): void;
  setRestartBanner(banner: { message: string } | null): void;
  resolvePendingPaste(confirm: boolean): void;
  focus(): void;
  mountRef: MutableRefObject<HTMLDivElement | null>;
}

/** Alle flüchtigen Ref-Zustände eines Renderers — Basis des Sync-Kerns. */
export interface RendererRefs {
  terminalRef: MutableRefObject<Terminal | null>;
  fitRef: MutableRefObject<FitAddon | null>;
  activeRef: MutableRefObject<boolean>;
  kindRef: MutableRefObject<TerminalKind>;
  sessionRef: MutableRefObject<string | null>;
  epochRef: MutableRefObject<number>;
  sequenceRef: MutableRefObject<number>;
  ownsGeometryRef: MutableRefObject<boolean>;
  hasLiveStateRef: MutableRefObject<boolean>;
  snapshotReplayRef: MutableRefObject<boolean>;
  replayBufferRef: MutableRefObject<string[]>;
  mouseTrackingRef: MutableRefObject<boolean>;
  mouseEncodingRef: MutableRefObject<boolean>;
  disposedRef: MutableRefObject<boolean>;
  closedRef: MutableRefObject<boolean>;
  createRetriesRef: MutableRefObject<number>;
  subscriptionRef: MutableRefObject<TerminalSubscription | null>;
  resizeFrameRef: MutableRefObject<number | null>;
  cwdRef: MutableRefObject<string>;
}

/** Zustands-Setter und Output-Pfade, die der Sync-Kern vom Hook bekommt. */
export interface RendererCoreDeps {
  instanceId: string;
  kind: TerminalKind;
  projectId: string | null;
  initialCwd: string | null;
  mode: "agent" | "login";
  accountId: string | undefined;
  sendMessage(message: unknown): boolean;
  setStatus(status: TerminalStatus): void;
  setCwd(cwd: string): void;
  setError(message: string | null): void;
  setRestartBanner(banner: { message: string } | null): void;
  reportMeta(patch: Partial<TerminalMeta>): void;
  queueOutput(data: string): void;
  flushReplayBuffer(): void;
  fitAndReport(): void;
}
