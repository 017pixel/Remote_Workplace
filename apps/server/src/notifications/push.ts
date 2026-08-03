import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import webPush from "web-push";
import {
  notificationPreferencesSchema,
  pushSubscriptionSchema,
  type Notification,
  type NotificationPreferences,
  type PushSubscription,
} from "@workbench/contracts";
import type { NotificationDatabase } from "./database.js";

interface StoredKeys { publicKey: string; privateKey: string }

function loadOrCreateKeys(path: string): StoredKeys {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredKeys>;
    if (typeof parsed.publicKey === "string" && typeof parsed.privateKey === "string") return parsed as StoredKeys;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  mkdirSync(dirname(path), { recursive: true });
  const keys = webPush.generateVAPIDKeys();
  writeFileSync(path, `${JSON.stringify(keys)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  return keys;
}

export class NotificationPushService {
  private readonly db: DatabaseSync;
  private readonly keys: StoredKeys;
  private preferences: NotificationPreferences;
  private readonly unsubscribe: () => void;

  constructor(options: {
    databasePath: string; dataDirectory: string; subject: string;
    preferences: NotificationPreferences; notifications: NotificationDatabase;
  }) {
    this.preferences = notificationPreferencesSchema.parse(options.preferences);
    this.keys = loadOrCreateKeys(join(options.dataDirectory, "notifications/vapid.json"));
    webPush.setVapidDetails(options.subject, this.keys.publicKey, this.keys.privateKey);
    this.db = new DatabaseSync(options.databasePath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, subscription_json TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);`);
    this.unsubscribe = options.notifications.subscribe((event) => {
      if (event.type === "notification.created") void this.deliver(event.notification);
    });
  }

  close(): void { this.unsubscribe(); this.db.close(); }
  publicKey(): string { return this.keys.publicKey; }
  getPreferences(): NotificationPreferences { return this.preferences; }
  setPreferences(preferences: NotificationPreferences): void { this.preferences = notificationPreferencesSchema.parse(preferences); }
  isSubscribed(userId: string): boolean { return Boolean(this.db.prepare("SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1").get(userId)); }

  subscribe(userId: string, subscription: PushSubscription): void {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO push_subscriptions(endpoint,user_id,subscription_json,created_at,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,
      subscription_json=excluded.subscription_json,updated_at=excluded.updated_at`).run(
      subscription.endpoint, userId, JSON.stringify(subscription), now, now,
    );
  }

  unsubscribeUser(userId: string, endpoint?: string): void {
    if (endpoint) this.db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(userId, endpoint);
    else this.db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(userId);
  }

  private shouldPush(notification: Notification): boolean {
    if (!this.preferences.pushEnabled || !this.preferences.sources[notification.source].push) return false;
    return notification.severity === "warning" || notification.severity === "error"
      || notification.kind === "agent.input-required" || notification.kind === "agent.plan-ready";
  }

  private async deliver(notification: Notification): Promise<void> {
    if (!this.shouldPush(notification)) return;
    const subscriptions = this.db.prepare("SELECT endpoint, subscription_json json FROM push_subscriptions").all() as unknown as Array<{ endpoint: string; json: string }>;
    const payload = JSON.stringify({ title: notification.title, body: notification.body, link: "/workbench/inbox", id: notification.id });
    await Promise.all(subscriptions.map(async ({ endpoint, json }) => {
      try {
        const stored = pushSubscriptionSchema.parse(JSON.parse(json));
        await webPush.sendNotification({ endpoint: stored.endpoint, keys: stored.keys }, payload, { TTL: 300, urgency: notification.severity === "error" ? "high" : "normal" });
      }
      catch (error) {
        const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
      }
    }));
  }
}
