import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface RegisteredProject {
  id: string;
  path: string;
  name: string;
  createdAt: string;
}

interface RegistryRow {
  id: string;
  path: string;
  name: string;
  createdAt: string;
}

function projectSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ordner";
}

export function registeredProjectId(path: string): string {
  const hash = createHash("sha256").update(path).digest("hex").slice(0, 10);
  return `custom-${projectSlug(basename(path))}-${hash}`;
}

export class ProjectRegistryDatabase {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS orbit_project_registry (
        id TEXT PRIMARY KEY,
        canonical_path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  list(): RegisteredProject[] {
    return (this.database.prepare(`
      SELECT id, canonical_path AS path, name, created_at AS createdAt
      FROM orbit_project_registry
      ORDER BY created_at ASC, canonical_path ASC
    `).all() as unknown as RegistryRow[]).map((row) => ({ ...row }));
  }

  findByPath(path: string): RegisteredProject | null {
    const row = this.database.prepare(`
      SELECT id, canonical_path AS path, name, created_at AS createdAt
      FROM orbit_project_registry
      WHERE canonical_path = ?
    `).get(path) as RegistryRow | undefined;
    return row ? { ...row } : null;
  }

  register(path: string, name = basename(path), at = new Date().toISOString(), preferredId?: string): { project: RegisteredProject; created: boolean } {
    const existing = this.findByPath(path);
    if (existing) return { project: existing, created: false };
    const project: RegisteredProject = { id: preferredId ?? registeredProjectId(path), path, name, createdAt: at };
    this.database.prepare(`
      INSERT INTO orbit_project_registry (id, canonical_path, name, created_at)
      VALUES (?, ?, ?, ?)
    `).run(project.id, project.path, project.name, project.createdAt);
    return { project, created: true };
  }

  close() { this.database.close(); }
}
