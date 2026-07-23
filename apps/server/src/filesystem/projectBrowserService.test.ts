import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectBrowserService } from "./projectBrowserService.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "workbench-project-browser-"));
  directories.push(root);
  await mkdir(join(root, ".hidden"));
  await mkdir(join(root, "project"));
  await writeFile(join(root, ".env"), "SECRET=hidden\n");
  await writeFile(join(root, "readme.md"), "read me\n");
  return { root, browser: await ProjectBrowserService.create(root, 300) };
}

describe("ProjectBrowserService", () => {
  it("lists directories, files and dotfiles without reading contents", async () => {
    const { root, browser } = await fixture();
    const tree = await browser.tree();
    expect(tree).toMatchObject({ root, path: root, nextCursor: null });
    expect(tree.entries.map((entry) => [entry.name, entry.kind])).toEqual([
      [".hidden", "directory"],
      ["project", "directory"],
      [".env", "file"],
      ["readme.md", "file"],
    ]);
    expect(tree.entries.find((entry) => entry.name === ".env")).toMatchObject({ readable: true, sizeBytes: 14 });
  });

  it("paginates one directory with path-bound cursors", async () => {
    const { browser } = await fixture();
    const first = await browser.tree({ limit: 2 });
    expect(first.entries).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await browser.tree({ cursor: first.nextCursor!, limit: 2 });
    expect(second.entries).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    await expect(browser.tree({ path: "project", cursor: first.nextCursor! })).rejects.toMatchObject({ code: "FILESYSTEM_CURSOR_INVALID" });
  });

  it("resolves absolute, home-relative and root-relative directories", async () => {
    const { root, browser } = await fixture();
    await expect(browser.resolveDirectory(join(root, "project"))).resolves.toBe(join(root, "project"));
    await expect(browser.resolveDirectory("~/project")).resolves.toBe(join(root, "project"));
    await expect(browser.resolveDirectory("project")).resolves.toBe(join(root, "project"));
  });

  it("rejects root selection, files and paths outside the configured root", async () => {
    const { root, browser } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "workbench-project-browser-outside-"));
    directories.push(outside);
    await expect(browser.resolveDirectory(root, false)).rejects.toMatchObject({ code: "PROJECT_BROWSER_ROOT_NOT_SELECTABLE" });
    await expect(browser.resolveDirectory(join(root, "readme.md"), false)).rejects.toMatchObject({ code: "FILESYSTEM_PATH_NOT_DIRECTORY" });
    await expect(browser.resolveDirectory(outside, false)).rejects.toMatchObject({ code: "FILESYSTEM_PATH_OUTSIDE_ROOT" });
    await expect(browser.resolveDirectory("../outside", false)).rejects.toMatchObject({ code: "FILESYSTEM_PATH_OUTSIDE_ROOT" });
  });

  it("shows symlinks but never follows or selects them", async () => {
    const { root, browser } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), "workbench-project-browser-target-"));
    directories.push(outside);
    await symlink(outside, join(root, "external-link"));
    const tree = await browser.tree();
    expect(tree.entries.find((entry) => entry.name === "external-link")).toMatchObject({ kind: "symlink", readable: false });
    await expect(browser.resolveDirectory(join(root, "external-link"), false)).rejects.toMatchObject({ code: "FILESYSTEM_SYMLINK_FORBIDDEN" });
  });
});
