import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readdir, rename, stat, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import type { OrbitAsset, GalleryFolder } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

interface AssetRow { id: string; filename: string; mimeType: string; bytes: number; sha256: string; storagePath: string; createdAt: string; folderId: string | null; }

interface AssetCursor { createdAt: string; id: string; }

interface FolderRow { id: string; name: string; createdAt: string; }

const filename = (value: string) => value.replace(/[\\/\0]/g, "_").trim().slice(0, 255) || "datei";
const safeMime = (value: string) => /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value) ? value.toLowerCase() : "application/octet-stream";
const uploadFilePattern = /^\.[0-9a-f-]{36}\.upload$/i;
const storageFilePattern = /^[0-9a-f]{64}-.+/i;
const orphanRetentionMilliseconds = 24 * 60 * 60 * 1_000;

// Defense in depth: der Speicherpfad muss nach der Namensbildung zwingend
// innerhalb des Galerie-Ordners liegen (verhindert Path-Traversal).
const contained = (root: string, target: string): boolean => {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
};

export class OrbitAssetRepository {
  private readonly db: DatabaseSync;
  constructor(databasePath: string, private readonly directory: string, private readonly maxFileBytes: number, private readonly maxTotalBytes: number, private readonly tableName: string = "orbit_assets") {
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName} (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime_type TEXT NOT NULL, bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL UNIQUE, storage_path TEXT NOT NULL, created_at TEXT NOT NULL, folder_id TEXT
    );`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}_folders (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
    );`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${this.tableName}_reservations (
      id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL, created_at TEXT NOT NULL
    );`);
    this.db.prepare(`DELETE FROM ${this.tableName}_reservations WHERE created_at < ?`)
      .run(new Date(Date.now() - 3_600_000).toISOString());
    try {
      this.db.exec(`ALTER TABLE ${this.tableName} ADD COLUMN folder_id TEXT;`);
    } catch {
      // Column already exists
    }
    // Ein Prozessabbruch kann zwischen Datei-Rename und Datenbank-Commit
    // temporäre oder finale Dateien hinterlassen. Die Bereinigung ist bewusst
    // best effort und löscht nur eindeutig erkennbare, mindestens einen Tag
    // alte Artefakte, damit langsame Uploads nicht unterbrochen werden.
    void this.reconcileStorage().catch(() => undefined);
  }
  close() { this.db.close(); }
  private safeStoragePath(storagePath: string): string {
    const root = resolve(this.directory);
    const candidate = resolve(storagePath);
    if (!contained(root, candidate)) {
      throw new AppError(500, "ORBIT_ASSET_INVALID_STORAGE_PATH", "Der gespeicherte Medienpfad liegt außerhalb des Archivs.");
    }
    return candidate;
  }
  private async reconcileStorage(): Promise<void> {
    const entries = await readdir(this.directory, { withFileTypes: true });
    const referenced = new Set(
      (this.db.prepare(`SELECT storage_path storagePath FROM ${this.tableName}`).all() as Array<{ storagePath: string }>)
        .map((row) => resolve(row.storagePath)),
    );
    const cutoff = Date.now() - orphanRetentionMilliseconds;
    await Promise.all(entries.filter((entry) => entry.isFile() && (uploadFilePattern.test(entry.name) || storageFilePattern.test(entry.name))).map(async (entry) => {
      const path = resolve(this.directory, entry.name);
      if (referenced.has(path)) return;
      try {
        const info = await stat(path);
        if (info.mtimeMs < cutoff) await unlink(path);
      } catch {
        // Ein parallel abgeschlossener Upload oder ein bereits gelöschtes
        // Artefakt ist kein Fehler des aktuellen Requests.
      }
    }));
  }
  private toAsset(row: AssetRow): OrbitAsset { return { id: row.id, filename: row.filename, mimeType: row.mimeType, bytes: row.bytes, createdAt: row.createdAt, folderId: row.folderId }; }
  private toFolder(row: FolderRow, fileCount: number): GalleryFolder { return { id: row.id, name: row.name, createdAt: row.createdAt, fileCount }; }
  private totalBytes() { return Number((this.db.prepare(`SELECT COALESCE(SUM(bytes), 0) total FROM ${this.tableName}`).get() as { total: number }).total); }
  private assertFolder(folderId: string | null) {
    if (folderId === null) return;
    if (!this.db.prepare(`SELECT 1 FROM ${this.tableName}_folders WHERE id=?`).get(folderId)) {
      throw new AppError(404, "GALLERY_FOLDER_NOT_FOUND", "Der Zielordner wurde nicht gefunden.");
    }
  }
  async create(input: { filename: string; mimeType: string; buffer: Buffer; folderId?: string | null }): Promise<OrbitAsset> {
    return this.createStream({
      filename: input.filename,
      mimeType: input.mimeType,
      stream: Readable.from(input.buffer),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    });
  }
  async createStream(input: { filename: string; mimeType: string; stream: Readable; folderId?: string | null }): Promise<OrbitAsset> {
    const id = randomUUID();
    const temporary = join(this.directory, `.${id}.upload`);
    const digest = createHash("sha256");
    let bytes = 0;
    const safeFilename = filename(input.filename);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await pipeline(
        input.stream,
        new Transform({
          transform: (chunk: Buffer | string, encoding, callback) => {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
            bytes += data.length;
            if (bytes > this.maxFileBytes) {
              callback(new AppError(413, "ORBIT_ASSET_TOO_LARGE", "Die Datei überschreitet die erlaubte Größe."));
              return;
            }
            digest.update(data);
            callback(null, data);
          },
        }),
        createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      );
      const handle = await open(temporary, "r");
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    if (bytes === 0) {
      await unlink(temporary).catch(() => undefined);
      throw new AppError(400, "ORBIT_ASSET_EMPTY", "Leere Dateien können nicht archiviert werden.");
    }
    const sha256 = digest.digest("hex");
    const folderId = input.folderId ?? null;
    this.assertFolder(folderId);
    const existing = this.db.prepare(`SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName} WHERE sha256=?`).get(sha256) as AssetRow | undefined;
    if (existing) {
      await unlink(temporary).catch(() => undefined);
      if ((existing.folderId ?? null) !== folderId) {
        throw new AppError(
          409,
          "ORBIT_ASSET_DUPLICATE",
          "Diese Datei ist bereits in einem anderen Galerieordner archiviert. Verschiebe den bestehenden Eintrag oder verwende eine andere Datei.",
          { assetId: existing.id, folderId: existing.folderId },
        );
      }
      return this.toAsset(existing);
    }
    this.db.exec("BEGIN IMMEDIATE");
    const reservationId = randomUUID();
    try {
      const concurrentExisting = this.db.prepare(`SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName} WHERE sha256=?`).get(sha256) as AssetRow | undefined;
      if (concurrentExisting) {
        this.db.exec("ROLLBACK");
        await unlink(temporary).catch(() => undefined);
        if ((concurrentExisting.folderId ?? null) !== folderId) {
          throw new AppError(
            409,
            "ORBIT_ASSET_DUPLICATE",
            "Diese Datei ist bereits in einem anderen Galerieordner archiviert. Verschiebe den bestehenden Eintrag oder verwende eine andere Datei.",
            { assetId: concurrentExisting.id, folderId: concurrentExisting.folderId },
          );
        }
        return this.toAsset(concurrentExisting);
      }
      // Der Ordner kann zwischen Vorabprüfung und Reservierung gelöscht
      // worden sein; daher muss die Referenz unter dem SQLite-Lock erneut
      // validiert werden.
      this.assertFolder(folderId);
      const reservedBytes = Number((this.db.prepare(`SELECT COALESCE(SUM(bytes), 0) total FROM ${this.tableName}_reservations`).get() as { total: number }).total);
      if (this.totalBytes() + reservedBytes + bytes > this.maxTotalBytes) {
        throw new AppError(413, "ORBIT_ASSET_ARCHIVE_FULL", "Das Orbit-Medienarchiv hat seine Speichergrenze erreicht.");
      }
      this.db.prepare(`INSERT INTO ${this.tableName}_reservations(id, sha256, bytes, created_at) VALUES (?, ?, ?, ?)`)
        .run(reservationId, sha256, bytes, new Date().toISOString());
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      await unlink(temporary).catch(() => undefined);
      if (String(error).includes("UNIQUE constraint failed")) {
        throw new AppError(409, "ORBIT_ASSET_UPLOAD_IN_PROGRESS", "Diese Datei wird bereits archiviert.");
      }
      throw error;
    }
    // Echter Dateiname auf der Platte (mit Endung), kollisionsfrei über einen
    // vollständigen Hash. Damit kann rename niemals eine fremde Datei mit
    // zufällig gleichem Kurzpräfix überschreiben.
    const storageName = `${sha256}-${safeFilename}`;
    const storagePath = resolve(this.directory, storageName);
    const createdAt = new Date().toISOString();
    let ownsStoragePath = false;
    try {
      if (!contained(resolve(this.directory), storagePath)) throw new AppError(400, "ORBIT_ASSET_INVALID_NAME", "Der Dateiname ist ungültig.");
      await rename(temporary, storagePath);
      ownsStoragePath = true;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.prepare(`INSERT INTO ${this.tableName}(id, filename, mime_type, bytes, sha256, storage_path, created_at, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, safeFilename, safeMime(input.mimeType), bytes, sha256, storagePath, createdAt, folderId);
        this.db.prepare(`DELETE FROM ${this.tableName}_reservations WHERE id=?`).run(reservationId);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      return { id, filename: safeFilename, mimeType: safeMime(input.mimeType), bytes, createdAt, folderId };
    } catch (error) {
      await Promise.all([
        unlink(temporary).catch(() => undefined),
        ownsStoragePath ? unlink(storagePath).catch(() => undefined) : Promise.resolve(),
      ]);
      this.db.prepare(`DELETE FROM ${this.tableName}_reservations WHERE id=?`).run(reservationId);
      throw error;
    }
  }
  async file(id: string): Promise<{ asset: OrbitAsset; path: string } | null> {
    const row = this.db.prepare(`SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName} WHERE id=?`).get(id) as AssetRow | undefined;
    if (!row) return null;
    const storagePath = this.safeStoragePath(row.storagePath);
    try { await stat(storagePath); } catch { throw new AppError(500, "ORBIT_ASSET_MISSING", "Die archivierte Datei fehlt auf dem Server."); }
    return { asset: this.toAsset(row), path: storagePath };
  }
  list(limit: number, cursor: AssetCursor | null, folderId?: string | null): { assets: OrbitAsset[]; nextCursor: string | null } {
    const folderFilter = folderId === undefined ? "" : folderId === null ? "AND folder_id IS NULL" : "AND folder_id = ?";
    const queryParams = folderId !== undefined && folderId !== null ? [folderId] : [];
    const query = cursor
      ? `SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName}
          WHERE (created_at < ? OR (created_at = ? AND id < ?)) ${folderFilter} ORDER BY created_at DESC, id DESC LIMIT ?`
      : `SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName}
          WHERE 1=1 ${folderFilter} ORDER BY created_at DESC, id DESC LIMIT ?`;
    const rows = (cursor
      ? this.db.prepare(query).all(cursor.createdAt, cursor.createdAt, cursor.id, ...queryParams, limit + 1)
      : this.db.prepare(query).all(...queryParams, limit + 1)) as unknown as AssetRow[];
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      assets: page.map((row) => this.toAsset(row)),
      nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString("base64url") : null,
    };
  }
  async delete(id: string): Promise<boolean> {
    const row = this.db.prepare(`SELECT id, storage_path storagePath FROM ${this.tableName} WHERE id=?`).get(id) as { id: string; storagePath: string } | undefined;
    if (!row) return false;
    const storagePath = this.safeStoragePath(row.storagePath);
    try {
      await unlink(storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new AppError(503, "ORBIT_ASSET_DELETE_FAILED", "Die Datei konnte nicht sicher gelöscht werden.");
      }
    }
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id=?`).run(id);
    return true;
  }
  async update(id: string, updates: { filename?: string; folderId?: string | null }): Promise<OrbitAsset | null> {
    const row = this.db.prepare(`SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName} WHERE id=?`).get(id) as AssetRow | undefined;
    if (!row) return null;
    const newFilename = updates.filename !== undefined ? filename(updates.filename) : row.filename;
    const newFolderId = updates.folderId !== undefined ? updates.folderId : row.folderId;
    this.assertFolder(newFolderId);
    this.db.prepare(`UPDATE ${this.tableName} SET filename = ?, folder_id = ? WHERE id = ?`).run(newFilename, newFolderId, id);
    return { ...this.toAsset(row), filename: newFilename, folderId: newFolderId };
  }
  createFolder(name: string): GalleryFolder {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db.prepare(`INSERT INTO ${this.tableName}_folders(id, name, created_at) VALUES (?, ?, ?)`).run(id, name, createdAt);
    return { id, name, createdAt, fileCount: 0 };
  }
  listFolders(): GalleryFolder[] {
    const rows = this.db.prepare(`SELECT f.id, f.name, f.created_at createdAt, COUNT(a.id) fileCount FROM ${this.tableName}_folders f LEFT JOIN ${this.tableName} a ON f.id = a.folder_id GROUP BY f.id ORDER BY f.name ASC`).all() as unknown as (FolderRow & { fileCount: number })[];
    return rows.map((row) => this.toFolder(row, row.fileCount));
  }
  getFolder(id: string): GalleryFolder | null {
    const row = this.db.prepare(`SELECT f.id, f.name, f.created_at createdAt, COUNT(a.id) fileCount FROM ${this.tableName}_folders f LEFT JOIN ${this.tableName} a ON f.id = a.folder_id WHERE f.id = ? GROUP BY f.id`).get(id) as (FolderRow & { fileCount: number }) | undefined;
    if (!row) return null;
    return this.toFolder(row, row.fileCount);
  }
  updateFolder(id: string, name: string): GalleryFolder | null {
    const existing = this.db.prepare(`SELECT id, name, created_at createdAt FROM ${this.tableName}_folders WHERE id=?`).get(id) as FolderRow | undefined;
    if (!existing) return null;
    this.db.prepare(`UPDATE ${this.tableName}_folders SET name = ? WHERE id = ?`).run(name, id);
    const fileCount = Number((this.db.prepare(`SELECT COUNT(*) count FROM ${this.tableName} WHERE folder_id = ?`).get(id) as { count: number }).count);
    return { id: existing.id, name, createdAt: existing.createdAt, fileCount };
  }
  deleteFolder(id: string): boolean {
    this.db.prepare(`UPDATE ${this.tableName} SET folder_id = NULL WHERE folder_id = ?`).run(id);
    const result = this.db.prepare(`DELETE FROM ${this.tableName}_folders WHERE id=?`).run(id);
    return result.changes > 0;
  }
}
