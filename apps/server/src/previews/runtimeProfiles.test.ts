import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Project } from "@workbench/contracts";
import { detectRuntimeProfile } from "./runtimeProfiles.js";

const cleanup: string[] = [];
afterEach(async () => { for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true }); });

async function project(): Promise<Project> {
  const path = await mkdtemp(join(tmpdir(), "workbench-runtime-profile-"));
  cleanup.push(path);
  return {
    id: "test-projekt", name: "Test Projekt", description: "", path, enabled: true, sortOrder: 1,
    availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [], links: { t3Code: null, codeServer: null },
  };
}

const ports = [1234, 1223, 8000, 8080, 8888, 4444, 1233, 6000, 6060, 4040];

describe("Preview-Laufzeitprofile", () => {
  it("erkennt ein Vite-Projekt und weist den ersten erlaubten Port zu", async () => {
    const value = await project();
    await writeFile(join(value.path, "package.json"), JSON.stringify({ scripts: { dev: "vite" }, devDependencies: { vite: "1.0.0" } }));
    const profile = await detectRuntimeProfile(value, ports);
    expect(profile.services).toMatchObject([{ role: "frontend", port: 1234, portMode: "argument" }]);
    expect(profile.mainServiceId).toBe("frontend");
  });

  it("erkennt Frontend und Backend eines Monorepos als getrennte Dienste", async () => {
    const value = await project();
    await mkdir(join(value.path, "apps", "web"), { recursive: true });
    await mkdir(join(value.path, "apps", "api"), { recursive: true });
    await writeFile(join(value.path, "package.json"), JSON.stringify({ packageManager: "pnpm@10", workspaces: ["apps/*"] }));
    await writeFile(join(value.path, "apps", "web", "package.json"), JSON.stringify({ name: "@app/web", scripts: { dev: "vite" }, devDependencies: { vite: "1" } }));
    await writeFile(join(value.path, "apps", "api", "package.json"), JSON.stringify({ name: "@app/api", scripts: { dev: "tsx watch src.ts" }, dependencies: { fastify: "1" } }));
    const profile = await detectRuntimeProfile(value, ports);
    expect(profile.services.map((service) => [service.role, service.port])).toEqual([["frontend", 1234], ["api", 1223]]);
    expect(profile.services.every((service) => service.command === "pnpm run dev")).toBe(true);
  });

  it("liest pnpm-workspace.yaml und priorisiert benannte Root-Scripts vor gemeinsamen Abhängigkeiten", async () => {
    const value = await project();
    await mkdir(join(value.path, "apps", "web"), { recursive: true });
    await mkdir(join(value.path, "apps", "api"), { recursive: true });
    await writeFile(join(value.path, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await writeFile(join(value.path, "package.json"), JSON.stringify({ packageManager: "pnpm@10", scripts: { "db:dev": "docker compose up database" } }));
    await writeFile(join(value.path, "apps", "web", "package.json"), JSON.stringify({ name: "web", scripts: { dev: "vite" }, devDependencies: { vite: "1" } }));
    await writeFile(join(value.path, "apps", "api", "package.json"), JSON.stringify({ name: "api", scripts: { dev: "tsx watch" }, dependencies: { fastify: "1" } }));
    const workspaceProfile = await detectRuntimeProfile(value, ports);
    expect(workspaceProfile.services.map((service) => [service.role, service.port])).toEqual([["frontend", 1234], ["api", 1223], ["database", null]]);

    await rm(join(value.path, "apps"), { recursive: true, force: true });
    await rm(join(value.path, "pnpm-workspace.yaml"));
    await writeFile(join(value.path, "package.json"), JSON.stringify({
      scripts: { "dev:frontend": "vite", "dev:backend": "tsx watch server.ts" },
      dependencies: { fastify: "1" }, devDependencies: { vite: "1" },
    }));
    const rootProfile = await detectRuntimeProfile(value, ports);
    expect(rootProfile.services.map((service) => service.role)).toEqual(["frontend", "backend"]);
  });

  it("verwendet für Create React App den PORT-Environment-Modus", async () => {
    const value = await project();
    await writeFile(join(value.path, "package.json"), JSON.stringify({ scripts: { dev: "react-scripts start" }, dependencies: { "react-scripts": "1" } }));
    const profile = await detectRuntimeProfile(value, ports);
    expect(profile.services[0]).toMatchObject({ role: "frontend", port: 1234, portMode: "environment" });
  });

  it("übernimmt ein explizites Profil für API und lokale Datenbank", async () => {
    const value = await project();
    await writeFile(join(value.path, "preview.config.json"), JSON.stringify({
      version: 1,
      mainService: "api",
      setupCommand: "npm run prepare:dev",
      services: [
        { id: "api", name: "API", role: "api", command: "npm run dev:api", port: 8000, portMode: "environment" },
        { id: "db", name: "Datenbank", role: "database", command: "npm run db:start", port: null, portMode: "none" },
      ],
    }));
    const profile = await detectRuntimeProfile(value, ports);
    expect(profile.source).toBe("configured");
    expect(profile.mainServiceId).toBe("api");
    expect(profile.setupCommand).toBe("npm run prepare:dev");
    expect(profile.services[1]).toMatchObject({ role: "database", port: null });
  });

  it("erlaubt automatische Ports in expliziten Profilen der Version 2", async () => {
    const value = await project();
    await writeFile(join(value.path, "preview.config.json"), JSON.stringify({
      version: 2,
      mainService: "web",
      services: [
        { id: "web", name: "Web", role: "frontend", command: "npm run dev -- --port {port}", port: "auto", portMode: "none" },
        { id: "api", name: "API", role: "api", command: "npm run api", port: "auto", portMode: "environment" },
      ],
    }));
    const profile = await detectRuntimeProfile(value, ports);
    expect(profile.services.map((service) => service.port)).toEqual([1234, 1223]);
    expect(profile.autoPortServiceIds).toEqual(["web", "api"]);
  });

  it("weist automatische Ports in Version 1 mit einer Migrationsmeldung zurück", async () => {
    const value = await project();
    await writeFile(join(value.path, "preview.config.json"), JSON.stringify({
      version: 1,
      services: [{ id: "web", name: "Web", role: "frontend", command: "npm run dev", port: "auto", portMode: "environment" }],
    }));
    await expect(detectRuntimeProfile(value, ports)).rejects.toThrow("Version 2");
  });

  it("weist Ports außerhalb der zentralen Palette zurück", async () => {
    const value = await project();
    await writeFile(join(value.path, "preview.config.json"), JSON.stringify({
      version: 1,
      services: [{ id: "web", name: "Web", role: "frontend", command: "npm run dev", port: 5173, portMode: "argument" }],
    }));
    await expect(detectRuntimeProfile(value, ports)).rejects.toThrow("erlaubt sind nur");
  });

  it("weist doppelte IDs in einem expliziten Profil zurück", async () => {
    const value = await project();
    await writeFile(join(value.path, "preview.config.json"), JSON.stringify({
      version: 1,
      services: [
        { id: "server", name: "Frontend", role: "frontend", command: "npm run web", port: 1234, portMode: "argument" },
        { id: "server", name: "API", role: "api", command: "npm run api", port: 1223, portMode: "environment" },
      ],
    }));
    await expect(detectRuntimeProfile(value, ports)).rejects.toThrow("Dienst-IDs müssen eindeutig");
  });
});
