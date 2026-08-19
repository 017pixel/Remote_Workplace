import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  notificationCategorySchema,
  notificationEventSchema,
  notificationPatchSchema,
  notificationPresenceInputSchema,
  notificationPreferencesSchema,
  notificationSeveritySchema,
  notificationSourceSchema,
  pushEndpointRequestSchema,
  pushSubscriptionRegistrationSchema,
} from "@wrapt/contracts";
import { z } from "zod";
import { persistNotificationPreferences } from "../config/wrapt-config.js";
import { isSameOriginRequest } from "../security/same-origin.js";
import { resolveWorkbenchUser, type WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import { AppError } from "../utils/errors.js";
import type { NotificationDatabase } from "./database.js";
import type { NotificationPushService } from "./push.js";

function query(request: FastifyRequest) {
  const raw = request.query && typeof request.query === "object" ? request.query as Record<string, unknown> : {};
  return z.object({ cursor: z.string().max(200).optional(), unreadOnly: z.coerce.boolean().default(false),
    source: notificationSourceSchema.optional(), category: notificationCategorySchema.optional(), severity: notificationSeveritySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(raw);
}

export async function registerNotificationRoutes(app: FastifyInstance, options: {
  database: NotificationDatabase;
  push: NotificationPushService;
  configDirectory: string;
  identity: WorkbenchIdentityOptions;
}) {
  const database = options.database;
  const settingsResponse = (userId: string) => ({
    preferences: options.push.getPreferences(),
    pushSupported: true,
    vapidPublicKey: options.push.publicKey(),
    subscriptionCount: options.push.subscriptionCount(userId),
    serverPushEnabled: options.push.getPreferences().pushEnabled,
  });
  app.get("/notifications", async (request) => {
    const parsed = query(request);
    return database.list({ ...(parsed.cursor ? { cursor: parsed.cursor } : {}), unreadOnly: parsed.unreadOnly,
      ...(parsed.source ? { source: parsed.source } : {}), ...(parsed.category ? { category: parsed.category } : {}),
      ...(parsed.severity ? { severity: parsed.severity } : {}), limit: parsed.limit });
  });
  app.patch("/notifications/:id", async (request) => {
    const id = z.object({ id: z.string().uuid() }).parse(request.params).id;
    const parsed = notificationPatchSchema.parse(request.body);
    return database.patch(id, { ...(parsed.read === undefined ? {} : { read: parsed.read }), ...(parsed.acknowledged === undefined ? {} : { acknowledged: parsed.acknowledged }) });
  });
  const markAll = async (request: FastifyRequest) => {
    const category = z.object({ category: notificationCategorySchema.optional() }).parse(request.body ?? {}).category;
    database.markAllRead(category); return database.list();
  };
  app.post("/notifications/mark-all-read", markAll);
  app.post("/notifications/read-all", markAll);
  app.put("/notifications/presence", async (request) => {
    const presence = notificationPresenceInputSchema.parse(request.body);
    return { updated: database.setPresence(presence) };
  });
  app.delete("/notifications", async (_request, reply) => {
    database.dismissAll();
    return reply.status(204).send();
  });
  app.delete("/notifications/:id", async (request, reply) => {
    const id = z.object({ id: z.string().uuid() }).parse(request.params).id;
    database.dismiss(id); return reply.status(204).send();
  });
  app.get("/notifications/:id/report", async (request, reply) => {
    const id = z.object({ id: z.string().uuid() }).parse(request.params).id;
    const notification = database.get(id);
    if (!notification?.report) return reply.status(404).send({ error: { code: "REPORT_NOT_FOUND", message: "Für diese Benachrichtigung liegt kein Fehlerbericht vor." } });
    return { report: notification.report };
  });
  app.post("/notifications/report", async (request, reply) => {
    const parsed = z.object({
      title: z.string().min(1).max(200), body: z.string().max(1_000), link: z.string().startsWith("/").max(512).nullable().default(null),
      remoteId: z.string().max(200), report: z.object({ message: z.string().min(1).max(4_000), stack: z.string().max(20_000).nullable().default(null),
        context: z.record(z.string(), z.string().max(2_000)).default({}), logs: z.array(z.string().max(2_000)).max(100).default([]),
        environment: z.record(z.string(), z.string().max(2_000)).default({}) }),
    }).parse(request.body);
    const notification = database.create({ source: "wrapt", category: "terminal", sourceIcon: "wrapt", kind: "wrapt.crash", severity: "error", ...parsed });
    return reply.status(201).send(notification);
  });
  app.get("/notifications/settings", async (request) => settingsResponse(resolveWorkbenchUser(request, options.identity)));
  app.put("/notifications/settings", async (request) => {
    const userId = resolveWorkbenchUser(request, options.identity);
    const preferences = notificationPreferencesSchema.parse(request.body);
    persistNotificationPreferences(options.configDirectory, preferences);
    options.push.setPreferences(preferences);
    return settingsResponse(userId);
  });
  app.post("/notifications/push-subscription", async (request, reply) => {
    const userId = resolveWorkbenchUser(request, options.identity);
    const result = options.push.register(userId, pushSubscriptionRegistrationSchema.parse(request.body));
    if (!result.registered) throw new AppError(409, "PUSH_ENDPOINT_OWNED", "Diese Push-Subscription gehört bereits einer anderen Workbench-Identität.");
    return reply.status(201).send(result);
  });
  app.delete("/notifications/push-subscription", async (request, reply) => {
    const userId = resolveWorkbenchUser(request, options.identity);
    const { endpoint } = pushEndpointRequestSchema.parse(request.body);
    if (!options.push.unregister(userId, endpoint)) throw new AppError(404, "PUSH_SUBSCRIPTION_NOT_FOUND", "Diese Push-Subscription wurde für das aktuelle Gerät nicht gefunden.");
    return reply.status(204).send();
  });
  app.post("/notifications/push-test", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request) => {
    const userId = resolveWorkbenchUser(request, options.identity);
    const { endpoint } = pushEndpointRequestSchema.parse(request.body);
    try {
      if (!await options.push.sendTest(userId, endpoint)) throw new AppError(404, "PUSH_SUBSCRIPTION_NOT_FOUND", "Diese Push-Subscription gehört nicht zur aktuellen Workbench-Identität.");
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "PUSH_TEST_FAILED", "Die Testbenachrichtigung konnte nicht an den Push-Dienst gesendet werden.");
    }
    return { sent: true };
  });
  app.get("/notifications/ws", { websocket: true }, (socket, request) => {
    if (!isSameOriginRequest(request)) { socket.close(1008, "FORBIDDEN"); return; }
    const unsubscribe = database.subscribe((event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(notificationEventSchema.parse(event)));
    });
    socket.on("close", unsubscribe); socket.on("error", unsubscribe);
    socket.send(JSON.stringify({ type: "notification.sync" }));
  });
}
