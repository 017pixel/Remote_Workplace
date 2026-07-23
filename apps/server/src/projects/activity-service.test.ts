import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectActivityDatabase } from "./activity-database.js";
import { ProjectActivityService } from "./activity-service.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProjectActivityService", () => {
  it("combines Workbench use and real filesystem activity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-project-activity-"));
    directories.push(directory);
    const project = join(directory, "project");
    const database = new ProjectActivityDatabase(join(directory, "workbench.sqlite"));
    await mkdir(project);
    await writeFile(join(project, "file.ts"), "export {};\n");
    const touchedAt = "2099-01-02T03:04:05.000Z";
    database.touch("project", touchedAt);
    const service = new ProjectActivityService({ database, cacheMilliseconds: 10_000, maximumDepth: 3 });
    expect(await service.get("project", project)).toMatchObject({
      lastWorkbenchUseAt: touchedAt,
      effectiveAt: touchedAt,
    });
    database.close();
  });
});
