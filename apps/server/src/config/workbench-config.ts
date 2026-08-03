import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dashboardConfigSchema, notificationPreferencesSchema, t3ChannelSchema, type NotificationPreferences, type T3Channel } from "@workbench/contracts";
import { z } from "zod";

const absolutePath = z.string().startsWith("/");

export const workbenchConfigSchema = z.object({
  branding: z.object({
    appName: z.string().min(1),
    shortName: z.string().min(1),
  }),
  system: z.object({
    user: z.string().min(1),
    homeDirectory: absolutePath,
  }),
  tailscale: z.object({
    hostname: z.string().min(1),
    ip: z.string().min(1),
    httpsPort: z.number().int().positive(),
    allowedUsers: z.array(z.string().min(1)),
  }),
  paths: z.object({
    projectsRoot: absolutePath,
    orbitProjectBrowserRoot: absolutePath,
    terminalAllowedRoots: z.array(absolutePath),
    terminalDefaultCwd: absolutePath,
    dataDir: absolutePath,
    browserProfilesRoot: absolutePath,
    orbitBackupDir: absolutePath,
    orbitAssetDir: absolutePath,
    fileGalleryDir: absolutePath.optional(),
    workbenchProfilesRoot: absolutePath,
    // Gemeinsame Homes der KI-Werkzeuge für Sessions und Konfiguration; der Accountwechsel
    // tauscht nur die darin liegende Anmeldedatei aus. Ohne Angabe `<home>/.codex`,
    // `<home>/.claude` und `<home>/.local/share/opencode`.
    codexSharedHome: absolutePath.optional(),
    claudeSharedHome: absolutePath.optional(),
    opencodeSharedHome: absolutePath.optional(),
    databasePath: absolutePath,
  }),
  cli: z.object({
    codexbar: z.string().min(1),
    codex: z.string().min(1),
    opencode: z.string().min(1),
    claude: z.string().min(1),
    tmux: absolutePath,
    chromium: z.string().min(1),
  }),
  codexbar: z.object({
    configPath: absolutePath,
    oauthProfileHomes: z.array(absolutePath),
  }),
  // Dashboard-Sichtbarkeit und Polling gehören zur zentralen, nicht-sensiblen
  // Workbench-Konfiguration. Die Oberfläche kann einzelne Bereiche lokal
  // ausblenden, diese Werte definieren die serverseitigen Defaults und Grenzen.
  dashboard: dashboardConfigSchema,
  notifications: z.object({
    preferences: notificationPreferencesSchema.prefault({}),
    pollSeconds: z.number().int().min(2).max(300).default(5),
    pruneAfterHours: z.number().int().min(1).max(720).default(48),
    terminalMinimumSeconds: z.number().int().min(5).max(86_400).default(180),
    agentMinimumSeconds: z.number().int().min(5).max(86_400).default(180),
    t3CompletionMinimumSeconds: z.number().int().min(5).max(86_400).default(120),
    t3MiniTaskSeconds: z.number().int().min(1).max(300).default(30),
    hermesCompletionMinimumSeconds: z.number().int().min(5).max(86_400).default(120),
    pushSubject: z.string().max(200).default("mailto:admin@localhost"),
  }).prefault({}),
  hermes: z.object({
    enabled: z.boolean().default(true),
    host: z.string().min(1).default("127.0.0.1"),
    port: z.number().int().positive().default(9119),
    proxyPrefix: z.string().startsWith("/").max(64).default("/hermes"),
    cliPath: absolutePath.optional(),
    homeDirectory: absolutePath.optional(),
    checkoutDirectory: absolutePath.optional(),
    pythonPath: absolutePath.optional(),
    dashboardServiceUnit: z.string().min(1).default("hermes-dashboard.service"),
    gatewayServiceUnit: z.string().min(1).default("hermes-gateway.service"),
    updateServiceUnit: z.string().min(1).default("hermes-update.service"),
    // Legacy field. Hermes öffnet in der Workbench immer die offizielle SPA.
    defaultSurface: z.enum(["chat", "admin"]).default("admin"),
    updateTime: z.string().regex(/^\d{2}:\d{2}$/).default("04:15"),
    updateTimezone: z.string().min(1).default("Europe/Berlin"),
    requestTimeoutSeconds: z.number().int().positive().default(20),
    startTimeoutSeconds: z.number().int().positive().default(120),
    acpMaxSessions: z.number().int().min(1).max(32).default(8),
    acpIdleTimeoutSeconds: z.number().int().positive().default(3_600),
    statusPollSeconds: z.number().int().min(5).max(300).default(30),
    taskPollSeconds: z.number().int().min(2).max(120).default(6),
    resultPollSeconds: z.number().int().min(5).max(300).default(20),
  }).prefault({}),
  previews: z.object({
    slotPorts: z.array(z.number().int().min(1).max(65_535)).min(1).max(32)
      .default([3901, 3902, 3903, 3904, 3905, 3906, 3907, 3908, 3909, 3910, 3911, 3912]),
    publicPorts: z.array(z.number().int().min(1).max(65_535)).min(1).max(32)
      .default([8451, 8452, 8453, 8454, 8455, 8456, 8457, 8458, 8459, 8460, 8461, 8462]),
    // Feature-Flags der Preview-Überarbeitung. Jede Teilfunktion lässt sich einzeln
    // zurückrollen, ohne Daten zu verlieren (siehe plans/02, Abschnitt 17/18).
    gatewayV2Enabled: z.boolean().default(false),
    bridgeEnabled: z.boolean().default(false),
    diagnosticsEnabled: z.boolean().default(false),
    storageSyncMode: z.enum(["off", "opt-in"]).default("off"),
    slotResetEnabled: z.boolean().default(false),
    maxInjectableHtmlBytes: z.number().int().min(65_536).max(16 * 1024 * 1024).default(2_097_152),
    diagnosticRetentionDays: z.number().int().min(1).max(7).default(7),
    diagnosticMaxEventBytes: z.number().int().min(1_024).max(262_144).default(65_536),
    diagnosticMaxBatchBytes: z.number().int().min(4_096).max(1_048_576).default(262_144),
    diagnosticMaxDailyBytes: z.number().int().min(1_048_576).max(536_870_912).default(33_554_432),
    diagnosticMaxTotalBytes: z.number().int().min(1_048_576).max(2_147_483_648).default(134_217_728),
    localStorageMaxBytes: z.number().int().min(1_024).max(1_048_576).default(262_144),
    localStorageMaxKeys: z.number().int().min(1).max(10_000).default(1_000),
  }).prefault({}),
  // Werkzeug „KI-Skills": bearbeitet den globalen Harness-Ordner (AGENTS.md + Skills).
  // Alle Pfade sind optional; ohne Angabe werden sie aus `system.homeDirectory` abgeleitet.
  // Persönliche Pfade gehören ausschließlich in `workbench.local.json`.
  skillEditor: z.object({
    // Hauptordner, der im Baum/Editor angezeigt wird. Default: <home>/.config/opencode
    rootDirectory: absolutePath.optional(),
    // Zielordner, in denen neue Skills per Symlink verteilt werden.
    // Defaults: <home>/.claude/skills und <home>/.codex/skills (nur wenn vorhanden).
    propagateDirectories: z.array(absolutePath).optional(),
    // Git-Repo für README-Tabelle und Commit/Push-Button. Ohne Angabe entsteht der
    // physische Skill-Ordner direkt unter rootDirectory/skills und der Git-Bereich entfällt.
    repositoryDirectory: absolutePath.optional(),
    autosaveDebounceMs: z.number().int().min(500).max(15_000).default(2_500),
    maxFileBytes: z.number().int().min(16_384).max(2_097_152).default(262_144),
  }).prefault({}),
  // T3 Code läuft als eine einzige Instanz hinter dem /t3-Proxy. Alle Werte sind optional,
  // damit ältere Konfigurationen ohne diesen Abschnitt weiter laden.
  t3: z.object({
    // Gewünschter Kanal. Wird über die Einstellungen gesetzt und beim nächsten
    // Neustart von scripts/sync-t3-channel.sh angewendet.
    channel: t3ChannelSchema.default("stable"),
    npmPackage: z.string().min(1).default("t3"),
    // Absoluter Pfad zur t3-Binary; ohne Angabe wird sie unter dem npm-Global-Prefix gesucht.
    cliPath: absolutePath.optional(),
    host: z.string().min(1).default("127.0.0.1"),
    port: z.number().int().positive().default(3773),
    serviceUnit: z.string().min(1).default("t3-code.service"),
    // Vorgänger-Start ohne systemd. Wird beim Kanalwechsel beendet, sonst blockiert er den Port.
    legacyLauncher: absolutePath.optional(),
    installTimeoutSeconds: z.number().int().positive().default(300),
    stopTimeoutSeconds: z.number().int().positive().default(20),
    portTimeoutSeconds: z.number().int().positive().default(30),
    healthTimeoutSeconds: z.number().int().positive().default(60),
    // prefault statt default: Fehlt der Abschnitt ganz, wird ein leeres Objekt geparst
    // und die Feld-Defaults greifen — sonst müsste hier jeder Wert ausgeschrieben werden.
  }).prefault({}),
}).superRefine((config, context) => {
  if (config.previews.slotPorts.length !== config.previews.publicPorts.length) {
    context.addIssue({ code: "custom", path: ["previews"], message: "Interne und öffentliche Preview-Ports müssen gleich viele Einträge enthalten." });
  }
  if (new Set(config.previews.slotPorts).size !== config.previews.slotPorts.length) {
    context.addIssue({ code: "custom", path: ["previews", "slotPorts"], message: "Interne Preview-Ports müssen eindeutig sein." });
  }
  if (new Set(config.previews.publicPorts).size !== config.previews.publicPorts.length) {
    context.addIssue({ code: "custom", path: ["previews", "publicPorts"], message: "Öffentliche Preview-Ports müssen eindeutig sein." });
  }
  const internalAndPublic = [...config.previews.slotPorts, ...config.previews.publicPorts];
  if (new Set(internalAndPublic).size !== internalAndPublic.length) {
    context.addIssue({ code: "custom", path: ["previews"], message: "Interne und öffentliche Preview-Ports dürfen sich nicht überschneiden." });
  }
  if (config.previews.slotPorts.includes(config.t3.port)) {
    context.addIssue({ code: "custom", path: ["previews", "slotPorts"], message: "Ein interner Preview-Port kollidiert mit T3 Code." });
  }
  if (config.previews.publicPorts.includes(config.tailscale.httpsPort)) {
    context.addIssue({ code: "custom", path: ["previews", "publicPorts"], message: "Ein öffentlicher Preview-Port kollidiert mit dem Workbench-HTTPS-Port." });
  }
  if (!["127.0.0.1", "::1", "localhost"].includes(config.hermes.host)) {
    context.addIssue({ code: "custom", path: ["hermes", "host"], message: "Das Hermes-Dashboard darf nur an Loopback binden." });
  }
  const reservedPorts = [config.t3.port, ...config.previews.slotPorts, ...config.previews.publicPorts];
  if (reservedPorts.includes(config.hermes.port)) {
    context.addIssue({ code: "custom", path: ["hermes", "port"], message: "Der Hermes-Port kollidiert mit einem bereits belegten Port." });
  }
});

export type WorkbenchConfig = z.infer<typeof workbenchConfigSchema>;

/**
 * Lädt die zentrale Workbench-Konfiguration synchron: erst `workbench.local.json`
 * (persönliche Werte, gitignored), sonst Fallback auf das committete
 * `workbench.example.json`. Synchron, weil `settings.ts` die Werte bereits beim
 * Modul-Load als Defaults benötigt.
 */
export function loadWorkbenchConfig(configDirectory: string): WorkbenchConfig {
  const candidates = ["workbench.local.json", "workbench.example.json"];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const content = readFileSync(join(configDirectory, candidate), "utf8");
      return workbenchConfigSchema.parse(JSON.parse(content) as unknown);
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  throw lastError ?? new Error("Workbench-Konfiguration fehlt (config/workbench.local.json oder .example.json).");
}

const localConfigName = "workbench.local.json";
const exampleConfigName = "workbench.example.json";

/**
 * Liest den eingestellten T3-Kanal frisch von der Platte. Bewusst nicht aus `settings`,
 * denn der Wert kann sich zur Laufzeit ändern (Einstellungen → T3 Code Kanal), während
 * `settings` beim Serverstart eingefroren wird.
 */
export function readConfiguredT3Channel(configDirectory: string): T3Channel {
  return loadWorkbenchConfig(configDirectory).t3.channel;
}

/**
 * Schreibt den gewünschten Kanal nach `workbench.local.json` — nur dieses eine Feld,
 * alle übrigen Werte bleiben unverändert. Existiert noch keine lokale Datei, dient
 * `workbench.example.json` als Grundlage. Geschrieben wird über eine temporäre Datei
 * und `rename`, damit ein Abbruch keine halbe Konfiguration hinterlässt.
 */
export function persistT3Channel(configDirectory: string, channel: T3Channel): void {
  const localPath = join(configDirectory, localConfigName);
  let base: Record<string, unknown>;
  try {
    base = JSON.parse(readFileSync(localPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    base = JSON.parse(readFileSync(join(configDirectory, exampleConfigName), "utf8")) as Record<string, unknown>;
  }

  const previousT3 = (base.t3 ?? {}) as Record<string, unknown>;
  const next = { ...base, t3: { ...previousT3, channel } };
  // Erst prüfen, dann schreiben: eine ungültige Datei würde den nächsten Serverstart verhindern.
  workbenchConfigSchema.parse(next);

  const temporaryPath = `${localPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, localPath);
  chmodSync(localPath, 0o600);
}

export function persistNotificationPreferences(configDirectory: string, preferences: NotificationPreferences): void {
  const localPath = join(configDirectory, localConfigName);
  let base: Record<string, unknown>;
  try {
    base = JSON.parse(readFileSync(localPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    base = JSON.parse(readFileSync(join(configDirectory, exampleConfigName), "utf8")) as Record<string, unknown>;
  }
  const previous = (base.notifications ?? {}) as Record<string, unknown>;
  const next = { ...base, notifications: { ...previous, preferences } };
  workbenchConfigSchema.parse(next);
  const temporaryPath = `${localPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, localPath);
  chmodSync(localPath, 0o600);
}
