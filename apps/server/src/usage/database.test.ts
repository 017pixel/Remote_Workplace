import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AccountService } from "./account-service.js";
import { UsageDatabase } from "./database.js";

const databases: UsageDatabase[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

describe("usage history", () => {
  it("imports cost history idempotently and aggregates models", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const payload = [{ provider:"codex", source:"local", updatedAt:"2026-07-15T10:00:00Z", projects:[], daily:[{date:"2026-07-15",inputTokens:90,outputTokens:10,cacheReadTokens:50,cacheCreationTokens:0,totalTokens:100,totalCost:0.25,modelBreakdowns:[{modelName:"gpt-test",totalTokens:100,cost:0.25}]}] }];
    database.importCost(payload); database.importCost(payload);
    const dashboard = database.dashboard("30d");
    expect(dashboard.totals.totalTokens).toBe(100);
    expect(dashboard.models).toMatchObject([{ label:"gpt-test", totalTokens:100 }]);
  });

  it("forecasts a limit only after three snapshots", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const reset = "2099-07-16T10:00:00Z";
    for (const [time,usedPercent] of [["2026-07-15T08:00:00Z",10],["2026-07-15T09:00:00Z",20],["2026-07-15T10:00:00Z",30]] as const) {
      database.importUsage("codex", [{provider:"codex",account:"test@example.com",usage:{accountEmail:"test@example.com",primary:{usedPercent,windowMinutes:300,resetsAt:reset}}}], time);
    }
    expect(database.forecasts()).toEqual([
      expect.objectContaining({ providerId: "codex", accountLabel: "test@example.com", windowLabel: "5-Stunden-Limit", sampleCount: 3 }),
    ]);
  });

  it("keeps only the newest reset series for each account window", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    for (const [reset, base] of [["2099-07-16T10:00:00Z", 10], ["2099-07-17T10:00:00Z", 40]] as const) {
      for (let index = 0; index < 3; index += 1) {
        database.importUsage("opencode", [{provider:"opencodego",usage:{primary:{usedPercent:base+index,windowMinutes:300,resetsAt:reset}}}], `2026-07-15T0${index + (base === 10 ? 1 : 5)}:00:00Z`);
      }
    }
    const forecasts = database.forecasts();
    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]).toMatchObject({ providerId: "opencode", resetsAt: "2099-07-17T10:00:00Z", sampleCount: 3 });
  });
});

describe("account registry", () => {
  it("deregisters an account without deleting its local profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-account-")); const profile = join(root,"codex-profile"); const config = join(root,"codexbar","config.json");
    await mkdir(profile); await writeFile(join(profile,"auth.json"),"credential-placeholder");
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const service = new AccountService({database,allowedRoots:[root],profilesRoot:join(root,"profiles"),codexbarConfigPath:config});
    const account = await service.create({provider:"codex",label:"Test",profilePath:profile,source:"local"});
    await expect(service.discover()).resolves.toContainEqual(expect.objectContaining({
      accountId: account.id,
      label: "Test",
      profilePath: profile,
      registered: true,
      authenticated: true,
      enabled: true,
      source: "local",
    }));
    expect(service.loginCommand(account)).toBe("codex login --device-auth");
    await service.remove(account.id);
    expect(await readFile(join(profile,"auth.json"),"utf8")).toBe("credential-placeholder");
    expect(service.list()).toHaveLength(0);
  });

  it("migrates the account registry and accepts Claude Code profiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-claude-account-"));
    const path = join(root, "usage.sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE accounts (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('codex','opencode')),
      label TEXT NOT NULL, email TEXT, profile_path TEXT NOT NULL, source TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(provider, profile_path)
    )`);
    legacy.close();
    const database = new UsageDatabase(path); databases.push(database);

    expect(database.createAccount({ provider: "claude", label: "Claude Pro", profilePath: join(root, ".claude"), source: "local" }))
      .toMatchObject({ provider: "claude", label: "Claude Pro", enabled: true });
  });

  it("discovers the authenticated local Claude Code profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-claude-discovery-"));
    const profile = join(root, ".claude");
    const claude = join(root, "claude");
    await mkdir(profile);
    await writeFile(claude, `#!/bin/sh\nprintf '%s' '{"loggedIn":true,"email":"claude@example.com"}'\n`);
    await chmod(claude, 0o700);
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const service = new AccountService({ database, allowedRoots: [root], profilesRoot: join(root, "profiles"), codexbarConfigPath: join(root, "codexbar.json"), claudeCliPath: claude, homeDirectory: root });

    await expect(service.discover()).resolves.toContainEqual(expect.objectContaining({
      provider: "claude",
      profilePath: profile,
      label: "claude@example.com",
      authenticated: true,
      registered: false,
    }));
  });
});
