import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hermesStatusSchema, hermesUpdateStateSchema, type HermesStatus, type HermesUpdateState } from "@workbench/contracts";
import { settings } from "../config/settings.js";
import { HermesClientError } from "./client.js";
import type { HermesDashboardClient } from "./client.js";
import type { HermesAcpManager } from "./acp/Manager.js";
import { serviceState } from "./service-control.js";

const execFileAsync = promisify(execFile);

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function defaultUpdateState(): HermesUpdateState {
  return { phase: "idle", pending: false, lastCheckedAt: null, lastStartedAt: null, lastFinishedAt: null, lastResult: "none", previousVersion: null, previousCommit: null, newVersion: null, newCommit: null, deferredSince: null, lastFullBackupAt: null, logTail: [] };
}

export function readHermesUpdateState(): HermesUpdateState {
  try {
    return hermesUpdateStateSchema.parse(JSON.parse(readFileSync(join(settings.dataDirectory, "hermes/update-state.json"), "utf8")) as unknown);
  } catch {
    return defaultUpdateState();
  }
}

async function checkoutCommit(): Promise<string | null> {
  try {
    const result = await execFileAsync("git", ["-C", settings.hermes.checkoutDirectory, "rev-parse", "HEAD"], { timeout: 5_000, maxBuffer: 64 * 1024 });
    const value = result.stdout.trim();
    return /^[a-f0-9]{40}$/i.test(value) ? value : null;
  } catch { return null; }
}

function telegramConnected(value: unknown): boolean | null {
  const platforms = object(value);
  const telegram = platforms.telegram;
  if (typeof telegram === "boolean") return telegram;
  if (telegram && typeof telegram === "object") {
    const item = telegram as Record<string, unknown>;
    if (typeof item.connected === "boolean") return item.connected;
    if (typeof item.running === "boolean") return item.running;
    if (item.state === "connected" || item.state === "running") return true;
    if (typeof item.state === "string") return false;
  }
  return null;
}

export class HermesStatusService {
  constructor(private readonly client: HermesDashboardClient, private readonly manager: HermesAcpManager) {}

  async get(): Promise<HermesStatus> {
    const checkedAt = new Date().toISOString();
    if (!settings.hermes.enabled) return hermesStatusSchema.parse({
      enabled: false, installed: false, reachable: false, version: null, commit: null, provider: null, model: null,
      dashboard: { state: "inactive", reachable: false, url: `${settings.hermes.proxyPrefix}/` },
      gateway: { state: "unknown", telegramConnected: null, lastError: null },
      chat: { transport: "unavailable", ready: false, activeSessions: 0 },
      update: { available: false, pending: false, running: false, currentVersion: null, latestVersion: null, lastCheckedAt: null, lastUpdatedAt: null, lastResult: "none" },
      checkedAt,
    });

    const installed = existsSync(settings.hermes.cliPath) && existsSync(settings.hermes.pythonPath);
    const dashboardState = await serviceState("dashboard");
    const gatewayState = await serviceState("gateway");
    let reachable = false;
    let version: string | null = null;
    let provider: string | null = null;
    let model: string | null = null;
    let gatewayTelegram: boolean | null = null;
    let gatewayError: string | null = null;
    try {
      const raw = object(await this.client.get("/api/status"));
      reachable = true;
      version = typeof raw.version === "string" ? raw.version : null;
      gatewayTelegram = telegramConnected(raw.gateway_platforms);
      gatewayError = typeof raw.gateway_exit_reason === "string" ? raw.gateway_exit_reason.slice(0, 500) : null;
      try {
        const info = object(await this.client.get("/api/model/info"));
        provider = typeof info.provider === "string" ? info.provider : null;
        model = typeof info.model === "string" ? info.model : null;
      } catch { /* Status bleibt auch ohne Modelldetails nutzbar. */ }
    } catch (error) {
      if (!(error instanceof HermesClientError)) throw error;
    }
    const update = readHermesUpdateState();
    return hermesStatusSchema.parse({
      enabled: true,
      installed,
      reachable,
      version,
      commit: await checkoutCommit(),
      provider,
      model,
      dashboard: { state: dashboardState, reachable, url: `${settings.hermes.proxyPrefix}/` },
      gateway: { state: gatewayState, telegramConnected: gatewayTelegram, lastError: gatewayError },
      chat: { transport: installed ? "acp" : "unavailable", ready: installed && this.manager.ready, activeSessions: this.manager.activeSessionCount() },
      update: { available: update.pending, pending: update.pending, running: update.phase === "running", currentVersion: update.previousVersion, latestVersion: update.newVersion, lastCheckedAt: update.lastCheckedAt, lastUpdatedAt: update.lastFinishedAt, lastResult: update.lastResult },
      checkedAt,
    });
  }
}
