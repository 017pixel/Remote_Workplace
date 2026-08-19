import {
  skillEditorCreateRequestSchema,
  skillEditorDeleteRequestSchema,
  skillEditorReadResponseSchema,
  skillEditorRenameRequestSchema,
  skillEditorStatusResponseSchema,
  skillEditorTreeResponseSchema,
  skillEditorWriteRequestSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteServices } from "../api/services.js";

// Werkzeug „KI-Skills": bearbeitet die globalen Agenten-Regeln und Skills direkt
// auf der Platte. Mutationen sind zusätzlich rate-limitiert, weil sie in echte
// Dateien und ins Skill-Repository schreiben.
export async function registerSkillsRoutes(app: FastifyInstance, services: RouteServices) {
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
}
