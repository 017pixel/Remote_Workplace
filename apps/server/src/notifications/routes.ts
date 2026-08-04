import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  notificationCategorySchema,
  notificationEventSchema,
  notificationPatchSchema,
  notificationPresenceSchema,
  notificationPreferencesSchema,
  notificationSeveritySchema,
  notificationSourceSchema,
  pushSubscriptionSchema,
} from "@workbench/contracts";
import { z } from "zod";
import { persistNotificationPreferences } from "../config/workbench-config.js";
import { isSameOriginRequest } from "../security/same-origin.js";
import type { NotificationDatabase } from "./database.js";
import type { NotificationPushService } from "./push.js";

function identity(request: FastifyRequest): string {
  const raw = request.headers["tailscale-user-login"];
  return (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase() ?? "";
}

function query(request: FastifyRequest) {
  const raw = request.query && typeof request.query === "object" ? request.query as Record<string, unknown> : {};
  return z.object({ cursor: z.string().max(200).optional(), unreadOnly: z.coerce.boolean().default(false),
    source: notificationSourceSchema.optional(), category: notificationCategorySchema.optional(), severity: notificationSeveritySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(raw);
}

export async function registerNotificationRoutes(app: FastifyInstance, options: {
  database: NotificationDatabase; push: NotificationPushService; configDirectory: string;
}) {
  const database = options.database;
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
    const presence = notificationPresenceSchema.nullable().parse(request.body);
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
    const notification = database.create({ source: "workbench", category: "terminal", sourceIcon: "workbench", kind: "workbench.crash", severity: "error", ...parsed });
    return reply.status(201).send(notification);
  });
  app.get("/notifications/settings", async (request) => ({
    preferences: options.push.getPreferences(), pushSupported: true, vapidPublicKey: options.push.publicKey(), subscribed: options.push.isSubscribed(identity(request)),
  }));
  app.put("/notifications/settings", async (request) => {
    const preferences = notificationPreferencesSchema.parse(request.body);
    persistNotificationPreferences(options.configDirectory, preferences);
    options.push.setPreferences(preferences);
    return { preferences, pushSupported: true, vapidPublicKey: options.push.publicKey(), subscribed: options.push.isSubscribed(identity(request)) };
  });
  app.post("/notifications/push-subscription", async (request, reply) => {
    options.push.subscribe(identity(request), pushSubscriptionSchema.parse(request.body));
    return reply.status(201).send({ subscribed: true });
  });
  app.delete("/notifications/push-subscription", async (request, reply) => {
    const endpoint = z.object({ endpoint: z.string().url().optional() }).parse(request.body ?? {}).endpoint;
    options.push.unsubscribeUser(identity(request), endpoint); return reply.status(204).send();
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
