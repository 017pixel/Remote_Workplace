import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type webPush from "web-push";
import { notificationPreferencesSchema, notificationSchema, type Notification, type PushSubscription } from "@workbench/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationDatabase } from "./database.js";
import { createPushPayload, NotificationPushService, safeNotificationLink } from "./push.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function subscription(name: string): PushSubscription {
  return { endpoint: `https://push.example/${name}`, expirationTime: null, keys: { p256dh: `key-${name}`, auth: `auth-${name}` } };
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return notificationSchema.parse({
    id: randomUUID(), source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.completed",
    severity: "success", state: "active", title: "Fertig", body: "Die Aufgabe ist abgeschlossen.",
    link: "/workbench/t3-code?thread=1", remoteId: null, createdAt: new Date().toISOString(), readAt: null,
    acknowledgedAt: null, deletedAt: null, resolvedAt: null, meta: {}, report: null, ...overrides,
  });
}

function fixture(options: {
  pushEnabled?: boolean;
  sourcePush?: boolean;
  sendNotification?: typeof webPush.sendNotification;
  directory?: string;
  presenceTtlMilliseconds?: number;
} = {}) {
  const directory = options.directory ?? mkdtempSync(join(tmpdir(), "remote-workplace-push-"));
  if (!options.directory) directories.push(directory);
  const databasePath = join(directory, "workbench.sqlite");
  const notifications = new NotificationDatabase(databasePath, 48, options.presenceTtlMilliseconds);
  const preferences = notificationPreferencesSchema.parse({
    pushEnabled: options.pushEnabled ?? true,
    sources: { t3: { toast: true, push: options.sourcePush ?? true }, workbench: { toast: true, push: true } },
  });
  const sendNotification = options.sendNotification ?? (vi.fn(async () => ({ statusCode: 201, body: "", headers: {} })) as unknown as typeof webPush.sendNotification);
  const push = new NotificationPushService({ databasePath, dataDirectory: directory, subject: "mailto:test@example.com", preferences, notifications, sendNotification });
  return { directory, databasePath, notifications, push, sendNotification };
}

describe("NotificationPushService", () => {
  it("verwaltet zwei Geräte eines Benutzers unabhängig und registriert idempotent", async () => {
    const { notifications, push } = fixture();
    expect(push.register("user@example.com", subscription("android"))).toMatchObject({ registered: true, subscriptionCount: 1 });
    expect(push.register("user@example.com", subscription("ipad"))).toMatchObject({ registered: true, subscriptionCount: 2 });
    expect(push.register("user@example.com", subscription("ipad"))).toMatchObject({ registered: true, subscriptionCount: 2 });
    expect(push.unregister("user@example.com", subscription("android").endpoint)).toBe(true);
    expect(push.subscriptionCount("user@example.com")).toBe(1);
    expect(push.unregister("user@example.com", subscription("android").endpoint)).toBe(false);
    await push.close(); notifications.close();
  });

  it("verhindert Übernahme, Löschen und Testen eines fremden Endpoints", async () => {
    const { notifications, push, sendNotification } = fixture();
    expect(push.register("owner@example.com", subscription("owned"))).toMatchObject({ registered: true });
    expect(push.register("other@example.com", subscription("owned"))).toEqual({ registered: false });
    expect(push.unregister("other@example.com", subscription("owned").endpoint)).toBe(false);
    await expect(push.sendTest("other@example.com", subscription("owned").endpoint)).resolves.toBe(false);
    expect(sendNotification).not.toHaveBeenCalled();
    await push.close(); notifications.close();
  });

  it("beachtet globale Policy, Quellen und Relevanz zentral", async () => {
    const disabled = fixture({ pushEnabled: false });
    disabled.push.register("user@example.com", subscription("disabled"));
    await expect(disabled.push.deliver(notification())).resolves.toMatchObject({ attempted: 0 });
    await disabled.push.close(); disabled.notifications.close();

    const sourceDisabled = fixture({ sourcePush: false });
    sourceDisabled.push.register("user@example.com", subscription("source-disabled"));
    await expect(sourceDisabled.push.deliver(notification())).resolves.toMatchObject({ attempted: 0 });
    await sourceDisabled.push.close(); sourceDisabled.notifications.close();

    const enabled = fixture();
    enabled.push.register("user@example.com", subscription("enabled"));
    await expect(enabled.push.deliver(notification({ kind: "terminal.completed" }))).resolves.toMatchObject({ attempted: 0 });
    for (const kind of ["agent.input-required", "agent.plan-ready", "agent.completed", "agent.failed", "terminal.failed"]) {
      await expect(enabled.push.deliver(notification({ kind }))).resolves.toMatchObject({ attempted: 1, sent: 1 });
    }
    await expect(enabled.push.deliver(notification({ source: "workbench", sourceIcon: "workbench", kind: "workbench.crash" }))).resolves.toMatchObject({ attempted: 1, sent: 1 });
    await expect(enabled.push.deliver(notification({ kind: "sonstige.warnung", severity: "warning" }))).resolves.toMatchObject({ attempted: 1, sent: 1 });
    await expect(enabled.push.deliver(notification({ kind: "sonstiger.fehler", severity: "error" }))).resolves.toMatchObject({ attempted: 1, sent: 1 });
    expect(enabled.sendNotification).toHaveBeenCalledTimes(8);
    await enabled.push.close(); enabled.notifications.close();
  });

  it("sendet genau einmal an jedes Gerät und lässt einen Gerätefehler die anderen nicht blockieren", async () => {
    const sendMock = vi.fn(async (target: PushSubscription) => {
      if (target.endpoint.endsWith("/broken")) throw Object.assign(new Error("vorübergehend"), { statusCode: 503 });
      return { statusCode: 201, body: "", headers: {} };
    });
    const send = sendMock as unknown as typeof webPush.sendNotification;
    const { notifications, push } = fixture({ sendNotification: send });
    for (const name of ["android", "broken", "ipad"]) push.register("user@example.com", subscription(name));
    await expect(push.deliver(notification({ kind: "agent.failed", severity: "error" }))).resolves.toEqual({ attempted: 3, sent: 2, removed: 0, failed: 1 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(new Set(sendMock.mock.calls.map(([target]) => target.endpoint)).size).toBe(3);
    await push.close(); notifications.close();
  });

  it("entfernt 404 und 410, behält temporäre Fehler aber bei", async () => {
    const send = vi.fn(async (target: PushSubscription) => {
      const code = target.endpoint.endsWith("/gone") ? 410 : target.endpoint.endsWith("/missing") ? 404 : 429;
      throw Object.assign(new Error(String(code)), { statusCode: code });
    }) as unknown as typeof webPush.sendNotification;
    const { notifications, push } = fixture({ sendNotification: send });
    for (const name of ["gone", "missing", "limited"]) push.register("user@example.com", subscription(name));
    await expect(push.deliver(notification({ severity: "error" }))).resolves.toEqual({ attempted: 3, sent: 0, removed: 2, failed: 1 });
    expect(push.subscriptionCount("user@example.com")).toBe(1);
    await push.close(); notifications.close();
  });

  it("unterdrückt Push, solange die Workbench aktiv gemeldet wird", async () => {
    const { notifications, push, sendNotification } = fixture();
    push.register("user@example.com", subscription("handy"));
    notifications.setPresence([{ source: "t3", threadId: "thread-1" }]);
    await expect(push.deliver(notification({ kind: "agent.completed", meta: { threadId: "thread-1" } }))).resolves.toMatchObject({ attempted: 0 });
    await expect(push.deliver(notification({ kind: "agent.completed", meta: { threadId: "thread-2" } }))).resolves.toMatchObject({ attempted: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
    await push.close(); notifications.close();
  });

  it("sendet wieder, sobald die Presence abgelaufen ist", async () => {
    vi.useFakeTimers();
    try {
      const { notifications, push } = fixture({ presenceTtlMilliseconds: 10_000 });
      push.register("user@example.com", subscription("handy"));
      notifications.setPresence([{ source: "t3", threadId: "thread-1" }]);
      await expect(push.deliver(notification({ kind: "agent.completed", meta: { threadId: "thread-1" } }))).resolves.toMatchObject({ attempted: 0 });
      vi.advanceTimersByTime(10_001);
      await expect(push.deliver(notification({ kind: "agent.completed", meta: { threadId: "thread-1" } }))).resolves.toMatchObject({ attempted: 1, sent: 1 });
      await push.close(); notifications.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sendet an APNs ohne Topic-Header, an FCM mit", async () => {
    const sendMock = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));
    const { notifications, push } = fixture({ sendNotification: sendMock as unknown as typeof webPush.sendNotification });
    push.register("user@example.com", subscription("fcm"));
    push.register("user@example.com", { ...subscription("apns"), endpoint: "https://web.push.apple.com/device-token" });
    await push.deliver(notification({ kind: "agent.completed" }));
    expect(sendMock).toHaveBeenCalledTimes(2);
    const calls = sendMock.mock.calls as unknown as Array<[unknown, unknown, { topic?: string }]>;
    const fcm = calls.find(([target]) => (target as { endpoint: string }).endpoint.endsWith("/fcm"))![2];
    const apns = calls.find(([target]) => (target as { endpoint: string }).endpoint.includes("web.push.apple.com"))![2];
    expect(typeof fcm.topic).toBe("string");
    expect(apns.topic).toBeUndefined();
    await push.close(); notifications.close();
  });

  it("übernimmt sichere Deep Links und ersetzt fremde Ziele", () => {
    expect(safeNotificationLink("/workbench/codex?session=1")).toBe("/workbench/codex?session=1");
    expect(safeNotificationLink("/t3/environment/thread")).toBe("/t3/environment/thread");
    expect(safeNotificationLink("https://attacker.example/path")).toBe("/workbench/inbox");
    expect(safeNotificationLink("//attacker.example/path")).toBe("/workbench/inbox");
    expect(createPushPayload(notification({ link: "/admin" }))).toMatchObject({ version: 1, link: "/workbench/inbox" });
  });

  it("verwendet denselben VAPID-Schlüssel nach einem Neustart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "remote-workplace-vapid-")); directories.push(directory);
    const first = fixture({ directory });
    const publicKey = first.push.publicKey();
    await first.push.close(); first.notifications.close();
    const second = fixture({ directory });
    expect(second.push.publicKey()).toBe(publicKey);
    await second.push.close(); second.notifications.close();
  });
});
