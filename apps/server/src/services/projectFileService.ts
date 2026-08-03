import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CreateProjectFileRequest, ProjectFileResponse } from "@workbench/contracts";
import type { createProjectService } from "./projectService.js";
import { AppError } from "../utils/errors.js";

function contained(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

async function fileVersion(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const digest = createHash("sha256");
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) digest.update(chunk);
    return digest.digest("hex");
  } finally {
    await handle.close();
  }
}

export function createProjectFileService(projects: Pick<ReturnType<typeof createProjectService>, "get">) {
  return {
    async create(projectId: string, input: CreateProjectFileRequest): Promise<ProjectFileResponse> {
      if (isAbsolute(input.path) || input.path.split(/[\\/]+/).some((part) => part === ".." || part === "")) {
        throw new AppError(400, "INVALID_PROJECT_PATH", "Der Dateipfad muss relativ zum Projekt sein.");
      }
      const { project } = await projects.get(projectId);
      if (project.availability !== "available") {
        throw new AppError(409, "PROJECT_UNAVAILABLE", "Das Projekt ist momentan nicht beschreibbar.");
      }
      const root = await realpath(project.path);
      const target = resolve(root, input.path);
      if (!contained(root, target)) {
        throw new AppError(400, "INVALID_PROJECT_PATH", "Der Dateipfad verlässt das Projektverzeichnis.");
      }
      await mkdir(dirname(target), { recursive: true });
      const canonicalParent = await realpath(dirname(target));
      if (canonicalParent !== root && !canonicalParent.startsWith(`${root}${sep}`)) {
        throw new AppError(400, "INVALID_PROJECT_PATH", "Der Dateipfad führt über einen unsicheren Verweis.");
      }
      // Ab hier ausschließlich den kanonischen Elternpfad verwenden. Ein
      // lokaler Prozess kann den ursprünglichen Parent zwischen Prüfung und
      // Rename gegen einen Symlink austauschen. Ein Ziel unter dem bereits
      // aufgelösten Parent folgt diesem Verweis beim Commit nicht.
      const canonicalTarget = join(canonicalParent, basename(target));
      let existed = false;
      let currentVersion: string | null = null;
      try {
        const stats = await lstat(canonicalTarget);
        if (stats.isSymbolicLink()) {
          throw new AppError(400, "INVALID_PROJECT_PATH", "Symbolische Dateiverweise dürfen nicht beschrieben werden.");
        }
        if (!stats.isFile()) {
          throw new AppError(409, "PROJECT_PATH_NOT_FILE", "Am Zielpfad liegt keine reguläre Datei.");
        }
        existed = true;
        currentVersion = await fileVersion(canonicalTarget);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (existed && !input.overwrite) {
        throw new AppError(
          409,
          "FILE_EXISTS",
          "Die Datei existiert bereits. Überschreiben muss ausdrücklich bestätigt werden.",
          { currentVersion },
        );
      }
      if (existed && input.expectedVersion === undefined) {
        throw new AppError(
          409,
          "FILE_VERSION_REQUIRED",
          "Vor dem Überschreiben muss die aktuelle Dateiversion bestätigt werden.",
          { currentVersion },
        );
      }
      if (existed && input.expectedVersion !== currentVersion) {
        throw new AppError(
          409,
          "FILE_CHANGED",
          "Die Datei wurde zwischenzeitlich geändert. Bitte prüfe den aktuellen Stand.",
          { currentVersion },
        );
      }
      const temporary = join(canonicalParent, `.workbench-${randomUUID()}.tmp`);
      let temporaryExists = false;
      try {
        const handle = await open(
          temporary,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        temporaryExists = true;
        try {
          await handle.writeFile(input.content, { encoding: "utf8" });
          await handle.sync();
        } finally {
          await handle.close();
        }
        const parentImmediatelyBeforeCommit = await realpath(canonicalParent);
        if (parentImmediatelyBeforeCommit !== canonicalParent) {
          throw new AppError(409, "PROJECT_PATH_CHANGED", "Das Zielverzeichnis wurde während des Speicherns verändert.");
        }
        if (existed) {
          const versionImmediatelyBeforeCommit = await fileVersion(canonicalTarget);
          if (versionImmediatelyBeforeCommit !== input.expectedVersion) {
            throw new AppError(
              409,
              "FILE_CHANGED",
              "Die Datei wurde zwischenzeitlich geändert. Bitte prüfe den aktuellen Stand.",
              { currentVersion: versionImmediatelyBeforeCommit },
            );
          }
          await rename(temporary, canonicalTarget);
          temporaryExists = false;
        } else {
          await link(temporary, canonicalTarget);
          await unlink(temporary);
          temporaryExists = false;
        }
      } catch (error) {
        if (temporaryExists) await unlink(temporary).catch(() => undefined);
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          const racedVersion = await fileVersion(canonicalTarget).catch(() => null);
          throw new AppError(
            409,
            "FILE_EXISTS",
            "Die Datei existiert bereits. Überschreiben muss ausdrücklich bestätigt werden.",
            { currentVersion: racedVersion },
          );
        }
        throw error;
      }
      const version = createHash("sha256").update(input.content, "utf8").digest("hex");
      return {
        projectId,
        path: relative(root, canonicalTarget).split(sep).join("/"),
        bytes: Buffer.byteLength(input.content, "utf8"),
        created: !existed,
        version,
      };
    },
  };
}
