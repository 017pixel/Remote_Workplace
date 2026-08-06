import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { readOpenCodeUsage } from "./opencode-usage.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function createFixtureDatabase(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "opencode-usage-test-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "opencode.db");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE session (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, slug TEXT NOT NULL, directory TEXT NOT NULL,
    title TEXT NOT NULL, version TEXT NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL,
    model TEXT, cost REAL DEFAULT 0 NOT NULL, tokens_input INTEGER DEFAULT 0 NOT NULL,
    tokens_output INTEGER DEFAULT 0 NOT NULL, tokens_reasoning INTEGER DEFAULT 0 NOT NULL,
    tokens_cache_read INTEGER DEFAULT 0 NOT NULL, tokens_cache_write INTEGER DEFAULT 0 NOT NULL
  )`);
  const now = Date.now();
  const insert = db.prepare(`INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated, model, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run("s1", "p1", "a", "/home/user/projects/alpha", "A", "1", now - 86_400_000, now - 86_400_000, JSON.stringify({ id: "deepseek-v4-flash", providerID: "opencode-go" }), 0.25, 1_000, 500, 200, 8_000, 100);
  insert.run("s2", "p1", "b", "/home/user/projects/alpha", "B", "1", now - 86_400_000, now - 86_400_000, JSON.stringify({ id: "deepseek-v4-flash", providerID: "opencode-go" }), 0.75, 2_000, 1_000, 0, 12_000, 0);
  insert.run("s3", "p2", "c", "/home/user/projects/beta", "C", "1", now, now, JSON.stringify({ id: "claude-sonnet-5", providerID: "anthropic" }), 1.5, 3_000, 1_500, 0, 20_000, 0);
  insert.run("s4", "p3", "d", "/home/user/projects/gamma", "D", "1", now - 400 * 86_400_000, now - 400 * 86_400_000, JSON.stringify({ id: "altes-modell" }), 9, 99_000, 0, 0, 0, 0);
  insert.run("s5", "p4", "e", "/home/user/projects/delta", "E", "1", now, now, null, 0, 0, 0, 0, 0, 0);
  db.close();
  return path;
}

describe("readOpenCodeUsage", () => {
  it("aggregates models, daily points and projects from the local session database", async () => {
    const payload = readOpenCodeUsage(await createFixtureDatabase());
    expect(payload).not.toBeNull();
    expect(payload?.provider).toBe("opencode");
    const byModel = new Map(payload?.daily.flatMap((day) => day.modelBreakdowns).map((item) => [item.modelName, item]) ?? []);
    expect(byModel.get("deepseek-v4-flash")).toMatchObject({ totalTokens: 24_800, cost: 1.0 });
    expect(byModel.get("claude-sonnet-5")).toMatchObject({ totalTokens: 24_500, cost: 1.5 });
    expect(byModel.get("altes-modell")).toMatchObject({ totalTokens: 99_000, cost: 9 });
    expect(payload?.projects).toContainEqual(expect.objectContaining({ projectPath: "/home/user/projects/alpha", totalTokens: 24_800, name: "alpha" }));
    expect(payload?.projects).toContainEqual(expect.objectContaining({ projectPath: "/home/user/projects/gamma", totalTokens: 99_000, name: "gamma" }));
    expect(payload?.projects).toContainEqual(expect.objectContaining({ projectPath: "/home/user/projects/beta", totalTokens: 24_500 }));
  });

  it("returns null when the database is missing or not readable", () => {
    expect(readOpenCodeUsage(join(tmpdir(), "definitiv-nicht-vorhanden", "opencode.db"))).toBeNull();
  });
});
