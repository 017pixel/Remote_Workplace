import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RestartPhase, RestartTarget } from "@workbench/contracts";

// Eindeutig pro Serverprozess. Ändert sich der Wert im /health, lief ein Backend-Neustart durch.
export const bootId = randomUUID();

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const logDirectory = join(projectRoot, "data", "restart-logs");
const statusFile = join(logDirectory, "last-status.json");

const scriptByTarget: Record<RestartTarget, string> = {
  frontend: "restart-frontend.sh",
  backend: "restart-backend.sh",
  both: "restart-all.sh",
};

// mtime der gebauten Startseite. Der Frontend-Neustart baut dist/ neu und hebt diesen Wert an.
export function webBuildId(): number | null {
  try {
    return Math.floor(statSync(join(projectRoot, "apps/web/dist/index.html")).mtimeMs);
  } catch {
    return null;
  }
}

export class RestartError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message);
    this.name = "RestartError";
  }
}

interface StatusFile {
  target?: string;
  phase?: string;
  exitCode?: number | null;
  step?: string;
  message?: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  logFile?: string | null;
}

export interface RestartStatus {
  phase: RestartPhase;
  target: RestartTarget | null;
  exitCode: number | null;
  step: string;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  logTail: string;
  logFile: string | null;
}

const isRestartTarget = (value: unknown): value is RestartTarget =>
  value === "frontend" || value === "backend" || value === "both";
const isRestartPhase = (value: unknown): value is RestartPhase =>
  value === "idle" || value === "running" || value === "succeeded" || value === "failed";

// eslint-disable-next-line no-control-regex -- Farbcodes aus der Build-Ausgabe müssen weg.
const ansiPattern = /\[[0-9;]*[A-Za-z]/g;
const LOG_TAIL_BYTES = 12_000;

function readLogTail(file: string | null | undefined): string {
  if (!file) return "";
  try {
    const raw = readFileSync(file, "utf8");
    const tail = raw.length > LOG_TAIL_BYTES ? `… (gekürzt)\n${raw.slice(-LOG_TAIL_BYTES)}` : raw;
    return tail.replace(ansiPattern, "").trimEnd();
  } catch {
    return "";
  }
}

function writeStatusFile(status: Pick<RestartStatus, "phase" | "target" | "exitCode" | "step" | "message" | "startedAt" | "logFile">) {
  try {
    mkdirSync(logDirectory, { recursive: true });
    writeFileSync(statusFile, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch {
    // Der Status ist Zusatzinfo — wenn er nicht schreibbar ist, läuft der Neustart trotzdem.
  }
}

export function readRestartStatus(): RestartStatus {
  let parsed: StatusFile;
  try {
    parsed = JSON.parse(readFileSync(statusFile, "utf8")) as StatusFile;
  } catch {
    return { phase: "idle", target: null, exitCode: null, step: "", message: "Bisher kein Neustart über diese Oberfläche.", startedAt: null, updatedAt: null, logTail: "", logFile: null };
  }
  // Bei einem Aufruf direkt aus der Shell steht kein Logpfad drin — dann null statt "".
  const logFile = parsed.logFile ? parsed.logFile : null;
  return {
    phase: isRestartPhase(parsed.phase) ? parsed.phase : "idle",
    target: isRestartTarget(parsed.target) ? parsed.target : null,
    exitCode: typeof parsed.exitCode === "number" ? parsed.exitCode : null,
    step: parsed.step ?? "",
    message: parsed.message ?? "",
    startedAt: parsed.startedAt ?? null,
    updatedAt: parsed.updatedAt ?? null,
    logTail: readLogTail(logFile),
    logFile,
  };
}

// Ein Neustart gilt als hängend, wenn sich der Status länger nicht bewegt hat. Ohne diese
// Schranke würde ein abgebrochener Lauf jeden weiteren Versuch dauerhaft blockieren.
const STALE_RESTART_MS = 10 * 60 * 1000;

function restartInFlight(): boolean {
  const status = readRestartStatus();
  if (status.phase !== "running") return false;
  const updatedAt = status.updatedAt ? Date.parse(status.updatedAt) : Number.NaN;
  if (Number.isNaN(updatedAt)) return false;
  return Date.now() - updatedAt < STALE_RESTART_MS;
}

// Startet das passende Skript losgelöst vom Serverprozess. Das Skript baut zuerst (sichtbar im Log)
// und plant den eigentlichen Dienst-Neustart in einer eigenen systemd-Einheit ein, damit er den
// laufenden Prozess überlebt. Die Ausgabe landet in data/restart-logs/.
export function triggerRestart(target: RestartTarget): { logFile: string } {
  const script = join(projectRoot, "scripts", scriptByTarget[target]);
  try {
    accessSync(script, constants.R_OK);
  } catch {
    throw new RestartError(
      `Das Neustart-Skript fehlt: ${script}`,
      "Prüfe, ob das Repository vollständig ausgecheckt ist (scripts/restart-*.sh).",
    );
  }
  if (restartInFlight()) {
    throw new RestartError(
      "Es läuft bereits ein Neustart.",
      "Warte, bis der laufende Vorgang fertig ist — der Fortschritt steht unter Einstellungen.",
    );
  }

  mkdirSync(logDirectory, { recursive: true });
  const logFile = join(logDirectory, `restart-${target}-${Date.now()}.log`);
  const logHandle = openSync(logFile, "a");
  const startedAt = new Date().toISOString();

  // Vorab schreiben: Wenn bash gar nicht erst hochkommt, sieht das UI trotzdem einen Zustand.
  writeStatusFile({ phase: "running", target, exitCode: null, step: "Skript wird gestartet", message: "Läuft …", startedAt, logFile });

  try {
    const child = spawn("/bin/bash", [script], {
      cwd: projectRoot,
      detached: true,
      stdio: ["ignore", logHandle, logHandle],
      env: {
        ...process.env,
        RESTART_LOG_FILE: logFile,
        RESTART_TARGET: target,
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`,
      },
    });
    child.on("error", (error) => {
      writeStatusFile({ phase: "failed", target, exitCode: null, step: "Skriptstart", message: `Das Neustart-Skript konnte nicht gestartet werden: ${error.message}`, startedAt, logFile });
    });
    child.unref();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeStatusFile({ phase: "failed", target, exitCode: null, step: "Skriptstart", message, startedAt, logFile });
    throw new RestartError(`Der Neustart konnte nicht gestartet werden: ${message}`, "Details stehen im Log unter data/restart-logs/.");
  }

  return { logFile };
}
