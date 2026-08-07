import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalPort, Project } from "@workbench/contracts";
import { PreviewDevServerManager, sanitizeDevServerPath } from "./DevServerManager.js";
import { PreviewDevServerDatabase } from "./devServerDatabase.js";

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function harness() {
  const directory = await mkdtemp(join(tmpdir(), "workbench-dev-server-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const projectPath = join(directory, "projekt");
  await mkdir(projectPath);
  await writeFile(join(projectPath, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
  const database = new PreviewDevServerDatabase(join(directory, "workbench.sqlite"));
  cleanup.push(() => database.close());
  const project: Project = {
    id: "projekt",
    name: "Projekt",
    description: "",
    path: projectPath,
    enabled: true,
    sortOrder: 1,
    availability: "available",
    activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [],
    links: { t3Code: null, codeServer: null },
  };
  const ports: LocalPort[] = [{ port: 5173, address: "127.0.0.1", process: "vite", pid: 42, projectId: project.id, projectName: project.name, protocol: "http", localUrl: "http://127.0.0.1:5173", proxyUrl: null }];
  const supervisor = {
    exists: false,
    dead: false,
    exitCode: null as number | null,
    output: "\u001b[31merror\u001b[0m\nready on http://localhost:5173\n",
    commands: [] as string[][],
    sessions: new Map<string, { options: Record<string, string>; dead: boolean; exitCode: number | null }>(),
  };
  const runner = (args: string[]) => {
    supervisor.commands.push(args);
    if (args[0] === "list-sessions") {
      return { status: 0, stdout: [...supervisor.sessions.keys()].join("\n"), stderr: "" };
    }
    if (args[0] === "list-panes") {
      const session = supervisor.sessions.get(args[2] ?? "");
      if (!session) return { status: 1, stdout: "", stderr: "missing" };
      return { status: 0, stdout: `${session.dead ? 1 : 0}\t${session.exitCode ?? ""}\t4242\t1700000000\n`, stderr: "" };
    }
    if (args[0] === "new-session") {
      const name = args[3]!;
      supervisor.sessions.set(name, { options: {}, dead: false, exitCode: null });
      supervisor.exists = true;
      supervisor.dead = false;
      supervisor.exitCode = null;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "kill-session") {
      supervisor.sessions.delete(args[2] ?? "");
      supervisor.exists = false;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "capture-pane") return { status: 0, stdout: supervisor.output, stderr: "" };
    if (args[0] === "set-option") {
      const session = supervisor.sessions.get(args[2] ?? "");
      if (session && args[3]) session.options[args[3]] = args[4] ?? "";
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "show-options") {
      const session = supervisor.sessions.get(args[2] ?? "");
      const value = session?.options[args[4] ?? ""] ?? "";
      return { status: 0, stdout: value ? `${value}\n` : "", stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  const create = () => new PreviewDevServerManager({
    database,
    tmuxExecutable: "/usr/bin/tmux",
    npmExecutable: "npm",
    logBytes: 16_384,
    startTimeoutMilliseconds: 5_000,
    project: async (id) => { if (id !== project.id) throw new Error("missing"); return project; },
    localPorts: async () => ports,
    runner,
  });
  return { create, database, supervisor, project };
}

describe("PreviewDevServerManager", () => {
  it("übernimmt eine laufende tmux-Sitzung nach einem Backend-Neustart", async () => {
    const { create, supervisor } = await harness();
    expect((await create().start("user@example.test", "projekt")).state).toBe("running");
    const command = supervisor.commands.find((args) => args[0] === "new-session");
    expect(command?.at(-1)).toContain("'npm' 'run' 'dev'");
    expect((await create().status("user@example.test", "projekt")).state).toBe("running");
    expect((await create().stop("user@example.test", "projekt")).state).toBe("stopped");
  });

  it("startet den Dev-Server mit explizitem PATH über env", async () => {
    const { create, supervisor, project } = await harness();
    await create().start("user@example.test", "projekt");
    const command = supervisor.commands.find((args) => args[0] === "new-session");
    const last = command?.at(-1) ?? "";
    expect(last.startsWith("'/usr/bin/env'")).toBe(true);
    expect(last).toContain(`PATH=${join(project.path, "node_modules", ".bin")}:`);
    expect(last).toContain("'npm' 'run' 'dev'");
    expect(command).not.toContain("-e");
  });

  it("entfernt fremde node_modules-Bins aus dem PATH, behält aber globale und System-Werkzeuge", () => {
    const ambient = [
      "/home/bbecker/projects/Remote_Workplace/apps/server/node_modules/.bin",
      "/home/bbecker/.npm-global/lib/node_modules/pnpm/dist/node-gyp-bin",
      "/home/bbecker/projects/Remote_Workplace/node_modules/.bin",
      "/home/bbecker/.npm-global/bin",
      "/home/bbecker/projects/anderes-projekt/node_modules/.bin",
      "/usr/local/sbin",
      "/usr/local/bin",
      "/usr/sbin",
      "/usr/bin",
      "/sbin",
      "/bin",
    ].join(":");
    const result = sanitizeDevServerPath("/home/bbecker/projects/projekt", ambient);
    expect(result).toContain("/home/bbecker/projects/projekt/node_modules/.bin");
    expect(result).toContain("/home/bbecker/.npm-global/bin");
    expect(result).toContain("/usr/bin");
    expect(result).not.toContain("Remote_Workplace");
    expect(result).not.toContain("node-gyp-bin");
    expect(result).not.toContain("anderes-projekt");
    expect(result).not.toMatch(/(^|:)node_modules\/\.bin(:|$)/);
  });

  it("speichert nur einen Port, der zum Projekt gehört", async () => {
    const { create } = await harness();
    await expect(create().saveMainPort("user@example.test", "projekt", 9999)).rejects.toMatchObject({ code: "DEV_SERVER_PORT_NOT_OWNED" });
    expect((await create().saveMainPort("user@example.test", "projekt", 5173)).mainPort).toBe(5173);
  });

  it("entfernt Terminal-Steuersequenzen aus Logs und speichert den Öffnungsmodus", async () => {
    const { create } = await harness();
    await create().start("user@example.test", "projekt");
    const logs = await create().logs("user@example.test", "projekt");
    expect(logs.output).toContain("error");
    expect(logs.output).not.toContain("\u001b");
    expect(create().savePreference("user@example.test", "tab").externalOpenMode).toBe("tab");
    expect(create().preference("user@example.test").externalOpenMode).toBe("tab");
  });

  it("startet einen abgestürzten Dev-Server automatisch neu", async () => {
    const { create, supervisor } = await harness();
    const manager = create();
    await manager.start("user@example.test", "projekt");
    const name = [...supervisor.sessions.keys()][0]!;
    supervisor.sessions.get(name)!.dead = true;
    supervisor.sessions.get(name)!.exitCode = 1;
    await manager.tick();
    expect(supervisor.sessions.get(name)?.dead).toBe(false);
    const starts = supervisor.commands.filter((command) => command[0] === "new-session");
    expect(starts).toHaveLength(2);
  });

  it("holt auch nach einem Backend-Neustart tote Sessions anhand der tmux-Optionen hoch", async () => {
    const { create, supervisor } = await harness();
    const manager = create();
    await manager.start("user@example.test", "projekt");
    const name = [...supervisor.sessions.keys()][0]!;
    supervisor.sessions.get(name)!.dead = true;
    supervisor.sessions.get(name)!.exitCode = 1;
    const fresh = create();
    await fresh.tick();
    expect(supervisor.sessions.get(name)?.dead).toBe(false);
  });

  it("startet eine Session nach explizitem Stop nicht neu", async () => {
    const { create, supervisor } = await harness();
    const manager = create();
    await manager.start("user@example.test", "projekt");
    await manager.stop("user@example.test", "projekt");
    const starts = supervisor.commands.filter((command) => command[0] === "new-session").length;
    await manager.tick();
    expect(supervisor.commands.filter((command) => command[0] === "new-session")).toHaveLength(starts);
  });

  it("bremst wiederholte Abstürze mit einem Backoff-Fenster", async () => {
    const { create, supervisor } = await harness();
    const manager = create();
    await manager.start("user@example.test", "projekt");
    const name = [...supervisor.sessions.keys()][0]!;
    for (let index = 0; index < 4; index += 1) {
      await manager.tick();
      supervisor.sessions.get(name)!.dead = true;
      supervisor.sessions.get(name)!.exitCode = 1;
    }
    const starts = supervisor.commands.filter((command) => command[0] === "new-session");
    // Ein ursprünglicher Start plus die drei erlaubten Auto-Restarts.
    expect(starts).toHaveLength(4);
    expect(supervisor.sessions.get(name)?.dead).toBe(true);
  });

  it("ignoriert normal beendete Sessions beim Auto-Restart", async () => {
    const { create, supervisor } = await harness();
    const manager = create();
    await manager.start("user@example.test", "projekt");
    const name = [...supervisor.sessions.keys()][0]!;
    supervisor.sessions.get(name)!.dead = true;
    supervisor.sessions.get(name)!.exitCode = 0;
    await manager.tick();
    const starts = supervisor.commands.filter((command) => command[0] === "new-session");
    expect(starts).toHaveLength(1);
  });
});
