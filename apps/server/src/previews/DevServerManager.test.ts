import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalPort, Project } from "@workbench/contracts";
import { PreviewDevServerManager, sanitizeDevServerPath, type PreviewRuntimePublication } from "./DevServerManager.js";
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
  const projects = new Map([[project.id, project]]);
  const addProject = async (id: string) => {
    const path = join(directory, id);
    await mkdir(path);
    await writeFile(join(path, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    const value: Project = { ...project, id, name: id, path };
    projects.set(id, value);
    return value;
  };
  const ports: LocalPort[] = [];
  const supervisor = {
    exists: false,
    dead: false,
    exitCode: null as number | null,
    output: "\u001b[31merror\u001b[0m\nready on http://localhost:5173\n",
    commands: [] as string[][],
    sessions: new Map<string, { options: Record<string, string>; dead: boolean; exitCode: number | null; windows: string[] }>(),
  };
  const runner = (args: string[]) => {
    supervisor.commands.push(args);
    if (args[0] === "list-sessions") {
      return { status: 0, stdout: [...supervisor.sessions.keys()].join("\n"), stderr: "" };
    }
    if (args[0] === "list-panes") {
      const session = supervisor.sessions.get(args[2] ?? "");
      if (!session) return { status: 1, stdout: "", stderr: "missing" };
      return { status: 0, stdout: session.windows.map((window) => `${window}\t${session.dead ? 1 : 0}\t${session.exitCode ?? ""}\t4242\t1700000000`).join("\n") + "\n", stderr: "" };
    }
    if (args[0] === "new-session") {
      const name = args[3]!;
      supervisor.sessions.set(name, { options: {}, dead: false, exitCode: null, windows: [args[5] ?? "frontend"] });
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
    if (args[0] === "new-window") {
      const session = supervisor.sessions.get(args[3] ?? "");
      if (session) session.windows.push(args[5] ?? `dienst-${session.windows.length + 1}`);
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
  const create = (publishRuntime?: () => Promise<PreviewRuntimePublication>) => new PreviewDevServerManager({
    database,
    tmuxExecutable: "/usr/bin/tmux",
    allowedProjectPorts: [1234, 1223, 8000, 8080, 8888, 4444, 1233, 6000, 6060, 4040],
    logBytes: 16_384,
    startTimeoutMilliseconds: 5_000,
    project: async (id) => { const value = projects.get(id); if (!value) throw new Error("missing"); return value; },
    localPorts: async () => ports,
    ...(publishRuntime ? { publishRuntime } : {}),
    runner,
  });
  return { create, database, supervisor, project, addProject };
}

describe("PreviewDevServerManager", () => {
  it("übernimmt eine laufende tmux-Sitzung nach einem Backend-Neustart", async () => {
    const { create, supervisor } = await harness();
    expect((await create().start("user@example.test", "projekt")).state).toBe("running");
    const paneQuery = supervisor.commands.find((args) => args[0] === "list-panes");
    expect(paneQuery?.[4]).toContain("\t");
    expect(paneQuery?.[4]).not.toContain("\\t");
    const command = supervisor.commands.find((args) => args[0] === "new-session");
    expect(command?.at(-1)).toContain("npm run dev -- --port 1234");
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
    expect(last).toContain("npm run dev -- --port 1234");
    expect(command).not.toContain("-e");
  });

  it("startet Frontend, API und Datenbank gemeinsam als getrennte überwachte Dienste", async () => {
    const { create, supervisor, project } = await harness();
    await writeFile(join(project.path, "preview.config.json"), JSON.stringify({
      version: 1,
      mainService: "frontend",
      services: [
        { id: "frontend", name: "Frontend", role: "frontend", command: "npm run dev:web -- --port {port}", port: 1234, portMode: "none" },
        { id: "api", name: "API", role: "api", command: "npm run dev:api", port: 1223, portMode: "environment" },
        { id: "database", name: "Datenbank", role: "database", command: "npm run db:dev", port: null, portMode: "none" },
      ],
    }));
    const status = await create().start("user@example.test", "projekt");
    const session = [...supervisor.sessions.values()][0];
    expect(session?.windows).toEqual(["frontend", "api", "database"]);
    expect(status.services.map((service) => [service.role, service.port, service.state])).toEqual([
      ["frontend", 1234, "running"],
      ["api", 1223, "running"],
      ["database", null, "running"],
    ]);
    const apiCommand = supervisor.commands.find((command) => command[0] === "new-window" && command.includes("api"))?.at(-1) ?? "";
    expect(apiCommand).toContain("PORT=1223");
    expect(apiCommand).toContain("HOST=127.0.0.1");
  });

  it("weist gleichzeitig gestarteten Projekten unterschiedliche Ports zu und behält sie nach einem Backend-Neustart", async () => {
    const { create, addProject } = await harness();
    await addProject("zweites-projekt");
    const manager = create();
    const [first, second] = await Promise.all([
      manager.start("user@example.test", "projekt"),
      manager.start("user@example.test", "zweites-projekt"),
    ]);
    expect([first.mainPort, second.mainPort]).toEqual([1234, 1223]);
    expect((await create().status("user@example.test", "zweites-projekt")).mainPort).toBe(1223);
  });

  it("lässt feste Ports kompatibel und meldet ihren Konflikt konkret", async () => {
    const { create, addProject } = await harness();
    const second = await addProject("festes-projekt");
    await writeFile(join(second.path, "preview.config.json"), JSON.stringify({
      version: 1,
      services: [{ id: "web", name: "Web", role: "frontend", command: "npm run dev", port: 1234, portMode: "environment" }],
    }));
    const manager = create();
    await manager.start("user@example.test", "projekt");
    await expect(manager.start("user@example.test", "festes-projekt")).rejects.toMatchObject({ code: "PREVIEW_RUNTIME_PORT_BUSY" });
  });

  it("liefert für nicht konfigurierte Projekte einen stabilen Status, lehnt ihren Start aber ab", async () => {
    const { create, addProject } = await harness();
    const unconfigured = await addProject("ohne-laufzeit");
    await writeFile(join(unconfigured.path, "package.json"), JSON.stringify({ scripts: {} }));
    const manager = create();

    await expect(manager.status("user@example.test", unconfigured.id)).resolves.toMatchObject({
      state: "stopped",
      services: [],
      message: expect.stringContaining("preview.config.json"),
    });
    await expect(manager.logs("user@example.test", unconfigured.id)).resolves.toMatchObject({ services: [], output: "" });
    await expect(manager.profile(unconfigured.id)).rejects.toMatchObject({ code: "PREVIEW_RUNTIME_PROFILE_INVALID" });
    await expect(manager.start("user@example.test", unconfigured.id)).rejects.toMatchObject({ code: "PREVIEW_RUNTIME_PROFILE_INVALID" });
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
    expect((await create().saveMainPort("user@example.test", "projekt", 1234)).mainPort).toBe(1234);
  });

  it("startet beim Launch die Laufzeit und liefert die direkte veröffentlichte URL", async () => {
    const { create } = await harness();
    const manager = create(async () => ({ url: "https://server.test.ts.net:8451/", sessionId: "11111111-1111-4111-8111-111111111111" }));
    const launched = await manager.launch("user@example.test", "projekt");
    expect(launched.publication.url).toBe("https://server.test.ts.net:8451/");
    expect(launched.status).toMatchObject({ state: "running", mainPort: 1234, publicUrl: "https://server.test.ts.net:8451/" });
  });

  it("startet die Projektprozesse auch dann, wenn noch kein Preview-Slot veröffentlicht werden kann", async () => {
    const { create } = await harness();
    let publications = 0;
    const manager = create(async () => {
      publications += 1;
      throw new Error("Keine Preview-Slots frei");
    });

    await expect(manager.start("user@example.test", "projekt")).resolves.toMatchObject({ state: "running", publicUrl: null });
    await manager.tick();
    expect(publications).toBe(0);
    await expect(manager.launch("user@example.test", "projekt")).rejects.toThrow(/Keine Preview-Slots frei/);
    expect(publications).toBe(1);
    expect((await manager.status("user@example.test", "projekt")).state).toBe("running");
  });

  it("erneuert nur eine ausdrücklich geöffnete Preview nach einem Backend-Neustart", async () => {
    const { create } = await harness();
    let publications = 0;
    const publish = async () => {
      publications += 1;
      return { url: "https://server.test.ts.net:8451/", sessionId: "11111111-1111-4111-8111-111111111111" };
    };
    await create(publish).launch("user@example.test", "projekt");
    expect(publications).toBe(1);

    await create(publish).tick();
    expect(publications).toBe(2);
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
