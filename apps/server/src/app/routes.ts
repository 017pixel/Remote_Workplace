import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { operationalMetricsSchema, readinessResponseSchema } from "@workbench/contracts";
import type { FastifyInstance } from "fastify";
import { registerApiRoutes } from "../api/routes.js";
import { registerBrowserRoutes } from "../browser/routes.js";
import { settings } from "../config/settings.js";
import { registerExtensionRoutes } from "../extensions/routes.js";
import { registerHermesRoutes } from "../hermes/routes.js";
import { registerNewsRoutes } from "../news/routes.js";
import { registerNotificationRoutes } from "../notifications/routes.js";
import { registerPreviewRoutes } from "../previews/routes.js";
import { registerEditorOpenRoutes } from "../services/editorOpen.js";
import { createCommandService } from "../services/commandService.js";
import { createServiceStatusService } from "../services/serviceStatusService.js";
import { registerTerminalRoutes } from "../terminal/routes.js";
import { TerminalFailure } from "../terminal/Manager.js";
import { AppError } from "../utils/errors.js";
import type { AppDependencies } from "./dependencies.js";

export async function registerApplicationRoutes(app: FastifyInstance, deps: AppDependencies) {
  await app.register(registerApiRoutes, {
    prefix: "/api/v1",
    projects: deps.projects,
    statuses: createServiceStatusService(deps.servicesConfig.services),
    commands: createCommandService(deps.commandsConfig),
    usage: deps.liveUsage,
    analytics: deps.analytics,
    accounts: deps.accounts,
    usageTimeline: deps.usageTimeline,
    orbit: deps.orbitDatabase,
    orbitAssets: deps.orbitAssets,
    fileGallery: deps.fileGallery,
    projectBrowser: deps.projectBrowser,
    fileManager: deps.fileManager,
    skillEditor: deps.skillEditor,
    projectFiles: deps.projectFiles,
    localPorts: deps.localPorts,
    previewSlots: deps.previewSlots,
    proxyOrigins: deps.proxyOrigins,
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
    ...deps.operationalMetrics.snapshot(),
    audit: deps.operationalAudit.verify(),
    orbit: deps.orbitDatabase.maintenanceStatus(),
    preview: (() => {
      const slots = deps.previewSlots.list().slots;
      return {
        totalSlots: slots.length,
        freeSlots: slots.filter((slot) => slot.state === "free").length,
        resettingSlots: slots.filter((slot) => slot.state === "resetting").length,
        quarantinedSlots: slots.filter((slot) => slot.state === "quarantined").length,
      };
    })(),
  }));
  await app.register(registerPreviewRoutes, {
    prefix: "/api/v1",
    slots: deps.previewSlots,
    database: deps.previewSlotDatabase,
    diagnostics: deps.previewDiagnostics,
    storage: deps.previewStorage,
    repair: deps.previewRepair,
    secrets: deps.previewSecrets,
    identity: deps.identityOptions,
    scanCandidates: deps.scanCandidates,
    diagnosticsEnabled: settings.previews.diagnosticsEnabled,
    diagnosticMaxBatchBytes: settings.previews.diagnosticMaxBatchBytes,
    diagnosticRetentionDays: settings.previews.diagnosticRetentionDays,
    devServers: deps.previewDevServers,
  });
  await app.register(registerNewsRoutes, { prefix: "/api/v1", news: deps.news, newsDatabase: deps.newsDatabase });
  await app.register(registerHermesRoutes, {
    prefix: "/api/v1",
    client: deps.hermesClient,
    manager: deps.hermesManager,
    sessions: deps.hermesSessions,
    status: deps.hermesStatus,
    resolveProjectCwd: async (projectId) => {
      if (projectId === null) return settings.terminalDefaultCwd;
      const { project } = await deps.projects.get(projectId);
      if (project.availability !== "available") throw new AppError(400, "PROJECT_NOT_FOUND", "Das gewählte Projekt ist momentan nicht verfügbar.");
      return project.path;
    },
  });
  await app.register(registerNotificationRoutes, { prefix: "/api/v1", database: deps.notificationDatabase, push: deps.notificationPush, configDirectory: settings.configDirectory, identity: deps.identityOptions });
  await app.register(registerEditorOpenRoutes, { prefix: "/api/v1", secrets: deps.editorOpenSecrets });
  await app.register(registerExtensionRoutes, { prefix: "/api/v1", manager: deps.extensionManager, catalog: deps.extensionCatalog });
  await app.register(registerTerminalRoutes, {
    prefix: "/api/v1",
    manager: deps.terminals,
    database: deps.terminalDatabase,
    allowedUsers: settings.terminalAllowedUsers,
    ...(settings.developmentTailscaleUser ? { developmentUser: settings.developmentTailscaleUser } : {}),
    resolveProjectPath: async (projectId) => {
      try {
        const { project } = await deps.projects.get(projectId);
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
    manager: deps.browsers,
    allowedUsers: settings.terminalAllowedUsers,
  });
}
