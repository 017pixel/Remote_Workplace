import * as nodePty from "node-pty";

export interface PtyProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): { dispose(): void };
  onExit(callback: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
}

export interface PtyAdapter {
  spawn(shell: string, args: string[], options: nodePty.IPtyForkOptions): PtyProcess;
}

export const nodePtyAdapter: PtyAdapter = { spawn: (shell, args, options) => nodePty.spawn(shell, args, options) };
