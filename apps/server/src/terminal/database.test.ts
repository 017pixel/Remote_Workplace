import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import { TerminalDatabase } from "./database.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function database() {
  const directory = await mkdtemp(join(tmpdir(), "workbench-terminal-db-"));
  directories.push(directory);
  return new TerminalDatabase(join(directory, "workbench.sqlite"));
}

describe("TerminalDatabase", () => {
  it("stores independent per-user workspaces with optimistic revisions", async () => {
    const db = await database();
    expect(db.getWorkspace("alice").revision).toBe(0);
    const document = { version: 1 as const, areas: {} };
    const saved = db.saveWorkspace("alice", document, 0);
    expect(saved.revision).toBe(1);
    expect(db.getWorkspace("alice")).toMatchObject({ revision: 1, document });
    expect(db.getWorkspace("bob").revision).toBe(0);
    expect(() => db.saveWorkspace("alice", document, 0)).toThrowError(AppError);
    expect(() => db.saveWorkspace("alice", document, 0)).toThrowError(/anderen Gerät/);
    db.close();
  });

  it("marks running records interrupted when a backend starts again", async () => {
    const db = await database();
    db.saveSession({
      id: "00000000-0000-4000-8000-000000000001",
      userId: "alice",
      runtimeId: "00000000-0000-4000-8000-000000000002",
      kind: "shell",
      mode: "agent",
      projectId: null,
      profilePath: null,
      supervisorName: null,
      cwd: "/tmp",
      pid: 123,
      cols: 80,
      rows: 24,
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exitCode: null,
      exitSignal: null,
    });
    db.markRunningSessionsInterrupted();
    expect(db.listSessions("alice", () => 0)[0]).toMatchObject({ status: "interrupted", pid: 123 });
    db.close();
  });
});
