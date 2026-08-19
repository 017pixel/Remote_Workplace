import { join } from "node:path";
import type { PreviewServiceEdge } from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { CodexOAuthPrimaryWindowFallback } from "../adapters/codexbar/codex-oauth-primary-window.js";
import { CodexbarClient } from "../adapters/codexbar/codexbar-client.js";
import { createCodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import { BrowserDatabase } from "../browser/database.js";
import { BrowserManager } from "../browser/Manager.js";
import { loadCommandsConfig, loadProjectsConfig, loadServicesConfig } from "../config/repository.js";
import { settings } from "../config/settings.js";
import { ExtensionDatabase } from "../extensions/database.js";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "../extensions/catalog.js";
import { ExtensionManager } from "../extensions/manager.js";
import { FileManagerService } from "../filesystem/fileManagerService.js";
import { ProjectBrowserService } from "../filesystem/projectBrowserService.js";
import { HermesDashboardClient } from "../hermes/client.js";
import { HermesAcpManager } from "../hermes/acp/Manager.js";
import { HermesSessionService } from "../hermes/session-service.js";
import { HermesStatusService } from "../hermes/status-service.js";
import { HermesResultSync } from "../hermes/result-sync.js";
import { NewsDatabase } from "../news/database.js";
import { NewsService } from "../news/news-service.js";
import { AgentSessionSync } from "../notifications/agent-session-sync.js";
import { NotificationDatabase } from "../notifications/database.js";
import { NotificationPushService } from "../notifications/push.js";
import { T3StatusSync } from "../notifications/t3-status-sync.js";
import { TerminalStatusSync } from "../notifications/terminal-status-sync.js";
import { OperationalAuditDatabase } from "../observability/audit.js";
import { OperationalMetrics } from "../observability/metrics.js";
import { OrbitAssetRepository } from "../orbit/assets.js";
import { OrbitDatabase } from "../orbit/database.js";
import { PreviewDevServerDatabase } from "../previews/devServerDatabase.js";
import { PreviewDevServerManager } from "../previews/DevServerManager.js";
import { PreviewDiagnosticsService } from "../previews/diagnostics.js";
import { PreviewSecrets } from "../previews/keys.js";
import { PreviewRepairService } from "../previews/repair.js";
import { scanServiceCandidates } from "../previews/services.js";
import { PreviewSlotDatabase, PreviewSlotService } from "../previews/slots.js";
import { PreviewStorageService } from "../previews/storage.js";
import { ProjectActivityDatabase } from "../projects/activity-database.js";
import { ProjectActivityService } from "../projects/activity-service.js";
import { ProjectRegistryDatabase } from "../projects/registry-database.js";
import { EditorOpenSecrets } from "../services/editorOpen.js";
import { createLocalPortService } from "../services/localPortService.js";
import { createProjectFileService } from "../services/projectFileService.js";
import { createProjectService } from "../services/projectService.js";
import { usageMonitoringService } from "../services/usageMonitoringService.js";
import type { WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import { SkillEditorService } from "../skills/skillEditorService.js";
import { TerminalDatabase } from "../terminal/database.js";
import { TerminalManager } from "../terminal/Manager.js";
import { defaultTerminalSocketPath, TmuxSupervisor } from "../terminal/TmuxSupervisor.js";
import { AccountService } from "../usage/account-service.js";
import { UsageDatabase } from "../usage/database.js";
import { UsageTimelineService } from "../usage/timeline-service.js";
import { UsageAnalyticsService } from "../usage/usage-service.js";
import { AppError } from "../utils/errors.js";

export async function createAppDependencies(app: FastifyInstance) {
  const [projectsConfig, servicesConfig, commandsConfig] = await Promise.all([
    loadProjectsConfig(),
    loadServicesConfig(),
    loadCommandsConfig(),
  ]);
  const identityOptions: WorkbenchIdentityOptions = {
    allowedUsers: settings.terminalAllowedUsers,
    ...(settings.developmentTailscaleUser
      ? { developmentUser: settings.developmentTailscaleUser }
      : {}),
  };

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
  if (settings.previews.publicOriginMode === "loopback-http") {
    for (const slotPort of settings.previewSlotPorts) {
      frameSources.add(`http://127.0.0.1:${slotPort}`);
      frameSources.add(`http://localhost:${slotPort}`);
    }
  }
  const proxyOrigins = [...frameSources].filter((origin) => origin !== "'self'");

  const usageDatabase = new UsageDatabase(settings.databasePath);
  const operationalAudit = new OperationalAuditDatabase(settings.databasePath, settings.auditVerifyCacheMilliseconds);
  const operationalMetrics = new OperationalMetrics();
  const projectActivityDatabase = new ProjectActivityDatabase(settings.databasePath);
  const projectRegistryDatabase = new ProjectRegistryDatabase(settings.databasePath);
  const browserDatabase = new BrowserDatabase(settings.databasePath);
  const previewSlotDatabase = new PreviewSlotDatabase(settings.databasePath);
  const previewDevServerDatabase = new PreviewDevServerDatabase(settings.databasePath);
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
    forbiddenTargetPorts: [settings.port, settings.t3Port, settings.opencodeWebPort, settings.tailscaleHttpsPort],
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
  const extensionDatabase = new ExtensionDatabase(join(settings.dataDirectory, "extensions.sqlite"));
  const extensionManager = new ExtensionManager(extensionDatabase);
  const extensionCatalog = new LocalExtensionCatalog(defaultCatalogProviderId(), app.log);
  extensionCatalog.addSourceDirectory(join(settings.dataDirectory, "extension-catalog"));
  extensionManager.attachCatalog(extensionCatalog);
  const notificationPush = new NotificationPushService({
    databasePath: settings.databasePath,
    dataDirectory: settings.dataDirectory,
    subject: settings.notifications.pushSubject,
    preferences: settings.notifications.preferences,
    notifications: notificationDatabase,
    logger: app.log,
  });
  const t3StatusSync = new T3StatusSync({
    databasePath: join(settings.systemHomeDirectory, ".t3/userdata/state.sqlite"),
    environmentIdPath: join(settings.systemHomeDirectory, ".t3/userdata/environment-id"),
    notifications: notificationDatabase,
    pollSeconds: settings.notifications.pollSeconds,
    completionMinimumSeconds: settings.notifications.t3CompletionMinimumSeconds,
    miniTaskSeconds: settings.notifications.t3MiniTaskSeconds,
    cursorPath: join(settings.dataDirectory, "notifications/t3-status-cursor.json"),
    remoteSources: settings.notifications.t3RemoteSyncs,
  });
  const terminalStatusSync = new TerminalStatusSync({
    databasePath: settings.databasePath,
    notifications: notificationDatabase,
    pollSeconds: settings.notifications.pollSeconds,
    terminalMinimumSeconds: settings.notifications.terminalMinimumSeconds,
    agentMinimumSeconds: settings.notifications.agentMinimumSeconds,
    inputIdleMilliseconds: settings.notifications.terminalInputIdleMilliseconds,
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
  const analytics = new UsageAnalyticsService({ database: usageDatabase, client: codexbarClient, live: liveUsage, intervalMilliseconds: settings.usageSnapshotIntervalMilliseconds, monitoring: () => usageMonitoringService.get(), opencodeUsagePath: join(settings.sharedHomes.opencode.sharedHome, "opencode.db") });
  const accounts = new AccountService({ database: usageDatabase, allowedRoots: settings.terminalAllowedRoots, profilesRoot: settings.wraptProfilesRoot, codexbarConfigPath: settings.codexbarConfigPath, codexbarCliPath: settings.codexbarCliPath, claudeCliPath: settings.claudeCliPath, sharedHomes: settings.sharedHomes });
  const usageTimeline = new UsageTimelineService({ accounts, client: codexbarClient, live: liveUsage, database: usageDatabase, ttlMilliseconds: settings.codexbarCacheMilliseconds });
  const projectFiles = createProjectFileService(projects);
  const localPorts = createLocalPortService({
    cacheMilliseconds: settings.localPortCacheMilliseconds,
    probeTimeoutMilliseconds: settings.localPortProbeTimeoutMilliseconds,
    excludedPorts: [
      settings.port,
      settings.t3Port,
      settings.opencodeWebPort,
      settings.tailscaleHttpsPort,
      ...settings.previewSlotPorts,
      ...settings.previewPublicPorts,
    ],
    projects: async () => projects.listReferences(),
  });
  const previewDevServers = new PreviewDevServerManager({
    database: previewDevServerDatabase,
    tmuxExecutable: settings.tmuxPath,
    allowedProjectPorts: settings.previews.allowedProjectPorts,
    logBytes: settings.previews.devServerLogBytes,
    startTimeoutMilliseconds: settings.previews.devServerStartTimeoutMilliseconds,
    project: async (projectId) => (await projects.get(projectId)).project,
    // Starts und Neustarts brauchen einen frischen Scan; der normale
    // Port-Dashboard-Cache könnte einen soeben beendeten eigenen Dienst sonst
    // noch als Konflikt melden.
    localPorts: async () => (await localPorts.list(true)).ports,
    publishRuntime: async (userId, profile) => {
      const main = profile.services.find((service) => service.id === profile.mainServiceId && service.port !== null);
      if (!main?.port) throw new AppError(409, "PREVIEW_RUNTIME_MAIN_SERVICE_MISSING", "Die Projektlaufzeit besitzt keinen Hauptdienst mit Browser-Port.");
      const edges: PreviewServiceEdge[] = profile.services.filter((service) => service.id !== main.id && service.port !== null).map((service) => ({
        serviceId: `runtime:${service.id}`,
        projectId: profile.projectId,
        port: service.port!,
        protocol: service.role === "socket" ? "ws" : "http",
        role: service.role === "socket" ? "socket" : ["api", "backend"].includes(service.role) ? "api" : service.role === "frontend" ? "asset" : "other",
        label: service.name,
        probeStatus: "unknown",
        source: "detected",
        confirmedAt: new Date().toISOString(),
      }));
      previewSlots.saveServiceGraph(profile.projectId, String(main.port), edges);
      const session = previewSlots.openSession(userId, {
        sessionKey: `preview-runtime:${profile.projectId}`,
        projectId: profile.projectId,
        primaryPort: main.port,
        primaryProtocol: "http",
        isolate: false,
        storageProfileId: null,
      });
      const primary = session.bindings.find((binding) => binding.role === "primary");
      if (!primary) throw new AppError(500, "PREVIEW_RUNTIME_PUBLICATION_FAILED", "Der veröffentlichte Hauptdienst fehlt.");
      return { url: primary.publicUrl, sessionId: session.id };
    },
    logger: (message) => app.log.warn({ component: "preview-dev-server-watchdog" }, message),
  });
  const scanCandidates = async () => scanServiceCandidates({
    ports: (await localPorts.list()).ports,
    projects: await projects.listReferences(),
    probeTimeoutMilliseconds: settings.localPortProbeTimeoutMilliseconds,
  });
  const previewRepair = new PreviewRepairService({ database: previewSlotDatabase, slots: previewSlots, scanCandidates });
  // Dedizierter tmux-Socket unter $XDG_RUNTIME_DIR: Der Supervisor läuft als
  // eigene systemd-Unit (wrapt-terminal-supervisor.service) und überlebt
  // Backend-Neustarts. Die Workbench verbindet sich nur mit dem Server.
  const terminalSupervisor = settings.terminalSupervisor === "tmux" ? new TmuxSupervisor(settings.tmuxPath, settings.tmuxSocketPath ?? defaultTerminalSocketPath()) : null;
  if (settings.runtimeMode === "production") terminalSupervisor?.ensureSupervisorUnit();
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
      // Shell-Ausgabe interessiert nicht; bei Agenten entscheidet die
      // Pause-Heuristik im Sync, ob der Nutzer wirklich gebraucht wird.
      terminalStatusSync.noteOutput(session, data);
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
  const editorOpenSecrets = new EditorOpenSecrets(settings.dataDirectory);

  return {
    projectsConfig,
    servicesConfig,
    commandsConfig,
    identityOptions,
    frameSources,
    proxyOrigins,
    usageDatabase,
    operationalAudit,
    operationalMetrics,
    projectActivityDatabase,
    projectRegistryDatabase,
    browserDatabase,
    previewSlotDatabase,
    previewDevServerDatabase,
    previewSecrets,
    previewDiagnostics,
    previewSlots,
    previewStorage,
    projectActivity,
    projectBrowser,
    fileManager,
    skillEditor,
    projects,
    terminalDatabase,
    notificationDatabase,
    extensionDatabase,
    extensionManager,
    extensionCatalog,
    notificationPush,
    t3StatusSync,
    terminalStatusSync,
    agentSessionSync,
    hermesClient,
    hermesManager,
    hermesSessions,
    hermesStatus,
    hermesResultSync,
    orbitDatabase,
    orbitAssets,
    fileGallery,
    newsDatabase,
    news,
    codexbarClient,
    liveUsage,
    analytics,
    accounts,
    usageTimeline,
    projectFiles,
    localPorts,
    previewDevServers,
    previewRepair,
    scanCandidates,
    terminalSupervisor,
    terminals,
    browsers,
    editorOpenSecrets,
  };
}

export type AppDependencies = Awaited<ReturnType<typeof createAppDependencies>>;
