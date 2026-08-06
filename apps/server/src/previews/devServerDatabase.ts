import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PreviewExternalOpenMode } from "@workbench/contracts";

interface ProjectPreferenceRow {
  mainPort: number | null;
  updatedAt: string;
}

interface UserPreferenceRow {
  externalOpenMode: PreviewExternalOpenMode;
  updatedAt: string;
}

export class PreviewDevServerDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preview_dev_server_preferences (
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        main_port INTEGER,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, project_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS preview_hub_preferences (
        user_id TEXT PRIMARY KEY,
        external_open_mode TEXT NOT NULL CHECK(external_open_mode IN ('window','tab')) DEFAULT 'window',
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  projectPreference(userId: string, projectId: string): ProjectPreferenceRow | undefined {
    return this.db.prepare(`SELECT main_port mainPort, updated_at updatedAt
      FROM preview_dev_server_preferences WHERE user_id = ? AND project_id = ?`)
      .get(userId, projectId) as ProjectPreferenceRow | undefined;
  }

  saveMainPort(userId: string, projectId: string, mainPort: number | null): ProjectPreferenceRow {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`INSERT INTO preview_dev_server_preferences(user_id, project_id, main_port, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(user_id, project_id) DO UPDATE SET
      main_port=excluded.main_port, updated_at=excluded.updated_at`).run(userId, projectId, mainPort, updatedAt);
    return { mainPort, updatedAt };
  }

  hubPreference(userId: string): UserPreferenceRow | undefined {
    return this.db.prepare(`SELECT external_open_mode externalOpenMode, updated_at updatedAt
      FROM preview_hub_preferences WHERE user_id = ?`).get(userId) as UserPreferenceRow | undefined;
  }

  saveHubPreference(userId: string, externalOpenMode: PreviewExternalOpenMode): UserPreferenceRow {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`INSERT INTO preview_hub_preferences(user_id, external_open_mode, updated_at)
      VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
      external_open_mode=excluded.external_open_mode, updated_at=excluded.updated_at`)
      .run(userId, externalOpenMode, updatedAt);
    return { externalOpenMode, updatedAt };
  }

  close() { this.db.close(); }
}
