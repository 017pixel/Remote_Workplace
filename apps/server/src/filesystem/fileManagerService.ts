import { constants } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import { createReadStream, createWriteStream } from "node:fs";
import { access, lstat, mkdir, open, readdir, realpath, rename, rm } from "node:fs/promises";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  fileManagerOperationResponseSchema,
  fileManagerSearchResponseSchema,
  fileManagerStateResponseSchema,
  fileManagerTextPreviewResponseSchema,
  type FileManagerState,
  type FileManagerStateResponse,
  type FilesystemEntry,
  type FileManagerTextPreviewResponse,
  type FileManagerSearchResponse,
} from "@workbench/contracts";
import { AppError } from "../utils/errors.js";

const DEFAULT_TEXT_PREVIEW_BYTES = 300 * 1024;
const SEARCH_LIMIT = 250;
const SEARCH_MAX_DEPTH = 6;
const SEARCH_TIMEOUT_MS = 3_000;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", ".next", ".out", ".cache", ".venv", "venv", ".turbo"]);

interface StateRow {
  id: number;
  document_json: string;
  revision: number;
  updated_at: string;
}

function contained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

function filesystemFailure(error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") throw new AppError(404, "FILESYSTEM_PATH_NOT_FOUND", "Der angegebene Pfad wurde nicht gefunden.");
  if (code === "EACCES" || code === "EPERM") throw new AppError(403, "FILESYSTEM_PATH_INACCESSIBLE", "Der angegebene Pfad ist nicht lesbar.");
  throw error;
}

const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain", ".md": "text/markdown", ".markdown": "text/markdown", ".log": "text/plain",
  ".json": "application/json", ".jsonc": "application/json", ".yaml": "text/yaml", ".yml": "text/yaml",
  ".html": "text/html", ".htm": "text/html", ".xml": "text/xml", ".svg": "image/svg+xml",
  ".css": "text/css", ".scss": "text/scss", ".less": "text/less",
  ".js": "text/javascript", ".mjs": "text/javascript", ".cjs": "text/javascript", ".jsx": "text/javascript",
  ".ts": "text/typescript", ".mts": "text/typescript", ".cts": "text/typescript", ".tsx": "text/typescript",
  ".py": "text/x-python", ".rb": "text/x-ruby", ".php": "text/x-php", ".sh": "text/x-shellscript",
  ".bash": "text/x-shellscript", ".zsh": "text/x-shellscript", ".sql": "text/x-sql",
  ".java": "text/x-java", ".go": "text/x-go", ".rs": "text/x-rust", ".c": "text/x-c", ".h": "text/x-c",
  ".cpp": "text/x-cpp", ".hpp": "text/x-cpp", ".cs": "text/x-csharp", ".swift": "text/x-swift",
  ".kt": "text/x-kotlin", ".kts": "text/x-kotlin", ".toml": "text/toml", ".ini": "text/plain",
  ".env": "text/plain", ".gitignore": "text/plain", ".dockerignore": "text/plain", ".npmrc": "text/plain",
  ".csv": "text/csv", ".diff": "text/x-diff", ".patch": "text/x-diff",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".bmp": "image/bmp",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".oga": "audio/ogg", ".flac": "audio/flac", ".m4a": "audio/mp4", ".opus": "audio/opus",
  ".pdf": "application/pdf", ".zip": "application/zip", ".tar": "application/x-tar",
  ".gz": "application/gzip", ".tgz": "application/gzip", ".7z": "application/x-7z-compressed",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};

function mimeTypeFor(name: string): string {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

export function languageForName(name: string): string | null {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const languages: Record<string, string> = {
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "tsx",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "jsx",
    ".json": "json", ".jsonc": "json", ".css": "css", ".scss": "scss", ".less": "less",
    ".html": "xml", ".htm": "xml", ".svg": "xml", ".xml": "xml",
    ".md": "markdown", ".markdown": "markdown",
    ".py": "python", ".sh": "bash", ".bash": "bash", ".zsh": "bash",
    ".sql": "sql", ".yaml": "yaml", ".yml": "yaml", ".toml": "ini", ".ini": "ini",
    ".java": "java", ".go": "go", ".rs": "rust", ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp",
    ".cs": "csharp", ".rb": "ruby", ".php": "php", ".swift": "swift", ".kt": "kotlin",
    ".diff": "diff", ".patch": "diff", ".dockerfile": "dockerfile",
  };
  if (name.toLowerCase() === "dockerfile") return "dockerfile";
  return languages[extension] ?? null;
}

function sanitizeName(value: string): string {
  return value.replace(/[\\/\0]/g, "_").trim().slice(0, 255) || "datei";
}

/**
 * Länge des längsten gültigen UTF-8-Präfixes eines Buffers mit höchstens
 * `maxBytes` Bytes. Eine abgeschnittene Multibyte-Sequenz am Ende wird komplett
 * entfernt, damit eine Textdatei nicht fälschlich als Binärdaten gilt, nur weil
 * die Vorschau-Grenze mitten durch ein Zeichen läuft. Rückgabe -1, wenn der
 * Präfix offensichtlich ungültige Byte-Sequenzen enthält.
 */
function utf8SafeCut(buffer: Buffer, maxBytes: number): number {
  const available = buffer.length;
  if (available === 0) return 0;
  let cursor = available - 1;
  let continuationBytes = 0;
  while (cursor >= 0 && continuationBytes < 4 && (buffer[cursor]! & 0xc0) === 0x80) {
    cursor -= 1;
    continuationBytes += 1;
  }
  if (cursor < 0) return -1;
  const lead = buffer[cursor]!;
  let expectedLength: number;
  if (lead < 0x80) {
    if (continuationBytes === 0) return Math.min(maxBytes, available);
    return -1;
  }
  if ((lead & 0xe0) === 0xc0) expectedLength = lead >= 0xc2 ? 2 : 0;
  else if ((lead & 0xf0) === 0xe0) expectedLength = 3;
  else if ((lead & 0xf8) === 0xf0) expectedLength = lead <= 0xf4 ? 4 : 0;
  else expectedLength = 0;
  if (expectedLength === 0) return -1;
  if (continuationBytes > expectedLength - 1) return -1;
  if (continuationBytes < expectedLength - 1) {
    // Sequenz im Puffer unvollständig. Beginnt sie vor der Grenze, ist die Datei
    // wirklich kaputt; beginnt sie dahinter, wird sie einfach verworfen.
    return cursor < maxBytes ? -1 : Math.min(maxBytes, cursor);
  }
  // Vollständige Sequenz. Beginnt sie jenseits der Grenze, wird sie verworfen;
  // beginnt sie davor, aber sie endet dahinter, wird sie vervollständigt.
  if (cursor >= maxBytes) return maxBytes;
  const sequenceEnd = cursor + expectedLength;
  if (sequenceEnd > maxBytes && sequenceEnd <= available) return sequenceEnd;
  return maxBytes;
}

async function entryFor(path: string, name: string): Promise<FilesystemEntry> {
  const details = await lstat(path);
  if (details.isSymbolicLink()) return { name, path, kind: "symlink", sizeBytes: null, modifiedAt: null, readable: false };
  const kindValue: FilesystemEntry["kind"] = details.isDirectory() ? "directory" : details.isFile() ? "file" : "other";
  try {
    await access(path, kindValue === "directory" ? constants.R_OK | constants.X_OK : constants.R_OK);
    return {
      name,
      path,
      kind: kindValue,
      sizeBytes: kindValue === "file" ? details.size : null,
      modifiedAt: details.mtime.toISOString(),
      readable: true,
    };
  } catch {
    return { name, path, kind: kindValue, sizeBytes: null, modifiedAt: null, readable: false };
  }
}

export class FileManagerService {
  private readonly db: DatabaseSync;

  constructor(
    readonly root: string,
    private readonly textPreviewBytes: number,
    private readonly maxUploadBytes: number,
    databasePath: string,
  ) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    this.db.exec(`CREATE TABLE IF NOT EXISTS file_manager_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      document_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );`);
  }

  close() { this.db.close(); }

  private defaultState(): FileManagerState {
    return { currentPath: this.root, history: [], favorites: [], viewMode: "list", sortKey: "name", sortDirection: "asc" };
  }

  private requestedPath(input?: string): string {
    const value = input?.trim();
    if (!value || value === "~") return this.root;
    if (value.startsWith("~/")) return resolve(this.root, value.slice(2));
    return isAbsolute(value) ? normalize(value) : resolve(this.root, value);
  }

  /** Pfad innerhalb des Roots auflösen und auf echte Verzeichnisse/Dateien prüfen. */
  private async resolvePath(input: string, expect: "file" | "directory"): Promise<{ canonical: string; details: Stats }> {
    const requested = this.requestedPath(input);
    if (!contained(this.root, requested)) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    }
    let details: Stats;
    let canonical: string;
    try {
      details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht geöffnet werden.");
      if (expect === "directory" && !details.isDirectory()) throw new AppError(400, "FILESYSTEM_PATH_NOT_DIRECTORY", "Der angegebene Pfad ist kein Ordner.");
      if (expect === "file" && !details.isFile()) throw new AppError(400, "FILESYSTEM_PATH_NOT_FILE", "Der angegebene Pfad ist keine Datei.");
      canonical = await realpath(requested);
      await access(canonical, expect === "directory" ? constants.R_OK | constants.X_OK : constants.R_OK);
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    if (!contained(this.root, canonical) || canonical !== requested) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
    }
    return { canonical, details };
  }

  private async resolveTargetDirectory(input: string): Promise<string> {
    const requested = this.requestedPath(input);
    if (!contained(this.root, requested)) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Zielpfad liegt außerhalb des erlaubten Serverbereichs.");
    }
    let canonical: string;
    try {
      const details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht geöffnet werden.");
      if (!details.isDirectory()) throw new AppError(400, "FILESYSTEM_PATH_NOT_DIRECTORY", "Der Zielordner existiert nicht.");
      canonical = await realpath(requested);
      await access(canonical, constants.R_OK | constants.X_OK);
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    if (!contained(this.root, canonical) || canonical !== requested) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Zielpfad führt über einen nicht erlaubten Verweis.");
    }
    return canonical;
  }

  /** Textinhalt einer Datei lesen (begrenzt, mit Truncation-Marker). */
  async textPreview(input: { path: string }): Promise<FileManagerTextPreviewResponse> {
    const { canonical, details } = await this.resolvePath(input.path, "file");
    const limit = Math.max(4_096, this.textPreviewBytes || DEFAULT_TEXT_PREVIEW_BYTES);
    // Bis zu 3 Bytes über die Grenze hinaus lesen, damit ein Multibyte-Zeichen
    // an der Grenze vervollständigt oder sauber abgeschnitten werden kann.
    const readSize = Math.min(details.size, limit + 3);
    const buffer = Buffer.alloc(readSize);
    const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      await handle.read(buffer, 0, readSize, 0);
    } finally {
      await handle.close();
    }
    const truncated = details.size > limit;
    let text: string;
    if (!truncated) {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        throw new AppError(415, "FILESYSTEM_NOT_TEXT", "Diese Datei ist kein Textdokument und kann nicht als Textvorschau angezeigt werden.");
      }
    } else {
      const cut = utf8SafeCut(buffer, limit);
      if (cut < 0) {
        throw new AppError(415, "FILESYSTEM_NOT_TEXT", "Diese Datei ist kein Textdokument und kann nicht als Textvorschau angezeigt werden.");
      }
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, cut));
      } catch {
        throw new AppError(415, "FILESYSTEM_NOT_TEXT", "Diese Datei ist kein Textdokument und kann nicht als Textvorschau angezeigt werden.");
      }
    }
    const lineCount = text.split("\n").length;
    return fileManagerTextPreviewResponseSchema.parse({
      path: canonical,
      name: canonical.split(sep).at(-1) ?? input.path,
      sizeBytes: details.size,
      modifiedAt: details.mtime.toISOString(),
      mimeType: mimeTypeFor(canonical),
      text,
      truncated,
      lineCount,
    });
  }

  /** Byte-Bereich einer Datei öffnen (Range-Support für Video/Audio/PDF/Bild). */
  async openMedia(input: { path: string }, rangeHeader: string | undefined): Promise<{
    stream: Readable;
    statusCode: 200 | 206;
    headers: Record<string, string>;
  }> {
    const { canonical, details } = await this.resolvePath(input.path, "file");
    const size = details.size;
    const mime = mimeTypeFor(canonical);
    const baseHeaders: Record<string, string> = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
    };
    if (!rangeHeader) {
      return { stream: createReadStream(canonical), statusCode: 200, headers: { ...baseHeaders, "Content-Length": String(size) } };
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      throw new AppError(416, "FILESYSTEM_RANGE_INVALID", "Der angeforderte Bereich ist ungültig.", { contentRange: `bytes */${size}` });
    }
    let start: number;
    let end: number;
    if (match[1] === "" && match[2] === "") {
      throw new AppError(416, "FILESYSTEM_RANGE_INVALID", "Der angeforderte Bereich ist ungültig.", { contentRange: `bytes */${size}` });
    }
    if (match[1] === "") {
      const suffix = Number(match[2]);
      if (suffix <= 0) throw new AppError(416, "FILESYSTEM_RANGE_INVALID", "Der angeforderte Bereich ist ungültig.", { contentRange: `bytes */${size}` });
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
      if (start > end || start >= size) {
        throw new AppError(416, "FILESYSTEM_RANGE_INVALID", "Der angeforderte Bereich ist ungültig.", { contentRange: `bytes */${size}` });
      }
    }
    const chunk = end - start + 1;
    return {
      stream: createReadStream(canonical, { start, end }),
      statusCode: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(chunk),
      },
    };
  }

  async download(input: { path: string }): Promise<{ stream: Readable; name: string; size: number; mime: string }> {
    const { canonical, details } = await this.resolvePath(input.path, "file");
    return {
      stream: createReadStream(canonical),
      name: canonical.split(sep).at(-1) ?? "datei",
      size: details.size,
      mime: mimeTypeFor(canonical),
    };
  }

  async rename(input: { path: string; name: string }): Promise<string> {
    const requested = this.requestedPath(input.path);
    if (!contained(this.root, requested)) throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    const name = sanitizeName(input.name);
    let parentCanonical: string;
    try {
      const details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht umbenannt werden.");
      const parent = join(requested, "..");
      parentCanonical = await realpath(parent);
      const canonical = await realpath(requested);
      if (!contained(this.root, canonical) || canonical !== requested) {
        throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
      }
      if (!contained(this.root, parentCanonical)) {
        throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    const target = join(parentCanonical, name);
    if (requested === target) throw new AppError(400, "FILESYSTEM_SAME_NAME", "Der Name ist unverändert.");
    try {
      await lstat(target);
      throw new AppError(409, "FILE_EXISTS", "Ein Eintrag mit diesem Namen existiert bereits.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(requested, target);
    } catch (error) {
      filesystemFailure(error);
    }
    return target;
  }

  async move(input: { path: string; targetDirectory: string }): Promise<string> {
    const requested = this.requestedPath(input.path);
    if (!contained(this.root, requested)) throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    const targetDirectory = await this.resolveTargetDirectory(input.targetDirectory);
    let canonical: string;
    try {
      const details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht verschoben werden.");
      canonical = await realpath(requested);
      if (!contained(this.root, canonical) || canonical !== requested) {
        throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    const name = canonical.split(sep).at(-1) ?? "datei";
    const target = join(targetDirectory, name);
    if (target === canonical) throw new AppError(400, "FILESYSTEM_SAME_DIRECTORY", "Die Datei befindet sich bereits in diesem Ordner.");
    if (target.startsWith(`${canonical}${sep}`)) {
      throw new AppError(400, "FILESYSTEM_MOVE_INTO_SELF", "Ein Ordner kann nicht in sich selbst verschoben werden.");
    }
    try {
      await lstat(target);
      throw new AppError(409, "FILE_EXISTS", "Im Zielordner existiert bereits ein Eintrag mit diesem Namen.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(requested, target);
    } catch (error) {
      filesystemFailure(error);
    }
    return target;
  }

  async remove(input: { path: string }): Promise<string> {
    const requested = this.requestedPath(input.path);
    if (!contained(this.root, requested)) throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    let canonical: string;
    let details: Stats;
    try {
      details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht gelöscht werden.");
      canonical = await realpath(requested);
      if (!contained(this.root, canonical) || canonical !== requested) {
        throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
      }
      if (canonical === this.root) throw new AppError(400, "FILESYSTEM_ROOT_PROTECTED", "Der Home-Ordner selbst kann nicht gelöscht werden.");
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    if (details.isDirectory()) {
      const children = await readdir(canonical).catch(filesystemFailure);
      if (children.length > 0) {
        throw new AppError(409, "FILESYSTEM_DIRECTORY_NOT_EMPTY", "Der Ordner ist nicht leer und kann nicht gelöscht werden.");
      }
    }
    try {
      await rm(canonical, { force: false, recursive: details.isDirectory() });
    } catch (error) {
      filesystemFailure(error);
    }
    return canonical;
  }

  async mkdir(input: { path: string; name: string }): Promise<string> {
    const directory = await this.resolveTargetDirectory(input.path);
    const name = sanitizeName(input.name);
    const target = join(directory, name);
    try {
      await lstat(target);
      throw new AppError(409, "FILE_EXISTS", "Ein Eintrag mit diesem Namen existiert bereits.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await mkdir(target);
    } catch (error) {
      filesystemFailure(error);
    }
    return target;
  }

  /** Upload in den angegebenen Ordner. Streamt mit Größenlimit, kein Überschreiben. */
  async upload(input: { directory: string; filename: string; stream: Readable; byteLimit?: number }): Promise<FilesystemEntry> {
    const directory = await this.resolveTargetDirectory(input.directory);
    const name = sanitizeName(input.filename);
    const target = join(directory, name);
    try {
      await lstat(target);
      throw new AppError(409, "FILE_EXISTS", "Eine Datei mit diesem Namen existiert bereits im Zielordner.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const byteLimit = input.byteLimit ?? this.maxUploadBytes;
    const temporary = join(directory, `.workbench-upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
    let bytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > byteLimit) {
          callback(new AppError(413, "FILE_TOO_LARGE", "Die Datei überschreitet das Upload-Limit.", { limitBytes: byteLimit }));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(input.stream, counter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    const entry = await entryFor(target, name);
    return entry;
  }

  /** Namenssuche rekursiv mit Tiefen-, Treffer- und Zeitlimit. */
  async search(query: string): Promise<FileManagerSearchResponse> {
    const needle = query.trim().toLocaleLowerCase("de");
    if (!needle) throw new AppError(400, "FILESYSTEM_SEARCH_EMPTY", "Die Suche darf nicht leer sein.");
    const entries: FilesystemEntry[] = [];
    const deadline = Date.now() + SEARCH_TIMEOUT_MS;
    let truncated = false;

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (truncated || entries.length >= SEARCH_LIMIT || Date.now() > deadline) { truncated = true; return; }
      if (depth > SEARCH_MAX_DEPTH) return;
      let dirents: Dirent[];
      try {
        dirents = await readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }
      dirents.sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));
      for (const dirent of dirents) {
        if (truncated || entries.length >= SEARCH_LIMIT || Date.now() > deadline) { truncated = true; return; }
        if (dirent.isDirectory() && SKIPPED_DIRECTORIES.has(dirent.name)) continue;
        const path = join(directory, dirent.name);
        if (dirent.name.toLocaleLowerCase("de").includes(needle) && entries.length < SEARCH_LIMIT) {
          try {
            entries.push(await entryFor(path, dirent.name));
          } catch {
            /* nicht lesbare Einträge werden übersprungen */
          }
        }
        if (dirent.isDirectory()) await walk(path, depth + 1);
      }
    };

    await walk(this.root, 0);
    if (entries.length >= SEARCH_LIMIT || truncated) truncated = true;
    return fileManagerSearchResponseSchema.parse({ query: query.trim(), root: this.root, entries, truncated });
  }

  // --- Serverseitiger Zustand (Verlauf, Favoriten, Ansicht) -----------------

  private readState(): { document: FileManagerState; revision: number; updatedAt: string } {
    const row = this.db.prepare("SELECT id, document_json, revision, updated_at FROM file_manager_state WHERE id = 1").get() as StateRow | undefined;
    if (!row) return { document: this.defaultState(), revision: 0, updatedAt: new Date(0).toISOString() };
    return { document: JSON.parse(row.document_json) as FileManagerState, revision: row.revision, updatedAt: row.updated_at };
  }

  state(): FileManagerStateResponse {
    const { document, revision, updatedAt } = this.readState();
    return fileManagerStateResponseSchema.parse({ document, revision, updatedAt });
  }

  async saveState(input: { document: FileManagerState; expectedRevision: number | null }): Promise<FileManagerStateResponse> {
    const current = this.readState();
    if (input.expectedRevision === null && current.revision === 0) {
      // Erstinitialisierung ohne vorhandenen Stand ist erlaubt.
    } else if (input.expectedRevision !== current.revision) {
      throw new AppError(409, "FILE_MANAGER_STATE_CONFLICT", "Der Dateimanager-Zustand wurde parallel geändert. Bitte neu laden.", {
        revision: current.revision,
      });
    }
    const updatedAt = new Date().toISOString();
    const revision = current.revision + 1;
    this.db.prepare(
      `INSERT INTO file_manager_state (id, document_json, revision, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json, revision = excluded.revision, updated_at = excluded.updated_at`,
    ).run(JSON.stringify(input.document), revision, updatedAt);
    return fileManagerStateResponseSchema.parse({ document: input.document, revision, updatedAt });
  }

  /** Standardantwort für die Antwort-Form der Operationen. */
  response(path: string) {
    return fileManagerOperationResponseSchema.parse({ path, ok: true });
  }
}
