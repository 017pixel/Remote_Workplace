import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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

/** Accept documents written by Orbit v4/v5 and add the current preview metadata. */
function parseOrbitDocument(value: unknown): OrbitWorkspace {
  const source = value as { version?: number; boards?: Array<{ nodes?: Array<Record<string, unknown>> }> };
  if (source?.version === 4 || source?.version === 5) {
    return orbitWorkspaceSchema.parse({
      ...source,
      version: 6,
      boards: source.boards?.map((board) => ({
        ...board,
        nodes: board.nodes?.map((node) => ({ assetId: null, assetMimeType: null, assetBytes: null, ...node })),
      })),
    });
  }
  return orbitWorkspaceSchema.parse(value);
}

export function createDefaultOrbitWorkspace(): OrbitWorkspace {
  return orbitWorkspaceSchema.parse({
    version: 6,
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
    contentCharacters: counts.contentCharacters + board.nodes.reduce((sum, node) => sum + node.content.length, 0),
  }), { boards: 0, nodes: 0, edges: 0, contentCharacters: 0 });
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
      CREATE TABLE IF NOT EXISTS orbit_backup_outbox (
        revision INTEGER PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orbit_maintenance_state (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        last_error TEXT,
        failed_at TEXT
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
      this.queueBackup(current.revision, current.updatedAt);
    }
    this.runPostCommitMaintenance(current?.revision ?? null);
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

  private parseBackup(path: string): OrbitBackupEnvelope | null {
    try {
      const envelope = JSON.parse(readFileSync(path, "utf8")) as Partial<OrbitBackupEnvelope>;
      const serialized = JSON.stringify(envelope.document);
      const checksum = createHash("sha256").update(serialized).digest("hex");
      if (envelope.sha256 !== checksum) return null;
      if (typeof envelope.revision !== "number" || !Number.isSafeInteger(envelope.revision) || envelope.revision <= 0) return null;
      if (typeof envelope.updatedAt !== "string") return null;
      return {
        formatVersion: 1,
        revision: envelope.revision,
        updatedAt: envelope.updatedAt,
        sha256: checksum,
        document: parseOrbitDocument(envelope.document),
      };
    } catch {
      return null;
    }
  }

  private recoverFromBackupIfNeeded() {
    if (this.row()) return;
    const currentPath = join(this.backupDirectory, "current.json");
    const candidates = [
      ...(existsSync(currentPath) ? [currentPath] : []),
      ...readdirSync(this.backupDirectory)
        .filter((name) => /^orbit-r\d{12}\.json$/.test(name))
        .sort()
        .reverse()
        .map((name) => join(this.backupDirectory, name)),
    ];
    const envelope = candidates.map((path) => this.parseBackup(path)).find((candidate) => candidate !== null);
    if (!envelope) {
      if (candidates.length > 0) {
        throw new Error("Keine gültige Orbit-Sicherung gefunden; der Server startet zum Schutz der Daten nicht leer.");
      }
      return;
    }
    const serialized = JSON.stringify(envelope.document);
    this.db.prepare(`INSERT INTO orbit_documents(id, document_json, revision, updated_at, initialized)
      VALUES ('default', ?, ?, ?, 1)`).run(serialized, envelope.revision, envelope.updatedAt);
    this.db.prepare(`INSERT OR IGNORE INTO orbit_document_revisions(revision, document_json, created_at, source)
      VALUES (?, ?, ?, 'automatic-recovery')`).run(envelope.revision, serialized, envelope.updatedAt);
  }

  private queueBackup(revision: number, updatedAt: string) {
    this.db.prepare(`INSERT INTO orbit_backup_outbox(revision, attempts, last_error, updated_at)
      VALUES (?, 0, NULL, ?)
      ON CONFLICT(revision) DO UPDATE SET updated_at=excluded.updated_at`)
      .run(revision, updatedAt);
  }

  private processPendingBackups() {
    const pending = this.db.prepare(`SELECT o.revision, o.updated_at updatedAt, r.document_json documentJson
      FROM orbit_backup_outbox o
      JOIN orbit_document_revisions r ON r.revision=o.revision
      ORDER BY o.revision`).all() as Array<{ revision: number; updatedAt: string; documentJson: string }>;
    for (const item of pending) {
      try {
        this.writeBackup(parseOrbitDocument(JSON.parse(item.documentJson) as unknown), item.revision, item.updatedAt);
        this.db.prepare("DELETE FROM orbit_backup_outbox WHERE revision=?").run(item.revision);
      } catch (error) {
        this.db.prepare(`UPDATE orbit_backup_outbox
          SET attempts=attempts+1, last_error=? WHERE revision=?`)
          .run(error instanceof Error ? error.message.slice(0, 500) : "Backupfehler", item.revision);
      }
    }
  }

  private runPostCommitMaintenance(currentRevision: number | null) {
    try {
      this.processPendingBackups();
      if (currentRevision !== null) this.pruneHistory(currentRevision);
      this.db.prepare(`INSERT INTO orbit_maintenance_state(id,last_error,failed_at) VALUES (1,NULL,NULL)
        ON CONFLICT(id) DO UPDATE SET last_error=NULL,failed_at=NULL`).run();
    } catch (error) {
      // Der fachliche Save ist zu diesem Zeitpunkt bereits dauerhaft committet.
      // Wartungsfehler dürfen deshalb niemals als fehlgeschlagener Save zum
      // Client zurücklaufen und dort einen unsicheren Retry auslösen.
      try {
        this.db.prepare(`INSERT INTO orbit_maintenance_state(id,last_error,failed_at) VALUES (1,?,?)
          ON CONFLICT(id) DO UPDATE SET last_error=excluded.last_error,failed_at=excluded.failed_at`)
          .run(error instanceof Error ? error.message.slice(0, 500) : "Orbit-Wartungsfehler", new Date().toISOString());
      } catch {
        // Eine unbenutzbare DB-Verbindung wird vom nächsten Request/Readiness-Check sichtbar.
      }
    }
  }

  private pruneHistory(currentRevision: number) {
    const minimumRevision = Math.max(1, currentRevision - settings.orbitRevisionRetentionCount + 1);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`DELETE FROM orbit_document_revisions
        WHERE revision < ? AND revision NOT IN (SELECT revision FROM orbit_backup_outbox)`).run(minimumRevision);
      this.db.prepare(`DELETE FROM orbit_conflict_backups WHERE id NOT IN (
        SELECT id FROM orbit_conflict_backups ORDER BY id DESC LIMIT ?
      )`).run(settings.orbitConflictRetentionCount);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    for (const name of readdirSync(this.backupDirectory)) {
      const match = /^orbit-r(\d{12})\.json$/.exec(name);
      if (match && Number(match[1]) < minimumRevision) {
        try { unlinkSync(join(this.backupDirectory, name)); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }
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
    const removedBoards = before.boards - after.boards;
    const removedEdges = before.edges - after.edges;
    const removedContent = before.contentCharacters - after.contentCharacters;
    const destructiveNodeDrop = before.nodes >= 3 && removedNodes >= 3
      && removedNodes * 100 >= before.nodes * settings.orbitDestructiveDropPercent;
    const destructiveBoardDrop = before.boards >= 2 && removedBoards >= 1
      && removedBoards * 100 >= before.boards * settings.orbitDestructiveDropPercent;
    const destructiveEdgeDrop = before.edges >= 3 && removedEdges >= 3
      && removedEdges * 100 >= before.edges * settings.orbitDestructiveDropPercent;
    const destructiveContentDrop = before.contentCharacters >= 1_000 && removedContent >= 1_000
      && removedContent * 100 >= before.contentCharacters * settings.orbitDestructiveDropPercent;
    const emptiedPopulatedOrbit = before.nodes > 0 && after.nodes === 0;
    if (destructiveNodeDrop || destructiveBoardDrop || destructiveEdgeDrop || destructiveContentDrop || emptiedPopulatedOrbit) {
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

  maintenanceStatus() {
    const pending = this.db.prepare(`SELECT COUNT(*) count, MIN(updated_at) oldestPendingAt
      FROM orbit_backup_outbox`).get() as { count: number; oldestPendingAt: string | null };
    const state = this.db.prepare(`SELECT last_error lastError,failed_at failedAt
      FROM orbit_maintenance_state WHERE id=1`).get() as { lastError: string | null; failedAt: string | null } | undefined;
    return {
      pendingBackups: pending.count,
      oldestPendingAt: pending.oldestPendingAt,
      lastError: state?.lastError ?? null,
      failedAt: state?.failedAt ?? null,
    };
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

    try {
      return this.save(parsed, expectedRevision);
    } catch (error) {
      // Legacy-Clients erwarten bei einem veralteten Stand den aktuellen
      // Serverentwurf statt eines 409. Der eigentliche Save hat den Konflikt
      // bereits unter der Schreibsperre als Draft gesichert. Dieser Catch
      // behandelt auch den Race zwischen dem obigen Vorab-Read und dem
      // transaktionssicheren Save.
      if (error instanceof AppError && error.code === "ORBIT_REVISION_CONFLICT") return this.get();
      throw error;
    }
  }

  save(document: OrbitWorkspace, expectedRevision: number | null): OrbitDocumentResponse {
    const parsed = orbitWorkspaceSchema.parse(document);
    const serialized = JSON.stringify(parsed);
    if (Buffer.byteLength(serialized, "utf8") > settings.orbitDocumentMaxBytes) {
      throw new AppError(413, "ORBIT_DOCUMENT_TOO_LARGE", "Die Orbit-Arbeitsfläche überschreitet die erlaubte Größe.");
    }

    let current: OrbitRow | undefined;
    let currentRevision: number;
    let revision: number;
    let updatedAt: string;
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Die Revision muss innerhalb derselben Schreibtransaktion gelesen
      // werden. Andernfalls können zwei Prozesse denselben Stand lesen und
      // der zweite Writer erhält erst nach einem Unique-Constraint-Fehler
      // statt eines sauberen Konflikts eine 500-Antwort.
      current = this.row();
      currentRevision = current?.revision ?? 0;
      if (expectedRevision !== null && expectedRevision !== currentRevision) {
        if (serialized !== current?.documentJson) this.saveRecoveryDraft(serialized, expectedRevision, currentRevision);
        this.db.exec("COMMIT");
        committed = true;
        throw new AppError(409, "ORBIT_REVISION_CONFLICT", "Die Orbit-Arbeitsfläche wurde auf einem anderen Gerät geändert.");
      }
      try {
        this.assertNotDestructive(current, parsed, serialized);
      } catch (error) {
        // Die Sicherung des blockierten Entwurfs wurde in derselben
        // Transaktion angelegt und muss erhalten bleiben.
        if (error instanceof AppError && error.code === "ORBIT_DESTRUCTIVE_SAVE_BLOCKED") {
          this.db.exec("COMMIT");
          committed = true;
        }
        throw error;
      }

      revision = currentRevision + 1;
      updatedAt = new Date().toISOString();
      this.db.prepare(`INSERT INTO orbit_documents(id, document_json, revision, updated_at, initialized)
        VALUES ('default', ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET document_json=excluded.document_json,
          revision=excluded.revision, updated_at=excluded.updated_at, initialized=1`)
        .run(serialized, revision, updatedAt);
      this.db.prepare(`INSERT INTO orbit_document_revisions(revision, document_json, created_at, source)
        VALUES (?, ?, ?, 'autosave')`).run(revision, serialized, updatedAt);
      this.queueBackup(revision, updatedAt);
      this.db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    this.runPostCommitMaintenance(revision);
    return orbitDocumentResponseSchema.parse({
      document: parsed,
      revision,
      updatedAt,
      initialized: true,
      syncIntervalMilliseconds: settings.orbitSyncIntervalMilliseconds,
    });
  }
}
