import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserDatabase } from "./database.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("BrowserDatabase", () => {
  it("persists the shared profile and last URL for a stable browser instance", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-browser-db-"));
    directories.push(directory);
    const database = new BrowserDatabase(join(directory, "workbench.sqlite"));
    database.save({ userId: "owner@example.com", instanceId: "shared-browser", profileKey: "research-main", lastUrl: "https://example.com/workspace", updatedAt: 123 });
    expect(database.get("owner@example.com", "shared-browser")).toEqual({
      userId: "owner@example.com",
      instanceId: "shared-browser",
      profileKey: "research-main",
      lastUrl: "https://example.com/workspace",
      updatedAt: 123,
    });
    expect(database.get("other@example.com", "shared-browser")).toBeUndefined();
    database.close();
  });
});
