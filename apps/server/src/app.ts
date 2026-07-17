import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { constants as zlibConstants } from "node:zlib";
import compress from "@fastify/compress";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { apiErrorSchema } from "@workbench/contracts";
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
import { registerTerminalRoutes } from "./terminal/routes.js";
import { UsageDatabase } from "./usage/database.js";
import { UsageAnalyticsService } from "./usage/usage-service.js";
import { AccountService } from "./usage/account-service.js";
import { OrbitDatabase } from "./orbit/database.js";
import { createProjectFileService } from "./services/projectFileService.js";
import { createLocalPortService } from "./services/localPortService.js";
import { BrowserManager } from "./browser/Manager.js";
import { registerBrowserRoutes } from "./browser/routes.js";
import { NewsDatabase } from "./news/database.js";
import { NewsService } from "./news/news-service.js";
import { registerNewsRoutes } from "./news/routes.js";

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

export async function buildApp() {
  const app = Fastify({
    logger: { level: settings.logLevel },
    bodyLimit: settings.orbitDocumentMaxBytes + 65_536,
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
    for (const preview of project.previews) frameSources.add(new URL(preview.url).origin);
  }
  const proxyOrigins = [...frameSources].filter((origin) => origin !== "'self'");
  const projects = createProjectService(projectsConfig, servicesConfig.services);
  const usageDatabase = new UsageDatabase(settings.databasePath);
  const orbitDatabase = new OrbitDatabase(settings.databasePath, settings.orbitBackupDirectory);
  const newsDatabase = new NewsDatabase(settings.databasePath);
  const news = new NewsService(newsDatabase);
  const codexbarClient = new CodexbarClient({ baseUrl: settings.codexbarBaseUrl, timeoutMilliseconds: settings.codexbarTimeoutMilliseconds, cliPath: settings.codexbarCliPath, configPath: settings.codexbarConfigPath });
  const liveUsage = createCodexbarUsageService({
    client: codexbarClient,
    ttlMilliseconds: settings.codexbarCacheMilliseconds,
    ...(settings.codexOauthPrimaryFallbackEnabled ? { primaryWindowFallback: new CodexOAuthPrimaryWindowFallback({ profileHomes: settings.codexOauthProfileHomes, configPath: settings.codexbarConfigPath, timeoutMilliseconds: settings.codexOauthTimeoutMilliseconds }) } : {}),
  });
  const analytics = new UsageAnalyticsService({ database: usageDatabase, client: codexbarClient, live: liveUsage, intervalMilliseconds: settings.usageSnapshotIntervalMilliseconds });
  const accounts = new AccountService({ database: usageDatabase, allowedRoots: settings.terminalAllowedRoots, profilesRoot: settings.workbenchProfilesRoot, codexbarConfigPath: settings.codexbarConfigPath, codexbarCliPath: settings.codexbarCliPath });
  const projectFiles = createProjectFileService(projects);
  const localPorts = createLocalPortService({
    cacheMilliseconds: settings.localPortCacheMilliseconds,
    probeTimeoutMilliseconds: settings.localPortProbeTimeoutMilliseconds,
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
    allowList: (request) => !request.url.startsWith("/api/"),
  });
  await app.register(websocket, {
    // code-server sends initialisation frames larger than 64 KiB. Terminal
    // input remains independently restricted by its Zod protocol schema.
    options: { maxPayload: settings.webSocketMaxPayloadBytes },
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(
        apiErrorSchema.parse({ error: { code: error.code, message: error.message } }),
      );
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(
        apiErrorSchema.parse({ error: { code: "VALIDATION_ERROR", message: "Die Anfrage oder Konfiguration ist ungültig." } }),
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 429
    ) {
      return reply.status(429).send(
        apiErrorSchema.parse({ error: { code: "RATE_LIMITED", message: "Zu viele Anfragen. Bitte kurz warten." } }),
      );
    }
    app.log.error({ err: error }, "Unbehandelter Serverfehler");
    return reply.status(500).send(
      apiErrorSchema.parse({ error: { code: "INTERNAL_ERROR", message: "Die Anfrage konnte nicht verarbeitet werden." } }),
    );
  });

  app.addHook("onSend", (request, reply, payload, done) => {
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    done(null, payload);
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
    projectFiles,
    localPorts,
    proxyOrigins,
  });
  await app.register(registerNewsRoutes, { prefix: "/api/v1", news, newsDatabase });
  const terminals = new TerminalManager({
    allowedRoots: settings.terminalAllowedRoots,
    defaultCwd: settings.terminalDefaultCwd,
    maxSessions: settings.terminalMaxSessions + settings.codexMaxSessions + settings.opencodeMaxSessions,
    maxSessionsByKind: {
      shell: settings.terminalMaxSessions,
      codex: settings.codexMaxSessions,
      opencode: settings.opencodeMaxSessions,
    },
    cliPaths: { codex: settings.codexCliPath, opencode: settings.opencodeCliPath },
    resolveAccountProfile: (accountId, kind) => {
      const account = usageDatabase.getAccount(accountId);
      if (account.provider !== kind) throw new Error("Provider mismatch");
      return account.profilePath;
    },
  });
  const browsers = new BrowserManager({
    chromiumPath: settings.chromiumPath,
    maxSessions: settings.browserMaxSessions,
    startupTimeoutMilliseconds: settings.browserStartupTimeoutMilliseconds,
    idleTimeoutMilliseconds: settings.browserIdleTimeoutMilliseconds,
    captureMaxWidth: settings.browserCaptureMaxWidth,
    captureMaxHeight: settings.browserCaptureMaxHeight,
    captureMaxScale: settings.browserCaptureMaxScale,
    captureJpegQuality: settings.browserCaptureJpegQuality,
    captureEveryNthFrame: settings.browserCaptureEveryNthFrame,
  });
  await app.register(registerTerminalRoutes, {
    prefix: "/api/v1",
    manager: terminals,
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
  analytics.start();
  news.start();
  app.addHook("onClose", async () => { news.stop(); await analytics.stop(); terminals.shutdown(); await browsers.shutdown(); newsDatabase.close(); orbitDatabase.close(); usageDatabase.close(); });

  await registerEditorProxy(app);
  await registerT3Proxy(app);

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
        apiErrorSchema.parse({ error: { code: "NOT_FOUND", message: "Der API-Endpunkt wurde nicht gefunden." } }),
      );
    }
    if (hasWebBuild && request.url.startsWith("/workbench")) {
      return reply.type("text/html").sendFile("index.html");
    }
    if (hasWebBuild) return reply.status(404).send("Nicht gefunden.");
    return reply.status(503).send("Frontend-Build ist noch nicht vorhanden.");
  });

  return app;
}
