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
  end(exitCode = 0, signal?: number) { this.exit?.({ exitCode, ...(signal === undefined ? {} : { signal }) }); }
}

class FakeSupervisor {
  readonly sessions = new Set<string>();
  captureValue = "";
  alternate = false;
  sessionName(runtimeId: string) { return `workbench-${runtimeId.replaceAll("-", "")}`; }
  list() { return []; }
  has(name: string) { return this.sessions.has(name); }
  ensure(input: { runtimeId: string }) { const name = this.sessionName(input.runtimeId); this.sessions.add(name); return name; }
  capture() { return this.captureValue; }
  isAlternate() { return this.alternate; }
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

  it("serializes the authoritative headless terminal state into reconnect snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-terminal-snapshot-rendered-"));
    const pty = new FakePty();
    const supervisor = new FakeSupervisor();
    supervisor.captureValue = "capture-would-win-before\n";
    manager = new TerminalManager({
      allowedRoots: [root],
      defaultCwd: root,
      maxSessions: 1,
      supervisor: supervisor as unknown as TmuxSupervisor,
      adapter: { spawn: () => pty },
    });
    const session = await manager.createSession("owner", { cols: 80, rows: 24 });
    pty.output("\x1b[2Jheadless-state-wins\r\n");
    supervisor.captureValue = "stale-capture\n";
    // Der Headless-Terminal parst `write` asynchron; der Snapshot muss den
    // geparsten Stand abbilden.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const messages: Array<{ type: string; serialized?: string }> = [];
    manager.attachSession("owner", session.id, (message) => messages.push(message as { type: string; serialized?: string }));

    const snapshot = messages.find((message) => message.type === "terminal.snapshot");
    expect(snapshot?.serialized).toContain("headless-state-wins");
    expect(snapshot?.serialized).not.toContain("stale-capture");
  });

  it("applies the attaching client's viewport before capturing the snapshot", async () => {
    const { manager: terminal, pty } = await createManager();
    const session = await terminal.createSession("owner", { cols: 120, rows: 40, clientId: "desktop" });
    const messages: Array<Record<string, unknown>> = [];

    terminal.attachSession("owner", session.id, (message) => messages.push(message as Record<string, unknown>), "desktop", { cols: 80, rows: 24 });

    expect(pty.resizes.at(-1)).toEqual([80, 24]);
    expect(messages.find((message) => message.type === "terminal.snapshot")).toMatchObject({ cols: 80, rows: 24, ownsGeometry: true });
  });

  it("keeps the primary's geometry in a secondary's snapshot instead of reflowing", async () => {
    const { manager: terminal, pty } = await createManager();
    const session = await terminal.createSession("owner", { cols: 120, rows: 40, clientId: "desktop" });
    terminal.attachSession("owner", session.id, () => {}, "desktop", { cols: 120, rows: 40 });
    const mobile: Array<Record<string, unknown>> = [];

    terminal.attachSession("owner", session.id, (message) => mobile.push(message as Record<string, unknown>), "mobile", { cols: 52, rows: 24 });

    expect(pty.resizes).not.toContainEqual([52, 24]);
    expect(mobile.find((message) => message.type === "terminal.snapshot")).toMatchObject({ cols: 120, rows: 40, ownsGeometry: false });
  });

  it("reports a secondary resize without transferring primary ownership", async () => {
    const { manager: terminal, pty } = await createManager();
    const session = await terminal.createSession("owner", { cols: 120, rows: 40, clientId: "desktop" });
    terminal.attachSession("owner", session.id, () => {}, "desktop", { cols: 120, rows: 40 });
    terminal.attachSession("owner", session.id, () => {}, "mobile", { cols: 52, rows: 24 });

    terminal.resizeSession("owner", session.id, 60, 30, "mobile");

    expect(pty.resizes).not.toContainEqual([60, 30]);
    expect(terminal.getSessionMetadata("owner", session.id)).toMatchObject({ cols: 120, rows: 40 });
  });

  it("flags fullscreen TUIs in the snapshot so the client restores the alternate screen", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-terminal-alternate-"));
    const pty = new FakePty();
    manager = new TerminalManager({
      allowedRoots: [root],
      defaultCwd: root,
      maxSessions: 1,
      adapter: { spawn: () => pty },
    });
    const session = await manager.createSession("owner", { cols: 80, rows: 24 });
    // Eine echte Fullscreen-TUI schaltet in den Alternate Screen (DECSET 1049).
    pty.output("\x1b[?1049hfullscreen-tui");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const messages: Array<Record<string, unknown>> = [];

    manager.attachSession("owner", session.id, (message) => messages.push(message as Record<string, unknown>));

    expect(messages.find((message) => message.type === "terminal.snapshot")).toMatchObject({ alternate: true });
    expect(messages.find((message) => message.type === "terminal.snapshot")).toMatchObject({ serialized: expect.stringContaining("fullscreen-tui") });
  });
});
