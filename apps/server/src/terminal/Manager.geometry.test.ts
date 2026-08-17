import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalManager } from "./Manager.js";
import type { PtyProcess } from "./NodePtyAdapter.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";

class FakePty implements PtyProcess {
  pid = 4242;
  writes: string[] = [];
  resizes: Array<[number, number]> = [];
  private data: ((data: string) => void) | undefined;
  private exit: ((event: { exitCode: number; signal?: number }) => void) | undefined;

  write(data: string) { this.writes.push(data); }
  resize(cols: number, rows: number) { this.resizes.push([cols, rows]); }
  kill() {}
  onData(callback: (data: string) => void) { this.data = callback; return { dispose: () => { this.data = undefined; } }; }
  onExit(callback: (event: { exitCode: number; signal?: number }) => void) { this.exit = callback; return { dispose: () => { this.exit = undefined; } }; }
  output(data: string) { this.data?.(data); }
}

class FakeSupervisor {
  readonly sessions = new Set<string>();
  captureValue = "";
  sessionName(runtimeId: string) { return `workbench-${runtimeId.replaceAll("-", "")}`; }
  list() { return []; }
  has(name: string) { return this.sessions.has(name); }
  ensure(input: { runtimeId: string }) { const name = this.sessionName(input.runtimeId); this.sessions.add(name); return name; }
  capture() { return this.captureValue; }
  attachCommand(name: string) { return { file: "/usr/bin/tmux", args: ["attach-session", "-t", name] }; }
  respawn() {}
  sendLastCommandHint() {}
  currentPath() { return null; }
  terminate(name: string) { this.sessions.delete(name); }
}

let manager: TerminalManager | undefined;
afterEach(() => {
  manager?.shutdown();
  manager = undefined;
});

async function createManager() {
  const root = await mkdtemp(join(tmpdir(), "workbench-terminal-geometry-"));
  const pty = new FakePty();
  manager = new TerminalManager({
    allowedRoots: [root],
    defaultCwd: root,
    maxSessions: 1,
    adapter: { spawn: () => pty },
  });
  return { manager, pty };
}

describe("terminal rendering geometry", () => {
  it("hands PTY geometry to the device that becomes active", async () => {
    const { manager: terminal, pty } = await createManager();
    const session = await terminal.createSession("owner", {
      runtimeId: "00000000-0000-4000-8000-000000000001",
      cols: 120,
      rows: 40,
      clientId: "desktop",
    });

    terminal.attachSession("owner", session.id, () => {}, "desktop");
    terminal.attachSession("owner", session.id, () => {}, "mobile");
    terminal.resizeSession("owner", session.id, 120, 40, "desktop");
    terminal.resizeSession("owner", session.id, 52, 24, "mobile");

    expect(terminal.getSessionMetadata("owner", session.id)).toMatchObject({ cols: 120, rows: 40 });

    terminal.activateClient("owner", session.id, "mobile");
    expect(pty.resizes.at(-1)).toEqual([52, 24]);
    expect(terminal.getSessionMetadata("owner", session.id)).toMatchObject({ cols: 52, rows: 24 });

    terminal.activateClient("owner", session.id, "desktop");
    expect(pty.resizes.at(-1)).toEqual([120, 40]);
  });

  it("physically resizes a live PTY when the only client reconnects with a new viewport", async () => {
    const { manager: terminal, pty } = await createManager();
    const runtimeId = "00000000-0000-4000-8000-000000000002";
    const session = await terminal.createSession("owner", { runtimeId, cols: 120, rows: 40, clientId: "desktop" });
    const detach = terminal.attachSession("owner", session.id, () => {}, "desktop");
    detach();

    await terminal.createSession("owner", { runtimeId, cols: 50, rows: 22, clientId: "mobile" });

    expect(pty.resizes.at(-1)).toEqual([50, 22]);
    expect(terminal.getSessionMetadata("owner", session.id)).toMatchObject({ cols: 50, rows: 22 });
  });

  it("uses the tmux rendered pane for reconnect snapshots instead of stale raw ANSI output", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-terminal-snapshot-rendered-"));
    const pty = new FakePty();
    const supervisor = new FakeSupervisor();
    supervisor.captureValue = "initial-screen\n";
    manager = new TerminalManager({
      allowedRoots: [root],
      defaultCwd: root,
      maxSessions: 1,
      supervisor: supervisor as unknown as TmuxSupervisor,
      adapter: { spawn: () => pty },
    });
    const session = await manager.createSession("owner", { cols: 80, rows: 24 });
    pty.output("\x1b[2Jstale-raw-stream");
    supervisor.captureValue = "fresh-rendered-screen\n";

    const messages: Array<{ type: string; history?: string }> = [];
    manager.attachSession("owner", session.id, (message) => messages.push(message as { type: string; history?: string }));

    expect(messages.find((message) => message.type === "terminal.snapshot")?.history).toBe("fresh-rendered-screen\n");
  });
});
