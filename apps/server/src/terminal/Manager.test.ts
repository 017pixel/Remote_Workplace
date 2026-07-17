import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalFailure, TerminalManager } from "./Manager.js";
import type { PtyAdapter, PtyProcess } from "./NodePtyAdapter.js";

class FakePty implements PtyProcess {
  pid = 4242; writes: string[] = []; resizes: Array<[number, number]> = []; killed: string[] = []; private data: ((data: string) => void) | undefined; private exit: ((event: { exitCode: number; signal?: number }) => void) | undefined;
  write(data: string) { this.writes.push(data); } resize(cols: number, rows: number) { this.resizes.push([cols, rows]); } kill(signal?: string) { this.killed.push(signal ?? "SIGTERM"); }
  onData(callback: (data: string) => void) { this.data = callback; return { dispose: () => { this.data = undefined; } }; } onExit(callback: (event: { exitCode: number; signal?: number }) => void) { this.exit = callback; return { dispose: () => { this.exit = undefined; } }; }
  output(data: string) { this.data?.(data); } end(exitCode = 0, signal?: number) { this.exit?.({ exitCode, ...(signal === undefined ? {} : { signal }) }); }
}

let manager: TerminalManager | undefined;
afterEach(() => manager?.shutdown());

async function setup() { const root = await mkdtemp(join(tmpdir(), "workbench-terminal-")); await mkdir(join(root, "nested")); const pty = new FakePty(); manager = new TerminalManager({ allowedRoots: [root], defaultCwd: root, maxSessions: 1, adapter: { spawn: () => pty }, reconnectGraceMs: 1 }); return { root, pty, manager }; }

describe("TerminalManager", () => {
  it("creates an owned session and forwards input, resize, output and exit in sequence", async () => { const { pty, manager: terminal } = await setup(); const session = await terminal.createSession("user", { cols: 80, rows: 24 }); const messages: unknown[] = []; terminal.attachSession("user", session.id, (message) => messages.push(message)); terminal.writeToSession("user", session.id, "echo hello\r"); terminal.resizeSession("user", session.id, 120, 40); pty.output("hello\r\n"); pty.end(0);
    expect(pty.writes).toEqual(["echo hello\r"]); expect(pty.resizes).toEqual([[120, 40]]); expect(messages).toContainEqual(expect.objectContaining({ type: "terminal.output", sequence: 1 })); expect(messages).toContainEqual(expect.objectContaining({ type: "terminal.exited", sequence: 2, exitCode: 0 })); });
  it("rejects foreign sessions, invalid dimensions and invalid working directories", async () => { const { root, manager: terminal } = await setup(); const session = await terminal.createSession("owner", { cols: 80, rows: 24 }); expect(() => terminal.attachSession("other", session.id, vi.fn())).toThrow(TerminalFailure); expect(() => terminal.resizeSession("owner", session.id, 1, 24)).toThrow(TerminalFailure); await expect(terminal.createSession("other", { cols: 80, rows: 24, cwd: "/tmp" })).rejects.toMatchObject({ code: "INVALID_CWD" }); await expect(terminal.createSession("other", { cols: 80, rows: 24, cwd: join(root, "missing") })).rejects.toMatchObject({ code: "CWD_NOT_FOUND" }); });
  it("limits sessions, history and cleans up disconnected sessions", async () => { const { pty, manager: terminal } = await setup(); const session = await terminal.createSession("owner", { cols: 80, rows: 24 }); await expect(terminal.createSession("owner", { cols: 80, rows: 24 })).rejects.toMatchObject({ code: "TOO_MANY_SESSIONS" }); const detach = terminal.attachSession("owner", session.id, vi.fn()); pty.output("x".repeat(3_200_000)); expect(terminal.getSessionMetadata("owner", session.id).sequence).toBe(1); detach(); await new Promise((resolve) => setTimeout(resolve, 10)); expect(pty.killed).toContain("SIGTERM"); expect(() => terminal.getSessionMetadata("owner", session.id)).toThrow(TerminalFailure); });

  it("launches only the configured shell, Codex and OpenCode commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-cli-"));
    const spawns: Array<{ file: string; args: string[] }> = [];
    manager = new TerminalManager({
      allowedRoots: [root],
      defaultCwd: root,
      maxSessions: 3,
      cliPaths: { codex: "/opt/workbench/codex", opencode: "/opt/workbench/opencode" },
      adapter: {
        spawn: (file, args) => {
          spawns.push({ file, args });
          return new FakePty();
        },
      },
    });
    await manager.createSession("owner", { kind: "shell", cols: 80, rows: 24 });
    await manager.createSession("owner", { kind: "codex", cols: 80, rows: 24 });
    await manager.createSession("owner", { kind: "opencode", cols: 80, rows: 24 });
    expect(spawns).toEqual([
      { file: "/bin/bash", args: ["--login"] },
      { file: "/opt/workbench/codex", args: [] },
      { file: "/opt/workbench/opencode", args: [] },
    ]);
  });

  it("enforces independent limits for shell, Codex and OpenCode", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-cli-limits-"));
    manager = new TerminalManager({
      allowedRoots: [root],
      defaultCwd: root,
      maxSessions: 3,
      maxSessionsByKind: { shell: 1, codex: 1, opencode: 1 },
      adapter: { spawn: () => new FakePty() },
    });
    await manager.createSession("owner", { kind: "codex", cols: 80, rows: 24 });
    await expect(manager.createSession("owner", { kind: "codex", cols: 80, rows: 24 })).rejects.toMatchObject({ code: "TOO_MANY_SESSIONS" });
    await expect(manager.createSession("owner", { kind: "opencode", cols: 80, rows: 24 })).resolves.toMatchObject({ kind: "opencode" });
    await expect(manager.createSession("owner", { kind: "shell", cols: 80, rows: 24 })).resolves.toMatchObject({ kind: "shell" });
  });

  it("starts fixed login commands in the selected isolated profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-login-"));
    const profile = join(root,"profile"); await mkdir(profile);
    const spawns: Array<{file:string;args:string[];env:Record<string,string|undefined>}> = [];
    manager = new TerminalManager({ allowedRoots:[root],defaultCwd:root,maxSessions:2,cliPaths:{codex:"/codex",opencode:"/opencode"},resolveAccountProfile:()=>profile,adapter:{spawn:(file,args,options:Parameters<PtyAdapter["spawn"]>[2])=>{spawns.push({file,args,env:options.env ?? {}});return new FakePty();}} });
    await manager.createSession("owner",{kind:"codex",mode:"login",accountId:"00000000-0000-4000-8000-000000000001",cols:80,rows:24});
    await manager.createSession("owner",{kind:"opencode",mode:"login",accountId:"00000000-0000-4000-8000-000000000002",cols:80,rows:24});
    expect(spawns[0]).toMatchObject({file:"/codex",args:["login","--device-auth"],env:{CODEX_HOME:profile}});
    expect(spawns[1]).toMatchObject({file:"/opencode",args:["auth","login"],env:{XDG_DATA_HOME:profile}});
  });
});
