import type { FastifyInstance } from "fastify";
import {
  extensionManagementRequestSchema,
  extensionRegistrySnapshotSchema,
} from "@workbench/extension-contracts";
import { z } from "zod";
import type { ExtensionManager } from "./manager.js";

export async function registerExtensionRoutes(app: FastifyInstance, options: {
  manager: ExtensionManager;
}) {
  const manager = options.manager;

  app.get("/extensions", async () => {
    return extensionRegistrySnapshotSchema.parse(manager.snapshot());
  });

  app.get("/extensions/:id", async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(128) }).parse(request.params);
    return manager.detail(id);
  });

  app.post("/extensions/:id/operations", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(128) }).parse(request.params);
    const parsed = extensionManagementRequestSchema.parse(request.body);
    if (parsed.extensionId !== id) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION",
          message: "Der Pfad und der Request müssen dieselbe Extension adressieren.",
          details: null,
          requestId: request.id,
          retryable: false,
        },
      });
    }
    return manager.dispatch(parsed);
  });
}
