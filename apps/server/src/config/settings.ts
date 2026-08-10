import { chmodSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";
import { loadWorkbenchConfig } from "./workbench-config.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const environmentFile = resolve(projectRoot, ".env");
dotenv.config({ path: environmentFile });
try { chmodSync(environmentFile, 0o600); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const configDirectory = resolve(projectRoot, process.env.CONFIG_DIR ?? "./config");
try { chmodSync(resolve(configDirectory, "workbench.local.json"), 0o600); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
// Zentrale Personalisierung. Env-Variablen überschreiben diese Werte weiterhin.
const wb = loadWorkbenchConfig(configDirectory);

const integerFromEnvironment = (fallback: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : Number(value)),
    z.number().int().positive(),
  );

const boundedIntegerFromEnvironment = (fallback: number, minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : Number(value)),
    z.number().int().min(minimum).max(maximum),
  );

const booleanFromEnvironment = (fallback: boolean) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : value === "true"),
    z.boolean(),
  );

const profileHomesFromEnvironment = z.preprocess(
  (value) => (typeof value === "string" && value.length > 0 ? value.split(",").map((path) => path.trim()).filter(Boolean) : []),
  z.array(z.string().startsWith("/")),
);

const commaSeparatedValues = z.preprocess(
  (value) => (typeof value === "string" && value.length > 0 ? value.split(",").map((item) => item.trim()).filter(Boolean) : []),
  z.array(z.string().min(1)),
);

const localhostUrl = z.url().refine((value) => {
  const hostname = new URL(value).hostname;
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}, "CODEXBAR_BASE_URL muss auf einen lokalen Host zeigen.");

const settingsSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: integerFromEnvironment(3010),
  APP_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.43.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CONFIG_DIR: z.string().default("./config"),
  WEB_DIST_DIR: z.string().default("./apps/web/dist"),
  PROJECTS_ROOT: z.string().startsWith("/").default(wb.paths.projectsRoot),
  PROJECT_DISCOVERY_ENABLED: booleanFromEnvironment(true),
  PROJECT_ACTIVITY_CACHE_MS: boundedIntegerFromEnvironment(300_000, 10_000, 3_600_000),
  PROJECT_ACTIVITY_MAX_DEPTH: boundedIntegerFromEnvironment(8, 1, 20),
  PROJECT_ACTIVITY_MAX_FILES: boundedIntegerFromEnvironment(20_000, 100, 200_000),
  PROJECT_ACTIVITY_CONCURRENCY: boundedIntegerFromEnvironment(4, 1, 16),
  PROJECT_LIST_CACHE_MS: boundedIntegerFromEnvironment(5_000, 1_000, 60_000),
  ORBIT_RECENT_PROJECT_LIMIT: boundedIntegerFromEnvironment(8, 3, 20),
  ORBIT_PROJECT_BROWSER_ROOT: z.string().startsWith("/").default(wb.paths.orbitProjectBrowserRoot),
  ORBIT_PROJECT_BROWSER_PAGE_SIZE: boundedIntegerFromEnvironment(300, 1, 500),
  METRICS_CACHE_MS: integerFromEnvironment(5_000),
  SUMMARY_CACHE_MS: integerFromEnvironment(30_000),
  SERVICE_CACHE_MS: integerFromEnvironment(10_000),
  LOCAL_PORT_CACHE_MS: integerFromEnvironment(5_000),
  AUDIT_VERIFY_CACHE_MS: boundedIntegerFromEnvironment(5_000, 1_000, 60_000),
  LOCAL_PORT_PROBE_TIMEOUT_MS: boundedIntegerFromEnvironment(450, 100, 3_000),
  REQUEST_TIMEOUT_MS: integerFromEnvironment(3_000),
  COMPRESSION_THRESHOLD_BYTES: integerFromEnvironment(1_024),
  BROTLI_QUALITY: boundedIntegerFromEnvironment(4, 0, 11),
  // Pro IP und Minute. Hinter dem Tailscale-Proxy sehen alle Anfragen wie 127.0.0.1
  // aus — es ist damit ein gemeinsames Budget für sämtliche Tabs. Allein die
  // Oberfläche pollt je Tab 20–45 Anfragen pro Minute, 180 waren dafür zu knapp.
  API_RATE_LIMIT_MAX: integerFromEnvironment(1_200),
  WEBSOCKET_MAX_PAYLOAD_BYTES: integerFromEnvironment(16 * 1024 * 1024),
  CODEXBAR_BASE_URL: localhostUrl.default("http://127.0.0.1:18181"),
  CODEXBAR_CACHE_MS: integerFromEnvironment(60_000),
  CODEXBAR_TIMEOUT_MS: integerFromEnvironment(35_000),
  CODEXBAR_CLI_PATH: z.string().min(1).default(wb.cli.codexbar),
  CODEX_OAUTH_PRIMARY_FALLBACK: booleanFromEnvironment(false),
  CODEX_OAUTH_PROFILE_HOMES: profileHomesFromEnvironment.default(wb.codexbar.oauthProfileHomes),
  CODEX_OAUTH_TIMEOUT_MS: integerFromEnvironment(5_000),
  PROXY_TIMEOUT_MS: integerFromEnvironment(15_000),
  PROXY_MAX_HTML_BYTES: boundedIntegerFromEnvironment(4 * 1024 * 1024, 65_536, 16 * 1024 * 1024),
  TERMINAL_ALLOWED_USERS: commaSeparatedValues.default(wb.tailscale.allowedUsers),
  TERMINAL_ALLOWED_ROOTS: profileHomesFromEnvironment.default(wb.paths.terminalAllowedRoots),
  TERMINAL_DEFAULT_CWD: z.string().startsWith("/").default(wb.paths.terminalDefaultCwd),
  TERMINAL_MAX_SESSIONS: integerFromEnvironment(24),
  TERMINAL_SUPERVISOR: z.enum(["tmux", "direct"]).default("tmux"),
  TMUX_PATH: z.string().startsWith("/").default(wb.cli.tmux),
  CODEX_CLI_PATH: z.string().min(1).default(wb.cli.codex),
  OPENCODE_CLI_PATH: z.string().min(1).default(wb.cli.opencode),
  CLAUDE_CLI_PATH: z.string().min(1).default(wb.cli.claude),
  CODEX_MAX_SESSIONS: integerFromEnvironment(12),
  OPENCODE_MAX_SESSIONS: integerFromEnvironment(12),
  CLAUDE_MAX_SESSIONS: integerFromEnvironment(4),
  CHROMIUM_PATH: z.string().min(1).default(wb.cli.chromium),
  BROWSER_PROFILES_ROOT: z.string().startsWith("/").default(wb.paths.browserProfilesRoot),
  BROWSER_MAX_SESSIONS: boundedIntegerFromEnvironment(6, 1, 12),
  BROWSER_STARTUP_TIMEOUT_MS: boundedIntegerFromEnvironment(15_000, 2_000, 60_000),
  BROWSER_IDLE_TIMEOUT_MS: boundedIntegerFromEnvironment(1_800_000, 60_000, 86_400_000),
  BROWSER_CAPTURE_MAX_WIDTH: boundedIntegerFromEnvironment(2_560, 1_280, 7_680),
  BROWSER_CAPTURE_MAX_HEIGHT: boundedIntegerFromEnvironment(1_800, 720, 4_320),
  BROWSER_CAPTURE_MAX_SCALE: boundedIntegerFromEnvironment(2, 1, 3),
  BROWSER_CAPTURE_JPEG_QUALITY: boundedIntegerFromEnvironment(90, 60, 100),
  BROWSER_CAPTURE_EVERY_NTH_FRAME: boundedIntegerFromEnvironment(2, 1, 6),
  BROWSER_ALLOW_NO_SANDBOX: booleanFromEnvironment(false),
  DATABASE_PATH: z.string().default(wb.paths.databasePath),
  DATA_DIR: z.string().startsWith("/").default(wb.paths.dataDir),
  USAGE_SNAPSHOT_INTERVAL_MS: integerFromEnvironment(300_000),
  ORBIT_SYNC_INTERVAL_MS: boundedIntegerFromEnvironment(5_000, 1_000, 60_000),
  ORBIT_DOCUMENT_MAX_BYTES: boundedIntegerFromEnvironment(4 * 1024 * 1024, 65_536, 8 * 1024 * 1024),
  ORBIT_BACKUP_DIR: z.string().startsWith("/").default(wb.paths.orbitBackupDir),
  ORBIT_ASSET_DIR: z.string().startsWith("/").default(wb.paths.orbitAssetDir),
  ORBIT_ASSET_MAX_FILE_BYTES: boundedIntegerFromEnvironment(100 * 1024 * 1024, 1_024, 100 * 1024 * 1024),
  ORBIT_ASSET_MAX_TOTAL_BYTES: integerFromEnvironment(50 * 1024 * 1024 * 1024),
  FILE_GALLERY_DIR: z.string().startsWith("/").default(wb.paths.fileGalleryDir ?? join(wb.paths.dataDir, "file-gallery")),
  FILE_GALLERY_MAX_FILE_BYTES: boundedIntegerFromEnvironment(100 * 1024 * 1024, 1_024, 100 * 1024 * 1024),
  FILE_GALLERY_MAX_TOTAL_BYTES: integerFromEnvironment(50 * 1024 * 1024 * 1024),
  FILE_MANAGER_TEXT_PREVIEW_BYTES: boundedIntegerFromEnvironment(300 * 1024, 4_096, 2 * 1024 * 1024),
  FILE_MANAGER_MAX_UPLOAD_BYTES: boundedIntegerFromEnvironment(200 * 1024 * 1024, 1_024, 2 * 1024 * 1024 * 1024),
  ORBIT_DESTRUCTIVE_DROP_PERCENT: boundedIntegerFromEnvironment(50, 10, 100),
  ORBIT_REVISION_RETENTION_COUNT: boundedIntegerFromEnvironment(500, 20, 10_000),
  ORBIT_CONFLICT_RETENTION_COUNT: boundedIntegerFromEnvironment(100, 10, 2_000),
  MISTRAL_API_KEY: z.string().default(""),
  MISTRAL_API_BASE_URL: z.url().default("https://api.mistral.ai/v1"),
  MISTRAL_MODEL_INGEST: z.string().min(1).default("mistral-small-2603"),
  MISTRAL_MODEL_CHAT: z.string().min(1).default("mistral-medium-3-5"),
  MISTRAL_MODEL_EMBED: z.string().min(1).default("mistral-embed-2312"),
  MISTRAL_TIMEOUT_MS: boundedIntegerFromEnvironment(30_000, 2_000, 120_000),
  NEWS_SYNC_INTERVAL_MS: boundedIntegerFromEnvironment(1_800_000, 300_000, 86_400_000),
  NEWS_FETCH_TIMEOUT_MS: boundedIntegerFromEnvironment(12_000, 2_000, 60_000),
  NEWS_MAX_ITEMS_PER_SOURCE: boundedIntegerFromEnvironment(16, 1, 50),
  NEWS_AI_CONCURRENCY: boundedIntegerFromEnvironment(1, 1, 4),
  WORKBENCH_PROFILES_ROOT: z.string().startsWith("/").default(wb.paths.workbenchProfilesRoot),
  CODEXBAR_CONFIG_PATH: z.string().startsWith("/").default(wb.codexbar.configPath),
  // Gemeinsame Homes der KI-Werkzeuge: dort liegen Konfiguration, Sessions und Verlauf.
  // Beim Accountwechsel wird ausschließlich die darin liegende Anmeldedatei umgehängt.
  CODEX_SHARED_HOME: z.string().startsWith("/").default(wb.paths.codexSharedHome ?? join(wb.system.homeDirectory, ".codex")),
  CLAUDE_SHARED_HOME: z.string().startsWith("/").default(wb.paths.claudeSharedHome ?? join(wb.system.homeDirectory, ".claude")),
  OPENCODE_SHARED_HOME: z.string().startsWith("/").default(wb.paths.opencodeSharedHome ?? join(wb.system.homeDirectory, ".local/share/opencode")),
  // Der Kanal selbst steht bewusst nicht hier: Er wird zur Laufzeit aus der Config
  // gelesen und geschrieben (siehe readConfiguredT3Channel). Alles Übrige ist statisch.
  T3_CLI_PATH: z.string().startsWith("/").default(wb.t3.cliPath ?? join(wb.system.homeDirectory, ".npm-global/bin/t3")),
  T3_NPM_PACKAGE: z.string().min(1).default(wb.t3.npmPackage),
  T3_HOST: z.string().min(1).default(wb.t3.host),
  T3_PORT: integerFromEnvironment(wb.t3.port),
  T3_SERVICE_UNIT: z.string().min(1).default(wb.t3.serviceUnit),
  HERMES_ENABLED: booleanFromEnvironment(wb.hermes.enabled),
  HERMES_HOST: z.string().min(1).default(wb.hermes.host),
  HERMES_PORT: integerFromEnvironment(wb.hermes.port),
  HERMES_CLI_PATH: z.string().startsWith("/").default(wb.hermes.cliPath ?? join(wb.system.homeDirectory, ".local/bin/hermes")),
  HERMES_HOME: z.string().startsWith("/").default(wb.hermes.homeDirectory ?? join(wb.system.homeDirectory, ".hermes")),
  HERMES_CHECKOUT_DIRECTORY: z.string().startsWith("/").optional(),
  HERMES_PYTHON_PATH: z.string().startsWith("/").optional(),
  HERMES_PROXY_PREFIX: z.string().startsWith("/").max(64).default(wb.hermes.proxyPrefix),
  HERMES_DASHBOARD_UNIT: z.string().min(1).default(wb.hermes.dashboardServiceUnit),
  HERMES_GATEWAY_UNIT: z.string().min(1).default(wb.hermes.gatewayServiceUnit),
  HERMES_UPDATE_UNIT: z.string().min(1).default(wb.hermes.updateServiceUnit),
  // Preview-Feature-Flags. Env schlägt Config, damit ein Rollback ohne Config-Edit geht.
  PREVIEW_GATEWAY_V2: booleanFromEnvironment(wb.previews.gatewayV2Enabled),
  PREVIEW_BRIDGE: booleanFromEnvironment(wb.previews.bridgeEnabled),
  PREVIEW_DIAGNOSTICS: booleanFromEnvironment(wb.previews.diagnosticsEnabled),
  PREVIEW_STORAGE_SYNC_MODE: z.enum(["off", "opt-in"]).default(wb.previews.storageSyncMode),
  PREVIEW_SLOT_RESET: booleanFromEnvironment(wb.previews.slotResetEnabled),
  PREVIEW_MAX_INJECTABLE_HTML_BYTES: boundedIntegerFromEnvironment(wb.previews.maxInjectableHtmlBytes, 65_536, 16 * 1024 * 1024),
  PREVIEW_DIAGNOSTIC_RETENTION_DAYS: boundedIntegerFromEnvironment(wb.previews.diagnosticRetentionDays, 1, 7),
  PREVIEW_DIAGNOSTIC_MAX_EVENT_BYTES: boundedIntegerFromEnvironment(wb.previews.diagnosticMaxEventBytes, 1_024, 262_144),
  PREVIEW_DIAGNOSTIC_MAX_BATCH_BYTES: boundedIntegerFromEnvironment(wb.previews.diagnosticMaxBatchBytes, 4_096, 1_048_576),
  PREVIEW_DIAGNOSTIC_MAX_DAILY_BYTES: boundedIntegerFromEnvironment(wb.previews.diagnosticMaxDailyBytes, 1_048_576, 536_870_912),
  PREVIEW_DIAGNOSTIC_MAX_TOTAL_BYTES: boundedIntegerFromEnvironment(wb.previews.diagnosticMaxTotalBytes, 1_048_576, 2_147_483_648),
  PREVIEW_LOCAL_STORAGE_MAX_BYTES: boundedIntegerFromEnvironment(wb.previews.localStorageMaxBytes, 1_024, 1_048_576),
  PREVIEW_LOCAL_STORAGE_MAX_KEYS: boundedIntegerFromEnvironment(wb.previews.localStorageMaxKeys, 1, 10_000),
  PREVIEW_DEV_SERVER_LOG_BYTES: boundedIntegerFromEnvironment(wb.previews.devServerLogBytes, 16_384, 262_144),
  PREVIEW_DEV_SERVER_START_TIMEOUT_MS: boundedIntegerFromEnvironment(wb.previews.devServerStartTimeoutMs, 1_000, 60_000),
  // Nur für automatisierte Tests: Slot-Origins als http://127.0.0.1:<internalPort>
  // ausgeben. Produktion bleibt HTTPS über Tailscale.
  PREVIEW_PUBLIC_ORIGIN_MODE: z.enum(["tailscale-https", "loopback-http"]).default("tailscale-https"),
  // Entwicklungsidentität, wenn kein Tailscale-Proxy davor hängt. In Produktion leer.
  WORKBENCH_DEV_TAILSCALE_USER: z.string().default(""),
});

const environment = settingsSchema.parse(process.env);
if (environment.NODE_ENV === "production" && environment.WORKBENCH_DEV_TAILSCALE_USER.trim()) {
  throw new Error("WORKBENCH_DEV_TAILSCALE_USER darf in Produktion nicht gesetzt sein.");
}
if (!["127.0.0.1", "::1", "localhost"].includes(environment.HERMES_HOST)) {
  throw new Error("HERMES_HOST darf nur auf Loopback zeigen.");
}
const hermesHomeDirectory = environment.HERMES_HOME;
const hermesCheckoutDirectory = environment.HERMES_CHECKOUT_DIRECTORY ?? wb.hermes.checkoutDirectory ?? join(hermesHomeDirectory, "hermes-agent");
const hermesPythonPath = environment.HERMES_PYTHON_PATH ?? wb.hermes.pythonPath ?? join(hermesCheckoutDirectory, "venv/bin/python");
const hermesCliPath = environment.HERMES_CLI_PATH;
// KI-Skills: Ohne konfigurierte Propagationsziele werden die üblichen Harness-Ordner
// genommen — aber nur, wenn sie wirklich existieren. Ein explizit gesetzter Wert gilt
// dagegen immer, auch wenn der Ordner erst beim Anlegen des ersten Skills entsteht.
const skillEditorRoot = resolve(wb.skillEditor.rootDirectory ?? join(wb.system.homeDirectory, ".config/opencode"));
const skillEditorPropagateDirectories = (
  wb.skillEditor.propagateDirectories
    ?? [join(wb.system.homeDirectory, ".claude/skills"), join(wb.system.homeDirectory, ".codex/skills")].filter((path) => existsSync(path))
).map((path) => resolve(path));

const listenerPorts = [environment.PORT, environment.T3_PORT, environment.HERMES_PORT, ...wb.previews.slotPorts, ...wb.previews.publicPorts];
if (new Set(listenerPorts).size !== listenerPorts.length) {
  throw new Error("Workbench-, T3-, Hermes- und Preview-Ports müssen eindeutig sein.");
}

export const settings = Object.freeze({
  runtimeMode: environment.NODE_ENV,
  host: environment.HOST,
  port: environment.PORT,
  appVersion: environment.APP_VERSION,
  logLevel: environment.LOG_LEVEL,
  configDirectory,
  appName: wb.branding.appName,
  appShortName: wb.branding.shortName,
  dashboard: wb.dashboard,
  notifications: wb.notifications,
  systemUser: wb.system.user,
  systemHomeDirectory: wb.system.homeDirectory,
  tailscaleHostname: wb.tailscale.hostname,
  tailscaleIp: wb.tailscale.ip,
  tailscaleHttpsPort: wb.tailscale.httpsPort,
  previewSlotPorts: wb.previews.slotPorts,
  previewPublicPorts: wb.previews.publicPorts,
  dataDirectory: environment.DATA_DIR,
  previews: {
    gatewayV2Enabled: environment.PREVIEW_GATEWAY_V2,
    bridgeEnabled: environment.PREVIEW_BRIDGE,
    diagnosticsEnabled: environment.PREVIEW_DIAGNOSTICS,
    storageSyncMode: environment.PREVIEW_STORAGE_SYNC_MODE,
    slotResetEnabled: environment.PREVIEW_SLOT_RESET,
    maxInjectableHtmlBytes: environment.PREVIEW_MAX_INJECTABLE_HTML_BYTES,
    diagnosticRetentionDays: environment.PREVIEW_DIAGNOSTIC_RETENTION_DAYS,
    diagnosticMaxEventBytes: environment.PREVIEW_DIAGNOSTIC_MAX_EVENT_BYTES,
    diagnosticMaxBatchBytes: environment.PREVIEW_DIAGNOSTIC_MAX_BATCH_BYTES,
    diagnosticMaxDailyBytes: environment.PREVIEW_DIAGNOSTIC_MAX_DAILY_BYTES,
    diagnosticMaxTotalBytes: environment.PREVIEW_DIAGNOSTIC_MAX_TOTAL_BYTES,
    localStorageMaxBytes: environment.PREVIEW_LOCAL_STORAGE_MAX_BYTES,
    localStorageMaxKeys: environment.PREVIEW_LOCAL_STORAGE_MAX_KEYS,
    npmExecutable: wb.previews.npmExecutable,
    devServerLogBytes: environment.PREVIEW_DEV_SERVER_LOG_BYTES,
    devServerStartTimeoutMilliseconds: environment.PREVIEW_DEV_SERVER_START_TIMEOUT_MS,
    publicOriginMode: environment.PREVIEW_PUBLIC_ORIGIN_MODE,
  },
  developmentTailscaleUser: environment.NODE_ENV === "development" || environment.NODE_ENV === "test"
    ? environment.WORKBENCH_DEV_TAILSCALE_USER.trim().toLowerCase()
    : "",
  webDistDirectory: resolve(projectRoot, environment.WEB_DIST_DIR),
  projectsRootDirectory: resolve(environment.PROJECTS_ROOT),
  projectDiscoveryEnabled: environment.PROJECT_DISCOVERY_ENABLED,
  projectActivityCacheMilliseconds: environment.PROJECT_ACTIVITY_CACHE_MS,
  projectActivityMaximumDepth: environment.PROJECT_ACTIVITY_MAX_DEPTH,
  projectActivityMaximumFiles: environment.PROJECT_ACTIVITY_MAX_FILES,
  projectActivityConcurrency: environment.PROJECT_ACTIVITY_CONCURRENCY,
  projectListCacheMilliseconds: environment.PROJECT_LIST_CACHE_MS,
  orbitRecentProjectLimit: environment.ORBIT_RECENT_PROJECT_LIMIT,
  orbitProjectBrowserRoot: resolve(environment.ORBIT_PROJECT_BROWSER_ROOT),
  orbitProjectBrowserPageSize: environment.ORBIT_PROJECT_BROWSER_PAGE_SIZE,
  metricsCacheMilliseconds: environment.METRICS_CACHE_MS,
  summaryCacheMilliseconds: environment.SUMMARY_CACHE_MS,
  serviceCacheMilliseconds: environment.SERVICE_CACHE_MS,
  localPortCacheMilliseconds: environment.LOCAL_PORT_CACHE_MS,
  auditVerifyCacheMilliseconds: environment.AUDIT_VERIFY_CACHE_MS,
  localPortProbeTimeoutMilliseconds: environment.LOCAL_PORT_PROBE_TIMEOUT_MS,
  requestTimeoutMilliseconds: environment.REQUEST_TIMEOUT_MS,
  compressionThresholdBytes: environment.COMPRESSION_THRESHOLD_BYTES,
  brotliQuality: environment.BROTLI_QUALITY,
  apiRateLimitMax: environment.API_RATE_LIMIT_MAX,
  webSocketMaxPayloadBytes: environment.WEBSOCKET_MAX_PAYLOAD_BYTES,
  codexbarBaseUrl: environment.CODEXBAR_BASE_URL,
  codexbarCacheMilliseconds: environment.CODEXBAR_CACHE_MS,
  codexbarTimeoutMilliseconds: environment.CODEXBAR_TIMEOUT_MS,
  codexbarCliPath: environment.CODEXBAR_CLI_PATH,
  codexOauthPrimaryFallbackEnabled: environment.CODEX_OAUTH_PRIMARY_FALLBACK,
  codexOauthProfileHomes: environment.CODEX_OAUTH_PROFILE_HOMES,
  codexOauthTimeoutMilliseconds: environment.CODEX_OAUTH_TIMEOUT_MS,
  proxyTimeoutMilliseconds: environment.PROXY_TIMEOUT_MS,
  proxyMaximumHtmlBytes: environment.PROXY_MAX_HTML_BYTES,
  terminalAllowedUsers: environment.TERMINAL_ALLOWED_USERS.map((user) => user.toLowerCase()),
  terminalAllowedRoots: environment.TERMINAL_ALLOWED_ROOTS.map((path) => resolve(path)),
  terminalDefaultCwd: resolve(environment.TERMINAL_DEFAULT_CWD),
  terminalMaxSessions: environment.TERMINAL_MAX_SESSIONS,
  terminalSupervisor: environment.TERMINAL_SUPERVISOR,
  tmuxPath: environment.TMUX_PATH,
  codexCliPath: environment.CODEX_CLI_PATH,
  opencodeCliPath: environment.OPENCODE_CLI_PATH,
  claudeCliPath: environment.CLAUDE_CLI_PATH,
  codexMaxSessions: environment.CODEX_MAX_SESSIONS,
  opencodeMaxSessions: environment.OPENCODE_MAX_SESSIONS,
  claudeMaxSessions: environment.CLAUDE_MAX_SESSIONS,
  chromiumPath: environment.CHROMIUM_PATH,
  browserProfilesRoot: resolve(environment.BROWSER_PROFILES_ROOT),
  browserMaxSessions: environment.BROWSER_MAX_SESSIONS,
  browserStartupTimeoutMilliseconds: environment.BROWSER_STARTUP_TIMEOUT_MS,
  browserIdleTimeoutMilliseconds: environment.BROWSER_IDLE_TIMEOUT_MS,
  browserCaptureMaxWidth: environment.BROWSER_CAPTURE_MAX_WIDTH,
  browserCaptureMaxHeight: environment.BROWSER_CAPTURE_MAX_HEIGHT,
  browserCaptureMaxScale: environment.BROWSER_CAPTURE_MAX_SCALE,
  browserCaptureJpegQuality: environment.BROWSER_CAPTURE_JPEG_QUALITY,
  browserCaptureEveryNthFrame: environment.BROWSER_CAPTURE_EVERY_NTH_FRAME,
  browserAllowNoSandbox: environment.BROWSER_ALLOW_NO_SANDBOX,
  databasePath: resolve(projectRoot, environment.DATABASE_PATH),
  usageSnapshotIntervalMilliseconds: environment.USAGE_SNAPSHOT_INTERVAL_MS,
  orbitSyncIntervalMilliseconds: environment.ORBIT_SYNC_INTERVAL_MS,
  orbitDocumentMaxBytes: environment.ORBIT_DOCUMENT_MAX_BYTES,
  orbitBackupDirectory: resolve(environment.ORBIT_BACKUP_DIR),
  orbitAssetDirectory: resolve(environment.ORBIT_ASSET_DIR),
  orbitAssetMaxFileBytes: environment.ORBIT_ASSET_MAX_FILE_BYTES,
  orbitAssetMaxTotalBytes: environment.ORBIT_ASSET_MAX_TOTAL_BYTES,
  fileGalleryDirectory: resolve(environment.FILE_GALLERY_DIR),
  fileGalleryMaxFileBytes: environment.FILE_GALLERY_MAX_FILE_BYTES,
  fileGalleryMaxTotalBytes: environment.FILE_GALLERY_MAX_TOTAL_BYTES,
  fileManagerTextPreviewBytes: environment.FILE_MANAGER_TEXT_PREVIEW_BYTES,
  fileManagerMaxUploadBytes: environment.FILE_MANAGER_MAX_UPLOAD_BYTES,
  orbitDestructiveDropPercent: environment.ORBIT_DESTRUCTIVE_DROP_PERCENT,
  orbitRevisionRetentionCount: environment.ORBIT_REVISION_RETENTION_COUNT,
  orbitConflictRetentionCount: environment.ORBIT_CONFLICT_RETENTION_COUNT,
  mistralApiKey: environment.MISTRAL_API_KEY,
  mistralApiBaseUrl: environment.MISTRAL_API_BASE_URL.replace(/\/$/, ""),
  mistralIngestModel: environment.MISTRAL_MODEL_INGEST,
  mistralChatModel: environment.MISTRAL_MODEL_CHAT,
  mistralEmbedModel: environment.MISTRAL_MODEL_EMBED,
  mistralTimeoutMilliseconds: environment.MISTRAL_TIMEOUT_MS,
  newsSyncIntervalMilliseconds: environment.NEWS_SYNC_INTERVAL_MS,
  newsFetchTimeoutMilliseconds: environment.NEWS_FETCH_TIMEOUT_MS,
  newsMaxItemsPerSource: environment.NEWS_MAX_ITEMS_PER_SOURCE,
  newsAiConcurrency: environment.NEWS_AI_CONCURRENCY,
  workbenchProfilesRoot: resolve(environment.WORKBENCH_PROFILES_ROOT),
  codexbarConfigPath: resolve(environment.CODEXBAR_CONFIG_PATH),
  // Gemeinsames Home und Name der Anmeldedatei je Werkzeug.
  sharedHomes: {
    codex: { sharedHome: resolve(environment.CODEX_SHARED_HOME), authFileName: "auth.json" },
    claude: { sharedHome: resolve(environment.CLAUDE_SHARED_HOME), authFileName: ".credentials.json" },
    opencode: { sharedHome: resolve(environment.OPENCODE_SHARED_HOME), authFileName: "auth.json" },
  },
  t3CliPath: resolve(environment.T3_CLI_PATH),
  t3NpmPackage: environment.T3_NPM_PACKAGE,
  t3Host: environment.T3_HOST,
  t3Port: environment.T3_PORT,
  t3ServiceUnit: environment.T3_SERVICE_UNIT,
  // Kanal beim Serverstart. Nur Ausgangswert — der aktuelle Wert kommt aus der Config.
  t3BootChannel: wb.t3.channel,
  skillEditor: {
    rootDirectory: skillEditorRoot,
    propagateDirectories: skillEditorPropagateDirectories,
    repositoryDirectory: wb.skillEditor.repositoryDirectory ? resolve(wb.skillEditor.repositoryDirectory) : null,
    autosaveDebounceMilliseconds: wb.skillEditor.autosaveDebounceMs,
    maxFileBytes: wb.skillEditor.maxFileBytes,
  },
  hermes: {
    enabled: environment.HERMES_ENABLED,
    host: environment.HERMES_HOST,
    port: environment.HERMES_PORT,
    proxyPrefix: environment.HERMES_PROXY_PREFIX,
    cliPath: hermesCliPath,
    homeDirectory: hermesHomeDirectory,
    checkoutDirectory: hermesCheckoutDirectory,
    pythonPath: hermesPythonPath,
    dashboardServiceUnit: environment.HERMES_DASHBOARD_UNIT,
    gatewayServiceUnit: environment.HERMES_GATEWAY_UNIT,
    updateServiceUnit: environment.HERMES_UPDATE_UNIT,
    defaultSurface: wb.hermes.defaultSurface,
    updateTime: wb.hermes.updateTime,
    updateTimezone: wb.hermes.updateTimezone,
    requestTimeoutSeconds: wb.hermes.requestTimeoutSeconds,
    startTimeoutSeconds: wb.hermes.startTimeoutSeconds,
    acpMaxSessions: wb.hermes.acpMaxSessions,
    acpIdleTimeoutSeconds: wb.hermes.acpIdleTimeoutSeconds,
    statusPollSeconds: wb.hermes.statusPollSeconds,
    taskPollSeconds: wb.hermes.taskPollSeconds,
    resultPollSeconds: wb.hermes.resultPollSeconds,
  },
});
