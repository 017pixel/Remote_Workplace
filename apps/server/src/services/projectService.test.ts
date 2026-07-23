import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRegistryDatabase } from "../projects/registry-database.js";
import { createProjectService } from "./projectService.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("project service registry", () => {
  it("reuses discovered projects and persists arbitrary registered folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-project-service-"));
    directories.push(root);
    const discoveredPath = join(root, "discovered");
    const nestedPath = join(root, "other", "nested");
    await mkdir(discoveredPath);
    await mkdir(nestedPath, { recursive: true });
    const registry = new ProjectRegistryDatabase(join(root, "workbench.sqlite"));
    const service = createProjectService(
      { projects: [] },
      [],
      { enabled: true, rootDirectory: root },
      undefined,
      registry,
    );

    const existing = await service.register(discoveredPath);
    expect(existing).toMatchObject({ created: false, project: { id: "discovered", path: discoveredPath } });
    const registered = await service.register(nestedPath);
    expect(registered).toMatchObject({ created: true, project: { path: nestedPath, availability: "available" } });
    expect((await service.get(registered.project.id)).project.path).toBe(nestedPath);

    await rm(nestedPath, { recursive: true });
    expect((await service.get(registered.project.id)).project.availability).toBe("missing");
    registry.close();
  });
});
