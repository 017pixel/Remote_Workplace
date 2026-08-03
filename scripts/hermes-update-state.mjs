#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [, , statePath, ...rawFields] = process.argv;
if (!statePath) throw new Error("Pfad zur Hermes-Update-Zustandsdatei fehlt.");

const defaultState = {
  phase: "idle",
  pending: false,
  lastCheckedAt: null,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastResult: "none",
  previousVersion: null,
  previousCommit: null,
  newVersion: null,
  newCommit: null,
  deferredSince: null,
  lastFullBackupAt: null,
  logTail: [],
};

let current = defaultState;
try { current = { ...defaultState, ...JSON.parse(readFileSync(statePath, "utf8")) }; } catch { /* Erster Lauf. */ }

const patch = {};
for (const raw of rawFields) {
  const separator = raw.indexOf("=");
  if (separator <= 0) continue;
  const key = raw.slice(0, separator);
  const value = raw.slice(separator + 1);
  if (value === "null") patch[key] = null;
  else if (value === "true" || value === "false") patch[key] = value === "true";
  else patch[key] = value;
}

const logFile = process.env.HERMES_UPDATE_LOG_TAIL_FILE;
if (logFile) {
  try {
    patch.logTail = readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean).slice(-40).map((line) =>
      line.replace(/(api[_-]?key|token|secret|password|authorization)(\s*[:=]\s*)[^\s,;]+/gi, "$1$2[redigiert]").slice(0, 500),
    );
  } catch { /* Zustand wird auch ohne Logtail geschrieben. */ }
}

const next = { ...current, ...patch };
mkdirSync(dirname(statePath), { recursive: true });
const temporary = `${statePath}.${process.pid}.tmp`;
writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
renameSync(temporary, statePath);
chmodSync(statePath, 0o600);
