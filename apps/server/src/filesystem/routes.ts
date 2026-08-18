import {
  fileManagerDeleteRequestSchema,
  fileManagerMkdirRequestSchema,
  fileManagerMoveRequestSchema,
  fileManagerRenameRequestSchema,
  fileManagerSearchResponseSchema,
  fileManagerTextPreviewResponseSchema,
  filesystemEntrySchema,
  filesystemTreeResponseSchema,
  saveFileManagerStateRequestSchema,
} from "@workbench/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteServices } from "../api/services.js";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";

export async function registerFilesystemRoutes(app: FastifyInstance, services: RouteServices) {
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
}
