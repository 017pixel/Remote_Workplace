import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import webPush from "web-push";
import {
  notificationPreferencesSchema,
  notificationPushPayloadSchema,
  pushSubscriptionRegistrationSchema,
  pushSubscriptionSchema,
  type Notification,
  type NotificationPreferences,
  type NotificationPushPayload,
  type PushSubscription,
  type PushSubscriptionRegistration,
} from "@workbench/contracts";
import type { NotificationDatabase } from "./database.js";

interface StoredKeys { publicKey: string; privateKey: string }
interface SubscriptionRow { endpoint: string; userId: string; json: string }
interface PushLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

const fallbackLink = "/workbench/inbox";
const deliveryConcurrency = 4;
const noopLogger: PushLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

function loadOrCreateKeys(path: string): StoredKeys {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredKeys>;
    if (typeof parsed.publicKey === "string" && typeof parsed.privateKey === "string") {
      chmodSync(path, 0o600);
      return parsed as StoredKeys;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const keys = webPush.generateVAPIDKeys();
  writeFileSync(path, `${JSON.stringify(keys)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  return keys;
}

function statusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return null;
  const value = Number(error.statusCode);
  return Number.isInteger(value) ? value : null;
}

function endpointHost(endpoint: string): string {
  try { return new URL(endpoint).host; } catch { return "ungültig"; }
}

function isApplePushHost(host: string): boolean { return host === "web.push.apple.com"; }

export function safeNotificationLink(link: string | null): string {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return fallbackLink;
  if ([...link].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallbackLink;
  try {
    const url = new URL(link, "https://workbench.invalid");
    if (url.origin !== "https://workbench.invalid") return fallbackLink;
    const allowed = url.pathname === "/workbench" || url.pathname.startsWith("/workbench/")
      || url.pathname === "/t3" || url.pathname.startsWith("/t3/");
    return allowed ? `${url.pathname}${url.search}${url.hash}` : fallbackLink;
  } catch {
    return fallbackLink;
  }
}

export function isPushCandidate(notification: Notification): boolean {
  if (notification.severity === "warning" || notification.severity === "error") return true;
  return [
    "agent.input-required",
    "agent.plan-ready",
    "agent.completed",
    "agent.failed",
    "terminal.failed",
    "workbench.crash",
    "hermes.result",
    "hermes.update",
  ].includes(notification.kind);
}

export function pushTimeToLive(notification: Notification): number {
  if (notification.severity === "warning" || notification.severity === "error"
    || ["agent.input-required", "agent.plan-ready", "agent.failed", "terminal.failed", "workbench.crash"].includes(notification.kind)) return 86_400;
  if (["agent.completed", "hermes.result", "hermes.update"].includes(notification.kind)) return 3_600;
  return 900;
}

export function createPushPayload(notification: Notification): NotificationPushPayload {
  return notificationPushPayloadSchema.parse({
    version: 1,
    id: notification.id,
    title: notification.title,
    body: notification.body,
    link: safeNotificationLink(notification.link),
    source: notification.source,
    severity: notification.severity,
    createdAt: notification.createdAt,
  });
}

interface PushDeliveryOptions { TTL: number; urgency: "high" | "normal"; topic: string }

export class NotificationPushService {
  private readonly db: DatabaseSync;
  private readonly keys: StoredKeys;
  private readonly sendNotification: typeof webPush.sendNotification;
  private readonly logger: PushLogger;
  private readonly notifications: NotificationDatabase;
  private preferences: NotificationPreferences;
  private readonly unsubscribeNotifications: () => void;
  private readonly pendingDeliveries = new Set<Promise<unknown>>();

  constructor(options: {
    databasePath: string;
    dataDirectory: string;
    subject: string;
    preferences: NotificationPreferences;
    notifications: NotificationDatabase;
    logger?: PushLogger;
    sendNotification?: typeof webPush.sendNotification;
  }) {
    this.preferences = notificationPreferencesSchema.parse(options.preferences);
    this.keys = loadOrCreateKeys(join(options.dataDirectory, "notifications/vapid.json"));
    webPush.setVapidDetails(options.subject, this.keys.publicKey, this.keys.privateKey);
    this.sendNotification = options.sendNotification ?? webPush.sendNotification.bind(webPush);
    this.logger = options.logger ?? noopLogger;
    this.notifications = options.notifications;
    this.db = new DatabaseSync(options.databasePath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, subscription_json TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        device_name TEXT, platform TEXT, user_agent TEXT,
        last_success_at TEXT, last_error_status TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);`);
    this.addColumn("device_name", "TEXT");
    this.addColumn("platform", "TEXT");
    this.addColumn("user_agent", "TEXT");
    this.addColumn("last_success_at", "TEXT");
    this.addColumn("last_error_status", "TEXT");
    this.unsubscribeNotifications = options.notifications.subscribe((event) => {
      if (event.type !== "notification.created") return;
      const delivery = this.deliver(event.notification).catch((error: unknown) => {
        this.logger.error({ error: error instanceof Error ? error.message : String(error) }, "Push-Versand ist unerwartet fehlgeschlagen");
      });
      this.pendingDeliveries.add(delivery);
      void delivery.finally(() => this.pendingDeliveries.delete(delivery));
    });
  }

  async close(): Promise<void> {
    this.unsubscribeNotifications();
    await Promise.allSettled(this.pendingDeliveries);
    this.db.close();
  }

  publicKey(): string { return this.keys.publicKey; }
  getPreferences(): NotificationPreferences { return this.preferences; }
  setPreferences(preferences: NotificationPreferences): void { this.preferences = notificationPreferencesSchema.parse(preferences); }
  subscriptionCount(userId: string): number {
    return Number((this.db.prepare("SELECT COUNT(*) count FROM push_subscriptions WHERE user_id = ?").get(userId) as { count: number }).count);
  }

  register(userId: string, input: PushSubscriptionRegistration): { registered: true; subscriptionCount: number } | { registered: false } {
    const registration = pushSubscriptionRegistrationSchema.parse(input);
    const subscription = pushSubscriptionSchema.parse(registration);
    const existing = this.db.prepare("SELECT user_id userId FROM push_subscriptions WHERE endpoint = ?").get(subscription.endpoint) as { userId: string } | undefined;
    if (existing && existing.userId !== userId) return { registered: false };
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO push_subscriptions(
      endpoint,user_id,subscription_json,created_at,updated_at,device_name,platform,user_agent,last_error_status
    ) VALUES(?,?,?,?,?,?,?,?,NULL)
    ON CONFLICT(endpoint) DO UPDATE SET
      subscription_json=excluded.subscription_json,updated_at=excluded.updated_at,
      device_name=excluded.device_name,platform=excluded.platform,user_agent=excluded.user_agent,last_error_status=NULL`).run(
      subscription.endpoint,
      userId,
      JSON.stringify(subscription),
      now,
      now,
      registration.deviceName ?? null,
      registration.platform ?? null,
      registration.userAgent ?? null,
    );
    return { registered: true, subscriptionCount: this.subscriptionCount(userId) };
  }

  unregister(userId: string, endpoint: string): boolean {
    const result = this.db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(userId, endpoint);
    return Number(result.changes) === 1;
  }

  async sendTest(userId: string, endpoint: string): Promise<boolean> {
    const row = this.db.prepare("SELECT endpoint, user_id userId, subscription_json json FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
      .get(userId, endpoint) as SubscriptionRow | undefined;
    if (!row) return false;
    const payload = notificationPushPayloadSchema.parse({
      version: 1,
      id: randomUUID(),
      title: "Testbenachrichtigung",
      body: "Web Push funktioniert auf diesem Gerät.",
      link: fallbackLink,
      source: "workbench",
      severity: "info",
      createdAt: new Date().toISOString(),
    });
    const result = await this.sendToSubscription(row, JSON.stringify(payload), { TTL: 300, urgency: "high", topic: payload.id.replaceAll("-", "") });
    if (result !== "sent") throw new Error("Die Testbenachrichtigung konnte nicht zugestellt werden.");
    return true;
  }

  async deliver(notification: Notification): Promise<{ attempted: number; sent: number; removed: number; failed: number }> {
    if (!this.shouldPush(notification)) return { attempted: 0, sent: 0, removed: 0, failed: 0 };
    const subscriptions = this.db.prepare("SELECT endpoint, user_id userId, subscription_json json FROM push_subscriptions ORDER BY created_at, endpoint").all() as unknown as SubscriptionRow[];
    const payload = JSON.stringify(createPushPayload(notification));
    const options = {
      TTL: pushTimeToLive(notification),
      urgency: notification.severity === "error" || notification.kind === "agent.input-required" ? "high" as const : "normal" as const,
      topic: notification.id.replaceAll("-", ""),
    };
    const results: Array<"sent" | "removed" | "failed"> = [];
    for (let index = 0; index < subscriptions.length; index += deliveryConcurrency) {
      const batch = subscriptions.slice(index, index + deliveryConcurrency);
      results.push(...await Promise.all(batch.map((subscription) => this.sendToSubscription(subscription, payload, options))));
    }
    const summary = {
      attempted: subscriptions.length,
      sent: results.filter((result) => result === "sent").length,
      removed: results.filter((result) => result === "removed").length,
      failed: results.filter((result) => result === "failed").length,
    };
    this.logger.info({ notificationId: notification.id, source: notification.source, ...summary }, "Push-Versand abgeschlossen");
    return summary;
  }

  private addColumn(name: string, declaration: string): void {
    const columns = this.db.prepare("PRAGMA table_info(push_subscriptions)").all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name)) this.db.exec(`ALTER TABLE push_subscriptions ADD COLUMN ${name} ${declaration}`);
  }

  private shouldPush(notification: Notification): boolean {
    // Die Workbench ist aktiv genutzt (frischer Heartbeat eines sichtbaren
    // Fensters): Toast und Inbox decken den Desktop ab, Push an Handy und
    // Hintergrund-Fenster wäre doppelt. Erst wenn kein Fenster mehr aktiv
    // meldet, gehen Push-Benachrichtigungen an alle Geräte.
    return this.preferences.pushEnabled
      && this.preferences.sources[notification.source].push
      && isPushCandidate(notification)
      && !this.notifications.hasActiveWorkbench();
  }

  private async sendToSubscription(
    row: SubscriptionRow,
    payload: string,
    options: PushDeliveryOptions,
  ): Promise<"sent" | "removed" | "failed"> {
    let stored: PushSubscription;
    try {
      stored = pushSubscriptionSchema.parse(JSON.parse(row.json));
    } catch (error) {
      this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(row.endpoint);
      this.logger.error({ endpointHost: endpointHost(row.endpoint), error: error instanceof Error ? error.message : String(error) }, "Ungültige Push-Subscription wurde entfernt");
      return "removed";
    }
    // FCM nutzt den Topic zur Kollaps-Bündelung. APNs erwartet dort die
    // Bundle-ID der installierten Web-App; ein beliebiger Wert führt zu 403.
    // Ohne Topic verwendet APNs automatisch die richtige Bundle-ID.
    const effective = isApplePushHost(endpointHost(row.endpoint))
      ? { TTL: options.TTL, urgency: options.urgency }
      : options;
    try {
      await this.sendNotification({ endpoint: stored.endpoint, keys: stored.keys }, payload, effective);
      this.db.prepare("UPDATE push_subscriptions SET last_success_at = ?, last_error_status = NULL WHERE endpoint = ?").run(new Date().toISOString(), row.endpoint);
      return "sent";
    } catch (error) {
      const code = statusCode(error);
      if (code === 404 || code === 410) {
        this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(row.endpoint);
        this.logger.info({ endpointHost: endpointHost(row.endpoint), statusCode: code }, "Abgelaufene Push-Subscription wurde entfernt");
        return "removed";
      }
      this.db.prepare("UPDATE push_subscriptions SET last_error_status = ? WHERE endpoint = ?").run(code === null ? "network" : String(code), row.endpoint);
      const details = { endpointHost: endpointHost(row.endpoint), statusCode: code, error: error instanceof Error ? error.message : String(error) };
      if (code === 401 || code === 403) this.logger.error(details, "Push-Dienst lehnt VAPID-Konfiguration ab");
      else if (code === 429) this.logger.warn(details, "Push-Dienst begrenzt den Versand");
      else if (code !== null && code >= 500) this.logger.warn(details, "Push-Dienst ist vorübergehend nicht verfügbar");
      else this.logger.error(details, "Push-Versand an ein Gerät ist fehlgeschlagen");
      return "failed";
    }
  }
}
