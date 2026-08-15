import { chmod, mkdtemp, mkdir, readFile, readlink, symlink, unlink, writeFile } from "node:fs/promises";
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
    const today = new Date().toISOString().slice(0, 10);
    const payload = [{ provider:"codex", source:"local", updatedAt:`${today}T10:00:00Z`, projects:[], daily:[{date:today,inputTokens:90,outputTokens:10,cacheReadTokens:50,cacheCreationTokens:0,totalTokens:100,totalCost:0.25,modelBreakdowns:[{modelName:"gpt-test",totalTokens:100,cost:0.25}]}] }];
    database.importCost(payload); database.importCost(payload);
    const dashboard = database.dashboard("30d");
    expect(dashboard.totals.totalTokens).toBe(100);
    expect(dashboard.models).toMatchObject([{ label:"gpt-test", totalTokens:100 }]);
  });

  it("führt Kosten kumulativ fort, ohne ältere Tage, Modelle oder Projekte zu löschen", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    database.importCost([{
      provider: "codex",
      source: "local",
      updatedAt: "2026-07-15T10:00:00Z",
      projects: [{ name: "Alt", totalTokens: 20, totalCost: 0.2 }],
      daily: [
        { date: "2026-07-14", inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 10, totalCost: 0.1, modelBreakdowns: [] },
        { date: "2026-07-15", inputTokens: 20, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 20, totalCost: 0.2, modelBreakdowns: [] },
      ],
    }], "both");
    database.importCost([{
      provider: "codex",
      source: "local",
      updatedAt: "2026-07-16T10:00:00Z",
      projects: [],
      daily: [{ date: "2026-07-16", inputTokens: 30, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 30, totalCost: 0.3, modelBreakdowns: [] }],
    }], "daily");
    const dashboard = database.dashboard("all");
    expect(dashboard.daily).toHaveLength(3);
    expect(dashboard.daily.at(-1)).toMatchObject({ date: "2026-07-16", totalTokens: 30 });
    expect(dashboard.projects).toContainEqual(expect.objectContaining({ label: "Alt" }));
  });

  it("zeigt bei „Gesamt“ auch Tage außerhalb der letzten 365 Tage", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const oldDate = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    database.importCost([{
      provider: "codex",
      source: "local",
      updatedAt: "2026-07-15T10:00:00Z",
      projects: [],
      daily: [{ date: oldDate, inputTokens: 50, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 50, totalCost: 0.5, modelBreakdowns: [{ modelName: "altes-modell", totalTokens: 50, cost: 0.5 }] }],
    }], "daily");
    const year = database.dashboard("365d");
    expect(year.daily).toHaveLength(0);
    expect(year.models).toHaveLength(0);
    const all = database.dashboard("all");
    expect(all.daily).toHaveLength(1);
    expect(all.models).toEqual([expect.objectContaining({ label: "altes-modell", totalTokens: 50 })]);
    expect(all.projectRange).toBe("all");
  });

  it("aggregates mehrere Provider je Tag statt doppelte Tagespunkte zu liefern", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const today = new Date().toISOString().slice(0, 10);
    database.importCost([
      { provider: "codex", source: "local", updatedAt: "2026-07-16T10:00:00Z", projects: [], daily: [{ date: today, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 100, totalCost: 0.5, modelBreakdowns: [] }] },
      { provider: "claude", source: "local", updatedAt: "2026-07-16T11:00:00Z", projects: [], daily: [{ date: today, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 200, totalCost: 1.0, modelBreakdowns: [] }] },
    ]);
    const dashboard = database.dashboard("7d");
    expect(dashboard.daily).toHaveLength(1);
    expect(dashboard.daily[0]).toMatchObject({ totalTokens: 300, totalCost: 1.5 });
    expect(dashboard.totals.todayTokens).toBe(300);
    expect(dashboard.totals.totalTokens).toBe(300);
  });

  it("fasst dasselbe Projekt über mehrere Provider zu einer Zeile zusammen", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    database.importCost([
      { provider: "codex", source: "local", updatedAt: "2026-07-16T10:00:00Z", projects: [{ projectPath: "/pfad/Remote_Workplace", name: "Remote_Workplace", totalTokens: 1_000, totalCost: 5.0 }], daily: [] },
      { provider: "opencode", source: "local", updatedAt: "2026-07-16T10:00:00Z", projects: [{ projectPath: "/pfad/Remote_Workplace", name: "Remote_Workplace", totalTokens: 400, totalCost: 1.0 }], daily: [] },
      { provider: "opencode", source: "local", updatedAt: "2026-07-16T10:00:00Z", projects: [{ projectPath: "/pfad/AnderesProjekt", name: "AnderesProjekt", totalTokens: 50, totalCost: 0.1 }], daily: [] },
    ]);
    const dashboard = database.dashboard("365d");
    const remote = dashboard.projects.find((item) => item.label === "Remote_Workplace");
    expect(remote).toMatchObject({ totalTokens: 1_400, totalCost: 6.0, quality: "exact" });
    expect(dashboard.projects).toHaveLength(2);
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

  it("mirrors the current reset credits instead of keeping consumed credits", () => {
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const accountEmail = "test@example.com";
    database.importUsage("codex", [
      {
        provider: "codex",
        usage: {
          accountEmail,
          secondary: { usedPercent: 10, windowMinutes: 10_080 },
          codexResetCredits: {
            availableCount: 2,
            credits: [
              { id: "old", title: "Full reset", description: "", status: "available" },
              { id: "current", title: "Full reset", description: "", status: "available" },
            ],
          },
        },
      },
      {
        provider: "codex",
        usage: {
          accountEmail: "removed@example.com",
          secondary: { usedPercent: 5, windowMinutes: 10_080 },
          codexResetCredits: {
            availableCount: 1,
            credits: [{ id: "removed", title: "Full reset", description: "", status: "available" }],
          },
        },
      },
    ], "2026-07-15T08:00:00Z");
    database.importUsage("codex", [{
      provider: "codex",
      usage: {
        accountEmail,
        secondary: { usedPercent: 20, windowMinutes: 10_080 },
        codexResetCredits: {
          availableCount: 1,
          credits: [{ id: "current", title: "Full reset", description: "", status: "available" }],
        },
      },
    }], "2026-07-15T09:00:00Z");

    expect(database.resetCredits()).toEqual({
      [accountEmail]: [expect.objectContaining({ id: "current" })],
    });
  });
});

describe("account registry", () => {
  it("deregisters an account without deleting its local profile", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-account-")); const profile = join(root,"codex-profile"); const config = join(root,"codexbar","config.json");
    await mkdir(profile); await writeFile(join(profile,"auth.json"),"credential-placeholder");
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const service = new AccountService({database,allowedRoots:[root],profilesRoot:join(root,"profiles"),codexbarConfigPath:config,sharedHomes:{codex:{sharedHome:join(root,".codex"),authFileName:"auth.json"},claude:{sharedHome:join(root,".claude"),authFileName:".credentials.json"},opencode:{sharedHome:join(root,"share/opencode"),authFileName:"auth.json"}}});
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
    const service = new AccountService({ database, allowedRoots: [root], profilesRoot: join(root, "profiles"), codexbarConfigPath: join(root, "codexbar.json"), claudeCliPath: claude, homeDirectory: root, sharedHomes:{codex:{sharedHome:join(root,".codex"),authFileName:"auth.json"},claude:{sharedHome:join(root,".claude"),authFileName:".credentials.json"},opencode:{sharedHome:join(root,"share/opencode"),authFileName:"auth.json"}} });

    await expect(service.discover()).resolves.toContainEqual(expect.objectContaining({
      provider: "claude",
      profilePath: profile,
      label: "claude@example.com",
      authenticated: true,
      registered: false,
    }));
  });

  it("serializes concurrent account activation and reconciles a filesystem-switched journal", async () => {
    const root = await mkdtemp(join(tmpdir(), "workbench-account-concurrency-"));
    const sharedHome = join(root, ".codex");
    const firstProfile = join(root, "first");
    const secondProfile = join(root, "second");
    await Promise.all([mkdir(sharedHome), mkdir(firstProfile), mkdir(secondProfile)]);
    await Promise.all([
      writeFile(join(firstProfile, "auth.json"), "{}"),
      writeFile(join(secondProfile, "auth.json"), "{}"),
    ]);
    const database = new UsageDatabase(":memory:"); databases.push(database);
    const service = new AccountService({
      database,
      allowedRoots: [root],
      profilesRoot: join(root, "profiles"),
      codexbarConfigPath: join(root, "codexbar.json"),
      sharedHomes: {
        codex: { sharedHome, authFileName: "auth.json" },
        claude: { sharedHome: join(root, ".claude"), authFileName: ".credentials.json" },
        opencode: { sharedHome: join(root, "opencode"), authFileName: "auth.json" },
      },
    });
    const first = await service.create({ provider: "codex", label: "Erster", profilePath: firstProfile, source: "local" });
    const second = await service.create({ provider: "codex", label: "Zweiter", profilePath: secondProfile, source: "local" });
    await Promise.all([service.activate(first.id), service.activate(second.id)]);
    expect(await readlink(join(sharedHome, "auth.json"))).toBe(join(secondProfile, "auth.json"));
    expect(database.listActiveAccounts()).toMatchObject({ codex: second.id });

    await unlink(join(sharedHome, "auth.json"));
    await symlink(join(firstProfile, "auth.json"), join(sharedHome, "auth.json"));
    database.setActivationJournal("codex", first.id, "filesystem-switched");
    await service.listWithState();
    expect(database.listActiveAccounts()).toMatchObject({ codex: first.id });
    expect(database.listActivationJournal()).toEqual([]);
  });
});
