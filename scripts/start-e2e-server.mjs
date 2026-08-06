#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.WORKBENCH_E2E_EXTERNAL === "true") {
  throw new Error("Der isolierte E2E-Server darf nicht für einen externen Server gestartet werden.");
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePorts = JSON.parse(
  await readFile(join(repositoryRoot, "tests/fixtures/preview-apps/ports.json"), "utf8"),
);
const e2ePort = Number(process.env.WORKBENCH_E2E_PORT ?? 3010);
if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort + 130 > 65_535) {
  throw new Error("WORKBENCH_E2E_PORT muss eine gültige TCP-Portnummer sein.");
}
const temporaryRoot = await mkdtemp(join(tmpdir(), "remote-workplace-e2e-"));
const configDirectory = join(temporaryRoot, "config");
const dataDirectory = join(temporaryRoot, "data");
const e2eIdentity = process.env.WORKBENCH_E2E_USER?.trim() || "user@example.com";
await Promise.all([mkdir(configDirectory, { recursive: true }), mkdir(dataDirectory, { recursive: true })]);

const config = JSON.parse(await readFile(join(repositoryRoot, "config/workbench.example.json"), "utf8"));
config.system = { user: "e2e", homeDirectory: temporaryRoot };
// Der isolierte E2E-Server bindet nur an Loopback (HOST-Default 127.0.0.1) und
// läuft mit eigener Temp-Konfiguration. Die Terminal-Route verlangt eine
// explizit erlaubte Identität; sie wird für den Lauf aus WORKBENCH_E2E_USER
// übernommen und bleibt auf den isolierten Server begrenzt.
config.tailscale.allowedUsers = [e2eIdentity];
// Alle vom isolierten Server reservierten Listener werden aus dem E2E-Port
// abgeleitet. Dadurch kollidiert ein lokaler Lauf nicht mit der laufenden
// Workbench oder einem anderen Testprozess.
config.t3.port = e2ePort + 1;
config.previews.slotPorts = Array.from({ length: 12 }, (_, index) => e2ePort + 10 + index);
config.previews.publicPorts = Array.from({ length: 12 }, (_, index) => e2ePort + 100 + index);
config.paths = {
  projectsRoot: repositoryRoot,
  orbitProjectBrowserRoot: repositoryRoot,
  terminalAllowedRoots: [repositoryRoot, temporaryRoot],
  terminalDefaultCwd: repositoryRoot,
  dataDir: dataDirectory,
  browserProfilesRoot: join(dataDirectory, "browser-profiles"),
  orbitBackupDir: join(dataDirectory, "orbit-backups"),
  orbitAssetDir: join(dataDirectory, "orbit-assets"),
  fileGalleryDir: join(dataDirectory, "file-gallery"),
  workbenchProfilesRoot: join(dataDirectory, "profiles"),
  codexSharedHome: join(dataDirectory, "shared-codex"),
  claudeSharedHome: join(dataDirectory, "shared-claude"),
  opencodeSharedHome: join(dataDirectory, "shared-opencode"),
  databasePath: join(dataDirectory, "workbench.sqlite"),
};
config.codexbar.configPath = join(dataDirectory, "codexbar.json");
config.codexbar.oauthProfileHomes = [];
config.previews = {
  ...config.previews,
  gatewayV2Enabled: true,
  bridgeEnabled: true,
  diagnosticsEnabled: true,
  storageSyncMode: "opt-in",
  slotResetEnabled: true,
};
await writeFile(
  join(configDirectory, "workbench.local.json"),
  `${JSON.stringify(config, null, 2)}\n`,
  { mode: 0o600 },
);

const projects = {
  projects: [
    {
      id: "remote-workplace",
      name: "Remote Workplace",
      description: "Isoliertes E2E-Projekt",
      path: repositoryRoot,
      enabled: true,
      sortOrder: 1,
      previews: [
        {
          id: "e2e-spa",
          name: "E2E SPA",
          url: null,
          targetPort: fixturePorts.spa,
          path: "/",
          mode: "hybrid",
          runtime: "iframe",
          dependencies: [],
        },
      ],
    },
    {
      id: "chappie",
      name: "Chappie",
      description: "Isolierte E2E-Fixture",
      path: join(repositoryRoot, "tests/fixtures"),
      enabled: true,
      sortOrder: 2,
      previews: [],
    },
  ],
};
await writeFile(join(configDirectory, "projects.local.json"), `${JSON.stringify(projects, null, 2)}\n`, { mode: 0o600 });
for (const name of ["services", "commands"]) {
  const content = await readFile(join(repositoryRoot, `config/${name}.example.json`));
  await writeFile(join(configDirectory, `${name}.local.json`), content, { mode: 0o600 });
}

const child = spawn(process.execPath, ["apps/server/dist/index.js"], {
  cwd: repositoryRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    CONFIG_DIR: configDirectory,
    DATABASE_PATH: join(dataDirectory, "workbench.sqlite"),
    NODE_ENV: "test",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
    PROJECT_DISCOVERY_ENABLED: "false",
    TERMINAL_SUPERVISOR: "direct",
    // Die .env des Repos enthält produktive Pfade (Orbit-Backups, Terminal-Roots,
    // Codexbar, KI-Profile). Der isolierte Testserver darf diese NICHT erben:
    // Beim Start würde er die echten Orbit-Daten aus den Backups wiederherstellen
    // und beim Speichern die echten Backups mit Testdaten überschreiben. Alle
    // Pfad- und Profilvariablen werden deshalb auf die Temp-Umgebung umgebogen.
    ORBIT_BACKUP_DIR: join(dataDirectory, "orbit-backups"),
    ORBIT_ASSET_DIR: join(dataDirectory, "orbit-assets"),
    FILE_GALLERY_DIR: join(dataDirectory, "file-gallery"),
    CODEBAR_CONFIG_PATH: join(dataDirectory, "codexbar.json"),
    CODEX_OAUTH_PROFILE_HOMES: "",
    CODEX_OAUTH_PRIMARY_FALLBACK: "false",
    TERMINAL_ALLOWED_ROOTS: `${repositoryRoot},${temporaryRoot}`,
    TERMINAL_DEFAULT_CWD: temporaryRoot,
    // Die .env des Repos setzt TERMINAL_ALLOWED_USERS für die Produktion; der
    // isolierte Testserver nutzt stattdessen ausschließlich seine Testidentität.
    TERMINAL_ALLOWED_USERS: e2eIdentity,
    // Die .env erbt ORBIT_DESTRUCTIVE_DROP_PERCENT=50 als Produktionsschutz;
    // die Tests ersetzen Orbit-Dokumente jedoch komplett (eigene Arbeitsflächen).
    ORBIT_DESTRUCTIVE_DROP_PERCENT: "100",
    WORKBENCH_DEV_TAILSCALE_USER: e2eIdentity,
    PREVIEW_PUBLIC_ORIGIN_MODE: "loopback-http",
    MISTRAL_API_KEY: "",
    PORT: String(e2ePort),
  },
});

let stopping = false;
const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
};
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));

const exitCode = await new Promise((resolve) => {
  child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});
await rm(temporaryRoot, { recursive: true, force: true });
process.exitCode = exitCode;
