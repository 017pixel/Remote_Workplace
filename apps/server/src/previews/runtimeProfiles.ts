import { access, readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import {
  previewRuntimeProfileSchema,
  type PreviewRuntimePortMode,
  type PreviewRuntimeProfile,
  type PreviewRuntimeService,
  type PreviewRuntimeServiceRole,
  type Project,
} from "@wrapt/contracts";
import { z } from "zod";

export const PREVIEW_RUNTIME_CONFIG_FILE = "preview.config.json";

const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const relativeDirectory = z.string().min(1).max(240).refine((value) => {
  const normalized = value.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !normalized.split("/").includes("..");
}, "Arbeitsverzeichnisse müssen innerhalb des Projekts liegen.");

const configuredPortSchema = z.union([z.number().int().min(1_024).max(65_535), z.literal("auto")]).nullable();

const runtimeConfigSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  setupCommand: z.string().trim().min(1).max(1_000).nullable().default(null),
  mainService: identifier.nullable().default(null),
  services: z.array(z.object({
    id: identifier,
    name: z.string().trim().min(1).max(80),
    role: z.enum(["frontend", "backend", "api", "database", "socket", "worker", "other"]),
    command: z.string().trim().min(1).max(1_000),
    workingDirectory: relativeDirectory.default("."),
    port: configuredPortSchema.default(null),
    portMode: z.enum(["argument", "environment", "none"]).default("environment"),
  })).min(1).max(10),
}).superRefine((config, context) => {
  const ids = config.services.map((service) => service.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["services"], message: "Dienst-IDs müssen eindeutig sein." });
  if (config.version === 1) {
    config.services.forEach((service, index) => {
      if (service.port === "auto") context.addIssue({ code: "custom", path: ["services", index, "port"], message: "Automatische Ports benötigen preview.config.json Version 2." });
    });
  }
});

interface PackageManifest {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface RuntimeProfileResult extends PreviewRuntimeProfile {
  setupCommand: string | null;
  autoPortServiceIds: string[];
}

const frontendMarkers = new Map([
  ["vite", "Vite"], ["next", "Next.js"], ["@sveltejs/kit", "SvelteKit"], ["nuxt", "Nuxt"],
  ["astro", "Astro"], ["@angular/cli", "Angular"], ["react-scripts", "Create React App"],
]);
const backendMarkers = new Map([
  ["fastify", "Fastify"], ["express", "Express"], ["hono", "Hono"], ["@nestjs/core", "NestJS"],
  ["koa", "Koa"], ["elysia", "Elysia"],
]);
const socketMarkers = new Map([["ws", "WebSocket"], ["socket.io", "Socket.IO"]]);
const databaseMarkers = new Map([
  ["prisma", "Prisma"], ["@prisma/client", "Prisma"], ["drizzle-orm", "Drizzle"],
  ["@supabase/supabase-js", "Supabase"], ["convex", "Convex"], ["mongoose", "MongoDB"],
  ["pg", "PostgreSQL"], ["mysql2", "MySQL"], ["better-sqlite3", "SQLite"],
]);

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function readManifest(directory: string): Promise<PackageManifest | null> {
  try { return JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as PackageManifest; }
  catch { return null; }
}

function dependencies(manifest: PackageManifest): Set<string> {
  return new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);
}

function hintsFor(manifest: PackageManifest): string[] {
  const names = dependencies(manifest);
  const hints = [...frontendMarkers, ...backendMarkers, ...socketMarkers, ...databaseMarkers]
    .filter(([dependency]) => names.has(dependency)).map(([, hint]) => hint);
  return [...new Set(hints)].slice(0, 12);
}

function roleFor(manifest: PackageManifest, label: string, script: string): PreviewRuntimeServiceRole {
  const names = dependencies(manifest);
  const haystack = `${manifest.name ?? ""} ${label} ${script}`.toLowerCase();
  // Explizite Script- und Paketnamen haben Vorrang vor gemeinsam installierten
  // Monorepo-Abhängigkeiten. Sonst würde z. B. ein `dev:frontend`-Script allein
  // wegen Fastify im Root fälschlich zum Backend.
  if (/\b(db|database|postgres|mysql|redis|supabase|convex)\b/.test(haystack)) return "database";
  if (/\b(worker|queue|jobs?)\b/.test(haystack)) return "worker";
  if (/\b(socket|websocket|ws)\b/.test(haystack)) return "socket";
  if (/\b(api)\b/.test(haystack)) return "api";
  if (/\b(server|backend)\b/.test(haystack)) return "backend";
  if (/\b(web|frontend|client|ui)\b/.test(haystack)) return "frontend";
  if ([...socketMarkers.keys()].some((name) => names.has(name))) return "socket";
  if ([...backendMarkers.keys()].some((name) => names.has(name) || haystack.includes(name))) return "backend";
  if ([...frontendMarkers.keys()].some((name) => names.has(name) || haystack.includes(name))) return "frontend";
  return "other";
}

function serviceName(manifest: PackageManifest, script: string, role: PreviewRuntimeServiceRole): string {
  if (script !== "dev") return script.replace(/^dev:/, "").replace(/:dev$/, "").replaceAll("-", " ").replace(/\b\w/g, (value) => value.toUpperCase());
  if (manifest.name) return manifest.name.replace(/^@[^/]+\//, "");
  return role === "other" ? "Development Server" : role[0]!.toUpperCase() + role.slice(1);
}

function slug(value: string, fallback: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

async function packageManager(projectPath: string, manifest: PackageManifest): Promise<string> {
  const declared = manifest.packageManager?.split("@")[0];
  if (declared && ["npm", "pnpm", "yarn", "bun"].includes(declared)) return declared;
  if (await exists(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(join(projectPath, "yarn.lock"))) return "yarn";
  if (await exists(join(projectPath, "bun.lockb")) || await exists(join(projectPath, "bun.lock"))) return "bun";
  return "npm";
}

function scriptCommand(manager: string, script: string): string {
  return manager === "yarn" ? `yarn ${script}` : manager === "bun" ? `bun run ${script}` : `${manager} run ${script}`;
}

async function workspaceDirectories(projectPath: string, manifest: PackageManifest): Promise<string[]> {
  const configuredPatterns = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages ?? [];
  let pnpmPatterns: string[] = [];
  if (configuredPatterns.length === 0 && await exists(join(projectPath, "pnpm-workspace.yaml"))) {
    const source = await readFile(join(projectPath, "pnpm-workspace.yaml"), "utf8");
    pnpmPatterns = source.split("\n").flatMap((line) => {
      const match = line.match(/^\s*-\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/);
      return match?.[1]?.trim() ? [match[1].trim()] : [];
    });
  }
  const patterns = configuredPatterns.length > 0 ? configuredPatterns : pnpmPatterns;
  const directories: string[] = [];
  for (const pattern of patterns) {
    const normalized = pattern.replaceAll("\\", "/").replace(/\/$/, "");
    if (normalized.endsWith("/*")) {
      const parent = resolve(projectPath, normalized.slice(0, -2));
      if (relative(projectPath, parent).startsWith("..")) continue;
      try {
        for (const entry of await readdir(parent, { withFileTypes: true })) if (entry.isDirectory()) directories.push(join(parent, entry.name));
      } catch { /* Ein fehlendes Workspace-Muster ist kein Profilfehler. */ }
    } else if (!normalized.includes("*")) {
      const directory = resolve(projectPath, normalized);
      if (!relative(projectPath, directory).startsWith("..")) directories.push(directory);
    }
  }
  return [...new Set(directories)];
}

function usesBrowserPort(role: PreviewRuntimeServiceRole): boolean {
  return !["database", "worker"].includes(role);
}

function assignPorts(
  detected: Array<Omit<PreviewRuntimeService, "port" | "portMode" | "source">>,
  allowedPorts: readonly number[],
): PreviewRuntimeService[] {
  let index = 0;
  return detected.slice(0, 10).map((service) => {
    const needsPort = usesBrowserPort(service.role);
    const port = needsPort ? allowedPorts[index++] ?? null : null;
    const portMode: PreviewRuntimePortMode = port === null
      ? "none"
      : service.role === "frontend" && !service.frameworkHints.includes("Create React App")
        ? "argument"
        : "environment";
    return { ...service, port, portMode, source: "detected" };
  });
}

function mainService(services: PreviewRuntimeService[], configured: string | null = null): string | null {
  if (configured && services.some((service) => service.id === configured && service.port !== null)) return configured;
  return services.find((service) => service.role === "frontend" && service.port !== null)?.id
    ?? services.find((service) => ["api", "backend", "other"].includes(service.role) && service.port !== null)?.id
    ?? services.find((service) => service.port !== null)?.id
    ?? null;
}

async function configuredProfile(project: Project, allowedPorts: readonly number[]): Promise<RuntimeProfileResult | null> {
  const path = join(project.path, PREVIEW_RUNTIME_CONFIG_FILE);
  if (!await exists(path)) return null;
  const parsed = runtimeConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const usedPorts = new Set<number>();
  const autoPortServiceIds: string[] = [];
  const services = parsed.services.map((service): PreviewRuntimeService => {
    if (typeof service.port === "number" && !allowedPorts.includes(service.port)) throw new Error(`Dienst ${service.name} verwendet Port ${service.port}, erlaubt sind nur ${allowedPorts.join(", ")}.`);
    if (typeof service.port === "number" && usedPorts.has(service.port)) throw new Error(`Port ${service.port} ist im Preview-Profil doppelt vergeben.`);
    if (service.port === "auto" && !usesBrowserPort(service.role)) throw new Error(`Dienst ${service.name} benötigt als ${service.role} keinen Browser-Port. Verwende port: null.`);
    if (service.port === null && usesBrowserPort(service.role)) throw new Error(`Dienst ${service.name} benötigt einen Port aus der erlaubten Preview-Palette oder port: "auto".`);
    let port = service.port;
    if (port === "auto") {
      const available = allowedPorts.find((candidate) => !usedPorts.has(candidate));
      if (available === undefined) throw new Error(`Das Projekt benötigt mehr Browser-Ports als verfügbar sind (${allowedPorts.length}).`);
      port = available;
      autoPortServiceIds.push(service.id);
    }
    if (port !== null) usedPorts.add(port);
    const workingDirectory = resolve(project.path, service.workingDirectory);
    if (relative(project.path, workingDirectory).startsWith("..")) throw new Error(`Dienst ${service.name} liegt außerhalb des Projektordners.`);
    return { ...service, port, workingDirectory, source: "configured", frameworkHints: [] };
  });
  const selectedMain = mainService(services, parsed.mainService);
  if (parsed.mainService && selectedMain !== parsed.mainService) throw new Error("Der konfigurierte Hauptdienst fehlt oder besitzt keinen Browser-Port.");
  const profile = previewRuntimeProfileSchema.parse({
    projectId: project.id, source: "configured", mainServiceId: selectedMain, services,
    allowedPorts: [...allowedPorts], warnings: [], detectedAt: new Date().toISOString(),
  });
  return { ...profile, setupCommand: parsed.setupCommand, autoPortServiceIds };
}

export async function detectRuntimeProfile(project: Project, allowedPorts: readonly number[]): Promise<RuntimeProfileResult> {
  const configured = await configuredProfile(project, allowedPorts);
  if (configured) return configured;

  const root = await readManifest(project.path);
  if (!root) throw new Error("Das Projekt besitzt keine lesbare package.json und kein preview.config.json.");
  const manager = await packageManager(project.path, root);
  const detected: Array<Omit<PreviewRuntimeService, "port" | "portMode" | "source">> = [];
  const workspaces = await workspaceDirectories(project.path, root);

  for (const directory of workspaces) {
    const manifest = await readManifest(directory);
    if (!manifest?.scripts?.dev) continue;
    const role = roleFor(manifest, basename(directory), `dev ${manifest.scripts.dev}`);
    if (role === "other" && /(?:contracts?|types?|shared|config|eslint)/i.test(`${manifest.name ?? ""} ${basename(directory)}`)) continue;
    detected.push({
      id: slug(manifest.name ?? basename(directory), `dienst-${detected.length + 1}`),
      name: serviceName(manifest, "dev", role), role, command: scriptCommand(manager, "dev"),
      workingDirectory: directory, frameworkHints: hintsFor(manifest),
    });
  }

  const scripts = root.scripts ?? {};
  const named = Object.keys(scripts).filter((name) => /^(?:dev:)?(?:web|frontend|client|server|backend|api|socket|worker|db|database)(?::dev)?$/.test(name));
  if (detected.length > 0) {
    // Ergänzende Root-Dienste (typisch `db:dev` oder `worker`) dürfen neben
    // Workspace-Apps nicht verloren gehen. Bereits erkannte Rollen werden nicht
    // doppelt gestartet, weil Root-Scripts in Monorepos oft nur Wrapper sind.
    for (const script of named) {
      const role = roleFor(root, script, `${script} ${scripts[script] ?? ""}`);
      if (detected.some((service) => service.role === role)) continue;
      detected.push({
        id: slug(script, `dienst-${detected.length + 1}`), name: serviceName(root, script, role), role,
        command: scriptCommand(manager, script), workingDirectory: project.path, frameworkHints: hintsFor(root),
      });
    }
  } else {
    const selected = named.length >= 2 ? named : scripts.dev ? ["dev"] : named;
    for (const script of selected) {
      const role = roleFor(root, project.name, `${script} ${scripts[script] ?? ""}`);
      detected.push({
        id: slug(script === "dev" ? role : script, `dienst-${detected.length + 1}`),
        name: serviceName(root, script, role), role, command: scriptCommand(manager, script),
        workingDirectory: project.path, frameworkHints: hintsFor(root),
      });
    }
  }

  if (detected.length === 0) throw new Error("Es wurde kein startbarer Development-Dienst erkannt. Lege preview.config.json an.");
  const usedIds = new Set<string>();
  for (const service of detected) {
    const base = service.id;
    let unique = base;
    let suffix = 2;
    while (usedIds.has(unique)) unique = `${base}-${suffix++}`;
    service.id = unique;
    usedIds.add(unique);
  }
  const rolePriority: Record<PreviewRuntimeServiceRole, number> = {
    frontend: 0, api: 1, backend: 2, socket: 3, database: 4, worker: 5, other: 6,
  };
  detected.sort((left, right) => rolePriority[left.role] - rolePriority[right.role] || left.id.localeCompare(right.id));
  const services = assignPorts(detected, allowedPorts);
  if (services.some((service) => usesBrowserPort(service.role) && service.port === null)) {
    throw new Error(`Das Projekt benötigt mehr Browser-Ports als verfügbar sind (${allowedPorts.length}).`);
  }
  const rootDependencies = dependencies(root);
  const databaseHints = [...databaseMarkers].filter(([name]) => rootDependencies.has(name)).map(([, hint]) => hint);
  const hasDatabaseService = services.some((service) => service.role === "database");
  const warnings = databaseHints.length > 0 && !hasDatabaseService
    ? [`${[...new Set(databaseHints)].join(", ")} erkannt. Ohne lokalen Datenbank-Startbefehl wird kein eigener Datenbankdienst gestartet.`]
    : [];
  return {
    ...previewRuntimeProfileSchema.parse({
      projectId: project.id, source: "detected", mainServiceId: mainService(services), services,
      allowedPorts: [...allowedPorts], warnings, detectedAt: new Date().toISOString(),
    }),
    setupCommand: null,
    autoPortServiceIds: services.flatMap((service) => service.port === null ? [] : [service.id]),
  };
}
