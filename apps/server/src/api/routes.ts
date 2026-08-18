import type { FastifyInstance } from "fastify";
import { registerFilesystemRoutes } from "../filesystem/routes.js";
import { registerOrbitRoutes } from "../orbit/routes.js";
import { registerProjectRoutes } from "../projects/routes.js";
import { registerSkillsRoutes } from "../skills/routes.js";
import { registerSystemRoutes } from "../system/routes.js";
import { registerUsageRoutes } from "../usage/routes.js";
import { createProxyHandler } from "./proxy.js";
import type { RouteServices } from "./services.js";

export async function registerApiRoutes(app: FastifyInstance, services: RouteServices) {
  await registerSystemRoutes(app, services);
  await registerFilesystemRoutes(app, services);
  await registerSkillsRoutes(app, services);
  await registerProjectRoutes(app, services);
  await registerOrbitRoutes(app, services);
  await registerUsageRoutes(app, services);

  app.get(
    "/proxy/*",
    { helmet: { contentSecurityPolicy: false }, config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    createProxyHandler(services.proxyOrigins),
  );
}
