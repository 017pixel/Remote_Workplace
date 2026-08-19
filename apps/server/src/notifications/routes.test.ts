import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type webPush from "web-push";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationPreferencesSchema, type PushSubscription } from "@wrapt/contracts";
import { NotificationDatabase } from "./database.js";
import { NotificationPushService } from "./push.js";
import { registerNotificationRoutes } from "./routes.js";

const directories: string[] = [];
const apps: Array<ReturnType<typeof Fastify>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function subscription(name: string): PushSubscription {
  return { endpoint: `https://push.example/${name}`, expirationTime: null, keys: { p256dh: `key-${name}`, auth: `auth-${name}` } };
}

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-push-routes-")); directories.push(directory);
  const databasePath = join(directory, "wrapt.sqlite");
  const notifications = new NotificationDatabase(databasePath);
  const sendNotification = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} })) as unknown as typeof webPush.sendNotification;
  const push = new NotificationPushService({
    databasePath, dataDirectory: directory, subject: "mailto:test@example.com", notifications, sendNotification,
    preferences: notificationPreferencesSchema.parse({ pushEnabled: true, sources: { wrapt: { toast: true, push: true } } }),
  });
  const app = Fastify(); apps.push(app);
  await app.register(registerNotificationRoutes, {
    prefix: "/api/v1", database: notifications, push, configDirectory: directory,
    identity: { allowedUsers: ["owner@example.com", "other@example.com"] },
  });
  app.addHook("onClose", async () => { await push.close(); notifications.close(); });
  await app.ready();
  return { app, sendNotification };
}

describe("Push-Subscription-API", () => {
  it("fordert eine gültige Identität und verwaltet ausschließlich den übergebenen Endpoint", async () => {
    const { app, sendNotification } = await fixture();
    const owner = { "tailscale-user-login": "owner@example.com" };
    const other = { "tailscale-user-login": "other@example.com" };

    expect((await app.inject({ method: "GET", url: "/api/v1/notifications/settings" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/v1/notifications/push-subscription", payload: subscription("anonymous") })).statusCode).toBe(401);

    const first = await app.inject({ method: "POST", url: "/api/v1/notifications/push-subscription", headers: owner, payload: subscription("android") });
    const second = await app.inject({ method: "POST", url: "/api/v1/notifications/push-subscription", headers: owner, payload: subscription("ipad") });
    const duplicate = await app.inject({ method: "POST", url: "/api/v1/notifications/push-subscription", headers: owner, payload: subscription("ipad") });
    expect(first.statusCode).toBe(201);
    expect(second.json()).toEqual({ registered: true, subscriptionCount: 2 });
    expect(duplicate.json()).toEqual({ registered: true, subscriptionCount: 2 });

    const foreignDelete = await app.inject({ method: "DELETE", url: "/api/v1/notifications/push-subscription", headers: other, payload: { endpoint: subscription("android").endpoint } });
    const foreignTest = await app.inject({ method: "POST", url: "/api/v1/notifications/push-test", headers: other, payload: { endpoint: subscription("ipad").endpoint } });
    expect(foreignDelete.statusCode).toBe(404);
    expect(foreignTest.statusCode).toBe(404);
    expect(sendNotification).not.toHaveBeenCalled();

    const removed = await app.inject({ method: "DELETE", url: "/api/v1/notifications/push-subscription", headers: owner, payload: { endpoint: subscription("android").endpoint } });
    expect(removed.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/v1/notifications/settings", headers: owner })).json()).toMatchObject({ subscriptionCount: 1, serverPushEnabled: true });

    const tested = await app.inject({ method: "POST", url: "/api/v1/notifications/push-test", headers: owner, payload: { endpoint: subscription("ipad").endpoint } });
    expect(tested.statusCode).toBe(200);
    expect(tested.json()).toEqual({ sent: true });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
