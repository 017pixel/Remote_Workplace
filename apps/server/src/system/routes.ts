import {
  dashboardConfigSchema,
  healthResponseSchema,
  localPortsResponseSchema,
  restartRequestSchema,
  restartResponseSchema,
  restartStatusResponseSchema,
  serverMetricsSchema,
  serverSummarySchema,
  servicesResponseSchema,
  t3ChannelRequestSchema,
  usageMonitoringResponseSchema,
} from "@workbench/contracts";
import type { FastifyInstance } from "fastify";
import { settings } from "../config/settings.js";
import type { RouteServices } from "../api/services.js";
import { systemService } from "../services/systemService.js";
import { t3ChannelService } from "../services/t3ChannelService.js";
import { usageMonitoringService } from "../services/usageMonitoringService.js";
import { bootId, readRestartStatus, RestartError, triggerRestart, webBuildId } from "./restart.js";
import { AppError } from "../utils/errors.js";

export async function registerSystemRoutes(app: FastifyInstance, services: RouteServices) {
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
  app.get("/system/usage-monitoring", async () => usageMonitoringResponseSchema.parse({ monitoring: usageMonitoringService.get() }));
  // Wirkt sofort: Der Sync überspringt deaktivierte Anbieter, der Live-Cache meldet sie
  // als deaktiviert. Persistiert wird ausschließlich in config/workbench.local.json.
  app.put("/system/usage-monitoring", async (request) => {
    const { monitoring } = usageMonitoringResponseSchema.parse(request.body);
    const result = usageMonitoringService.update(monitoring);
    // Gespeicherte Live-Antwort verwerfen, damit der neue Stand ohne Wartezeit ankommt.
    services.usage.invalidate();
    return usageMonitoringResponseSchema.parse({ monitoring: result });
  });
  app.get("/server/summary", async () => serverSummarySchema.parse(await systemService.getSummary()));
  app.get("/server/metrics", async () => serverMetricsSchema.parse(await systemService.getMetrics()));
  app.get("/services", async () => servicesResponseSchema.parse(await services.statuses.list()));
  app.get("/local-ports", async () => localPortsResponseSchema.parse(await services.localPorts.list()));
}
