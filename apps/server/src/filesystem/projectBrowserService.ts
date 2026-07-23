import { constants } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { filesystemTreeResponseSchema, type FilesystemEntry, type FilesystemTreeResponse } from "@workbench/contracts";
import { AppError } from "../utils/errors.js";

interface CursorPayload {
  path: string;
  offset: number;
}

function contained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

function cursorFor(path: string, offset: number): string {
  return Buffer.from(JSON.stringify({ path, offset } satisfies CursorPayload), "utf8").toString("base64url");
}

function parseCursor(cursor: string | undefined, path: string): number {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof value !== "object" || value === null ||
      !("path" in value) || value.path !== path ||
      !("offset" in value) || !Number.isInteger(value.offset) || Number(value.offset) < 0
    ) throw new Error("invalid cursor");
    return Number(value.offset);
  } catch {
    throw new AppError(400, "FILESYSTEM_CURSOR_INVALID", "Der Verzeichniscursor ist ungültig.");
  }
}

function kindOf(entry: Dirent): FilesystemEntry["kind"] {
  if (entry.isSymbolicLink()) return "symlink";
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  return "other";
}

function filesystemFailure(error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") throw new AppError(404, "FILESYSTEM_PATH_NOT_FOUND", "Der angegebene Pfad wurde nicht gefunden.");
  if (code === "EACCES" || code === "EPERM") throw new AppError(403, "FILESYSTEM_PATH_INACCESSIBLE", "Der angegebene Pfad ist nicht lesbar.");
  throw error;
}

export class ProjectBrowserService {
  private constructor(
    readonly root: string,
    readonly pageSize: number,
  ) {}

  static async create(root: string, pageSize: number): Promise<ProjectBrowserService> {
    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(resolve(root));
      const details = await lstat(canonicalRoot);
      if (!details.isDirectory()) throw new Error("Orbit project browser root must be a directory.");
      await access(canonicalRoot, constants.R_OK | constants.X_OK);
    } catch (error) {
      filesystemFailure(error);
    }
    return new ProjectBrowserService(canonicalRoot, pageSize);
  }

  private requestedPath(input?: string): string {
    const value = input?.trim();
    if (!value || value === "~") return this.root;
    if (value.startsWith("~/")) return resolve(this.root, value.slice(2));
    return isAbsolute(value) ? normalize(value) : resolve(this.root, value);
  }

  async resolveDirectory(input?: string, rootSelectable = true): Promise<string> {
    const requested = this.requestedPath(input);
    if (!contained(this.root, requested)) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    }
    let details: Stats;
    let canonical: string;
    try {
      details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verzeichnisse können nicht geöffnet werden.");
      if (!details.isDirectory()) throw new AppError(400, "FILESYSTEM_PATH_NOT_DIRECTORY", "Der angegebene Pfad ist kein Ordner.");
      canonical = await realpath(requested);
      await access(canonical, constants.R_OK | constants.X_OK);
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    if (!contained(this.root, canonical) || canonical !== requested) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
    }
    if (!rootSelectable && canonical === this.root) {
      throw new AppError(400, "PROJECT_BROWSER_ROOT_NOT_SELECTABLE", "Der Home-Ordner selbst kann nicht als Projekt geöffnet werden.");
    }
    return canonical;
  }

  async tree(input?: { path?: string; cursor?: string; limit?: number }): Promise<FilesystemTreeResponse> {
    const directory = await this.resolveDirectory(input?.path);
    const limit = Math.min(500, Math.max(1, input?.limit ?? this.pageSize));
    const offset = parseCursor(input?.cursor, directory);
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      filesystemFailure(error);
    }
    entries.sort((left, right) => {
      const kindDifference = (left.isDirectory() ? 0 : 1) - (right.isDirectory() ? 0 : 1);
      return kindDifference || left.name.localeCompare(right.name, "de", { sensitivity: "base", numeric: true });
    });
    const page = entries.slice(offset, offset + limit);
    const mapped = await Promise.all(page.map(async (entry): Promise<FilesystemEntry> => {
      const path = join(directory, entry.name);
      const kind = kindOf(entry);
      if (kind === "symlink") return { name: entry.name, path, kind, sizeBytes: null, modifiedAt: null, readable: false };
      try {
        const [details] = await Promise.all([
          lstat(path),
          access(path, kind === "directory" ? constants.R_OK | constants.X_OK : constants.R_OK),
        ]);
        return {
          name: entry.name,
          path,
          kind,
          sizeBytes: kind === "file" ? details.size : null,
          modifiedAt: details.mtime.toISOString(),
          readable: true,
        };
      } catch {
        return { name: entry.name, path, kind, sizeBytes: null, modifiedAt: null, readable: false };
      }
    }));
    const nextOffset = offset + page.length;
    return filesystemTreeResponseSchema.parse({
      root: this.root,
      path: directory,
      entries: mapped,
      nextCursor: nextOffset < entries.length ? cursorFor(directory, nextOffset) : null,
    });
  }
}
