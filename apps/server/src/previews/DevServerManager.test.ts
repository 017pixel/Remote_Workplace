import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalPort, Project } from "@workbench/contracts";
import { PreviewDevServerManager } from "./DevServerManager.js";
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
  const supervisor = { exists: false, dead: false, exitCode: null as number | null, output: "\u001b[31merror\u001b[0m\nready on http://localhost:5173\n", commands: [] as string[][] };
  const runner = (args: string[]) => {
    supervisor.commands.push(args);
    if (args[0] === "list-panes") return supervisor.exists
      ? { status: 0, stdout: `${supervisor.dead ? 1 : 0}\t${supervisor.exitCode ?? ""}\t4242\t1700000000\n`, stderr: "" }
      : { status: 1, stdout: "", stderr: "missing" };
    if (args[0] === "new-session") { supervisor.exists = true; supervisor.dead = false; supervisor.exitCode = null; return { status: 0, stdout: "", stderr: "" }; }
    if (args[0] === "kill-session") { supervisor.exists = false; return { status: 0, stdout: "", stderr: "" }; }
    if (args[0] === "capture-pane") return { status: 0, stdout: supervisor.output, stderr: "" };
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
    expect(command?.at(-1)).toBe("'npm' 'run' 'dev'");
    expect((await create().status("user@example.test", "projekt")).state).toBe("running");
    expect((await create().stop("user@example.test", "projekt")).state).toBe("stopped");
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
});
