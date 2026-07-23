import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

interface ActivityRow {
  projectId: string;
  lastUsedAt: string;
}

export class ProjectActivityDatabase {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS project_activity (
        project_id TEXT PRIMARY KEY,
        last_used_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  touch(projectId: string, at = new Date().toISOString()) {
    this.database.prepare(`
      INSERT INTO project_activity (project_id, last_used_at)
      VALUES (?, ?)
      ON CONFLICT(project_id) DO UPDATE SET last_used_at = excluded.last_used_at
    `).run(projectId, at);
    return at;
  }

  lastUsedAt(projectId: string): string | null {
    const row = this.database.prepare(
      "SELECT project_id AS projectId, last_used_at AS lastUsedAt FROM project_activity WHERE project_id = ?",
    ).get(projectId) as ActivityRow | undefined;
    return row?.lastUsedAt ?? null;
  }

  close() { this.database.close(); }
}
