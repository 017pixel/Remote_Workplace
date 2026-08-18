import { apiErrorSchema } from "@workbench/contracts";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { isAuditedMutation } from "../observability/audit.js";
import {
  isProtectedWorkbenchRequest,
  requestIdentity,
  requireMutationOrigin,
  resolveWorkbenchUser,
} from "../security/workbench-identity.js";
import { AppError } from "../utils/errors.js";
import type { AppDependencies } from "./dependencies.js";

export function registerCoreHooks(app: FastifyInstance, deps: AppDependencies) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(
        apiErrorSchema.parse({ error: { code: error.code, message: error.message, details: error.details, requestId: request.id, retryable: error.retryable } }),
      );
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(
        apiErrorSchema.parse({
          error: {
            code: "VALIDATION_ERROR",
            message: "Die Anfrage oder Konfiguration ist ungültig.",
            details: { issues: error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) },
            requestId: request.id,
            retryable: false,
          },
        }),
      );
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 429
    ) {
      return reply.status(429).send(
        apiErrorSchema.parse({ error: { code: "RATE_LIMITED", message: "Zu viele Anfragen. Bitte kurz warten.", details: null, requestId: request.id, retryable: true } }),
      );
    }
    app.log.error({ err: error }, "Unbehandelter Serverfehler");
    return reply.status(500).send(
      apiErrorSchema.parse({ error: { code: "INTERNAL_ERROR", message: "Die Anfrage konnte nicht verarbeitet werden.", details: null, requestId: request.id, retryable: true } }),
    );
  });

  app.addHook("onSend", (request, reply, payload, done) => {
    reply.header("X-Request-Id", request.id);
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    done(null, payload);
  });

  app.addHook("onResponse", async (request, reply) => {
    deps.operationalMetrics.finish(
      request,
      request.method,
      request.routeOptions.url ?? request.url.split("?", 1)[0] ?? "unbekannt",
      reply.statusCode,
    );
    if (!isAuditedMutation(request.method, request.url)) return;
    try {
      deps.operationalAudit.record({
        requestId: request.id,
        actor: requestIdentity(request) ?? "unbekannt",
        action: `${request.method} ${request.routeOptions.url}`,
        target: request.url.split("?", 1)[0] ?? request.url,
        statusCode: reply.statusCode,
      });
    } catch (error) {
      request.log.error({ err: error }, "Audit-Eintrag konnte nicht geschrieben werden");
    }
  });

  app.addHook("onRequest", async (request) => {
    deps.operationalMetrics.start(request);
  });
  app.addHook("onRequest", async (request) => {
    if (!isProtectedWorkbenchRequest(request)) return;
    resolveWorkbenchUser(request, deps.identityOptions);
    requireMutationOrigin(request);
  });
}
