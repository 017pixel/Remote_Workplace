import { execFile } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { hermesServiceActionRequestSchema, type HermesServiceState } from "@workbench/contracts";
import { settings } from "../config/settings.js";
import { HermesClientError } from "./client.js";

const execFileAsync = promisify(execFile);

const unitFor = {
  dashboard: settings.hermes.dashboardServiceUnit,
  gateway: settings.hermes.gatewayServiceUnit,
} as const;

export function normalizeServiceState(activeState: string | undefined, subState = "", result = ""): HermesServiceState {
  if (activeState === "active" && (subState === "running" || subState.length === 0)) return "active";
  if (activeState === "activating" || activeState === "reloading") return "activating";
  if (activeState === "failed" || result === "failed") return "failed";
  if (activeState === "inactive" || activeState === "deactivating") return "inactive";
  return "unknown";
}

async function systemctl(args: string[], timeout = settings.hermes.requestTimeoutSeconds * 1_000): Promise<string> {
  try {
    const result = await execFileAsync("systemctl", ["--user", ...args], {
      env: { ...process.env, XDG_RUNTIME_DIR: `/run/user/${process.getuid?.() ?? 0}` },
      timeout,
      maxBuffer: 256 * 1024,
      windowsHide: true,
    });
    return result.stdout.trim();
  } catch {
    throw new HermesClientError("INTERNAL_ERROR", "Die Hermes-Dienststeuerung konnte nicht ausgeführt werden.", null, true);
  }
}

export async function serviceState(target: keyof typeof unitFor): Promise<HermesServiceState> {
  const unit = unitFor[target];
  try {
    const output = await systemctl(["show", "-p", "ActiveState", "-p", "SubState", "-p", "Result", unit]);
    const properties = new Map(
      output.split(/\r?\n/).flatMap((line) => {
        const separator = line.indexOf("=");
        return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
      }),
    );
    const activeState = properties.get("ActiveState") ?? "";
    const subState = properties.get("SubState") ?? "";
    const result = properties.get("Result") ?? "";
    return normalizeServiceState(activeState, subState, result);
  } catch (error) {
    if (error instanceof HermesClientError) return "unknown";
    return "unknown";
  }
}

export async function performServiceAction(input: unknown): Promise<{ target: keyof typeof unitFor; action: "start" | "stop" | "restart"; state: HermesServiceState }> {
  const parsed = hermesServiceActionRequestSchema.parse(input);
  const unit = unitFor[parsed.target];
  await systemctl([parsed.action, unit]);
  return { target: parsed.target, action: parsed.action, state: await serviceState(parsed.target) };
}

export async function startUpdateService(force = false): Promise<void> {
  if (force) {
    const marker = join(settings.dataDirectory, "hermes/update-force");
    mkdirSync(dirname(marker), { recursive: true, mode: 0o700 });
    const temporary = `${marker}.${process.pid}.tmp`;
    writeFileSync(temporary, `${new Date().toISOString()}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, marker);
  }
  await systemctl(["start", settings.hermes.updateServiceUnit]);
}

export { unitFor };
