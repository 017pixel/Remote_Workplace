import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
dotenv.config({ path: resolve(projectRoot, ".env") });

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
  HOST: z.string().default("127.0.0.1"),
  PORT: integerFromEnvironment(3010),
  APP_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.20.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CONFIG_DIR: z.string().default("./config"),
  WEB_DIST_DIR: z.string().default("./apps/web/dist"),
  PROJECTS_ROOT: z.string().startsWith("/").default("/home/bbecker/projects"),
  PROJECT_DISCOVERY_ENABLED: booleanFromEnvironment(true),
  METRICS_CACHE_MS: integerFromEnvironment(5_000),
  SUMMARY_CACHE_MS: integerFromEnvironment(30_000),
  SERVICE_CACHE_MS: integerFromEnvironment(10_000),
  LOCAL_PORT_CACHE_MS: integerFromEnvironment(5_000),
  LOCAL_PORT_PROBE_TIMEOUT_MS: boundedIntegerFromEnvironment(450, 100, 3_000),
  REQUEST_TIMEOUT_MS: integerFromEnvironment(3_000),
  COMPRESSION_THRESHOLD_BYTES: integerFromEnvironment(1_024),
  BROTLI_QUALITY: boundedIntegerFromEnvironment(4, 0, 11),
  API_RATE_LIMIT_MAX: integerFromEnvironment(180),
  WEBSOCKET_MAX_PAYLOAD_BYTES: integerFromEnvironment(16 * 1024 * 1024),
  CODEXBAR_BASE_URL: localhostUrl.default("http://127.0.0.1:18181"),
  CODEXBAR_CACHE_MS: integerFromEnvironment(60_000),
  CODEXBAR_TIMEOUT_MS: integerFromEnvironment(35_000),
  CODEXBAR_CLI_PATH: z.string().min(1).default("/home/bbecker/.local/bin/codexbar"),
  CODEX_OAUTH_PRIMARY_FALLBACK: booleanFromEnvironment(false),
  CODEX_OAUTH_PROFILE_HOMES: profileHomesFromEnvironment.default([]),
  CODEX_OAUTH_TIMEOUT_MS: integerFromEnvironment(5_000),
  PROXY_TIMEOUT_MS: integerFromEnvironment(15_000),
  TERMINAL_ALLOWED_USERS: commaSeparatedValues.default([]),
  TERMINAL_ALLOWED_ROOTS: profileHomesFromEnvironment.default(["/home/bbecker"]),
  TERMINAL_DEFAULT_CWD: z.string().startsWith("/").default("/home/bbecker"),
  TERMINAL_MAX_SESSIONS: integerFromEnvironment(24),
  CODEX_CLI_PATH: z.string().min(1).default("/home/bbecker/.local/bin/codex"),
  OPENCODE_CLI_PATH: z.string().min(1).default("/home/bbecker/.npm-global/bin/opencode"),
  CODEX_MAX_SESSIONS: integerFromEnvironment(12),
  OPENCODE_MAX_SESSIONS: integerFromEnvironment(12),
  CHROMIUM_PATH: z.string().min(1).default("auto"),
  BROWSER_MAX_SESSIONS: boundedIntegerFromEnvironment(4, 1, 12),
  BROWSER_STARTUP_TIMEOUT_MS: boundedIntegerFromEnvironment(15_000, 2_000, 60_000),
  BROWSER_IDLE_TIMEOUT_MS: boundedIntegerFromEnvironment(1_800_000, 60_000, 86_400_000),
  BROWSER_CAPTURE_MAX_WIDTH: boundedIntegerFromEnvironment(2_560, 1_280, 7_680),
  BROWSER_CAPTURE_MAX_HEIGHT: boundedIntegerFromEnvironment(1_800, 720, 4_320),
  BROWSER_CAPTURE_MAX_SCALE: boundedIntegerFromEnvironment(2, 1, 3),
  BROWSER_CAPTURE_JPEG_QUALITY: boundedIntegerFromEnvironment(90, 60, 100),
  BROWSER_CAPTURE_EVERY_NTH_FRAME: boundedIntegerFromEnvironment(2, 1, 6),
  DATABASE_PATH: z.string().default("./data/workbench.sqlite"),
  USAGE_SNAPSHOT_INTERVAL_MS: integerFromEnvironment(300_000),
  ORBIT_SYNC_INTERVAL_MS: boundedIntegerFromEnvironment(5_000, 1_000, 60_000),
  ORBIT_DOCUMENT_MAX_BYTES: boundedIntegerFromEnvironment(4 * 1024 * 1024, 65_536, 8 * 1024 * 1024),
  ORBIT_BACKUP_DIR: z.string().startsWith("/").default("/home/bbecker/.local/share/remote-workplace/orbit-backups"),
  ORBIT_DESTRUCTIVE_DROP_PERCENT: boundedIntegerFromEnvironment(50, 10, 100),
  MISTRAL_API_KEY: z.string().default(""),
  MISTRAL_API_BASE_URL: z.url().default("https://api.mistral.ai/v1"),
  MISTRAL_MODEL_INGEST: z.string().min(1).default("mistral-small-2603"),
  MISTRAL_MODEL_CHAT: z.string().min(1).default("mistral-medium-3-5"),
  MISTRAL_MODEL_EMBED: z.string().min(1).default("mistral-embed-2312"),
  NEWS_SYNC_INTERVAL_MS: boundedIntegerFromEnvironment(1_800_000, 300_000, 86_400_000),
  NEWS_FETCH_TIMEOUT_MS: boundedIntegerFromEnvironment(12_000, 2_000, 60_000),
  NEWS_MAX_ITEMS_PER_SOURCE: boundedIntegerFromEnvironment(16, 1, 50),
  NEWS_AI_CONCURRENCY: boundedIntegerFromEnvironment(1, 1, 4),
  WORKBENCH_PROFILES_ROOT: z.string().startsWith("/").default("/home/bbecker/.workbench-profiles"),
  CODEXBAR_CONFIG_PATH: z.string().startsWith("/").default("/home/bbecker/.config/codexbar/config.json"),
});

const environment = settingsSchema.parse(process.env);

export const settings = Object.freeze({
  host: environment.HOST,
  port: environment.PORT,
  appVersion: environment.APP_VERSION,
  logLevel: environment.LOG_LEVEL,
  configDirectory: resolve(projectRoot, environment.CONFIG_DIR),
  webDistDirectory: resolve(projectRoot, environment.WEB_DIST_DIR),
  projectsRootDirectory: resolve(environment.PROJECTS_ROOT),
  projectDiscoveryEnabled: environment.PROJECT_DISCOVERY_ENABLED,
  metricsCacheMilliseconds: environment.METRICS_CACHE_MS,
  summaryCacheMilliseconds: environment.SUMMARY_CACHE_MS,
  serviceCacheMilliseconds: environment.SERVICE_CACHE_MS,
  localPortCacheMilliseconds: environment.LOCAL_PORT_CACHE_MS,
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
  terminalAllowedUsers: environment.TERMINAL_ALLOWED_USERS.map((user) => user.toLowerCase()),
  terminalAllowedRoots: environment.TERMINAL_ALLOWED_ROOTS.map((path) => resolve(path)),
  terminalDefaultCwd: resolve(environment.TERMINAL_DEFAULT_CWD),
  terminalMaxSessions: environment.TERMINAL_MAX_SESSIONS,
  codexCliPath: environment.CODEX_CLI_PATH,
  opencodeCliPath: environment.OPENCODE_CLI_PATH,
  codexMaxSessions: environment.CODEX_MAX_SESSIONS,
  opencodeMaxSessions: environment.OPENCODE_MAX_SESSIONS,
  chromiumPath: environment.CHROMIUM_PATH,
  browserMaxSessions: environment.BROWSER_MAX_SESSIONS,
  browserStartupTimeoutMilliseconds: environment.BROWSER_STARTUP_TIMEOUT_MS,
  browserIdleTimeoutMilliseconds: environment.BROWSER_IDLE_TIMEOUT_MS,
  browserCaptureMaxWidth: environment.BROWSER_CAPTURE_MAX_WIDTH,
  browserCaptureMaxHeight: environment.BROWSER_CAPTURE_MAX_HEIGHT,
  browserCaptureMaxScale: environment.BROWSER_CAPTURE_MAX_SCALE,
  browserCaptureJpegQuality: environment.BROWSER_CAPTURE_JPEG_QUALITY,
  browserCaptureEveryNthFrame: environment.BROWSER_CAPTURE_EVERY_NTH_FRAME,
  databasePath: resolve(projectRoot, environment.DATABASE_PATH),
  usageSnapshotIntervalMilliseconds: environment.USAGE_SNAPSHOT_INTERVAL_MS,
  orbitSyncIntervalMilliseconds: environment.ORBIT_SYNC_INTERVAL_MS,
  orbitDocumentMaxBytes: environment.ORBIT_DOCUMENT_MAX_BYTES,
  orbitBackupDirectory: resolve(environment.ORBIT_BACKUP_DIR),
  orbitDestructiveDropPercent: environment.ORBIT_DESTRUCTIVE_DROP_PERCENT,
  mistralApiKey: environment.MISTRAL_API_KEY,
  mistralApiBaseUrl: environment.MISTRAL_API_BASE_URL.replace(/\/$/, ""),
  mistralIngestModel: environment.MISTRAL_MODEL_INGEST,
  mistralChatModel: environment.MISTRAL_MODEL_CHAT,
  mistralEmbedModel: environment.MISTRAL_MODEL_EMBED,
  newsSyncIntervalMilliseconds: environment.NEWS_SYNC_INTERVAL_MS,
  newsFetchTimeoutMilliseconds: environment.NEWS_FETCH_TIMEOUT_MS,
  newsMaxItemsPerSource: environment.NEWS_MAX_ITEMS_PER_SOURCE,
  newsAiConcurrency: environment.NEWS_AI_CONCURRENCY,
  workbenchProfilesRoot: resolve(environment.WORKBENCH_PROFILES_ROOT),
  codexbarConfigPath: resolve(environment.CODEXBAR_CONFIG_PATH),
});
