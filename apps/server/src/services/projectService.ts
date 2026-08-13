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
import { createAsyncCache } from "../utils/cache.js";
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
  registry?: ProjectRegistryDatabase,
): Promise<ProjectConfig[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(rootDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  const configuredByPath = new Map(configuredProjects.map((project) => [normalize(project.path), project]));
  const usedIds = new Set([...configuredProjects.map((project) => project.id), ...(registry?.list().map((project) => project.id) ?? [])]);
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }))
    .flatMap((entry, index) => {
      const path = normalize(join(rootDirectory, entry.name));
      const configured = configuredByPath.get(path);
      if (configured) {
        return [{
          ...configured,
          name: entry.name,
          description: "Automatisch erkannter lokaler Arbeitsbereich.",
          path,
          enabled: true,
          sortOrder: 1_000 + index,
        }];
      }
      const known = registry?.findByPath(path);
      const id = known?.id ?? uniqueProjectId(entry.name, usedIds);
      if (known) usedIds.add(known.id);
      const persisted = registry?.register(path, entry.name, new Date().toISOString(), id).project;
      return [{
        id: persisted?.id ?? id,
        name: persisted?.name ?? entry.name,
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
      ? await discoverProjects(discovery.rootDirectory, projectConfig.projects, registry)
      : [];
    const discoveredPaths = new Set(discovered.map((project) => normalize(project.path)));
    const configuredOutsideDiscovery = projectConfig.projects.filter((project) => !discoveredPaths.has(normalize(project.path)) && !isWithinDiscoveryRoot(project.path));
    const base = discovery.enabled ? [...discovered, ...configuredOutsideDiscovery] : [...projectConfig.projects];
    const knownPaths = new Set(base.map((project) => normalize(project.path)));
    const registered = (registry?.list() ?? []).flatMap((project): ProjectConfig[] => {
      if (knownPaths.has(normalize(project.path))) return [];
      return [registeredProjectConfig(project)];
    });
    return [...base, ...registered];
  }

  function isWithinDiscoveryRoot(path: string): boolean {
    const root = normalize(discovery.rootDirectory);
    const candidate = normalize(path);
    return candidate === root || candidate.startsWith(`${root}/`);
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

  type ProjectReference = Pick<Project, "id" | "name" | "path">;
  const listCache = createAsyncCache<ProjectsResponse>(settings.projectListCacheMilliseconds, async () => {
    const availableProjects = await configuredAndDiscoveredProjects();
    const projects = await mapWithConcurrency(
      availableProjects
        .filter((project) => project.enabled)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
      settings.projectActivityConcurrency,
      mapProject,
    );
    return projectsResponseSchema.parse({ projects, projectsRoot: discovery.rootDirectory, recentLimit: settings.orbitRecentProjectLimit });
  });
  const referenceCache = createAsyncCache<readonly ProjectReference[]>(settings.projectListCacheMilliseconds, async () => {
    const availableProjects = await configuredAndDiscoveredProjects();
    return availableProjects
      .filter((project) => project.enabled)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map((project) => ({ id: project.id, name: project.name, path: project.path }));
  });

  return {
    async list(): Promise<ProjectsResponse> {
      return listCache.get();
    },
    async listReferences(): Promise<readonly ProjectReference[]> {
      return referenceCache.get();
    },
    async get(projectId: string): Promise<ProjectResponse> {
      const availableProjects = await configuredAndDiscoveredProjects();
      const configuredProject = availableProjects.find((project) => project.id === projectId && project.enabled);
      if (configuredProject === undefined) {
        throw new AppError(404, "PROJECT_NOT_FOUND", "Das lokale Projekt wurde nicht gefunden.");
      }
      return projectResponseSchema.parse({ project: await mapProject(configuredProject) });
    },
    async touch(projectId: string) {
      const project = (await referenceCache.get()).find((candidate) => candidate.id === projectId);
      if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Das lokale Projekt wurde nicht gefunden.");
      const lastUsedAt = activity?.touch(projectId) ?? new Date().toISOString();
      listCache.clear();
      referenceCache.clear();
      return { projectId, lastUsedAt };
    },
    async register(path: string): Promise<RegisterProjectResponse> {
      const availableProjects = await configuredAndDiscoveredProjects();
      const existing = availableProjects.find((candidate) => normalize(candidate.path) === normalize(path));
      if (existing) {
        return registerProjectResponseSchema.parse({ project: await mapProject(existing), created: false });
      }
      if (!registry) throw new AppError(503, "PROJECT_REGISTRY_UNAVAILABLE", "Die Orbit-Projektregistry ist momentan nicht verfügbar.");
      const registered = registry.register(path, basename(path));
      listCache.clear();
      referenceCache.clear();
      return registerProjectResponseSchema.parse({
        project: await mapProject(registeredProjectConfig(registered.project)),
        created: registered.created,
      });
    },
  };
}

async function mapWithConcurrency<T, R>(values: readonly T[], concurrency: number, map: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await map(values[index]!);
    }
  }));
  return results;
}
