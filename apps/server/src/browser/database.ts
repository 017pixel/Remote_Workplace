import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface StoredBrowserInstance {
  userId: string;
  instanceId: string;
  profileKey: string;
  lastUrl: string;
  updatedAt: number;
}

interface BrowserInstanceRow {
  userId: string;
  instanceId: string;
  profileKey: string;
  lastUrl: string;
  updatedAt: number;
}

export class BrowserDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS browser_instances (
        owner_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        profile_key TEXT NOT NULL,
        last_url TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(owner_id, instance_id)
      );
      CREATE INDEX IF NOT EXISTS browser_instances_owner_updated
        ON browser_instances(owner_id, updated_at DESC);
    `);
  }

  get(userId: string, instanceId: string): StoredBrowserInstance | undefined {
    return this.db.prepare(`SELECT owner_id userId, instance_id instanceId, profile_key profileKey,
      last_url lastUrl, updated_at updatedAt FROM browser_instances
      WHERE owner_id = ? AND instance_id = ?`).get(userId, instanceId) as BrowserInstanceRow | undefined;
  }

  save(instance: StoredBrowserInstance) {
    this.db.prepare(`INSERT INTO browser_instances(owner_id, instance_id, profile_key, last_url, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(owner_id, instance_id) DO UPDATE SET
      profile_key=excluded.profile_key, last_url=excluded.last_url, updated_at=excluded.updated_at`).run(
      instance.userId, instance.instanceId, instance.profileKey, instance.lastUrl, instance.updatedAt,
    );
  }

  close() { this.db.close(); }
}
