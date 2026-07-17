import { constants } from "node:fs";
import type { Dirent } from "node:fs";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import { join, normalize } from "node:path";
import {
  projectResponseSchema,
  projectsResponseSchema,
  type Project,
  type ProjectResponse,
  type ProjectsResponse,
} from "@workbench/contracts";
import type { ProjectsConfig, ServiceConfig } from "../config/schemas.js";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";

type ProjectConfig = ProjectsConfig["projects"][number];

function projectIdFromName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "projekt";
}

function uniqueProjectId(name: string, usedIds: Set<string>): string {
  const base = projectIdFromName(name);
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

async function discoverProjects(
  rootDirectory: string,
  configuredProjects: ProjectConfig[],
): Promise<ProjectConfig[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(rootDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  const configuredPaths = new Set(configuredProjects.map((project) => normalize(project.path)));
  const usedIds = new Set(configuredProjects.map((project) => project.id));
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }))
    .flatMap((entry, index) => {
      const path = normalize(join(rootDirectory, entry.name));
      if (configuredPaths.has(path)) return [];
      return [{
        id: uniqueProjectId(entry.name, usedIds),
        name: entry.name,
        description: "Automatisch erkannter lokaler Arbeitsbereich.",
        path,
        enabled: true,
        sortOrder: 1_000 + index,
        previews: [],
      }];
    });
}

async function getAvailability(path: string): Promise<Project["availability"]> {
  try {
    const normalizedPath = normalize(path);
    const stats = await lstat(normalizedPath);
    if (!stats.isDirectory()) return "inaccessible";
    const canonicalPath = await realpath(normalizedPath);
    if (canonicalPath !== normalizedPath || stats.isSymbolicLink()) return "symlink";
    await access(normalizedPath, constants.R_OK | constants.X_OK);
    return "available";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "inaccessible";
  }
}

function buildCodeServerUrl(publicUrl: string | null, projectPath: string): string | null {
  if (publicUrl === null) return null;
  const url = new URL(publicUrl);
  url.searchParams.set("folder", projectPath);
  return url.toString();
}

export function createProjectService(
  projectConfig: ProjectsConfig,
  services: ServiceConfig[],
  discovery: { enabled: boolean; rootDirectory: string } = {
    enabled: settings.projectDiscoveryEnabled,
    rootDirectory: settings.projectsRootDirectory,
  },
) {
  const ids = new Set<string>();
  for (const project of projectConfig.projects) {
    if (ids.has(project.id)) throw new Error(`Doppelte Projekt-ID: ${project.id}`);
    ids.add(project.id);
  }

  const t3CodeUrl = services.find((service) => service.id === "t3-code")?.publicUrl ?? null;
  const codeServerUrl = services.find((service) => service.id === "code-server")?.publicUrl ?? null;

  async function mapProject(configuredProject: ProjectConfig): Promise<Project> {
    return {
      ...configuredProject,
      availability: await getAvailability(configuredProject.path),
      links: {
        t3Code: t3CodeUrl,
        codeServer: buildCodeServerUrl(codeServerUrl, configuredProject.path),
      },
    };
  }

  async function configuredAndDiscoveredProjects(): Promise<ProjectConfig[]> {
    const discovered = discovery.enabled
      ? await discoverProjects(discovery.rootDirectory, projectConfig.projects)
      : [];
    return [...projectConfig.projects, ...discovered];
  }

  return {
    async list(): Promise<ProjectsResponse> {
      const availableProjects = await configuredAndDiscoveredProjects();
      const projects = await Promise.all(
        availableProjects
          .filter((project) => project.enabled)
          .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
          .map(mapProject),
      );
      return projectsResponseSchema.parse({ projects });
    },
    async get(projectId: string): Promise<ProjectResponse> {
      const availableProjects = await configuredAndDiscoveredProjects();
      const configuredProject = availableProjects.find(
        (project) => project.id === projectId && project.enabled,
      );
      if (configuredProject === undefined) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "Das lokale Projekt wurde nicht gefunden.");
      }
      return projectResponseSchema.parse({ project: await mapProject(configuredProject) });
    },
  };
}
