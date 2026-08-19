import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  notificationSchema,
  type Notification,
  type NotificationCategory,
  type NotificationEvent,
  type NotificationPresenceItem,
  type NotificationReport,
  type NotificationSeverity,
  type NotificationSource,
  type NotificationSourceIcon,
} from "@wrapt/contracts";
import { redactSensitive, truncateText } from "../hermes/redaction.js";

interface NotificationRow {
  id: string; source: NotificationSource; category: NotificationCategory; sourceIcon: NotificationSourceIcon;
  kind: string; severity: NotificationSeverity; state: "active" | "resolved" | "dismissed";
  title: string; body: string; link: string | null; remoteId: string | null; createdAt: string;
  readAt: string | null; acknowledgedAt: string | null; deletedAt: string | null; resolvedAt: string | null;
  metaJson: string; reportJson: string | null;
}

interface PresenceEntry extends NotificationPresenceItem {
  lastSeenAt: number;
}

export interface NotificationInput {
  source: NotificationSource; category: NotificationCategory; sourceIcon: NotificationSourceIcon;
  kind: string; severity: NotificationSeverity; title: string; body: string;
  link?: string | null; remoteId?: string | null; meta?: Record<string, unknown>; report?: NotificationReport | null;
}

function safeJson(value: string | null, fallback: unknown): unknown {
  if (!value) return fallback;
  try { return JSON.parse(value) as unknown; } catch { return fallback; }
}

function rowToNotification(row: NotificationRow): Notification {
  return notificationSchema.parse({ ...row, meta: safeJson(row.metaJson, {}), report: safeJson(row.reportJson, null) });
}

function encodeCursor(createdAt: string, id: string): string { return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url"); }
function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    return typeof value.createdAt === "string" && typeof value.id === "string" ? { createdAt: value.createdAt, id: value.id } : null;
  } catch { return null; }
}

const selection = `id, source, category, source_icon sourceIcon, kind, severity, state, title, body, link,
  remote_id remoteId, created_at createdAt, read_at readAt, acknowledged_at acknowledgedAt,
  deleted_at deletedAt, resolved_at resolvedAt, metadata_json metaJson, report_json reportJson`;

export class NotificationDatabase {
  private readonly db: DatabaseSync;
  private readonly listeners = new Set<(event: NotificationEvent) => void>();
  private readonly retentionMilliseconds: number;
  private readonly presenceTtlMilliseconds: number;
  private presence: PresenceEntry[] = [];
  /** Letzter Presence-Heartbeat, auch mit leerer Chat-Liste. */
  private lastActiveAt = 0;

  constructor(path: string, retentionHours = 48, presenceTtlMilliseconds = 90_000) {
    mkdirSync(dirname(path), { recursive: true });
    this.retentionMilliseconds = retentionHours * 3_600_000;
    this.presenceTtlMilliseconds = presenceTtlMilliseconds;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.db.exec(`CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL, link TEXT, remote_id TEXT, created_at TEXT NOT NULL,
      read_at TEXT, acknowledged_at TEXT, metadata_json TEXT NOT NULL DEFAULT '{}'
    ) STRICT;`);
    this.addColumn("category", "TEXT NOT NULL DEFAULT 'terminal'");
    this.addColumn("source_icon", "TEXT NOT NULL DEFAULT 'workbench'");
    this.addColumn("state", "TEXT NOT NULL DEFAULT 'active'");
    this.addColumn("deleted_at", "TEXT");
    this.addColumn("resolved_at", "TEXT");
    this.addColumn("report_json", "TEXT");
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS notifications_remote_unique ON notifications(source, kind, remote_id) WHERE remote_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS notifications_created_at ON notifications(created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS notifications_active_unread ON notifications(read_at) WHERE state = 'active' AND read_at IS NULL;`);
    // Bestehende Datensätze sinnvoll in das neue Modell überführen.
    this.db.exec(`UPDATE notifications SET
      category = CASE WHEN source IN ('hermes', 'update') THEN 'hermes' ELSE 'terminal' END,
      source_icon = CASE WHEN source IN ('hermes', 'update') THEN 'hermes' ELSE 'wrapt' END
      WHERE category = 'terminal' AND source_icon = 'workbench';`);
    const legacyUpdates = this.db.prepare("SELECT id, body, metadata_json metaJson FROM notifications WHERE state = 'active' AND source = 'update' AND kind IN ('hermes.update', 'hermes.updated')").all() as unknown as Array<{ id: string; body: string; metaJson: string }>;
    const resolvedAt = new Date().toISOString();
    for (const update of legacyUpdates) {
      const meta = safeJson(update.metaJson, {}) as Record<string, unknown>;
      const versions = update.body.split("→").map((part) => part.trim());
      if ((typeof meta.previousVersion === "string" && meta.previousVersion === meta.newVersion) || (versions.length === 2 && versions[0] === versions[1])) {
        this.db.prepare("UPDATE notifications SET state = 'resolved', resolved_at = ? WHERE id = ?").run(resolvedAt, update.id);
      }
    }
    this.prune();
  }

  private addColumn(name: string, declaration: string): void {
    const columns = this.db.prepare("PRAGMA table_info(notifications)").all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === name)) this.db.exec(`ALTER TABLE notifications ADD COLUMN ${name} ${declaration}`);
  }

  close() { this.listeners.clear(); this.db.close(); }
  subscribe(listener: (event: NotificationEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: NotificationEvent): void { for (const listener of this.listeners) listener(event); }

  create(input: NotificationInput): Notification {
    const parsed = notificationSchema.parse({
      id: randomUUID(), source: input.source, category: input.category, sourceIcon: input.sourceIcon,
      kind: input.kind, severity: input.severity, state: "active", title: input.title,
      body: truncateText(redactSensitive(input.body), 1_000), link: input.link ?? null,
      remoteId: input.remoteId ?? null, createdAt: new Date().toISOString(), readAt: null,
      acknowledgedAt: null, deletedAt: null, resolvedAt: null,
      meta: redactSensitive(input.meta ?? {}), report: input.report ? redactSensitive(input.report) : null,
    });
    if (parsed.remoteId) {
      const existing = this.findByRemoteId(parsed.source, parsed.kind, parsed.remoteId);
      // Ein verworfener Eintrag bleibt für denselben Remote-Zustand verworfen.
      // Quellen müssen für einen späteren, neuen Zustand eine neue remoteId
      // liefern. Sonst würde ein Dienstneustart dieselbe Meldung erneut pushen.
      if (existing?.state === "active" || existing?.state === "dismissed") return existing;
      if (existing) {
        const readAt = this.presenceMatches(parsed) ? new Date().toISOString() : null;
        this.db.prepare(`UPDATE notifications SET category=?,source_icon=?,severity=?,state='active',title=?,body=?,link=?,created_at=?,
          read_at=?,acknowledged_at=NULL,deleted_at=NULL,resolved_at=NULL,metadata_json=?,report_json=? WHERE id=?`).run(
          parsed.category, parsed.sourceIcon, parsed.severity, parsed.title, parsed.body, parsed.link, parsed.createdAt,
          readAt, JSON.stringify(parsed.meta), parsed.report ? JSON.stringify(parsed.report) : null, existing.id,
        );
        const reactivated = this.get(existing.id)!;
        this.emit({ type: "notification.created", notification: reactivated });
        return reactivated;
      }
    }
    const readAt = this.presenceMatches(parsed) ? new Date().toISOString() : null;
    this.db.prepare(`INSERT OR IGNORE INTO notifications(
      id, source, category, source_icon, kind, severity, state, title, body, link, remote_id,
      created_at, read_at, acknowledged_at, deleted_at, resolved_at, metadata_json, report_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      parsed.id, parsed.source, parsed.category, parsed.sourceIcon, parsed.kind, parsed.severity, parsed.state,
      parsed.title, parsed.body, parsed.link, parsed.remoteId, parsed.createdAt, readAt, null, null, null,
      JSON.stringify(parsed.meta), parsed.report ? JSON.stringify(parsed.report) : null,
    );
    const notification = parsed.remoteId
      ? this.findByRemoteId(parsed.source, parsed.kind, parsed.remoteId) ?? parsed
      : readAt ? this.get(parsed.id) ?? parsed : parsed;
    if (notification.id === parsed.id) this.emit({ type: "notification.created", notification });
    this.prune();
    return notification;
  }

  list(options: { cursor?: string; unreadOnly?: boolean; source?: NotificationSource; severity?: NotificationSeverity; category?: NotificationCategory; limit?: number } = {}) {
    const limit = Math.min(100, Math.max(1, options.limit ?? 50));
    const cursor = decodeCursor(options.cursor);
    const where = ["state = 'active'"];
    const values: Array<string | number> = [];
    if (options.unreadOnly) where.push("read_at IS NULL");
    if (options.source) { where.push("source = ?"); values.push(options.source); }
    if (options.severity) { where.push("severity = ?"); values.push(options.severity); }
    if (options.category) { where.push("category = ?"); values.push(options.category); }
    if (cursor) { where.push("(created_at < ? OR (created_at = ? AND id < ?))"); values.push(cursor.createdAt, cursor.createdAt, cursor.id); }
    const rows = this.db.prepare(`SELECT ${selection} FROM notifications WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...values, limit + 1) as unknown as NotificationRow[];
    const page = rows.slice(0, limit).map(rowToNotification);
    const last = page.at(-1);
    return { notifications: page, unreadCount: this.unreadCount(), unacknowledgedErrorCount: this.unacknowledgedErrorCount(), nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null };
  }

  patch(id: string, patch: { read?: boolean; acknowledged?: boolean }): Notification | null {
    const at = new Date().toISOString();
    if (patch.read !== undefined) this.db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND state = 'active'").run(patch.read ? at : null, id);
    if (patch.acknowledged !== undefined) this.db.prepare("UPDATE notifications SET acknowledged_at = ? WHERE id = ? AND state = 'active'").run(patch.acknowledged ? at : null, id);
    const notification = this.get(id);
    if (notification) this.emit({ type: "notification.updated", notification });
    return notification;
  }

  markAllRead(category?: NotificationCategory): void {
    const at = new Date().toISOString();
    if (category) this.db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE state = 'active' AND category = ?").run(at, category);
    else this.db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE state = 'active'").run(at);
    this.emit({ type: "notification.sync" });
  }

  /**
   * Der Browser meldet hier, welche Quelle und welcher Chat gerade sichtbar
   * sind (z. B. T3-Thread oder Codex-Sitzung). Es zählt die aktive Route plus
   * alle offenen Panels. Passt eine aktive, ungelesene Benachrichtigung zu
   * dieser Ansicht, gilt sie als gesehen und wird gelesen. Ein Eintrag ohne
   * konkrete Referenz (threadId/sessionId) passt zu nichts.
   *
   * Jede Meldung ist zugleich ein Aktiv-Heartbeat: Sie hält die Workbench als
   * „aktiv genutzt" frisch, was den Push-Versand unterdrückt. Nach
   * `presenceTtlMilliseconds` ohne Meldung gilt die Ansicht als verlassen.
   */
  setPresence(input: NotificationPresenceItem | NotificationPresenceItem[] | null): number {
    const items = Array.isArray(input) ? input : input ? [input] : [];
    this.presence = items.map((item) => ({ ...item, lastSeenAt: Date.now() }));
    this.lastActiveAt = Date.now();
    if (this.presence.length === 0) return 0;
    const at = new Date().toISOString();
    const ids = new Set<string>();
    for (const entry of this.presence) {
      const rows = this.db.prepare(`SELECT ${selection} FROM notifications WHERE state = 'active' AND read_at IS NULL AND source = ?`)
        .all(entry.source) as unknown as NotificationRow[];
      for (const row of rows) if (this.presenceMatches(rowToNotification(row))) ids.add(row.id);
    }
    if (ids.size === 0) return 0;
    const placeholders = [...ids].map(() => "?").join(",");
    this.db.prepare(`UPDATE notifications SET read_at = ? WHERE id IN (${placeholders})`).run(at, ...ids);
    this.emit({ type: "notification.sync" });
    return ids.size;
  }

  /** Ist die Workbench in einem sichtbaren Browserfenster aktiv genutzt worden? */
  hasActiveWorkbench(): boolean {
    return Date.now() - this.lastActiveAt < this.presenceTtlMilliseconds;
  }

  dismiss(id: string): void {
    const at = new Date().toISOString();
    this.db.prepare("UPDATE notifications SET state = 'dismissed', deleted_at = ?, read_at = COALESCE(read_at, ?) WHERE id = ? AND state = 'active'").run(at, at, id);
    this.emit({ type: "notification.removed", id });
  }

  dismissAll(): number {
    const ids = this.db.prepare("SELECT id FROM notifications WHERE state = 'active'").all() as unknown as Array<{ id: string }>;
    if (ids.length === 0) return 0;
    const at = new Date().toISOString();
    this.db.prepare("UPDATE notifications SET state = 'dismissed', deleted_at = ?, read_at = COALESCE(read_at, ?) WHERE state = 'active'").run(at, at);
    for (const { id } of ids) this.emit({ type: "notification.removed", id });
    return ids.length;
  }

  resolveByRemoteId(source: NotificationSource, kind: string, remoteId: string): boolean {
    const existing = this.findByRemoteId(source, kind, remoteId);
    if (!existing || existing.state !== "active") return false;
    const at = new Date().toISOString();
    this.db.prepare("UPDATE notifications SET state = 'resolved', resolved_at = ? WHERE id = ?").run(at, existing.id);
    this.emit({ type: "notification.removed", id: existing.id });
    return true;
  }

  activeRemoteId(source: NotificationSource, kind: string, remoteIdPrefix: string): string | null {
    const row = this.db.prepare("SELECT remote_id remoteId FROM notifications WHERE state = 'active' AND source = ? AND kind = ? AND remote_id LIKE ? ORDER BY created_at DESC LIMIT 1")
      .get(source, kind, `${remoteIdPrefix}%`) as { remoteId?: string | null } | undefined;
    return row?.remoteId ?? null;
  }

  resolveMatching(source: NotificationSource, kinds: readonly string[], remoteIdPrefix: string): number {
    if (kinds.length === 0) return 0;
    const at = new Date().toISOString();
    const placeholders = kinds.map(() => "?").join(",");
    const ids = this.db.prepare(`SELECT id FROM notifications WHERE state = 'active' AND source = ? AND kind IN (${placeholders}) AND remote_id LIKE ?`).all(source, ...kinds, `${remoteIdPrefix}%`) as unknown as Array<{ id: string }>;
    this.db.prepare(`UPDATE notifications SET state = 'resolved', resolved_at = ? WHERE state = 'active' AND source = ? AND kind IN (${placeholders}) AND remote_id LIKE ?`).run(at, source, ...kinds, `${remoteIdPrefix}%`);
    for (const { id } of ids) this.emit({ type: "notification.removed", id });
    return ids.length;
  }

  get(id: string): Notification | null {
    const row = this.db.prepare(`SELECT ${selection} FROM notifications WHERE id = ?`).get(id) as NotificationRow | undefined;
    return row ? rowToNotification(row) : null;
  }

  unreadCount(): number { return Number((this.db.prepare("SELECT COUNT(*) count FROM notifications WHERE state = 'active' AND read_at IS NULL").get() as { count: number }).count); }
  unacknowledgedErrorCount(): number { return Number((this.db.prepare("SELECT COUNT(*) count FROM notifications WHERE state = 'active' AND severity = 'error' AND read_at IS NULL").get() as { count: number }).count); }

  prune(now = Date.now()): number {
    const cutoff = new Date(now - this.retentionMilliseconds).toISOString();
    const result = this.db.prepare(`DELETE FROM notifications WHERE
      (state IN ('resolved','dismissed') AND COALESCE(resolved_at, deleted_at, created_at) < ?)
      OR (state = 'active' AND read_at IS NOT NULL AND read_at < ?)`).run(cutoff, cutoff);
    return Number(result.changes);
  }

  private findByRemoteId(source: NotificationSource, kind: string, remoteId: string): Notification | null {
    const row = this.db.prepare(`SELECT ${selection} FROM notifications WHERE source = ? AND kind = ? AND remote_id = ?`).get(source, kind, remoteId) as NotificationRow | undefined;
    return row ? rowToNotification(row) : null;
  }

  /** Passt eine Benachrichtigung zu einer gemeldeten, noch frischen Sicht? */
  private presenceMatches(notification: Notification): boolean {
    const cutoff = Date.now() - this.presenceTtlMilliseconds;
    for (const entry of this.presence) {
      if (entry.lastSeenAt < cutoff || entry.source !== notification.source) continue;
      if (entry.threadId && notification.meta.threadId === entry.threadId) return true;
      if (entry.sessionId && (notification.meta.sessionId === entry.sessionId || notification.meta.runtimeId === entry.sessionId)) return true;
    }
    return false;
  }
}
