import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, stat, writeFile, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { OrbitAsset, GalleryFolder } from "@workbench/contracts";
import { AppError } from "../utils/errors.js";

interface AssetRow { id: string; filename: string; mimeType: string; bytes: number; sha256: string; storagePath: string; createdAt: string; folderId: string | null; }

interface AssetCursor { createdAt: string; id: string; }

interface FolderRow { id: string; name: string; createdAt: string; }

const filename = (value: string) => value.replace(/[\\/\0]/g, "_").trim().slice(0, 255) || "datei";
const safeMime = (value: string) => /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value) ? value.toLowerCase() : "application/octet-stream";

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
    try {
      this.db.exec(`ALTER TABLE ${this.tableName} ADD COLUMN folder_id TEXT;`);
    } catch {
      // Column already exists
    }
  }
  close() { this.db.close(); }
  private toAsset(row: AssetRow): OrbitAsset { return { id: row.id, filename: row.filename, mimeType: row.mimeType, bytes: row.bytes, createdAt: row.createdAt, folderId: row.folderId }; }
  private toFolder(row: FolderRow, fileCount: number): GalleryFolder { return { id: row.id, name: row.name, createdAt: row.createdAt, fileCount }; }
  private totalBytes() { return Number((this.db.prepare(`SELECT COALESCE(SUM(bytes), 0) total FROM ${this.tableName}`).get() as { total: number }).total); }
  async create(input: { filename: string; mimeType: string; buffer: Buffer; folderId?: string | null }): Promise<OrbitAsset> {
    if (!input.buffer.length) throw new AppError(400, "ORBIT_ASSET_EMPTY", "Leere Dateien können nicht archiviert werden.");
    if (input.buffer.length > this.maxFileBytes) throw new AppError(413, "ORBIT_ASSET_TOO_LARGE", "Die Datei überschreitet die erlaubte Größe.");
    const sha256 = createHash("sha256").update(input.buffer).digest("hex");
    const existing = this.db.prepare(`SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName} WHERE sha256=?`).get(sha256) as AssetRow | undefined;
    if (existing) return this.toAsset(existing);
    if (this.totalBytes() + input.buffer.length > this.maxTotalBytes) throw new AppError(413, "ORBIT_ASSET_ARCHIVE_FULL", "Das Orbit-Medienarchiv hat seine Speichergrenze erreicht.");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    const safeFilename = filename(input.filename);
    // Echter Dateiname auf der Platte (mit Endung), kollisionsfrei über einen
    // kurzen sha256-Präfix. Der Präfix erhält zugleich die Deduplizierung.
    const storageName = `${sha256.slice(0, 12)}-${safeFilename}`;
    const storagePath = resolve(this.directory, storageName);
    if (!contained(this.directory, storagePath)) throw new AppError(400, "ORBIT_ASSET_INVALID_NAME", "Der Dateiname ist ungültig.");
    const temporary = join(this.directory, `.${id}.upload`);
    await writeFile(temporary, input.buffer, { mode: 0o600, flush: true });
    await rename(temporary, storagePath);
    const createdAt = new Date().toISOString();
    const folderId = input.folderId ?? null;
    this.db.prepare(`INSERT INTO ${this.tableName}(id, filename, mime_type, bytes, sha256, storage_path, created_at, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, safeFilename, safeMime(input.mimeType), input.buffer.length, sha256, storagePath, createdAt, folderId);
    return { id, filename: safeFilename, mimeType: safeMime(input.mimeType), bytes: input.buffer.length, createdAt, folderId };
  }
  async file(id: string): Promise<{ asset: OrbitAsset; path: string } | null> {
    const row = this.db.prepare(`SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName} WHERE id=?`).get(id) as AssetRow | undefined;
    if (!row) return null;
    try { await stat(row.storagePath); } catch { throw new AppError(500, "ORBIT_ASSET_MISSING", "Die archivierte Datei fehlt auf dem Server."); }
    return { asset: this.toAsset(row), path: row.storagePath };
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
      ? this.db.prepare(query).all(...queryParams, cursor.createdAt, cursor.createdAt, cursor.id, limit + 1)
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
    try { await unlink(row.storagePath); } catch { /* File may already be gone */ }
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id=?`).run(id);
    return true;
  }
  async update(id: string, updates: { filename?: string; folderId?: string | null }): Promise<OrbitAsset | null> {
    const row = this.db.prepare(`SELECT id, filename, mime_type mimeType, bytes, sha256, storage_path storagePath, created_at createdAt, folder_id folderId FROM ${this.tableName} WHERE id=?`).get(id) as AssetRow | undefined;
    if (!row) return null;
    const newFilename = updates.filename !== undefined ? filename(updates.filename) : row.filename;
    const newFolderId = updates.folderId !== undefined ? updates.folderId : row.folderId;
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
