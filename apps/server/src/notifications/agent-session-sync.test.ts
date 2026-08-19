import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { NotificationDatabase } from "./database.js";
import { AgentSessionSync } from "./agent-session-sync.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-agent-sync-"));
  directories.push(directory);
  const opencodePath = join(directory, "opencode.sqlite");
  const db = new DatabaseSync(opencodePath);
  db.exec(`CREATE TABLE event(aggregate_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE session(id TEXT PRIMARY KEY, directory TEXT NOT NULL, title TEXT NOT NULL, time_created INTEGER NOT NULL);
    CREATE TABLE part(message_id TEXT NOT NULL, data TEXT NOT NULL);`);
  db.close();
  const t3Path = join(directory, "t3.sqlite");
  const t3 = new DatabaseSync(t3Path);
  t3.exec(`CREATE TABLE projection_projects(project_id TEXT PRIMARY KEY, workspace_root TEXT);
    CREATE TABLE projection_threads(thread_id TEXT PRIMARY KEY, title TEXT NOT NULL, project_id TEXT);`);
  t3.prepare("INSERT INTO projection_projects VALUES(?,?)").run("project", "/workspace");
  t3.prepare("INSERT INTO projection_threads VALUES(?,?,?)").run("thread", "Planung Skill-Editor-Tool für Coding-Agents", "project");
  t3.close();
  const codexPath = join(directory, "codex");
  const cursorPath = join(directory, "cursor.json");
  const notifications = new NotificationDatabase(join(directory, "notifications.sqlite"));
  const sync = new AgentSessionSync({ opencodeDatabasePath: opencodePath, t3DatabasePath: t3Path, codexSessionsPath: codexPath, cursorPath, notifications, pollSeconds: 5, completionMinimumSeconds: 30 });
  return { directory, opencodePath, cursorPath, notifications, sync };
}

function appendAssistantCompletion(path: string, sessionId: string, messageId: string, completed = 45_000): void {
  const db = new DatabaseSync(path);
  db.prepare("INSERT INTO event(aggregate_id,type,data) VALUES(?,?,?)").run(sessionId, "message.updated.1", JSON.stringify({ info: { id: messageId, role: "assistant", time: { created: 0, completed } } }));
  db.prepare("INSERT INTO part(message_id,data) VALUES(?,?)").run(messageId, JSON.stringify({ type: "tool" }));
  db.close();
}

describe("Agent-Session-Synchronisation", () => {
  it("ignoriert T3-interne OpenCode-Abschlüsse, meldet normale OpenCode-Läufe aber nach Abschluss", () => {
    const { opencodePath, notifications, sync } = fixture();
    const db = new DatabaseSync(opencodePath);
    db.prepare("INSERT INTO session VALUES(?,?,?,?)").run("t3-prefix-session", "/workspace", " t3 code generateThreadTitle ", 0);
    db.prepare("INSERT INTO session VALUES(?,?,?,?)").run("t3-task-session", "/workspace", "Planung Skill-Editor-Tool für Coding-Agents", 0);
    db.prepare("INSERT INTO session VALUES(?,?,?,?)").run("normal-session", "/workspace", "Feature umsetzen", 0);
    db.close();

    sync.start();
    appendAssistantCompletion(opencodePath, "t3-prefix-session", "t3-prefix-message");
    appendAssistantCompletion(opencodePath, "t3-task-session", "t3-task-message");
    appendAssistantCompletion(opencodePath, "normal-session", "normal-message");
    (sync as unknown as { poll(emit: boolean): void }).poll(true);

    expect(notifications.list().notifications).toHaveLength(1);
    expect(notifications.list().notifications[0]).toMatchObject({ source: "opencode", kind: "agent.completed", remoteId: "opencode:normal-message" });
    sync.stop();
    notifications.close();
  });

  it("setzt beim ersten Lauf nur den Cursor und erzeugt keine Toast-Kandidaten für den Bestand", () => {
    const { opencodePath, cursorPath, notifications, sync } = fixture();
    const db = new DatabaseSync(opencodePath);
    db.prepare("INSERT INTO session VALUES(?,?,?,?)").run("normal-session", "/workspace", "Alte Aufgabe", 0);
    db.close();
    appendAssistantCompletion(opencodePath, "normal-session", "old-message");

    sync.start();
    expect(notifications.list().notifications).toEqual([]);
    expect(JSON.parse(readFileSync(cursorPath, "utf8"))).toMatchObject({ opencodeRowId: 1 });
    sync.stop();
    notifications.close();
  });
});
