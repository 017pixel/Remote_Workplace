import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { constants as zlibConstants } from "node:zlib";
import compress from "@fastify/compress";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { apiErrorSchema, operationalMetricsSchema, readinessResponseSchema } from "@workbench/contracts";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerApiRoutes } from "./api/routes.js";
import { loadCommandsConfig, loadProjectsConfig, loadServicesConfig } from "./config/repository.js";
import { settings } from "./config/settings.js";
import { createCommandService } from "./services/commandService.js";
import { createProjectService } from "./services/projectService.js";
import { createServiceStatusService } from "./services/serviceStatusService.js";
import { registerEditorProxy } from "./services/editorProxy.js";
import { registerT3Proxy } from "./services/t3Proxy.js";
import { AppError } from "./utils/errors.js";
import { CodexbarClient } from "./adapters/codexbar/codexbar-client.js";
import { createCodexbarUsageService } from "./adapters/codexbar/codexbar-cache.js";
import { CodexOAuthPrimaryWindowFallback } from "./adapters/codexbar/codex-oauth-primary-window.js";
import { TerminalFailure, TerminalManager } from "./terminal/Manager.js";
import { TerminalDatabase } from "./terminal/database.js";
import { registerTerminalRoutes } from "./terminal/routes.js";
import { UsageDatabase } from "./usage/database.js";
import { UsageAnalyticsService } from "./usage/usage-service.js";
import { AccountService } from "./usage/account-service.js";
import { OrbitDatabase } from "./orbit/database.js";
import { OrbitAssetRepository } from "./orbit/assets.js";
import { createProjectFileService } from "./services/projectFileService.js";
import { createLocalPortService } from "./services/localPortService.js";
import { usageMonitoringService } from "./services/usageMonitoringService.js";
import { BrowserManager } from "./browser/Manager.js";
import { BrowserDatabase } from "./browser/database.js";
import { registerBrowserRoutes } from "./browser/routes.js";
import { NewsDatabase } from "./news/database.js";
import { NewsService } from "./news/news-service.js";
import { registerNewsRoutes } from "./news/routes.js";
import { ProjectActivityDatabase } from "./projects/activity-database.js";
import { ProjectActivityService } from "./projects/activity-service.js";
import { TmuxSupervisor } from "./terminal/TmuxSupervisor.js";
import { ProjectRegistryDatabase } from "./projects/registry-database.js";
import { ProjectBrowserService } from "./filesystem/projectBrowserService.js";
import { FileManagerService } from "./filesystem/fileManagerService.js";
import { SkillEditorService } from "./skills/skillEditorService.js";
import { PreviewSlotDatabase, PreviewSlotService } from "./previews/slots.js";
import { registerPreviewRoutes } from "./previews/routes.js";
import { PreviewSecrets } from "./previews/keys.js";
import { PreviewDiagnosticsService } from "./previews/diagnostics.js";
import { PreviewStorageService } from "./previews/storage.js";
import { PreviewRepairService } from "./previews/repair.js";
import { scanServiceCandidates } from "./previews/services.js";
import {
  isProtectedWorkbenchRequest,
  requestIdentity,
  requireMutationOrigin,
  resolveWorkbenchUser,
} from "./security/workbench-identity.js";
import { isAuditedMutation, OperationalAuditDatabase } from "./observability/audit.js";
import { OperationalMetrics } from "./observability/metrics.js";
import { registerHermesDashboardProxy } from "./hermes/dashboard-proxy.js";
import { registerHermesRoutes } from "./hermes/routes.js";
import { HermesDashboardClient } from "./hermes/client.js";
import { HermesAcpManager } from "./hermes/acp/Manager.js";
import { HermesSessionService } from "./hermes/session-service.js";
import { HermesStatusService } from "./hermes/status-service.js";
import { HermesResultSync } from "./hermes/result-sync.js";
import { NotificationDatabase } from "./notifications/database.js";
import { registerNotificationRoutes } from "./notifications/routes.js";
import { NotificationPushService } from "./notifications/push.js";
import { T3StatusSync } from "./notifications/t3-status-sync.js";
import { TerminalStatusSync } from "./notifications/terminal-status-sync.js";
import { AgentSessionSync } from "./notifications/agent-session-sync.js";

const require = createRequire(import.meta.url);
const devtoolsDirectory = dirname(require.resolve("@chrome-devtools/inspector/inspector.html"));

async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function buildApp(options: { startBackgroundServices?: boolean } = {}) {
  const app = Fastify({
    logger: { level: settings.logLevel },
    genReqId: () => randomUUID(),
    bodyLimit: Math.max(settings.orbitDocumentMaxBytes + 65_536, settings.orbitAssetMaxFileBytes + 1_048_576),
    trustProxy: ["127.0.0.1", "::1"],
  });
  const [projectsConfig, servicesConfig, commandsConfig] = await Promise.all([
    loadProjectsConfig(),
    loadServicesConfig(),
    loadCommandsConfig(),
  ]);

  const frameSources = new Set<string>(["'self'"]);
  for (const service of servicesConfig.services) {
    if (service.publicUrl !== null) frameSources.add(new URL(service.publicUrl).origin);
  }
  for (const project of projectsConfig.projects) {
    for (const preview of project.previews) {
      if (preview.url) frameSources.add(new URL(preview.url).origin);
    }
  }
  for (const publicPort of settings.previewPublicPorts) {
    frameSources.add(`https://${settings.tailscaleHostname}:${publicPort}`);
  }
  const proxyOrigins = [...frameSources].filter((origin) => origin !== "'self'");
  const usageDatabase = new UsageDatabase(settings.databasePath);
  const operationalAudit = new OperationalAuditDatabase(settings.databasePath, settings.auditVerifyCacheMilliseconds);
  const operationalMetrics = new OperationalMetrics();
  const projectActivityDatabase = new ProjectActivityDatabase(settings.databasePath);
  const projectRegistryDatabase = new ProjectRegistryDatabase(settings.databasePath);
  const browserDatabase = new BrowserDatabase(settings.databasePath);
  const previewSlotDatabase = new PreviewSlotDatabase(settings.databasePath);
  const previewSecrets = new PreviewSecrets(settings.dataDirectory);
  // Beim ersten Start anlegen, damit der lokale Doctor sofort arbeiten kann.
  previewSecrets.capabilityToken();
  const previewDiagnostics = new PreviewDiagnosticsService({
    directory: join(settings.dataDirectory, "preview-logs"),
    secrets: previewSecrets,
    retentionDays: settings.previews.diagnosticRetentionDays,
    maxEventBytes: settings.previews.diagnosticMaxEventBytes,
    maxDailyBytes: settings.previews.diagnosticMaxDailyBytes,
    maxTotalBytes: settings.previews.diagnosticMaxTotalBytes,
    enabled: settings.previews.diagnosticsEnabled,
  });
  // Workbench-Origins für den Bridge-Handshake und die Embedding-Regel.
  const workbenchOrigins = [
    `https://${settings.tailscaleHostname}:${settings.tailscaleHttpsPort}`,
    `http://127.0.0.1:${settings.port}`,
    `http://localhost:${settings.port}`,
  ];
  const previewSlots = new PreviewSlotService({
    database: previewSlotDatabase,
    slotPorts: settings.previewSlotPorts,
    publicPorts: settings.previewPublicPorts,
    hostname: settings.tailscaleHostname,
    forbiddenTargetPorts: [settings.port, settings.t3Port, settings.tailscaleHttpsPort],
    workbenchOrigins,
    flags: {
      gatewayV2Enabled: settings.previews.gatewayV2Enabled,
      bridgeEnabled: settings.previews.bridgeEnabled,
      diagnosticsEnabled: settings.previews.diagnosticsEnabled,
      storageSyncEnabled: settings.previews.storageSyncMode === "opt-in",
      slotResetEnabled: settings.previews.slotResetEnabled,
      maxInjectableHtmlBytes: settings.previews.maxInjectableHtmlBytes,
      maxStorageBytes: settings.previews.localStorageMaxBytes,
      maxStorageKeys: settings.previews.localStorageMaxKeys,
      loopbackPublicOrigins: settings.previews.publicOriginMode === "loopback-http",
    },
    // Gatewayereignisse gehören keiner Benutzersession; sie werden pseudonym geführt.
    onDiagnostic: (event) => previewDiagnostics.recordGateway(event, "system"),
  });
  const previewStorage = new PreviewStorageService({
    database: previewSlotDatabase,
    secrets: previewSecrets,
    mode: settings.previews.storageSyncMode,
    maxBytes: settings.previews.localStorageMaxBytes,
    maxKeys: settings.previews.localStorageMaxKeys,
  });
  const projectActivity = new ProjectActivityService({
    database: projectActivityDatabase,
    cacheMilliseconds: settings.projectActivityCacheMilliseconds,
    maximumDepth: settings.projectActivityMaximumDepth,
    maximumFiles: settings.projectActivityMaximumFiles,
  });
  const projectBrowser = await ProjectBrowserService.create(settings.orbitProjectBrowserRoot, settings.orbitProjectBrowserPageSize);
  const fileManager = new FileManagerService(
    settings.orbitProjectBrowserRoot,
    settings.fileManagerTextPreviewBytes,
    settings.fileManagerMaxUploadBytes,
    settings.databasePath,
  );
  const skillEditor = new SkillEditorService({
    rootDirectory: settings.skillEditor.rootDirectory,
    propagateDirectories: settings.skillEditor.propagateDirectories,
    repositoryDirectory: settings.skillEditor.repositoryDirectory,
    autosaveDebounceMilliseconds: settings.skillEditor.autosaveDebounceMilliseconds,
    maxFileBytes: settings.skillEditor.maxFileBytes,
  });
  const projects = createProjectService(projectsConfig, servicesConfig.services, undefined, projectActivity, projectRegistryDatabase);
  const terminalDatabase = new TerminalDatabase(settings.databasePath);
  const notificationDatabase = new NotificationDatabase(settings.databasePath, settings.notifications.pruneAfterHours);
  const notificationPush = new NotificationPushService({
    databasePath: settings.databasePath,
    dataDirectory: settings.dataDirectory,
    subject: settings.notifications.pushSubject,
    preferences: settings.notifications.preferences,
    notifications: notificationDatabase,
  });
  const t3StatusSync = new T3StatusSync({
    databasePath: join(settings.systemHomeDirectory, ".t3/userdata/state.sqlite"),
    environmentIdPath: join(settings.systemHomeDirectory, ".t3/userdata/environment-id"),
    notifications: notificationDatabase,
    pollSeconds: settings.notifications.pollSeconds,
    completionMinimumSeconds: settings.notifications.t3CompletionMinimumSeconds,
    miniTaskSeconds: settings.notifications.t3MiniTaskSeconds,
    cursorPath: join(settings.dataDirectory, "notifications/t3-status-cursor.json"),
  });
  const terminalStatusSync = new TerminalStatusSync({
    databasePath: settings.databasePath,
    notifications: notificationDatabase,
    pollSeconds: settings.notifications.pollSeconds,
    terminalMinimumSeconds: settings.notifications.terminalMinimumSeconds,
    agentMinimumSeconds: settings.notifications.agentMinimumSeconds,
  });
  const agentSessionSync = new AgentSessionSync({
    opencodeDatabasePath: join(settings.systemHomeDirectory, ".local/share/opencode/opencode.db"),
    t3DatabasePath: join(settings.systemHomeDirectory, ".t3/userdata/state.sqlite"),
    codexSessionsPath: join(settings.systemHomeDirectory, ".codex/sessions"),
    cursorPath: join(settings.dataDirectory, "notifications/agent-session-cursor.json"),
    notifications: notificationDatabase,
    pollSeconds: settings.notifications.pollSeconds,
    completionMinimumSeconds: settings.notifications.agentMinimumSeconds,
  });
  const hermesClient = new HermesDashboardClient();
  const hermesManager = new HermesAcpManager({
    maxSessions: settings.hermes.acpMaxSessions,
    requestTimeoutSeconds: settings.hermes.requestTimeoutSeconds,
  });
  const hermesSessions = new HermesSessionService(hermesClient, hermesManager, async () => (await projects.list()).projects);
  const hermesStatus = new HermesStatusService(hermesClient, hermesManager);
  const hermesResultSync = new HermesResultSync(hermesSessions, hermesManager, notificationDatabase);
  const orbitDatabase = new OrbitDatabase(settings.databasePath, settings.orbitBackupDirectory);
  const orbitAssets = new OrbitAssetRepository(settings.databasePath, settings.orbitAssetDirectory, settings.orbitAssetMaxFileBytes, settings.orbitAssetMaxTotalBytes);
  const fileGallery = new OrbitAssetRepository(settings.databasePath, settings.fileGalleryDirectory, settings.fileGalleryMaxFileBytes, settings.fileGalleryMaxTotalBytes, "file_gallery_files");
  const newsDatabase = new NewsDatabase(settings.databasePath);
  const news = new NewsService(newsDatabase);
  const codexbarClient = new CodexbarClient({ baseUrl: settings.codexbarBaseUrl, timeoutMilliseconds: settings.codexbarTimeoutMilliseconds, cliPath: settings.codexbarCliPath, claudeCliPath: settings.claudeCliPath, configPath: settings.codexbarConfigPath });
  const liveUsage = createCodexbarUsageService({
    client: codexbarClient,
    ttlMilliseconds: settings.codexbarCacheMilliseconds,
    monitoring: () => usageMonitoringService.get(),
    ...(settings.codexOauthPrimaryFallbackEnabled ? { primaryWindowFallback: new CodexOAuthPrimaryWindowFallback({ profileHomes: settings.codexOauthProfileHomes, configPath: settings.codexbarConfigPath, timeoutMilliseconds: settings.codexOauthTimeoutMilliseconds }) } : {}),
  });
  const analytics = new UsageAnalyticsService({ database: usageDatabase, client: codexbarClient, live: liveUsage, intervalMilliseconds: settings.usageSnapshotIntervalMilliseconds, monitoring: () => usageMonitoringService.get() });
  const accounts = new AccountService({ database: usageDatabase, allowedRoots: settings.terminalAllowedRoots, profilesRoot: settings.workbenchProfilesRoot, codexbarConfigPath: settings.codexbarConfigPath, codexbarCliPath: settings.codexbarCliPath, claudeCliPath: settings.claudeCliPath, sharedHomes: settings.sharedHomes });
  const projectFiles = createProjectFileService(projects);
  const localPorts = createLocalPortService({
    cacheMilliseconds: settings.localPortCacheMilliseconds,
    probeTimeoutMilliseconds: settings.localPortProbeTimeoutMilliseconds,
    excludedPorts: [
      settings.port,
      settings.t3Port,
      settings.tailscaleHttpsPort,
      ...settings.previewSlotPorts,
      ...settings.previewPublicPorts,
    ],
    projects: async () => projects.listReferences(),
  });

  await app.register(compress, {
    global: true,
    globalDecompression: false,
    threshold: settings.compressionThresholdBytes,
    encodings: ["br", "gzip"],
    brotliOptions: {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: settings.brotliQuality },
    },
  });
  await app.register(helmet, {
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: [...frameSources, "https://www.youtube-nocookie.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameAncestors: ["'self'"],
      },
    },
  });
  await app.register(rateLimit, {
    max: settings.apiRateLimitMax,
    timeWindow: "1 minute",
    // Vite and code-server legitimately load hundreds of assets and maintain
    // several sockets. Only the Workbench API belongs behind this limiter.
    //
    // `/health` bleibt ausgenommen: Jeder offene Tab fragt es alle 10 Sekunden ab,
    // der Neustart-Flow pollt es sekündlich, und es liefert nur Version und
    // Neustart-Marker. Es ist damit der billigste und häufigste Endpunkt — als
    // Erstes das Limit zu reißen, obwohl der Schutz teuren Endpunkten gilt, hat
    // schon den E2E-Lauf rot gefärbt. Das Limit zählt pro IP, und hinter dem
    // Tailscale-Proxy sehen alle Anfragen wie 127.0.0.1 aus: Es ist praktisch ein
    // gemeinsames Budget für sämtliche Tabs.
    allowList: (request) => !request.url.startsWith("/api/") || request.url.startsWith("/api/v1/health"),
    keyGenerator: (request) => {
      const identity = requestIdentity(request);
      // Ein beliebiger Headerwert darf keine neue Rate-Limit-Bucket eröffnen.
      // Nicht zugelassene Identitäten bleiben deshalb im IP-Bucket, während
      // bekannte Benutzer getrennt voneinander bewertet werden.
      const allowedUsers = settings.terminalAllowedUsers;
      if (identity && (allowedUsers.length === 0 || allowedUsers.includes(identity))) return identity;
      return request.ip;
    },
  });
  await app.register(websocket, {
    // code-server sends initialisation frames larger than 64 KiB. Terminal
    // input remains independently restricted by its Zod protocol schema.
    options: { maxPayload: settings.webSocketMaxPayloadBytes },
  });
  await app.register(multipart, { limits: { files: 1, fileSize: settings.orbitAssetMaxFileBytes } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(
        apiErrorSchema.parse({ error: { code: error.code, message: error.message, details: error.details, requestId: request.id, retryable: error.retryable } }),
      );
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(
        apiErrorSchema.parse({
          error: {
            code: "VALIDATION_ERROR",
            message: "Die Anfrage oder Konfiguration ist ungültig.",
            details: { issues: error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) },
            requestId: request.id,
            retryable: false,
          },
        }),
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 429
    ) {
      return reply.status(429).send(
        apiErrorSchema.parse({ error: { code: "RATE_LIMITED", message: "Zu viele Anfragen. Bitte kurz warten.", details: null, requestId: request.id, retryable: true } }),
      );
    }
    app.log.error({ err: error }, "Unbehandelter Serverfehler");
    return reply.status(500).send(
      apiErrorSchema.parse({ error: { code: "INTERNAL_ERROR", message: "Die Anfrage konnte nicht verarbeitet werden.", details: null, requestId: request.id, retryable: true } }),
    );
  });

  app.addHook("onSend", (request, reply, payload, done) => {
    reply.header("X-Request-Id", request.id);
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    done(null, payload);
  });

  app.addHook("onResponse", async (request, reply) => {
    operationalMetrics.finish(
      request,
      request.method,
      request.routeOptions.url ?? request.url.split("?", 1)[0] ?? "unbekannt",
      reply.statusCode,
    );
    if (!isAuditedMutation(request.method, request.url)) return;
    try {
      operationalAudit.record({
        requestId: request.id,
        actor: requestIdentity(request) ?? "unbekannt",
        action: `${request.method} ${request.routeOptions.url}`,
        target: request.url.split("?", 1)[0] ?? request.url,
        statusCode: reply.statusCode,
      });
    } catch (error) {
      request.log.error({ err: error }, "Audit-Eintrag konnte nicht geschrieben werden");
    }
  });

  const identityOptions = {
    allowedUsers: settings.terminalAllowedUsers,
    ...(settings.developmentTailscaleUser
      ? { developmentUser: settings.developmentTailscaleUser }
      : {}),
  };
  app.addHook("onRequest", async (request) => {
    operationalMetrics.start(request);
  });
  app.addHook("onRequest", async (request) => {
    if (!isProtectedWorkbenchRequest(request)) return;
    resolveWorkbenchUser(request, identityOptions);
    requireMutationOrigin(request);
  });

  await app.register(registerApiRoutes, {
    prefix: "/api/v1",
    projects,
    statuses: createServiceStatusService(servicesConfig.services),
    commands: createCommandService(commandsConfig),
    usage: liveUsage,
    analytics,
    accounts,
    orbit: orbitDatabase,
    orbitAssets,
    fileGallery,
    projectBrowser,
    fileManager,
    skillEditor,
    projectFiles,
    localPorts,
    previewSlots,
    proxyOrigins,
  });
  app.get("/api/v1/health/readiness", async (_request, reply) => {
    const checks = await Promise.all([
      ["database", settings.databasePath],
      ["data-directory", settings.dataDirectory],
    ].map(async ([name, path]) => {
      try {
        await access(path!, fsConstants.R_OK | fsConstants.W_OK);
        return { name: name!, status: "ok" as const };
      } catch {
        return { name: name!, status: "failed" as const };
      }
    }));
    const status = checks.every((check) => check.status === "ok") ? "ready" as const : "degraded" as const;
    return reply.status(status === "ready" ? 200 : 503).send(
      readinessResponseSchema.parse({ status, timestamp: new Date().toISOString(), checks }),
    );
  });
  app.get("/api/v1/system/operational-metrics", async () => operationalMetricsSchema.parse({
    ...operationalMetrics.snapshot(),
    audit: operationalAudit.verify(),
    orbit: orbitDatabase.maintenanceStatus(),
    preview: (() => {
      const slots = previewSlots.list().slots;
      return {
        totalSlots: slots.length,
        freeSlots: slots.filter((slot) => slot.state === "free").length,
        resettingSlots: slots.filter((slot) => slot.state === "resetting").length,
        quarantinedSlots: slots.filter((slot) => slot.state === "quarantined").length,
      };
    })(),
  }));
  const scanCandidates = async () => scanServiceCandidates({
    ports: (await localPorts.list()).ports,
    projects: await projects.listReferences(),
    probeTimeoutMilliseconds: settings.localPortProbeTimeoutMilliseconds,
  });
  const previewRepair = new PreviewRepairService({ database: previewSlotDatabase, slots: previewSlots, scanCandidates });
  await app.register(registerPreviewRoutes, {
    prefix: "/api/v1",
    slots: previewSlots,
    database: previewSlotDatabase,
    diagnostics: previewDiagnostics,
    storage: previewStorage,
    repair: previewRepair,
    secrets: previewSecrets,
    identity: identityOptions,
    scanCandidates,
    diagnosticsEnabled: settings.previews.diagnosticsEnabled,
    diagnosticMaxBatchBytes: settings.previews.diagnosticMaxBatchBytes,
    diagnosticRetentionDays: settings.previews.diagnosticRetentionDays,
  });
  await app.register(registerNewsRoutes, { prefix: "/api/v1", news, newsDatabase });
  await app.register(registerHermesRoutes, {
    prefix: "/api/v1",
    client: hermesClient,
    manager: hermesManager,
    sessions: hermesSessions,
    status: hermesStatus,
    resolveProjectCwd: async (projectId) => {
      if (projectId === null) return settings.terminalDefaultCwd;
      const { project } = await projects.get(projectId);
      if (project.availability !== "available") throw new AppError(400, "PROJECT_NOT_FOUND", "Das gewählte Projekt ist momentan nicht verfügbar.");
      return project.path;
    },
  });
  await app.register(registerNotificationRoutes, { prefix: "/api/v1", database: notificationDatabase, push: notificationPush, configDirectory: settings.configDirectory });
  const terminalSupervisor = settings.terminalSupervisor === "tmux" ? new TmuxSupervisor(settings.tmuxPath) : null;
  const terminals = new TerminalManager({
    allowedRoots: settings.terminalAllowedRoots,
    defaultCwd: settings.terminalDefaultCwd,
    maxSessions: settings.terminalMaxSessions + settings.codexMaxSessions + settings.opencodeMaxSessions + settings.claudeMaxSessions,
    maxSessionsByKind: {
      shell: settings.terminalMaxSessions,
      codex: settings.codexMaxSessions,
      opencode: settings.opencodeMaxSessions,
      claude: settings.claudeMaxSessions,
    },
    cliPaths: { codex: settings.codexCliPath, opencode: settings.opencodeCliPath, claude: settings.claudeCliPath },
    database: terminalDatabase,
    onOutput: (session, data) => {
      if (session.kind === "shell" || Date.now() - session.createdAt < 10_000) return;
      if (/\b(?:approval required|needs? (?:your )?input|do you want to|permission required|press enter|continue\?)\b/i.test(data)) terminalStatusSync.noteWaiting(session);
    },
    onInput: (session) => terminalStatusSync.resolveWaiting(session.kind, session.id),
    ...(terminalSupervisor ? { supervisor: terminalSupervisor } : {}),
    ...(settings.terminalAllowedUsers.length === 1 ? { externalSessionOwnerId: settings.terminalAllowedUsers[0] } : {}),
    resolveAccountProfile: (accountId, kind) => {
      const account = usageDatabase.getAccount(accountId);
      if (account.provider !== kind) throw new Error("Provider mismatch");
      return account.profilePath;
    },
  });
  const browsers = new BrowserManager({
    chromiumPath: settings.chromiumPath,
    profilesRoot: settings.browserProfilesRoot,
    database: browserDatabase,
    maxSessions: settings.browserMaxSessions,
    startupTimeoutMilliseconds: settings.browserStartupTimeoutMilliseconds,
    idleTimeoutMilliseconds: settings.browserIdleTimeoutMilliseconds,
    captureMaxWidth: settings.browserCaptureMaxWidth,
    captureMaxHeight: settings.browserCaptureMaxHeight,
    captureMaxScale: settings.browserCaptureMaxScale,
    captureJpegQuality: settings.browserCaptureJpegQuality,
    captureEveryNthFrame: settings.browserCaptureEveryNthFrame,
    allowNoSandbox: settings.browserAllowNoSandbox,
  });
  await app.register(registerTerminalRoutes, {
    prefix: "/api/v1",
    manager: terminals,
    database: terminalDatabase,
    allowedUsers: settings.terminalAllowedUsers,
    resolveProjectPath: async (projectId) => {
      try {
        const { project } = await projects.get(projectId);
        if (project.availability !== "available") {
          throw new TerminalFailure("INVALID_CWD", "Das gewählte Projekt ist momentan nicht verfügbar.");
        }
        return project.path;
      } catch (error) {
        if (error instanceof TerminalFailure) throw error;
        throw new TerminalFailure("INVALID_CWD", "Das gewählte Projekt wurde nicht gefunden.");
      }
    },
  });
  await app.register(registerBrowserRoutes, {
    prefix: "/api/v1",
    manager: browsers,
    allowedUsers: settings.terminalAllowedUsers,
  });
  let previewLogRotation: NodeJS.Timeout | null = null;
  if (options.startBackgroundServices !== false) {
    analytics.start();
    news.start();
    hermesResultSync.start();
    t3StatusSync.start();
    terminalStatusSync.start();
    agentSessionSync.start();
    await previewSlots.startListeners();
    if (settings.previews.diagnosticsEnabled) {
      // Tageswechsel: abgeschlossene Tage komprimieren, alte Tage entfernen.
      previewLogRotation = setInterval(() => {
        void previewDiagnostics.rotate().catch((error) => app.log.error({ err: error }, "Preview-Logrotation fehlgeschlagen"));
      }, 3_600_000);
      previewLogRotation.unref();
      void previewDiagnostics.rotate().catch((error) => app.log.error({ err: error }, "Initiale Preview-Logrotation fehlgeschlagen"));
    }
  }
  app.addHook("onClose", async () => { await news.stop(); await analytics.stop(); await hermesResultSync.stop(); t3StatusSync.stop(); terminalStatusSync.stop(); agentSessionSync.stop(); await previewSlots.stopListeners(); if (previewLogRotation) clearInterval(previewLogRotation); await previewDiagnostics.close(); await hermesManager.close(); terminals.shutdown(); await browsers.shutdown(); operationalMetrics.close(); previewSlotDatabase.close(); terminalDatabase.close(); notificationPush.close(); notificationDatabase.close(); browserDatabase.close(); newsDatabase.close(); orbitDatabase.close(); orbitAssets.close(); fileGallery.close(); fileManager.close(); projectRegistryDatabase.close(); projectActivityDatabase.close(); operationalAudit.close(); usageDatabase.close(); });

  await registerEditorProxy(app);
  await registerT3Proxy(app);
  await registerHermesDashboardProxy(app);

  const hasWebBuild = await directoryExists(join(settings.webDistDirectory, "index.html"));
  if (hasWebBuild) {
    await app.register(fastifyStatic, {
      root: settings.webDistDirectory,
      prefix: "/workbench/",
      preCompressed: true,
      setHeaders: (response, filePath) => {
        if (filePath.includes("/assets/")) {
          response.header("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
          response.header("Cache-Control", "no-cache");
          return;
        }
        if (filePath.includes("/icons/") || filePath.endsWith("favicon.svg")) {
          response.header("Cache-Control", "public, max-age=604800");
        }
      },
    });
    await app.register(fastifyStatic, {
      root: devtoolsDirectory,
      prefix: "/workbench/devtools/",
      decorateReply: false,
      setHeaders: (response, filePath) => {
        response.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; frame-ancestors 'self'");
        response.header("Cache-Control", filePath.endsWith("inspector.html") ? "no-cache" : "public, max-age=31536000, immutable");
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send(
        apiErrorSchema.parse({ error: { code: "NOT_FOUND", message: "Der API-Endpunkt wurde nicht gefunden.", details: null, requestId: request.id, retryable: false } }),
      );
    }
    // Nur echte HTML-Navigationen bekommen den SPA-Fallback. Liefert ein
    // fehlender JavaScript-Chunk stattdessen index.html mit Status 200, meldet
    // der Browser nur einen irreführenden Modulfehler und der Prefetch-Promise
    // wird zum unhandledrejection.
    const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
    if (hasWebBuild && request.url.startsWith("/workbench") && acceptsHtml) {
      return reply.type("text/html").sendFile("index.html");
    }
    if (hasWebBuild) return reply.status(404).send("Nicht gefunden.");
    return reply.status(503).send("Frontend-Build ist noch nicht vorhanden.");
  });

  return app;
}
