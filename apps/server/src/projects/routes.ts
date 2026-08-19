import {
  createProjectFileRequestSchema,
  projectActivityTouchResponseSchema,
  projectFileResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  registerProjectRequestSchema,
  registerProjectResponseSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteServices } from "../api/services.js";

const projectParamsSchema = z.object({ projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function registerProjectRoutes(app: FastifyInstance, services: RouteServices) {
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
}
