#!/usr/bin/env node
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , configDirectory, cliPath, homeDirectory, checkoutDirectory, pythonPath] = process.argv;
if (!configDirectory || !cliPath || !homeDirectory || !checkoutDirectory || !pythonPath) throw new Error("Hermes-Konfigurationsargumente fehlen.");
const localPath = join(configDirectory, "workbench.local.json");
const examplePath = join(configDirectory, "workbench.example.json");
let base;
try { base = JSON.parse(readFileSync(localPath, "utf8")); } catch { base = JSON.parse(readFileSync(examplePath, "utf8")); }
const hermes = base.hermes && typeof base.hermes === "object" ? base.hermes : {};
delete hermes.defaultSurface;
base.hermes = {
  ...hermes,
  enabled: true,
  host: hermes.host ?? "127.0.0.1",
  port: hermes.port ?? 9119,
  proxyPrefix: hermes.proxyPrefix ?? "/hermes",
  cliPath,
  homeDirectory,
  checkoutDirectory,
  pythonPath,
  dashboardServiceUnit: hermes.dashboardServiceUnit ?? "hermes-dashboard.service",
  gatewayServiceUnit: hermes.gatewayServiceUnit ?? "hermes-gateway.service",
  updateServiceUnit: hermes.updateServiceUnit ?? "hermes-update.service",
  updateTime: hermes.updateTime ?? "04:15",
  updateTimezone: hermes.updateTimezone ?? "Europe/Berlin",
  requestTimeoutSeconds: hermes.requestTimeoutSeconds ?? 20,
  startTimeoutSeconds: hermes.startTimeoutSeconds ?? 120,
  acpMaxSessions: hermes.acpMaxSessions ?? 8,
  acpIdleTimeoutSeconds: hermes.acpIdleTimeoutSeconds ?? 3600,
  statusPollSeconds: hermes.statusPollSeconds ?? 30,
  taskPollSeconds: hermes.taskPollSeconds ?? 6,
  resultPollSeconds: hermes.resultPollSeconds ?? 20,
};
const temporary = `${localPath}.${process.pid}.tmp`;
writeFileSync(temporary, `${JSON.stringify(base, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
renameSync(temporary, localPath);
chmodSync(localPath, 0o600);
