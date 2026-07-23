import { constants } from "node:fs";
import type { Dirent } from "node:fs";
import { access, lstat, readdir, realpath } from "node:fs/promises";
import { basename, join, normalize } from "node:path";
import {
  projectResponseSchema,
  projectsResponseSchema,
  registerProjectResponseSchema,
  type Project,
  type ProjectResponse,
  type ProjectsResponse,
  type RegisterProjectResponse,
} from "@workbench/contracts";
import type { ProjectsConfig, ServiceConfig } from "../config/schemas.js";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";
import type { ProjectActivityService } from "../projects/activity-service.js";
import type { ProjectRegistryDatabase, RegisteredProject } from "../projects/registry-database.js";

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
  activity?: ProjectActivityService,
  registry?: ProjectRegistryDatabase,
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
      activity: activity ? await activity.get(configuredProject.id, configuredProject.path) : {
        lastWorkbenchUseAt: null,
        lastFilesystemChangeAt: null,
        lastGitCommitAt: null,
        effectiveAt: null,
      },
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
    const base = [...projectConfig.projects, ...discovered];
    const knownPaths = new Set(base.map((project) => normalize(project.path)));
    const registered = (registry?.list() ?? []).flatMap((project): ProjectConfig[] => {
      if (knownPaths.has(normalize(project.path))) return [];
      return [registeredProjectConfig(project)];
    });
    return [...base, ...registered];
  }

  function registeredProjectConfig(project: RegisteredProject): ProjectConfig {
    return {
      id: project.id,
      name: project.name,
      description: "Im Orbit ausgewählter lokaler Arbeitsbereich.",
      path: project.path,
      enabled: true,
      sortOrder: 2_000,
      previews: [],
    };
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
      return projectsResponseSchema.parse({ projects, recentLimit: settings.orbitRecentProjectLimit });
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
    async touch(projectId: string) {
      const availableProjects = await configuredAndDiscoveredProjects();
      const project = availableProjects.find((candidate) => candidate.id === projectId && candidate.enabled);
      if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Das lokale Projekt wurde nicht gefunden.");
      return { projectId, lastUsedAt: activity?.touch(projectId) ?? new Date().toISOString() };
    },
    async register(path: string): Promise<RegisterProjectResponse> {
      const availableProjects = await configuredAndDiscoveredProjects();
      const existing = availableProjects.find((candidate) => normalize(candidate.path) === normalize(path));
      if (existing) {
        return registerProjectResponseSchema.parse({ project: await mapProject(existing), created: false });
      }
      if (!registry) throw new AppError(503, "PROJECT_REGISTRY_UNAVAILABLE", "Die Orbit-Projektregistry ist momentan nicht verfügbar.");
      const registered = registry.register(path, basename(path));
      return registerProjectResponseSchema.parse({
        project: await mapProject(registeredProjectConfig(registered.project)),
        created: registered.created,
      });
    },
  };
}
