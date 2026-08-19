import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureWraptLocalConfig,
  migrateLegacyPersistentData,
} from "./legacy-migration.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("sichere Wrapt-Legacy-Migration", () => {
  it("kopiert nur die alte Config, wenn das Wrapt-Ziel fehlt", () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-config-migration-"));
    directories.push(directory);
    const legacy = {
      branding: { appName: "Remote Workplace", shortName: "Workplace" },
      paths: {
        dataDir: "/home/tester/.local/share/remote-workplace",
        databasePath: "/home/tester/.local/share/remote-workplace/workbench.sqlite",
        workbenchProfilesRoot: "/home/tester/.workbench-profiles",
      },
      secret: "preserved",
    };
    writeFileSync(join(directory, "workbench.local.json"), JSON.stringify(legacy), { mode: 0o600 });

    const result = ensureWraptLocalConfig(directory, (value) => value);

    expect(result.migrated).toBe(true);
    expect(JSON.parse(readFileSync(join(directory, "wrapt.local.json"), "utf8"))).toMatchObject({
      branding: { appName: "Wrapt", shortName: "Wrapt" },
      secret: "preserved",
      paths: {
        dataDir: "/home/tester/.local/share/wrapt",
        databasePath: "/home/tester/.local/share/wrapt/wrapt.sqlite",
        wraptProfilesRoot: "/home/tester/.wrapt-profiles",
      },
    });
    expect(existsSync(join(directory, "workbench.local.json"))).toBe(true);
  });

  it("überschreibt bei zwei Configs nichts und meldet einen Konflikt", () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-config-conflict-"));
    directories.push(directory);
    writeFileSync(join(directory, "wrapt.local.json"), JSON.stringify({ value: "new" }), { mode: 0o600 });
    writeFileSync(join(directory, "workbench.local.json"), JSON.stringify({ value: "old" }), { mode: 0o600 });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = ensureWraptLocalConfig(directory, (value) => value);

    expect(result).toMatchObject({ migrated: false, conflict: true });
    expect(JSON.parse(readFileSync(join(directory, "wrapt.local.json"), "utf8"))).toEqual({ value: "new" });
    expect(warning).toHaveBeenCalledOnce();
  });

  it("verschiebt Daten samt SQLite-WAL/SHM und Profile idempotent ohne Ziele zu überschreiben", () => {
    const home = mkdtempSync(join(tmpdir(), "wrapt-data-migration-"));
    directories.push(home);
    const legacyData = join(home, ".local/share/remote-workplace");
    const targetData = join(home, ".local/share/wrapt");
    const legacyProfiles = join(home, ".workbench-profiles");
    const targetProfiles = join(home, ".wrapt-profiles");
    mkdirSync(legacyData, { recursive: true });
    mkdirSync(join(legacyProfiles, "codex"), { recursive: true });
    writeFileSync(join(legacyData, "workbench.sqlite"), "database");
    writeFileSync(join(legacyData, "workbench.sqlite-wal"), "wal");
    writeFileSync(join(legacyData, "workbench.sqlite-shm"), "shm");
    writeFileSync(join(legacyProfiles, "codex", "auth.json"), "credentials");

    migrateLegacyPersistentData(home, targetData, targetProfiles);
    migrateLegacyPersistentData(home, targetData, targetProfiles);

    expect(readFileSync(join(targetData, "wrapt.sqlite"), "utf8")).toBe("database");
    expect(readFileSync(join(targetData, "wrapt.sqlite-wal"), "utf8")).toBe("wal");
    expect(readFileSync(join(targetData, "wrapt.sqlite-shm"), "utf8")).toBe("shm");
    expect(readFileSync(join(targetProfiles, "codex", "auth.json"), "utf8")).toBe("credentials");
    expect(existsSync(join(home, ".local/share/remote-workplace"))).toBe(false);
  });
});
