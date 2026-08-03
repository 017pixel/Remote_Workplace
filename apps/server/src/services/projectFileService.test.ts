import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectFileService } from "./projectFileService.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

async function service() {
  const root = await mkdtemp(join(tmpdir(), "workbench-files-"));
  directories.push(root);
  const projects = {
    get: async () => ({ project: { id: "test", name: "Test", description: "", path: root, enabled: true, sortOrder: 0, availability: "available" as const, activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null }, previews: [], links: { t3Code: null, codeServer: null } } }),
    list: async () => ({ projects: [], recentLimit: 8 }),
    touch: async () => ({ projectId: "test", lastUsedAt: new Date().toISOString() }),
  };
  return { root, files: createProjectFileService(projects) };
}

describe("project file service", () => {
  it("creates nested UTF-8 files below the project root", async () => {
    const { root, files } = await service();
    const result = await files.create("test", { path: "notes/orbit.md", content: "# Orbit", overwrite: false });
    expect(result).toMatchObject({ path: "notes/orbit.md", bytes: 7, created: true, version: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(await readFile(join(root, "notes/orbit.md"), "utf8")).toBe("# Orbit");
  });

  it("rejects traversal and implicit overwrites", async () => {
    const { root, files } = await service();
    await expect(files.create("test", { path: "../outside.txt", content: "no", overwrite: false })).rejects.toMatchObject({ code: "INVALID_PROJECT_PATH" });
    await files.create("test", { path: "inside.txt", content: "first", overwrite: false });
    const conflict = await files.create("test", { path: "inside.txt", content: "second", overwrite: false }).catch((error: unknown) => error);
    expect(conflict).toMatchObject({ code: "FILE_EXISTS", details: { currentVersion: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    const updated = await files.create("test", {
      path: "inside.txt",
      content: "second",
      overwrite: true,
      expectedVersion: (conflict as { details: { currentVersion: string } }).details.currentVersion,
    });
    expect(updated).toMatchObject({ created: false });
    expect(await readFile(join(root, "inside.txt"), "utf8")).toBe("second");
  });

  it("rejects stale overwrites without changing the newer file", async () => {
    const { root, files } = await service();
    await files.create("test", { path: "shared.txt", content: "first", overwrite: false });
    const conflict = await files.create("test", { path: "shared.txt", content: "mine", overwrite: false }).catch((error: unknown) => error);
    const staleVersion = (conflict as { details: { currentVersion: string } }).details.currentVersion;
    await writeFile(join(root, "shared.txt"), "external", "utf8");
    await expect(files.create("test", {
      path: "shared.txt",
      content: "mine",
      overwrite: true,
      expectedVersion: staleVersion,
    })).rejects.toMatchObject({ code: "FILE_CHANGED" });
    expect(await readFile(join(root, "shared.txt"), "utf8")).toBe("external");
  });
});
