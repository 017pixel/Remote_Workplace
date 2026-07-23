import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { CreateProjectFileRequest, ProjectFileResponse } from "@workbench/contracts";
import type { createProjectService } from "./projectService.js";
import { AppError } from "../utils/errors.js";

function contained(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
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
      try {
        const stats = await lstat(target);
        if (stats.isSymbolicLink()) {
          throw new AppError(400, "INVALID_PROJECT_PATH", "Symbolische Dateiverweise dürfen nicht beschrieben werden.");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      try {
        await writeFile(target, input.content, { encoding: "utf8", flag: input.overwrite ? "w" : "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new AppError(409, "FILE_EXISTS", "Die Datei existiert bereits. Überschreiben muss ausdrücklich bestätigt werden.");
        }
        throw error;
      }
      return {
        projectId,
        path: relative(root, target).split(sep).join("/"),
        bytes: Buffer.byteLength(input.content, "utf8"),
        created: true,
      };
    },
  };
}
