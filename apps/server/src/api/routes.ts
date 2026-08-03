import {
  dashboardConfigSchema,
  commandsResponseSchema,
  healthResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  serverMetricsSchema,
  serverSummarySchema,
  servicesResponseSchema,
  localPortsResponseSchema,
  usageResponseSchema,
  usageDashboardResponseSchema,
  usageRangeSchema,
  accountsResponseSchema,
  discoveredAccountsResponseSchema,
  createAccountRequestSchema,
  updateAccountRequestSchema,
  accountResponseSchema,
  activateAccountResponseSchema,
  loginSessionResponseSchema,
  orbitDocumentResponseSchema,
  saveOrbitDocumentRequestSchema,
  createProjectFileRequestSchema,
  projectFileResponseSchema,
  orbitAssetResponseSchema,
  orbitAssetListResponseSchema,
  galleryFileResponseSchema,
  galleryFileListResponseSchema,
  galleryFolderResponseSchema,
  galleryFolderListResponseSchema,
  createGalleryFolderRequestSchema,
  updateGalleryFolderRequestSchema,
  updateGalleryFileRequestSchema,
  filesystemTreeResponseSchema,
  filesystemEntrySchema,
  saveFileManagerStateRequestSchema,
  fileManagerTextPreviewResponseSchema,
  fileManagerRenameRequestSchema,
  fileManagerMoveRequestSchema,
  fileManagerDeleteRequestSchema,
  fileManagerMkdirRequestSchema,
  fileManagerSearchResponseSchema,
  skillEditorCreateRequestSchema,
  skillEditorDeleteRequestSchema,
  skillEditorReadResponseSchema,
  skillEditorRenameRequestSchema,
  skillEditorStatusResponseSchema,
  skillEditorTreeResponseSchema,
  skillEditorWriteRequestSchema,
  registerProjectRequestSchema,
  registerProjectResponseSchema,
  projectActivityTouchResponseSchema,
  restartRequestSchema,
  restartResponseSchema,
  restartStatusResponseSchema,
  t3ChannelRequestSchema,
} from "@workbench/contracts";
import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { createCommandService } from "../services/commandService.js";
import type { createProjectService } from "../services/projectService.js";
import type { createServiceStatusService } from "../services/serviceStatusService.js";
import { systemService } from "../services/systemService.js";
import { t3ChannelService } from "../services/t3ChannelService.js";
import { settings } from "../config/settings.js";
import { bootId, readRestartStatus, RestartError, triggerRestart, webBuildId } from "../system/restart.js";
import { createProxyHandler } from "./proxy.js";
import type { CodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import type { UsageAnalyticsService } from "../usage/usage-service.js";
import type { AccountService } from "../usage/account-service.js";
import type { OrbitDatabase } from "../orbit/database.js";
import type { createProjectFileService } from "../services/projectFileService.js";
import type { createLocalPortService } from "../services/localPortService.js";
import type { OrbitAssetRepository } from "../orbit/assets.js";
import type { ProjectBrowserService } from "../filesystem/projectBrowserService.js";
import type { FileManagerService } from "../filesystem/fileManagerService.js";
import type { SkillEditorService } from "../skills/skillEditorService.js";
import type { PreviewSlotService } from "../previews/slots.js";
import { AppError } from "../utils/errors.js";

interface RouteServices {
  projects: ReturnType<typeof createProjectService>;
  statuses: ReturnType<typeof createServiceStatusService>;
  commands: ReturnType<typeof createCommandService>;
  usage: CodexbarUsageService;
  analytics: UsageAnalyticsService;
  accounts: AccountService;
  orbit: OrbitDatabase;
  projectFiles: ReturnType<typeof createProjectFileService>;
  localPorts: ReturnType<typeof createLocalPortService>;
  previewSlots: PreviewSlotService;
  orbitAssets: OrbitAssetRepository;
  fileGallery: OrbitAssetRepository;
  projectBrowser: ProjectBrowserService;
  fileManager: FileManagerService;
  skillEditor: SkillEditorService;
  proxyOrigins: string[];
}

const projectParamsSchema = z.object({ projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function registerApiRoutes(app: FastifyInstance, services: RouteServices) {
  app.get("/health", async () =>
    healthResponseSchema.parse({ status: "ok", version: settings.appVersion, appName: settings.appName, timestamp: new Date().toISOString(), bootId, webBuildId: webBuildId() }),
  );
  app.get("/system/dashboard-config", async () => dashboardConfigSchema.parse(settings.dashboard));
  app.post("/system/restart", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { target } = restartRequestSchema.parse(request.body);
    try {
      const { jobId, logFile } = triggerRestart(target);
      return reply.status(202).send(restartResponseSchema.parse({ status: "accepted", jobId, target, bootId, webBuildId: webBuildId(), logFile }));
    } catch (error) {
      if (error instanceof RestartError) {
        request.log.warn({ err: error, target }, "Neustart abgelehnt");
        throw new AppError(409, "RESTART_REJECTED", `${error.message} ${error.hint}`, null, true);
      }
      throw error;
    }
  });
  app.get("/system/restart/status", async () =>
    restartStatusResponseSchema.parse({ ...readRestartStatus(), bootId, webBuildId: webBuildId() }),
  );
  app.get("/system/t3-channel", async () => t3ChannelService.status());
  // Setzt nur den Wunschkanal. Angewendet wird er beim nächsten Backend-Neustart
  // (Einstellungen → Dienst neu starten), damit der Nutzer den Zeitpunkt bestimmt.
  app.post("/system/t3-channel", async (request) => {
    const { channel } = t3ChannelRequestSchema.parse(request.body);
    return t3ChannelService.setChannel(channel);
  });
  app.get("/server/summary", async () => serverSummarySchema.parse(await systemService.getSummary()));
  app.get("/server/metrics", async () => serverMetricsSchema.parse(await systemService.getMetrics()));
  app.get("/services", async () => servicesResponseSchema.parse(await services.statuses.list()));
  app.get("/local-ports", async () => localPortsResponseSchema.parse(await services.localPorts.list()));
  // Preview-Endpunkte liegen in `previews/routes.ts`; sie erzwingen Identität,
  // Ownership und Same-Origin und gehören deshalb nicht in die allgemeine API.
  app.get("/filesystem/tree", async (request) => {
    const query = z.object({
      path: z.string().max(4_096).optional(),
      cursor: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    }).parse(request.query);
    return filesystemTreeResponseSchema.parse(await services.projectBrowser.tree({
      ...(query.path === undefined ? {} : { path: query.path }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    }));
  });
  app.get("/filesystem/state", async () => services.fileManager.state());
  app.put("/filesystem/state", async (request) => {
    const input = saveFileManagerStateRequestSchema.parse(request.body);
    return services.fileManager.saveState(input);
  });
  app.get("/filesystem/file", async (request) => {
    const query = z.object({ path: z.string().trim().min(1).max(4_096) }).parse(request.query);
    return fileManagerTextPreviewResponseSchema.parse(await services.fileManager.textPreview({ path: query.path }));
  });
  app.get("/filesystem/media", async (request, reply) => {
    const query = z.object({ path: z.string().trim().min(1).max(4_096) }).parse(request.query);
    const result = await services.fileManager.openMedia({ path: query.path }, request.headers.range);
    // Härtung wie bei den Galerie-Endpunkten: HTML/JS darf nie direkt im
    // Workbench-Origin ausgeführt werden (F01-04).
    return reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "sandbox")
      .status(result.statusCode).headers(result.headers).send(result.stream);
  });
  app.get("/filesystem/download", async (request, reply) => {
    const query = z.object({ path: z.string().trim().min(1).max(4_096) }).parse(request.query);
    const file = await services.fileManager.download({ path: query.path });
    return reply
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
      .header("Content-Type", file.mime)
      .header("Content-Length", String(file.size))
      .send(file.stream);
  });
  app.post("/filesystem/upload", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const query = z.object({ path: z.string().trim().min(1).max(4_096) }).parse(request.query);
    // Das eigene, größere Upload-Limit des Dateimanagers muss auch den
    // Multipart-Parser erreichen, sonst lehnt das globale Orbit-Limit die Datei
    // vorher mit einer generischen Meldung ab (F01-02).
    const upload = await request.file({ limits: { fileSize: settings.fileManagerMaxUploadBytes } });
    if (!upload) throw new AppError(400, "UPLOAD_REQUIRED", "Es wurde keine Datei mitgesendet.");
    const entry = await services.fileManager.upload({ directory: query.path, filename: upload.filename, stream: upload.file });
    return reply.status(201).send(filesystemEntrySchema.parse(entry));
  });
  app.post("/filesystem/rename", async (request) => {
    const input = fileManagerRenameRequestSchema.parse(request.body);
    return services.fileManager.response(await services.fileManager.rename(input));
  });
  app.post("/filesystem/move", async (request) => {
    const input = fileManagerMoveRequestSchema.parse(request.body);
    return services.fileManager.response(await services.fileManager.move(input));
  });
  app.post("/filesystem/delete", async (request) => {
    const input = fileManagerDeleteRequestSchema.parse(request.body);
    return services.fileManager.response(await services.fileManager.remove({ path: input.path }));
  });
  app.post("/filesystem/mkdir", async (request) => {
    const input = fileManagerMkdirRequestSchema.parse(request.body);
    return services.fileManager.response(await services.fileManager.mkdir(input));
  });
  app.get("/filesystem/search", async (request) => {
    const query = z.object({ q: z.string().trim().min(1).max(200) }).parse(request.query);
    return fileManagerSearchResponseSchema.parse(await services.fileManager.search(query.q));
  });
  // Werkzeug „KI-Skills": bearbeitet die globalen Agenten-Regeln und Skills direkt
  // auf der Platte. Mutationen sind zusätzlich rate-limitiert, weil sie in echte
  // Dateien und ins Skill-Repository schreiben.
  app.get("/skills/status", async () => skillEditorStatusResponseSchema.parse(await services.skillEditor.status()));
  app.get("/skills/tree", async () => skillEditorTreeResponseSchema.parse(await services.skillEditor.list()));
  app.get("/skills/file", async (request) => {
    const query = z.object({ path: z.string().trim().min(1).max(4_096) }).parse(request.query);
    return skillEditorReadResponseSchema.parse(await services.skillEditor.readFile({ path: query.path }));
  });
  app.put("/skills/file", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request) => {
    const input = skillEditorWriteRequestSchema.parse(request.body);
    return skillEditorReadResponseSchema.parse(await services.skillEditor.writeFile(input));
  });
  app.post("/skills", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    const input = skillEditorCreateRequestSchema.parse(request.body);
    return reply.status(201).send(await services.skillEditor.createSkill(input));
  });
  app.post("/skills/rename", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request) => {
    const input = skillEditorRenameRequestSchema.parse(request.body);
    return services.skillEditor.renameSkill(input);
  });
  app.delete("/skills/:name", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { name } = skillEditorDeleteRequestSchema.parse(request.params);
    await services.skillEditor.deleteSkill({ name });
    return reply.status(204).send();
  });
  app.post("/skills/git", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async () => services.skillEditor.gitCommitPush());
  app.get("/projects", async () => projectsResponseSchema.parse(await services.projects.list()));
  app.post("/projects/register", async (request, reply) => {
    const input = registerProjectRequestSchema.parse(request.body);
    const path = await services.projectBrowser.resolveDirectory(input.path, false);
    const result = registerProjectResponseSchema.parse(await services.projects.register(path));
    return reply.status(result.created ? 201 : 200).send(result);
  });
  app.get("/projects/:projectId", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return projectResponseSchema.parse(await services.projects.get(projectId));
  });
  app.post("/projects/:projectId/activity", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return projectActivityTouchResponseSchema.parse(await services.projects.touch(projectId));
  });
  app.post("/projects/:projectId/files", async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const result = await services.projectFiles.create(projectId, createProjectFileRequestSchema.parse(request.body));
    return reply.status(result.created ? 201 : 200).send(projectFileResponseSchema.parse(result));
  });
  app.get("/orbit", async () => orbitDocumentResponseSchema.parse(services.orbit.get()));
  app.put("/orbit", async (request) => {
    const input = saveOrbitDocumentRequestSchema.parse(request.body);
    const supportsCurrentConflictHandling = request.headers["x-workbench-sync-version"] === "2";
    const response = supportsCurrentConflictHandling
      ? services.orbit.save(input.document, input.expectedRevision)
      : services.orbit.saveLegacy(input.document, input.expectedRevision);
    return orbitDocumentResponseSchema.parse(response);
  });
  app.post("/orbit/assets", async (request, reply) => {
    const upload = await request.file();
    if (!upload) throw new AppError(400, "ORBIT_ASSET_REQUIRED", "Bitte wähle eine Datei zum Archivieren aus.");
    const { folderId } = z.object({ folderId: z.string().uuid().optional() }).parse(request.query);
    const asset = await services.orbitAssets.createStream({ filename: upload.filename, mimeType: upload.mimetype, stream: upload.file, folderId: folderId ?? null });
    return reply.status(201).send(orbitAssetResponseSchema.parse({ asset }));
  });
  app.get("/orbit/assets", async (request) => {
    const { limit, cursor, folderId } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), cursor: z.string().min(1).optional(), folderId: z.string().uuid().optional() }).parse(request.query);
    let decoded: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        decoded = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() }).parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      } catch {
        throw new AppError(400, "ORBIT_ASSET_CURSOR_INVALID", "Der Archivcursor ist ungültig.");
      }
    }
    return orbitAssetListResponseSchema.parse(services.orbitAssets.list(limit, decoded, folderId ?? undefined));
  });
  app.get("/orbit/assets/folders", async () => galleryFolderListResponseSchema.parse({ folders: services.orbitAssets.listFolders() }));
  app.post("/orbit/assets/folders", async (request, reply) => {
    const input = createGalleryFolderRequestSchema.parse(request.body);
    const folder = services.orbitAssets.createFolder(input.name);
    return reply.status(201).send(galleryFolderResponseSchema.parse({ folder }));
  });
  app.patch("/orbit/assets/folders/:folderId", async (request) => {
    const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.params);
    const input = updateGalleryFolderRequestSchema.parse(request.body);
    const folder = services.orbitAssets.updateFolder(folderId, input.name);
    if (!folder) throw new AppError(404, "ORBIT_FOLDER_NOT_FOUND", "Dieser Ordner wurde nicht gefunden.");
    return galleryFolderResponseSchema.parse({ folder });
  });
  app.delete("/orbit/assets/folders/:folderId", async (request, reply) => {
    const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.params);
    const deleted = services.orbitAssets.deleteFolder(folderId);
    if (!deleted) throw new AppError(404, "ORBIT_FOLDER_NOT_FOUND", "Dieser Ordner wurde nicht gefunden.");
    return reply.status(204).send();
  });
  app.get("/orbit/assets/:assetId", async (request, reply) => {
    const { assetId } = z.object({ assetId: z.string().uuid() }).parse(request.params);
    const found = await services.orbitAssets.file(assetId);
    if (!found) throw new AppError(404, "ORBIT_ASSET_NOT_FOUND", "Dieses Archivobjekt wurde nicht gefunden.");
    const inline = found.asset.mimeType.startsWith("image/") || found.asset.mimeType === "text/plain" || found.asset.mimeType === "application/pdf";
    reply.header("X-Content-Type-Options", "nosniff").header("Content-Security-Policy", "sandbox").type(found.asset.mimeType);
    reply.header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(found.asset.filename)}`);
    return reply.send(createReadStream(found.path));
  });
  app.patch("/orbit/assets/:assetId", async (request) => {
    const { assetId } = z.object({ assetId: z.string().uuid() }).parse(request.params);
    const input = updateGalleryFileRequestSchema.parse(request.body);
    const updates: { filename?: string; folderId?: string | null } = {};
    if (input.filename !== undefined) updates.filename = input.filename;
    if (input.folderId !== undefined) updates.folderId = input.folderId;
    const updated = await services.orbitAssets.update(assetId, updates);
    if (!updated) throw new AppError(404, "ORBIT_ASSET_NOT_FOUND", "Dieses Archivobjekt wurde nicht gefunden.");
    return orbitAssetResponseSchema.parse({ asset: updated });
  });
  app.delete("/orbit/assets/:assetId", async (request, reply) => {
    const { assetId } = z.object({ assetId: z.string().uuid() }).parse(request.params);
    const deleted = await services.orbitAssets.delete(assetId);
    if (!deleted) throw new AppError(404, "ORBIT_ASSET_NOT_FOUND", "Dieses Archivobjekt wurde nicht gefunden.");
    return reply.status(204).send();
  });
  app.post("/files", async (request, reply) => {
    const upload = await request.file();
    if (!upload) throw new AppError(400, "FILE_GALLERY_REQUIRED", "Bitte wähle eine Datei zum Hochladen aus.");
    const { folderId } = z.object({ folderId: z.string().uuid().optional() }).parse(request.query);
    const file = await services.fileGallery.createStream({ filename: upload.filename, mimeType: upload.mimetype, stream: upload.file, folderId: folderId ?? null });
    return reply.status(201).send(galleryFileResponseSchema.parse({ file }));
  });
  app.get("/files", async (request) => {
    const { limit, cursor, folderId } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), cursor: z.string().min(1).optional(), folderId: z.string().uuid().optional() }).parse(request.query);
    let decoded: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        decoded = z.object({ createdAt: z.string().datetime(), id: z.string().uuid() }).parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      } catch {
        throw new AppError(400, "FILE_GALLERY_CURSOR_INVALID", "Der Cursor ist ungültig.");
      }
    }
    const page = services.fileGallery.list(limit, decoded, folderId ?? undefined);
    return galleryFileListResponseSchema.parse({ files: page.assets, nextCursor: page.nextCursor });
  });
  app.get("/files/folders", async () => galleryFolderListResponseSchema.parse({ folders: services.fileGallery.listFolders() }));
  app.post("/files/folders", async (request, reply) => {
    const input = createGalleryFolderRequestSchema.parse(request.body);
    const folder = services.fileGallery.createFolder(input.name);
    return reply.status(201).send(galleryFolderResponseSchema.parse({ folder }));
  });
  app.patch("/files/folders/:folderId", async (request) => {
    const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.params);
    const input = updateGalleryFolderRequestSchema.parse(request.body);
    const folder = services.fileGallery.updateFolder(folderId, input.name);
    if (!folder) throw new AppError(404, "FILE_GALLERY_FOLDER_NOT_FOUND", "Dieser Ordner wurde nicht gefunden.");
    return galleryFolderResponseSchema.parse({ folder });
  });
  app.delete("/files/folders/:folderId", async (request, reply) => {
    const { folderId } = z.object({ folderId: z.string().uuid() }).parse(request.params);
    const deleted = services.fileGallery.deleteFolder(folderId);
    if (!deleted) throw new AppError(404, "FILE_GALLERY_FOLDER_NOT_FOUND", "Dieser Ordner wurde nicht gefunden.");
    return reply.status(204).send();
  });
  app.get("/files/:fileId", async (request, reply) => {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const found = await services.fileGallery.file(fileId);
    if (!found) throw new AppError(404, "FILE_GALLERY_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
    reply.header("X-Content-Type-Options", "nosniff").header("Content-Security-Policy", "sandbox").type(found.asset.mimeType);
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(found.asset.filename)}`);
    return reply.send(createReadStream(found.path));
  });
  app.patch("/files/:fileId", async (request) => {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const input = updateGalleryFileRequestSchema.parse(request.body);
    const updates: { filename?: string; folderId?: string | null } = {};
    if (input.filename !== undefined) updates.filename = input.filename;
    if (input.folderId !== undefined) updates.folderId = input.folderId;
    const updated = await services.fileGallery.update(fileId, updates);
    if (!updated) throw new AppError(404, "FILE_GALLERY_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
    return galleryFileResponseSchema.parse({ file: updated });
  });
  app.delete("/files/:fileId", async (request, reply) => {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const deleted = await services.fileGallery.delete(fileId);
    if (!deleted) throw new AppError(404, "FILE_GALLERY_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
    return reply.status(204).send();
  });
  app.get("/commands", async () => commandsResponseSchema.parse(await services.commands.list()));
  app.get("/usage", async () => usageResponseSchema.parse(await services.usage.getUsage()));
  app.get("/usage/dashboard", async (request) => {
    const range = usageRangeSchema.parse((request.query as {range?:unknown}).range ?? "30d");
    return usageDashboardResponseSchema.parse(await services.analytics.dashboard(range));
  });
  app.post("/usage/sync", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async () => { services.usage.invalidate(); await services.analytics.sync(); return usageDashboardResponseSchema.parse(await services.analytics.dashboard("30d")); });
  app.get("/accounts", async () => accountsResponseSchema.parse({ accounts: await services.accounts.listWithState() }));
  app.get("/accounts/discover", async () => discoveredAccountsResponseSchema.parse({ accounts: await services.accounts.discover() }));
  app.post("/accounts", async (request, reply) => {
    const account = await services.accounts.create(createAccountRequestSchema.parse(request.body));
    services.usage.invalidate();
    return reply.status(201).send(accountResponseSchema.parse({ account }));
  });
  app.patch("/accounts/:accountId", async (request) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(request.params);
    const account = services.accounts.update(accountId, updateAccountRequestSchema.parse(request.body));
    services.usage.invalidate();
    return accountResponseSchema.parse({ account });
  });
  app.delete("/accounts/:accountId", async (request, reply) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(request.params);
    await services.accounts.remove(accountId); services.usage.invalidate(); return reply.status(204).send();
  });
  // Schaltet den serverweit aktiven Codex-Account um. Alle danach gestarteten Codex-Prozesse
  // verwenden diesen Account, ohne dass eine erneute Anmeldung nötig ist.
  app.post("/accounts/:accountId/activate", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(request.params);
    const result = await services.accounts.activate(accountId);
    services.usage.invalidate();
    return activateAccountResponseSchema.parse(result);
  });
  app.post("/accounts/login-session", async (request, reply) => {
    const body = createAccountRequestSchema.parse({ ...(request.body as object), source: "login" });
    const account = await services.accounts.create(body);
    services.usage.invalidate();
    return reply.status(201).send(loginSessionResponseSchema.parse({ account, terminalKind: account.provider, command: services.accounts.loginCommand(account) }));
  });

  app.get(
    "/proxy/*",
    { helmet: { contentSecurityPolicy: false }, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    createProxyHandler(services.proxyOrigins),
  );
}
