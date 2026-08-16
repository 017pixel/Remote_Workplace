import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type {
  LocalPort,
  PreviewDevServerLogs,
  PreviewDevServerStatus,
  PreviewExternalOpenMode,
  PreviewHubPreference,
  PreviewRuntimeLogLevel,
  PreviewRuntimeProfile,
  PreviewRuntimeService,
  PreviewRuntimeServiceLogs,
  PreviewRuntimeServiceStatus,
  Project,
} from "@workbench/contracts";
import { AppError } from "../utils/errors.js";
import type { PreviewDevServerDatabase } from "./devServerDatabase.js";
import { detectRuntimeProfile, type RuntimeProfileResult } from "./runtimeProfiles.js";

interface CommandResult { status: number | null; stdout: string; stderr: string }
type CommandRunner = (args: string[], timeoutMilliseconds: number) => CommandResult;

const PREVIEW_TMUX_SOCKET = "remote-workplace-previews";
const RUNTIME_PORTS_OPTION = "@workbench_runtime_ports";

export interface PreviewRuntimePublication {
  url: string;
  sessionId: string;
}

export interface PreviewDevServerManagerOptions {
  database: PreviewDevServerDatabase;
  tmuxExecutable: string;
  allowedProjectPorts: readonly number[];
  logBytes: number;
  startTimeoutMilliseconds: number;
  project: (projectId: string) => Promise<Project>;
  localPorts: () => Promise<LocalPort[]>;
  publishRuntime?: (userId: string, profile: PreviewRuntimeProfile) => Promise<PreviewRuntimePublication>;
  runner?: CommandRunner;
  watchdogIntervalMilliseconds?: number;
  watchdogMaxAttemptsPerWindow?: number;
  watchdogWindowMilliseconds?: number;
  logger?: (message: string) => void;
}

interface PaneState {
  serviceId: string;
  dead: boolean;
  exitCode: number | null;
  pid: number | null;
  startedAt: string | null;
}

function cleanOutput(value: string): string {
  // eslint-disable-next-line no-control-regex
  const operatingSystemCommand = new RegExp("\\u001b\\][^\\u0007]*(?:\\u0007|\\u001b\\\\)", "g");
  // eslint-disable-next-line no-control-regex
  const ansiSequence = new RegExp("\\u001b\\[[0-?]*[ -/]*[@-~]", "g");
  // eslint-disable-next-line no-control-regex
  const unsupportedControl = new RegExp("[^\\u0009\\u000a\\u000d\\u0020-\\u007e\\u00a0-\\uffff]", "g");
  return value.replace(operatingSystemCommand, "").replace(ansiSequence, "").replace(unsupportedControl, "");
}

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'`; }

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

function logLevel(text: string): PreviewRuntimeLogLevel {
  if (/\b(error|failed|exception|fatal|err!|eaddrinuse|unhandled)\b/i.test(text)) return "error";
  if (/\b(warn|warning|deprecated)\b/i.test(text)) return "warning";
  if (/\b(ready|listening|started|compiled|built|success|local:)\b/i.test(text)) return "success";
  return "info";
}

function serviceState(service: PreviewRuntimeService, pane: PaneState | undefined): PreviewRuntimeServiceStatus {
  if (!pane) return { ...service, state: "stopped", pid: null, startedAt: null, exitCode: null, message: null };
  const state = pane.dead ? (pane.exitCode === 0 ? "stopped" : "failed") : "running";
  return {
    ...service, state, pid: pane.dead ? null : pane.pid, startedAt: pane.startedAt, exitCode: pane.exitCode,
    message: state === "failed" ? `${service.name} wurde mit Exit-Code ${pane.exitCode ?? "unbekannt"} beendet.` : null,
  };
}

export class PreviewDevServerManager {
  private readonly run: CommandRunner;
  private readonly watchdogIntervalMilliseconds: number;
  private readonly watchdogMaxAttemptsPerWindow: number;
  private readonly watchdogWindowMilliseconds: number;
  private readonly restartHistory = new Map<string, number[]>();
  private readonly publications = new Map<string, PreviewRuntimePublication>();
  private readonly publicationHeartbeat = new Map<string, number>();
  private startQueue: Promise<void> = Promise.resolve();
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private tickRunning = false;

  constructor(private readonly options: PreviewDevServerManagerOptions) {
    this.run = options.runner ?? ((args, timeoutMilliseconds) => {
      const result = spawnSync(options.tmuxExecutable, ["-L", PREVIEW_TMUX_SOCKET, ...args], { encoding: "utf8", timeout: timeoutMilliseconds });
      return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
    });
    this.watchdogIntervalMilliseconds = options.watchdogIntervalMilliseconds ?? 10_000;
    this.watchdogMaxAttemptsPerWindow = options.watchdogMaxAttemptsPerWindow ?? 3;
    this.watchdogWindowMilliseconds = options.watchdogWindowMilliseconds ?? 5 * 60_000;
  }

  async profile(projectId: string): Promise<RuntimeProfileResult> {
    const project = await this.resolveProject(projectId);
    try { return await detectRuntimeProfile(project, this.options.allowedProjectPorts); }
    catch (error) {
      throw new AppError(409, "PREVIEW_RUNTIME_PROFILE_INVALID", error instanceof Error ? error.message : "Die Projektlaufzeit konnte nicht erkannt werden.");
    }
  }

  async status(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    let detectedProfile: RuntimeProfileResult;
    try {
      detectedProfile = await this.profile(projectId);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "PREVIEW_RUNTIME_PROFILE_INVALID") throw error;
      return {
        projectId, state: "stopped", command: "Keine startbare Projektlaufzeit", mainPort: null,
        mainServiceId: null, profileSource: "detected", services: [],
        allowedPorts: [...this.options.allowedProjectPorts], warnings: [], publicUrl: null,
        pid: null, startedAt: null, updatedAt: new Date().toISOString(), exitCode: null,
        message: error.message,
      };
    }
    const profile = this.profileForSession(userId, projectId, detectedProfile);
    const name = this.sessionName(userId, projectId);
    const panes = new Map(this.panes(name).map((pane) => [pane.serviceId, pane]));
    const services = profile.services.map((service) => serviceState(service, panes.get(service.id)));
    const running = services.filter((service) => service.state === "running");
    const failed = services.filter((service) => service.state === "failed");
    const aggregate = failed.length > 0 ? "failed" : running.length > 0 ? "running" : "stopped";
    const mainPort = this.selectedMainPort(userId, projectId, profile);
    const mainServiceId = profile.services.find((service) => service.port === mainPort)?.id ?? profile.mainServiceId;
    const publication = this.publications.get(this.runtimeKey(userId, projectId));
    return {
      projectId, state: aggregate,
      command: services.length === 1 ? services[0]!.command : `${services.length} Dienste gemeinsam`,
      mainPort, mainServiceId, profileSource: profile.source, services,
      allowedPorts: [...this.options.allowedProjectPorts], warnings: profile.warnings,
      publicUrl: publication?.url ?? null,
      pid: running[0]?.pid ?? null,
      startedAt: running.map((service) => service.startedAt).filter((value): value is string => value !== null).sort()[0] ?? null,
      updatedAt: new Date().toISOString(),
      exitCode: failed[0]?.exitCode ?? null,
      message: failed.length > 0 ? `${failed.length} ${failed.length === 1 ? "Dienst ist" : "Dienste sind"} fehlgeschlagen.` : null,
    };
  }

  async statuses(userId: string): Promise<PreviewDevServerStatus[]> {
    const sessions = this.run(["list-sessions", "-F", "#{session_name}"], 4_000);
    if (sessions.status !== 0) return [];
    const projectIds = sessions.stdout.split("\n").map((value) => value.trim())
      .filter((name) => name.startsWith("workbench-preview-") && this.sessionOption(name, "@workbench_user_id") === userId)
      .flatMap((name) => {
        const projectId = this.sessionOption(name, "@workbench_project_id");
        return projectId ? [projectId] : [];
      });
    const statuses = await Promise.all([...new Set(projectIds)].map((projectId) => this.status(userId, projectId).catch(() => null)));
    return statuses.filter((status): status is PreviewDevServerStatus => status !== null);
  }

  async start(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    return this.withStartLock(() => this.startUnlocked(userId, projectId));
  }

  private async startUnlocked(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    const project = await this.resolveProject(projectId);
    const detectedProfile = await this.profile(projectId);
    const name = this.sessionName(userId, projectId);
    if (this.panes(name).some((pane) => !pane.dead)) {
      return this.status(userId, projectId);
    }
    if (this.panes(name).length > 0) this.execute(["kill-session", "-t", name]);
    const profile = await this.assignRuntimePorts(name, detectedProfile);
    if (profile.setupCommand) this.runSetup(project, name, profile.setupCommand);

    for (const [index, service] of profile.services.entries()) {
      const command = this.serviceCommand(project, service);
      const args = index === 0
        ? ["new-session", "-d", "-s", name, "-n", service.id, "-c", service.workingDirectory, command]
        : ["new-window", "-d", "-t", name, "-n", service.id, "-c", service.workingDirectory, command];
      const created = index === 0
        ? this.createSessionOutsideWorkbench(args, this.options.startTimeoutMilliseconds)
        : this.run(args, this.options.startTimeoutMilliseconds);
      if (created.status !== 0) {
        if (this.panes(name).length > 0) this.run(["kill-session", "-t", name], 5_000);
        throw new AppError(500, "DEV_SERVER_START_FAILED", cleanOutput(created.stderr).trim() || `${service.name} konnte nicht gestartet werden.`);
      }
    }
    this.execute(["set-option", "-t", name, "remain-on-exit", "on"]);
    this.execute(["set-option", "-t", name, "history-limit", "100000"]);
    this.execute(["set-option", "-t", name, "@workbench_kind", "preview-dev-server"]);
    this.execute(["set-option", "-t", name, "@workbench_project_id", projectId]);
    this.execute(["set-option", "-t", name, "@workbench_owner_hash", this.ownerHash(userId)]);
    this.execute(["set-option", "-t", name, "@workbench_user_id", userId]);
    this.execute(["set-option", "-t", name, "@workbench_preview_publication_requested", "0"]);
    this.execute(["set-option", "-t", name, RUNTIME_PORTS_OPTION, JSON.stringify(Object.fromEntries(profile.services.map((service) => [service.id, service.port])))]);
    return this.status(userId, projectId);
  }

  async launch(userId: string, projectId: string): Promise<{ status: PreviewDevServerStatus; publication: PreviewRuntimePublication }> {
    await this.start(userId, projectId);
    this.execute(["set-option", "-t", this.sessionName(userId, projectId), "@workbench_preview_publication_requested", "1"]);
    const profile = this.profileForSession(userId, projectId, await this.profile(projectId));
    const publication = await this.publish(userId, profile, true);
    if (!publication) throw new AppError(409, "PREVIEW_RUNTIME_NO_PUBLIC_URL", "Die Projektlaufzeit besitzt keinen veröffentlichbaren Hauptdienst.");
    return { status: await this.status(userId, projectId), publication };
  }

  async stop(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    await this.resolveProject(projectId);
    const name = this.sessionName(userId, projectId);
    if (this.panes(name).length > 0) this.execute(["kill-session", "-t", name]);
    const key = this.runtimeKey(userId, projectId);
    this.publications.delete(key);
    this.publicationHeartbeat.delete(key);
    return this.status(userId, projectId);
  }

  async restart(userId: string, projectId: string): Promise<PreviewDevServerStatus> {
    await this.stop(userId, projectId);
    return this.start(userId, projectId);
  }

  async logs(userId: string, projectId: string): Promise<PreviewDevServerLogs> {
    const status = await this.status(userId, projectId);
    const panes = new Map(this.panes(this.sessionName(userId, projectId)).map((pane) => [pane.serviceId, pane]));
    const serviceLogs: PreviewRuntimeServiceLogs[] = status.services.map((service) => {
      const pane = panes.get(service.id);
      const captured = pane ? this.run(["capture-pane", "-p", "-J", "-S", "-10000", "-t", `${this.sessionName(userId, projectId)}:${service.id}.0`], 4_000) : null;
      const cleaned = captured?.status === 0 ? cleanOutput(captured.stdout) : "";
      const output = cleaned.length > this.options.logBytes ? cleaned.slice(-this.options.logBytes).replace(/^[^\n]*\n/, "") : cleaned;
      const lines = output.split("\n").map((text) => text.trimEnd()).filter(Boolean).map((text) => ({ serviceId: service.id, level: logLevel(text), text }));
      return {
        serviceId: service.id, name: service.name, role: service.role, port: service.port,
        state: serviceState(service, pane).state, output, lines,
        errorCount: lines.filter((line) => line.level === "error").length,
        warningCount: lines.filter((line) => line.level === "warning").length,
        truncated: output.length < cleaned.length,
      };
    });
    const output = serviceLogs.filter((service) => service.output).map((service) => `# ${service.name}\n${service.output.trimEnd()}`).join("\n\n");
    return {
      projectId, output: output.slice(-262_144), truncated: serviceLogs.some((service) => service.truncated) || output.length > 262_144,
      services: serviceLogs,
      errorCount: serviceLogs.reduce((sum, service) => sum + service.errorCount, 0),
      warningCount: serviceLogs.reduce((sum, service) => sum + service.warningCount, 0),
      capturedAt: new Date().toISOString(),
    };
  }

  async saveMainPort(userId: string, projectId: string, mainPort: number | null): Promise<PreviewDevServerStatus> {
    const profile = this.profileForSession(userId, projectId, await this.profile(projectId));
    if (mainPort !== null && (!this.options.allowedProjectPorts.includes(mainPort) || !profile.services.some((service) => service.port === mainPort))) {
      throw new AppError(400, "DEV_SERVER_PORT_NOT_OWNED", "Der Hauptport muss zu einem erkannten Dienst gehören und aus der erlaubten Projektport-Palette stammen.");
    }
    const mainServiceId = profile.services.find((service) => service.port === mainPort)?.id ?? null;
    this.options.database.saveMainPort(userId, projectId, mainPort, mainServiceId);
    const name = this.sessionName(userId, projectId);
    if (mainPort !== null && this.sessionOption(name, "@workbench_preview_publication_requested") === "1" && this.panes(name).some((pane) => !pane.dead)) {
      await this.publish(userId, { ...profile, mainServiceId: profile.services.find((service) => service.port === mainPort)?.id ?? profile.mainServiceId }, true);
    }
    return this.status(userId, projectId);
  }

  preference(userId: string): PreviewHubPreference {
    return this.options.database.hubPreference(userId) ?? { externalOpenMode: "tab", updatedAt: null };
  }

  savePreference(userId: string, externalOpenMode: PreviewExternalOpenMode): PreviewHubPreference {
    return this.options.database.saveHubPreference(userId, externalOpenMode);
  }

  startWatchdog() {
    if (this.watchdogTimer !== null) return;
    this.watchdogTimer = setInterval(() => { void this.tick(); }, this.watchdogIntervalMilliseconds);
  }

  stopWatchdog() {
    if (this.watchdogTimer === null) return;
    clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  async tick() {
    if (this.tickRunning) return;
    this.tickRunning = true;
    try {
      const sessions = this.run(["list-sessions", "-F", "#{session_name}"], 4_000);
      if (sessions.status !== 0) return;
      for (const name of sessions.stdout.split("\n").map((value) => value.trim()).filter((value) => value.startsWith("workbench-preview-"))) {
        const projectId = this.sessionOption(name, "@workbench_project_id");
        const userId = this.sessionOption(name, "@workbench_user_id");
        if (!projectId || !userId) continue;
        try {
          await this.tickSession(name, userId, projectId);
        } catch (error) {
          this.options.logger?.(`Watchdog-Tick für ${projectId} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      this.options.logger?.(`Watchdog-Tick fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    } finally { this.tickRunning = false; }
  }

  private async tickSession(name: string, userId: string, projectId: string) {
    const panes = this.panes(name);
    if (panes.some((pane) => pane.dead && pane.exitCode !== 0)) {
      await this.autoRestart(name, userId, projectId);
      return;
    }
    if (panes.some((pane) => !pane.dead) && this.sessionOption(name, "@workbench_preview_publication_requested") === "1") {
      const key = this.runtimeKey(userId, projectId);
      if (Date.now() - (this.publicationHeartbeat.get(key) ?? 0) >= 10 * 60_000) {
        // `profile` darf nicht im Argument-Ausdruck liegen: Ein Fehler dort
        // läge vor dem `.catch` und würde den Tick als ungefangenes Promise
        // scheitern lassen.
        try {
          const profile = await this.profile(projectId);
          await this.publish(userId, this.profileForSession(userId, projectId, profile), true);
        } catch (error) {
          this.options.logger?.(`Die Preview-Veröffentlichung von ${projectId} konnte nicht erneuert werden: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  private selectedMainPort(userId: string, projectId: string, profile: RuntimeProfileResult): number | null {
    const stored = this.options.database.projectPreference(userId, projectId);
    if (stored?.mainServiceId) {
      const servicePort = profile.services.find((service) => service.id === stored.mainServiceId)?.port;
      if (servicePort !== undefined) return servicePort;
    }
    if (stored?.mainPort !== null && stored?.mainPort !== undefined && this.options.allowedProjectPorts.includes(stored.mainPort) && profile.services.some((service) => service.port === stored.mainPort)) return stored.mainPort;
    return profile.services.find((service) => service.id === profile.mainServiceId)?.port ?? null;
  }

  private async publish(userId: string, profile: RuntimeProfileResult | PreviewRuntimeProfile, force = false): Promise<PreviewRuntimePublication | null> {
    const projectId = profile.projectId;
    const selectedPort = this.selectedMainPort(userId, projectId, profile as RuntimeProfileResult);
    const mainService = profile.services.find((service) => service.port === selectedPort);
    if (!mainService || !this.options.publishRuntime) return null;
    const key = this.runtimeKey(userId, projectId);
    if (!force && Date.now() - (this.publicationHeartbeat.get(key) ?? 0) < 9 * 60_000) return this.publications.get(key) ?? null;
    const published = await this.options.publishRuntime(userId, { ...profile, mainServiceId: mainService.id });
    this.publications.set(key, published);
    this.publicationHeartbeat.set(key, Date.now());
    return published;
  }

  private async assignRuntimePorts(sessionName: string, profile: RuntimeProfileResult): Promise<RuntimeProfileResult> {
    const localPorts = await this.options.localPorts();
    const occupied = new Map<number, string>();
    localPorts.forEach((entry) => occupied.set(entry.port, entry.process ?? entry.projectName ?? "einem anderen Prozess"));
    for (const [port, owner] of this.assignedSessionPorts(sessionName)) occupied.set(port, owner);

    const automatic = new Set(profile.autoPortServiceIds);
    for (const service of profile.services) {
      if (service.port === null || automatic.has(service.id)) continue;
      const owner = occupied.get(service.port);
      if (owner) {
        throw new AppError(409, "PREVIEW_RUNTIME_PORT_BUSY", `Der feste Port ${service.port} für ${service.name} wird bereits von ${owner} verwendet. Verwende in preview.config.json bei Bedarf port: "auto".`);
      }
      occupied.set(service.port, service.name);
    }

    const services = profile.services.map((service) => {
      if (!automatic.has(service.id)) return service;
      const port = this.options.allowedProjectPorts.find((candidate) => !occupied.has(candidate));
      if (port === undefined) {
        const needed = profile.services.filter((candidate) => automatic.has(candidate.id)).length;
        const free = this.options.allowedProjectPorts.filter((candidate) => !occupied.has(candidate)).length;
        throw new AppError(409, "PREVIEW_RUNTIME_PORT_CAPACITY", `Das Projekt benötigt ${needed} freie Preview-Ports, verfügbar sind noch ${free} von ${this.options.allowedProjectPorts.length}. Stoppe eine andere Projektlaufzeit oder stelle einen konfigurierten Dienst auf port: null.`);
      }
      occupied.set(port, service.name);
      return { ...service, port };
    });
    return { ...profile, services };
  }

  private assignedSessionPorts(excludedSessionName: string): Map<number, string> {
    const assigned = new Map<number, string>();
    const sessions = this.run(["list-sessions", "-F", "#{session_name}"], 4_000);
    if (sessions.status !== 0) return assigned;
    for (const name of sessions.stdout.split("\n").map((value) => value.trim()).filter((value) => value.startsWith("workbench-preview-") && value !== excludedSessionName)) {
      if (!this.panes(name).some((pane) => !pane.dead)) continue;
      const raw = this.sessionOption(name, RUNTIME_PORTS_OPTION);
      if (!raw) continue;
      try {
        const ports = Object.values(JSON.parse(raw) as Record<string, unknown>);
        for (const port of ports) if (typeof port === "number" && this.options.allowedProjectPorts.includes(port)) assigned.set(port, "einer anderen Projektlaufzeit");
      } catch { /* Ungültige Alt-Sitzungen werden weiterhin über die lokale Portübersicht erkannt. */ }
    }
    return assigned;
  }

  private profileForSession(userId: string, projectId: string, profile: RuntimeProfileResult): RuntimeProfileResult {
    const raw = this.sessionOption(this.sessionName(userId, projectId), RUNTIME_PORTS_OPTION);
    if (!raw) return profile;
    try {
      const ports = JSON.parse(raw) as Record<string, unknown>;
      const services = profile.services.map((service) => {
        const port = ports[service.id];
        if (port === null) return { ...service, port: null };
        if (typeof port === "number" && this.options.allowedProjectPorts.includes(port)) return { ...service, port };
        return service;
      });
      return { ...profile, services };
    } catch {
      return profile;
    }
  }

  private async withStartLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.startQueue;
    let release: () => void = () => {};
    this.startQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  private serviceCommand(project: Project, service: PreviewRuntimeService): string {
    const path = sanitizeDevServerPath(project.path, process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
    const hadPlaceholder = service.command.includes("{port}");
    let command = service.port === null ? service.command : service.command.replaceAll("{port}", String(service.port));
    if (service.port !== null && service.portMode === "argument" && !hadPlaceholder) {
      command += service.source === "detected" ? ` -- --port ${service.port}` : ` --port ${service.port}`;
    }
    const environment = ["/usr/bin/env", `PATH=${path}`, "FORCE_COLOR=0"];
    if (service.port !== null && service.portMode === "environment") environment.push(`PORT=${service.port}`, "HOST=127.0.0.1");
    environment.push("/bin/bash", "-lc", command);
    return environment.map(shellQuote).join(" ");
  }

  private runSetup(project: Project, runtimeName: string, command: string): void {
    const setupName = `${runtimeName}-setup`;
    const signal = `${setupName}-done`;
    const path = sanitizeDevServerPath(project.path, process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
    const setup = [`/usr/bin/env`, `PATH=${path}`, "/bin/bash", "-lc", `${command} && ${shellQuote(this.options.tmuxExecutable)} wait-for -S ${shellQuote(signal)}`].map(shellQuote).join(" ");
    const created = this.run(["new-session", "-d", "-s", setupName, "-c", project.path, setup], this.options.startTimeoutMilliseconds);
    if (created.status !== 0) throw new AppError(500, "PREVIEW_RUNTIME_SETUP_FAILED", cleanOutput(created.stderr).trim() || "Die Vorbereitung der Projektlaufzeit ist fehlgeschlagen.");
    const waited = this.run(["wait-for", signal], this.options.startTimeoutMilliseconds);
    const output = this.run(["capture-pane", "-p", "-J", "-S", "-10000", "-t", `${setupName}:0.0`], 4_000);
    this.run(["kill-session", "-t", setupName], 5_000);
    if (waited.status !== 0) throw new AppError(500, "PREVIEW_RUNTIME_SETUP_FAILED", cleanOutput(output.stdout || waited.stderr).trim() || "Die Vorbereitung der Projektlaufzeit ist fehlgeschlagen.");
  }

  private async resolveProject(projectId: string): Promise<Project> {
    let project: Project;
    try { project = await this.options.project(projectId); }
    catch { throw new AppError(404, "PROJECT_NOT_FOUND", "Das ausgewählte Projekt wurde nicht gefunden."); }
    if (project.availability !== "available") throw new AppError(409, "PROJECT_UNAVAILABLE", "Das ausgewählte Projekt ist momentan nicht verfügbar.");
    return project;
  }

  private panes(name: string): PaneState[] {
    const result = this.run(["list-panes", "-t", name, "-F", "#{window_name}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}\t#{session_created}"], 4_000);
    if (result.status !== 0) return [];
    return result.stdout.trim().split("\n").filter(Boolean).map((line) => {
      const [serviceId, dead, exitCode, pid, created] = line.split("\t");
      const createdAt = Number(created);
      return {
        serviceId: serviceId ?? "dev", dead: dead === "1",
        exitCode: dead === "1" && exitCode !== "" ? Number(exitCode) : null,
        pid: Number(pid) > 0 ? Number(pid) : null,
        startedAt: createdAt > 0 ? new Date(createdAt * 1_000).toISOString() : null,
      };
    });
  }

  private execute(args: string[]): void {
    const result = this.run(args, 5_000);
    if (result.status !== 0) throw new AppError(500, "DEV_SERVER_SUPERVISOR_FAILED", cleanOutput(result.stderr).trim() || "Die Projektlaufzeit-Steuerung ist fehlgeschlagen.");
  }

  /**
   * Die erste Preview-Pane startet in einer eigenen systemd-Scope und auf einem
   * eigenen tmux-Socket. So gehört der tmux-Server nicht zur Cgroup des
   * Workbench-Backends und laufende Projektprozesse überleben dessen Neustart.
   */
  private createSessionOutsideWorkbench(args: string[], timeoutMilliseconds: number): CommandResult {
    if (this.options.runner) return this.run(args, timeoutMilliseconds);
    const unit = `workbench-preview-start-${process.pid}-${Date.now()}`;
    const result = spawnSync("/usr/bin/systemd-run", [
      "--user",
      "--scope",
      "--collect",
      "--quiet",
      `--unit=${unit}`,
      this.options.tmuxExecutable,
      "-L",
      PREVIEW_TMUX_SOCKET,
      ...args,
    ], { encoding: "utf8", timeout: timeoutMilliseconds });
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }

  private ownerHash(userId: string): string { return createHash("sha256").update(userId).digest("hex").slice(0, 20); }
  private runtimeKey(userId: string, projectId: string): string { return `${userId}\u0000${projectId}`; }
  private sessionName(userId: string, projectId: string): string {
    const key = createHash("sha256").update(this.runtimeKey(userId, projectId)).digest("hex").slice(0, 24);
    return `workbench-preview-${key}`;
  }

  private async autoRestart(sessionName: string, userId: string, projectId: string) {
    const now = Date.now();
    const attempts = (this.restartHistory.get(sessionName) ?? []).filter((at) => at >= now - this.watchdogWindowMilliseconds);
    if (attempts.length >= this.watchdogMaxAttemptsPerWindow) {
      this.options.logger?.(`Projektlaufzeit ${projectId} läuft nach ${attempts.length} automatischen Neustarts weiterhin nicht; nächster Versuch nach dem Backoff-Zeitfenster.`);
      this.restartHistory.set(sessionName, attempts);
      return;
    }
    attempts.push(now);
    this.restartHistory.set(sessionName, attempts);
    this.options.logger?.(`Projektlaufzeit ${projectId} ist fehlgeschlagen und wird automatisch vollständig neu gestartet.`);
    const publicationRequested = this.sessionOption(sessionName, "@workbench_preview_publication_requested") === "1";
    try {
      this.execute(["kill-session", "-t", sessionName]);
      await this.start(userId, projectId);
    } catch (error) {
      this.options.logger?.(`Der automatische Neustart von ${projectId} ist fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (publicationRequested) {
      this.execute(["set-option", "-t", sessionName, "@workbench_preview_publication_requested", "1"]);
      try {
        const profile = await this.profile(projectId);
        await this.publish(userId, this.profileForSession(userId, projectId, profile), true);
      } catch (error) {
        this.options.logger?.(`Die Preview-Veröffentlichung von ${projectId} konnte nach dem Neustart nicht wiederhergestellt werden: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private sessionOption(name: string, option: string): string | null {
    const result = this.run(["show-options", "-t", name, "-v", option], 4_000);
    if (result.status !== 0) return null;
    return result.stdout.trim() || null;
  }
}
