import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    expect(result).toMatchObject({ path: "notes/orbit.md", bytes: 7, created: true });
    expect(await readFile(join(root, "notes/orbit.md"), "utf8")).toBe("# Orbit");
  });

  it("rejects traversal and implicit overwrites", async () => {
    const { files } = await service();
    await expect(files.create("test", { path: "../outside.txt", content: "no", overwrite: false })).rejects.toMatchObject({ code: "INVALID_PROJECT_PATH" });
    await files.create("test", { path: "inside.txt", content: "first", overwrite: false });
    await expect(files.create("test", { path: "inside.txt", content: "second", overwrite: false })).rejects.toMatchObject({ code: "FILE_EXISTS" });
  });
});
