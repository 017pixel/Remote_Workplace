import {
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
  loginSessionResponseSchema,
  orbitDocumentResponseSchema,
  saveOrbitDocumentRequestSchema,
  createProjectFileRequestSchema,
  projectFileResponseSchema,
} from "@workbench/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { createCommandService } from "../services/commandService.js";
import type { createProjectService } from "../services/projectService.js";
import type { createServiceStatusService } from "../services/serviceStatusService.js";
import { systemService } from "../services/systemService.js";
import { settings } from "../config/settings.js";
import { createProxyHandler } from "./proxy.js";
import type { CodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import type { UsageAnalyticsService } from "../usage/usage-service.js";
import type { AccountService } from "../usage/account-service.js";
import type { OrbitDatabase } from "../orbit/database.js";
import type { createProjectFileService } from "../services/projectFileService.js";
import type { createLocalPortService } from "../services/localPortService.js";

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
  proxyOrigins: string[];
}

const projectParamsSchema = z.object({ projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function registerApiRoutes(app: FastifyInstance, services: RouteServices) {
  app.get("/health", async () =>
    healthResponseSchema.parse({ status: "ok", version: settings.appVersion, timestamp: new Date().toISOString() }),
  );
  app.get("/server/summary", async () => serverSummarySchema.parse(await systemService.getSummary()));
  app.get("/server/metrics", async () => serverMetricsSchema.parse(await systemService.getMetrics()));
  app.get("/services", async () => servicesResponseSchema.parse(await services.statuses.list()));
  app.get("/local-ports", async () => localPortsResponseSchema.parse(await services.localPorts.list()));
  app.get("/projects", async () => projectsResponseSchema.parse(await services.projects.list()));
  app.get("/projects/:projectId", async (request) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    return projectResponseSchema.parse(await services.projects.get(projectId));
  });
  app.post("/projects/:projectId/files", async (request, reply) => {
    const { projectId } = projectParamsSchema.parse(request.params);
    const result = await services.projectFiles.create(projectId, createProjectFileRequestSchema.parse(request.body));
    return reply.status(201).send(projectFileResponseSchema.parse(result));
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
  app.get("/commands", async () => commandsResponseSchema.parse(await services.commands.list()));
  app.get("/usage", async () => usageResponseSchema.parse(await services.usage.getUsage()));
  app.get("/usage/dashboard", async (request) => {
    const range = usageRangeSchema.catch("30d").parse((request.query as {range?:unknown}).range);
    return usageDashboardResponseSchema.parse(await services.analytics.dashboard(range));
  });
  app.post("/usage/sync", async () => { services.usage.invalidate(); await services.analytics.sync(); return usageDashboardResponseSchema.parse(await services.analytics.dashboard("30d")); });
  app.get("/accounts", async () => accountsResponseSchema.parse({ accounts: services.accounts.list() }));
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
  app.post("/accounts/login-session", async (request, reply) => {
    const body = createAccountRequestSchema.parse({ ...(request.body as object), source: "login" });
    const account = await services.accounts.create(body);
    services.usage.invalidate();
    return reply.status(201).send(loginSessionResponseSchema.parse({ account, terminalKind: account.provider, command: services.accounts.loginCommand(account) }));
  });

  app.get(
    "/proxy/*",
    { helmet: { contentSecurityPolicy: false } },
    createProxyHandler(services.proxyOrigins),
  );
}
