import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type {
  LocalPort,
  PreviewDevServerLogs,
  PreviewDevServerStatus,
  PreviewExternalOpenMode,
  PreviewHubPreference,
  Project,
} from "@workbench/contracts";
import { AppError } from "../utils/errors.js";
import type { PreviewDevServerDatabase } from "./devServerDatabase.js";

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

type CommandRunner = (args: string[], timeoutMilliseconds: number) => CommandResult;

export interface PreviewDevServerManagerOptions {
  database: PreviewDevServerDatabase;
  tmuxExecutable: string;
  npmExecutable: string;
  logBytes: number;
  startTimeoutMilliseconds: number;
  project: (projectId: string) => Promise<Project>;
  localPorts: () => Promise<LocalPort[]>;
  runner?: CommandRunner;
}

interface PaneState {
  dead: boolean;
  exitCode: number | null;
  pid: number | null;
  startedAt: string | null;
}

function cleanOutput(value: string): string {
  // Terminalausgaben enthalten bewusst ANSI- und OSC-Steuerzeichen, die vor der API-Antwort entfernt werden.
  // eslint-disable-next-line no-control-regex
  const operatingSystemCommand = new RegExp("\\u001b\\][^\\u0007]*(?:\\u0007|\\u001b\\\\)", "g");
  // eslint-disable-next-line no-control-regex
  const ansiSequence = new RegExp("\\u001b\\[[0-?]*[ -/]*[@-~]", "g");
  // eslint-disable-next-line no-control-regex
  const unsupportedControl = new RegExp("[^\\u0009\\u000a\\u000d\\u0020-\\u007e\\u00a0-\\uffff]", "g");
  return value
    .replace(operatingSystemCommand, "")
    .replace(ansiSequence, "")
    .replace(unsupportedControl, "");
}

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'`; }

/**
 * Arbeitsumgebung für Preview-Dev-Server: Die Workbench startet ihre tmux-Sitzung
 * mit ihrem eigenen node_modules im PATH. Ohne Filterung würde `npm run dev` eines
 * Projekts ohne lokale Abhängigkeiten fremde Werkzeuge aus dem Workbench-Repo
 * auflösen — und deren Einträge verschwinden beim nächsten pnpm-Install
 * (MODULE_NOT_FOUND mit stale Store-Pfad). Es bleiben nur das eigene
 * node_modules/.bin des Projekts sowie globale und System-Werkzeuge.
 */
export function sanitizeDevServerPath(projectPath: string, ambientPath: string): string {
  const ownBin = join(projectPath, "node_modules", ".bin");
  const kept = ambientPath.split(":").filter((entry) => {
    const normalized = entry.replace(/\/+$/, "");
    if (normalized === "" || normalized === ownBin) return false;
    if (normalized.endsWith("/node_modules/.bin")) return false;
    if (normalized.includes("/.pnpm/")) return false;
    if (normalized.endsWith("/node-gyp-bin")) return false;
    return true;
  });
  return [ownBin, ...kept].join(":");
}

export class PreviewDevServerManager {
  private readonly run: CommandRunner;

  constructor(private readonly options: PreviewDevServerManagerOptions) {
    this.run = options.runner ?? ((args, timeoutMilliseconds) => {
      const result = spawnSync(options.tmuxExecutable, args, { encoding: "utf8", timeout: timeoutMilliseconds });
      return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
    });
  }

  async status(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    await this.resolveProject(projectId);
    const pane = this.pane(this.sessionName(userId, projectId));
    const preference = this.options.database.projectPreference(userId, projectId);
    const now = new Date().toISOString();
    if (!pane) return {
      projectId,
      state: "stopped",
      command: "npm run dev",
      mainPort: preference?.mainPort ?? null,
      pid: null,
      startedAt: null,
      updatedAt: now,
      exitCode: null,
      message: null,
    };
    return {
      projectId,
      state: pane.dead ? (pane.exitCode === 0 ? "stopped" : "failed") : "running",
      command: "npm run dev",
      mainPort: preference?.mainPort ?? null,
      pid: pane.dead ? null : pane.pid,
      startedAt: pane.startedAt,
      updatedAt: now,
      exitCode: pane.exitCode,
      message: pane.dead && pane.exitCode !== 0 ? `npm run dev wurde mit Exit-Code ${pane.exitCode ?? "unbekannt"} beendet.` : null,
    };
  }

  async start(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    const project = await this.resolveProject(projectId);
    await this.requireDevScript(project);
    const name = this.sessionName(userId, projectId);
    const existing = this.pane(name);
    if (existing && !existing.dead) return this.status(userId, projectId);
    if (existing) this.execute(["kill-session", "-t", name]);

    // Der PATH wird explizit über `env` gesetzt, nicht über tmux-`-e`: Panes
    // erben die Umgebung des tmux-Servers, und dessen globale PATH kann durch
    // die pnpm-Skriptumgebung der Workbench verunreinigt sein (z. B. ein
    // veralteter .bin-Eintrag im eigenen node_modules). `env` ersetzt den PATH
    // für den npm-Prozess unabhängig davon, was die Pane geerbt hat.
    const previewPath = sanitizeDevServerPath(project.path, process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
    const command = [
      "/usr/bin/env",
      `PATH=${previewPath}`,
      this.options.npmExecutable,
      "run",
      "dev",
    ].map(shellQuote).join(" ");
    const created = this.run(["new-session", "-d", "-s", name, "-c", project.path, command], this.options.startTimeoutMilliseconds);
    if (created.status !== 0) {
      throw new AppError(500, "DEV_SERVER_START_FAILED", cleanOutput(created.stderr).trim() || "Der Dev-Server konnte nicht gestartet werden.");
    }
    this.execute(["set-option", "-t", name, "remain-on-exit", "on"]);
    this.execute(["set-option", "-t", name, "history-limit", "100000"]);
    this.execute(["set-option", "-t", name, "@workbench_kind", "preview-dev-server"]);
    this.execute(["set-option", "-t", name, "@workbench_project_id", projectId]);
    this.execute(["set-option", "-t", name, "@workbench_owner_hash", this.ownerHash(userId)]);
    return this.status(userId, projectId);
  }

  async stop(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    await this.resolveProject(projectId);
    const name = this.sessionName(userId, projectId);
    if (this.pane(name)) this.execute(["kill-session", "-t", name]);
    return this.status(userId, projectId);
  }

  async restart(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    await this.stop(userId, projectId);
    return this.start(userId, projectId);
  }

  async logs(userId: string, projectId: string): Promise<PreviewDevServerLogs> {
    await this.resolveProject(projectId);
    const name = this.sessionName(userId, projectId);
    if (!this.pane(name)) return { projectId, output: "", truncated: false, capturedAt: new Date().toISOString() };
    const result = this.run(["capture-pane", "-p", "-J", "-S", "-10000", "-t", `${name}:0.0`], 4_000);
    if (result.status !== 0) throw new AppError(503, "DEV_SERVER_LOGS_UNAVAILABLE", "Die Dev-Server-Logs sind momentan nicht verfügbar.", null, true);
    const cleaned = cleanOutput(result.stdout);
    const output = cleaned.length > this.options.logBytes ? cleaned.slice(-this.options.logBytes).replace(/^[^\n]*\n/, "") : cleaned;
    return { projectId, output, truncated: output.length < cleaned.length, capturedAt: new Date().toISOString() };
  }

  async saveMainPort(userId: string, projectId: string, mainPort: number | null): Promise<PreviewDevServerStatus> {
    const project = await this.resolveProject(projectId);
    if (mainPort !== null) {
      const ports = await this.options.localPorts();
      const belongsToProject = ports.some((port) => port.port === mainPort && port.projectId === projectId)
        || project.previews.some((preview) => preview.targetPort === mainPort);
      if (!belongsToProject) {
        throw new AppError(400, "DEV_SERVER_PORT_NOT_OWNED", "Der gewählte Hauptport gehört nicht zum ausgewählten Projekt.");
      }
    }
    this.options.database.saveMainPort(userId, projectId, mainPort);
    return this.status(userId, projectId);
  }

  preference(userId: string): PreviewHubPreference {
    return this.options.database.hubPreference(userId) ?? { externalOpenMode: "window", updatedAt: null };
  }

  savePreference(userId: string, externalOpenMode: PreviewExternalOpenMode): PreviewHubPreference {
    return this.options.database.saveHubPreference(userId, externalOpenMode);
  }

  private async resolveProject(projectId: string): Promise<Project> {
    let project: Project;
    try { project = await this.options.project(projectId); }
    catch { throw new AppError(404, "PROJECT_NOT_FOUND", "Das ausgewählte Projekt wurde nicht gefunden."); }
    if (project.availability !== "available") throw new AppError(409, "PROJECT_UNAVAILABLE", "Das ausgewählte Projekt ist momentan nicht verfügbar.");
    return project;
  }

  private async requireDevScript(project: Project): Promise<void> {
    let parsed: unknown;
    try { parsed = JSON.parse(await readFile(`${project.path}/package.json`, "utf8")) as unknown; }
    catch { throw new AppError(409, "DEV_SCRIPT_MISSING", "Das Projekt besitzt keine lesbare package.json."); }
    const scripts = typeof parsed === "object" && parsed !== null && "scripts" in parsed
      ? (parsed as { scripts?: unknown }).scripts
      : null;
    if (typeof scripts !== "object" || scripts === null || typeof (scripts as Record<string, unknown>).dev !== "string") {
      throw new AppError(409, "DEV_SCRIPT_MISSING", "Das Projekt definiert kein npm-Skript namens dev.");
    }
  }

  private pane(name: string): PaneState | null {
    const result = this.run(["list-panes", "-t", name, "-F", "#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}\t#{session_created}"], 4_000);
    if (result.status !== 0) return null;
    const [dead, exitCode, pid, created] = result.stdout.trim().split("\t");
    const createdAt = Number(created);
    return {
      dead: dead === "1",
      exitCode: dead === "1" && exitCode !== "" ? Number(exitCode) : null,
      pid: Number(pid) > 0 ? Number(pid) : null,
      startedAt: createdAt > 0 ? new Date(createdAt * 1_000).toISOString() : null,
    };
  }

  private execute(args: string[]): void {
    const result = this.run(args, 5_000);
    if (result.status !== 0) throw new AppError(500, "DEV_SERVER_SUPERVISOR_FAILED", cleanOutput(result.stderr).trim() || "Die Dev-Server-Steuerung ist fehlgeschlagen.");
  }

  private ownerHash(userId: string): string { return createHash("sha256").update(userId).digest("hex").slice(0, 20); }
  private sessionName(userId: string, projectId: string): string {
    const key = createHash("sha256").update(`${userId}\u0000${projectId}`).digest("hex").slice(0, 24);
    return `workbench-preview-${key}`;
  }
}
