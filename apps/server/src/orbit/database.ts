import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  orbitDocumentResponseSchema,
  orbitWorkspaceSchema,
  type OrbitDocumentResponse,
  type OrbitWorkspace,
} from "@workbench/contracts";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";

const DEFAULT_BOARD_ID = "orbit-default";

/** Tool types that no longer exist; nodes referencing them are dropped on load. */
const REMOVED_TOOL_TYPES = new Set(["notion"]);

/** Remove nodes for retired tools plus any edges that referenced them. */
function stripRemovedToolNodes(value: unknown): unknown {
  const source = value as {
    boards?: Array<{
      nodes?: Array<Record<string, unknown>>;
      edges?: Array<Record<string, unknown>>;
    }>;
  };
  if (!Array.isArray(source?.boards)) return value;
  return {
    ...source,
    boards: source.boards.map((board) => {
      const nodes = board.nodes ?? [];
      const removedIds = new Set(
        nodes
          .filter((node) => node.type === "tool" && typeof node.toolType === "string" && REMOVED_TOOL_TYPES.has(node.toolType))
          .map((node) => node.id as string),
      );
      if (removedIds.size === 0) return board;
      return {
        ...board,
        nodes: nodes.filter((node) => !removedIds.has(node.id as string)),
        edges: (board.edges ?? []).filter(
          (edge) => !removedIds.has(edge.source as string) && !removedIds.has(edge.target as string),
        ),
      };
    }),
  };
}

/** Accept documents written by Orbit v4 and make the new asset fields explicit. */
function parseOrbitDocument(value: unknown): OrbitWorkspace {
  const cleaned = stripRemovedToolNodes(value);
  const source = cleaned as { version?: number; boards?: Array<{ nodes?: Array<Record<string, unknown>> }> };
  if (source?.version === 4) {
    return orbitWorkspaceSchema.parse({
      ...source,
      version: 5,
      boards: source.boards?.map((board) => ({
        ...board,
        nodes: board.nodes?.map((node) => ({ assetId: null, assetMimeType: null, assetBytes: null, ...node })),
      })),
    });
  }
  return orbitWorkspaceSchema.parse(cleaned);
}

export function createDefaultOrbitWorkspace(): OrbitWorkspace {
  return orbitWorkspaceSchema.parse({
    version: 5,
    activeBoardId: DEFAULT_BOARD_ID,
    focusedNodeId: null,
    boards: [{
      id: DEFAULT_BOARD_ID,
      name: "Arbeitsfläche 1",
      viewport: { x: 0, y: 0, zoom: 0.8 },
      worldBounds: { minX: -1_600, minY: -1_000, maxX: 1_600, maxY: 1_000 },
      nodes: [],
      edges: [],
    }],
  });
}

interface OrbitRow {
  documentJson: string;
  revision: number;
  updatedAt: string;
  initialized: number;
}

interface OrbitBackupEnvelope {
  formatVersion: 1;
  revision: number;
  updatedAt: string;
  sha256: string;
  document: OrbitWorkspace;
}

function workspaceCounts(document: OrbitWorkspace) {
  return document.boards.reduce((counts, board) => ({
    boards: counts.boards + 1,
    nodes: counts.nodes + board.nodes.length,
    edges: counts.edges + board.edges.length,
  }), { boards: 0, nodes: 0, edges: 0 });
}

function backupEnvelope(document: OrbitWorkspace, revision: number, updatedAt: string): OrbitBackupEnvelope {
  const serialized = JSON.stringify(document);
  return {
    formatVersion: 1,
    revision,
    updatedAt,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    document,
  };
}

export class OrbitDatabase {
  private readonly db: DatabaseSync;
  private readonly backupDirectory: string;

  constructor(path: string, backupDirectory = `${path}.orbit-backups`) {
    mkdirSync(dirname(path), { recursive: true });
    mkdirSync(backupDirectory, { recursive: true });
    this.backupDirectory = backupDirectory;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orbit_documents (
        id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        initialized INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS orbit_conflict_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_json TEXT NOT NULL,
        expected_revision INTEGER,
        current_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orbit_document_revisions (
        revision INTEGER PRIMARY KEY,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        source TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (3, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (4, datetime('now'));
    `);
    this.recoverFromBackupIfNeeded();
    const current = this.row();
    if (current) {
      this.db.prepare(`INSERT OR IGNORE INTO orbit_document_revisions(revision, document_json, created_at, source)
        VALUES (?, ?, ?, 'migration')`).run(current.revision, current.documentJson, current.updatedAt);
      const migrated = parseOrbitDocument(JSON.parse(current.documentJson) as unknown);
      if (JSON.stringify(migrated) !== current.documentJson) {
        this.db.prepare("UPDATE orbit_documents SET document_json=? WHERE id='default'").run(JSON.stringify(migrated));
      }
      this.writeBackup(migrated, current.revision, current.updatedAt);
    }
  }

  close() { this.db.close(); }

  private row(): OrbitRow | undefined {
    return this.db.prepare(`SELECT document_json documentJson, revision, updated_at updatedAt, initialized
      FROM orbit_documents WHERE id = 'default'`).get() as OrbitRow | undefined;
  }

  private backupPath(revision: number) {
    return join(this.backupDirectory, `orbit-r${String(revision).padStart(12, "0")}.json`);
  }

  private writeBackup(document: OrbitWorkspace, revision: number, updatedAt: string) {
    const envelope = backupEnvelope(document, revision, updatedAt);
    const serialized = JSON.stringify(envelope);
    const revisionPath = this.backupPath(revision);
    if (!existsSync(revisionPath)) writeFileSync(revisionPath, serialized, { encoding: "utf8", flag: "wx", mode: 0o600, flush: true });
    const currentPath = join(this.backupDirectory, "current.json");
    const temporaryPath = join(this.backupDirectory, `.current-${process.pid}-${revision}.tmp`);
    writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o600, flush: true });
    renameSync(temporaryPath, currentPath);
    const directoryHandle = openSync(this.backupDirectory, "r");
    try { fsyncSync(directoryHandle); } finally { closeSync(directoryHandle); }
  }

  private recoverFromBackupIfNeeded() {
    if (this.row()) return;
    const currentPath = join(this.backupDirectory, "current.json");
    if (!existsSync(currentPath)) return;
    const envelope = JSON.parse(readFileSync(currentPath, "utf8")) as Partial<OrbitBackupEnvelope>;
    const originalSerialized = JSON.stringify(envelope.document);
    const originalChecksum = createHash("sha256").update(originalSerialized).digest("hex");
    if (envelope.sha256 !== originalChecksum) throw new Error("Die letzte Orbit-Sicherung ist beschädigt; der Server startet zum Schutz der Daten nicht leer.");
    const document = parseOrbitDocument(envelope.document);
    const revision = typeof envelope.revision === "number" && Number.isSafeInteger(envelope.revision) && envelope.revision > 0
      ? envelope.revision
      : 1;
    const updatedAt = typeof envelope.updatedAt === "string" ? envelope.updatedAt : new Date().toISOString();
    const serialized = JSON.stringify(document);
    this.db.prepare(`INSERT INTO orbit_documents(id, document_json, revision, updated_at, initialized)
      VALUES ('default', ?, ?, ?, 1)`).run(serialized, revision, updatedAt);
    this.db.prepare(`INSERT OR IGNORE INTO orbit_document_revisions(revision, document_json, created_at, source)
      VALUES (?, ?, ?, 'automatic-recovery')`).run(revision, serialized, updatedAt);
  }

  private saveRecoveryDraft(documentJson: string, expectedRevision: number | null, currentRevision: number) {
    this.db.prepare(`INSERT INTO orbit_conflict_backups(document_json, expected_revision, current_revision, created_at)
      VALUES (?, ?, ?, ?)`).run(documentJson, expectedRevision, currentRevision, new Date().toISOString());
  }

  private assertNotDestructive(current: OrbitRow | undefined, document: OrbitWorkspace, serialized: string) {
    if (!current?.initialized || current.documentJson === serialized) return;
    const before = workspaceCounts(parseOrbitDocument(JSON.parse(current.documentJson) as unknown));
    const after = workspaceCounts(document);
    const removedNodes = before.nodes - after.nodes;
    const destructiveNodeDrop = before.nodes >= 3 && removedNodes >= 3
      && removedNodes * 100 >= before.nodes * settings.orbitDestructiveDropPercent;
    const emptiedPopulatedOrbit = before.nodes > 0 && after.nodes === 0;
    if (destructiveNodeDrop || emptiedPopulatedOrbit) {
      this.saveRecoveryDraft(serialized, current.revision, current.revision);
      throw new AppError(400, "ORBIT_DESTRUCTIVE_SAVE_BLOCKED", "Ein ungewöhnlich großer Datenverlust wurde blockiert und als Wiederherstellungsentwurf gesichert.");
    }
  }

  get(): OrbitDocumentResponse {
    const row = this.row();
    if (!row) {
      return orbitDocumentResponseSchema.parse({
        document: createDefaultOrbitWorkspace(),
        revision: 0,
        updatedAt: new Date(0).toISOString(),
        initialized: false,
        syncIntervalMilliseconds: settings.orbitSyncIntervalMilliseconds,
      });
    }
    return orbitDocumentResponseSchema.parse({
      document: parseOrbitDocument(JSON.parse(row.documentJson) as unknown),
      revision: row.revision,
      updatedAt: row.updatedAt,
      initialized: Boolean(row.initialized),
      syncIntervalMilliseconds: settings.orbitSyncIntervalMilliseconds,
    });
  }

  saveLegacy(document: OrbitWorkspace, expectedRevision: number | null): OrbitDocumentResponse {
    const parsed = orbitWorkspaceSchema.parse(document);
    const serialized = JSON.stringify(parsed);
    if (Buffer.byteLength(serialized, "utf8") > settings.orbitDocumentMaxBytes) {
      throw new AppError(413, "ORBIT_DOCUMENT_TOO_LARGE", "Die Orbit-Arbeitsfläche überschreitet die erlaubte Größe.");
    }

    const current = this.row();
    const currentRevision = current?.revision ?? 0;
    if (expectedRevision !== null && expectedRevision !== currentRevision) {
      if (serialized !== current?.documentJson) {
        this.saveRecoveryDraft(serialized, expectedRevision, currentRevision);
      }
      return this.get();
    }

    return this.save(parsed, expectedRevision);
  }

  save(document: OrbitWorkspace, expectedRevision: number | null): OrbitDocumentResponse {
    const parsed = orbitWorkspaceSchema.parse(document);
    const serialized = JSON.stringify(parsed);
    if (Buffer.byteLength(serialized, "utf8") > settings.orbitDocumentMaxBytes) {
      throw new AppError(413, "ORBIT_DOCUMENT_TOO_LARGE", "Die Orbit-Arbeitsfläche überschreitet die erlaubte Größe.");
    }

    const current = this.row();
    const currentRevision = current?.revision ?? 0;
    if (expectedRevision !== null && expectedRevision !== currentRevision) {
      if (serialized !== current?.documentJson) this.saveRecoveryDraft(serialized, expectedRevision, currentRevision);
      throw new AppError(409, "ORBIT_REVISION_CONFLICT", "Die Orbit-Arbeitsfläche wurde auf einem anderen Gerät geändert.");
    }
    this.assertNotDestructive(current, parsed, serialized);

    const revision = currentRevision + 1;
    const updatedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO orbit_documents(id, document_json, revision, updated_at, initialized)
        VALUES ('default', ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json,
          revision=excluded.revision, updated_at=excluded.updated_at, initialized=1`)
        .run(serialized, revision, updatedAt);
      this.db.prepare(`INSERT INTO orbit_document_revisions(revision, document_json, created_at, source)
        VALUES (?, ?, ?, 'autosave')`).run(revision, serialized, updatedAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.writeBackup(parsed, revision, updatedAt);
    return orbitDocumentResponseSchema.parse({
      document: parsed,
      revision,
      updatedAt,
      initialized: true,
      syncIntervalMilliseconds: settings.orbitSyncIntervalMilliseconds,
    });
  }
}
