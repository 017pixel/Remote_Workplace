import type { PtyProcess } from "./NodePtyAdapter.js";
import type { ServerTerminalMessage, TerminalErrorCode, TerminalKind } from "./protocol.js";

export type TerminalStatus = "starting" | "running" | "exited" | "interrupted" | "closed";
export type TerminalClient = (message: ServerTerminalMessage) => void;
export interface TerminalClientViewport { cols: number; rows: number; }

export interface TerminalSession {
  id: string;
  userId: string;
  runtimeId: string;
  kind: TerminalKind;
  mode: "agent" | "login";
  profilePath: string | null;
  supervisorName: string | null;
  projectId: string | null;
  pty: PtyProcess | null;
  pid: number;
  cwd: string;
  cols: number;
  rows: number;
  status: TerminalStatus;
  history: string;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  exitSignal: number | null;
  sequence: number;
  lastPersistedAt: number | undefined;
  clients: Map<string, TerminalClient>;
  clientViewports: Map<string, TerminalClientViewport>;
  primaryClientId: string | null;
  dataListener: { dispose(): void } | null;
  exitListener: { dispose(): void } | null;
}

export class TerminalFailure extends Error {
  constructor(readonly code: TerminalErrorCode, message: string) { super(message); }
}

const HISTORY_LIMIT = 3 * 1024 * 1024;
/** Snapshot-Größe beim (Wieder-)Verbinden: Der Client spielt nur so viel ein,
 *  damit das Resume auch bei langen TUIs schnell bleibt. */
const SNAPSHOT_LIMIT = 512 * 1024;
/** Beendete Sessions räumen sich nach dieser Zeit von selbst auf. */
const EXITED_SESSION_TTL_MS = 30 * 60 * 1_000;

export { EXITED_SESSION_TTL_MS, HISTORY_LIMIT, SNAPSHOT_LIMIT };
