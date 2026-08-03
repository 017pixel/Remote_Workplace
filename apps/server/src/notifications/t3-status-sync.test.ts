import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationDatabase } from "./database.js";
import { T3StatusSync } from "./t3-status-sync.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "remote-workplace-t3-sync-")); directories.push(directory);
  const t3Path = join(directory, "t3.sqlite"); const db = new DatabaseSync(t3Path);
  db.exec(`CREATE TABLE orchestration_events(sequence INTEGER PRIMARY KEY, aggregate_kind TEXT, stream_id TEXT);
    CREATE TABLE projection_threads(thread_id TEXT PRIMARY KEY,title TEXT,project_id TEXT,updated_at TEXT,deleted_at TEXT,pending_approval_count INTEGER,pending_user_input_count INTEGER,has_actionable_proposed_plan INTEGER,settled_at TEXT);
    CREATE TABLE projection_thread_sessions(thread_id TEXT PRIMARY KEY,status TEXT,last_error TEXT);
    CREATE TABLE projection_turns(row_id INTEGER PRIMARY KEY,thread_id TEXT,turn_id TEXT,state TEXT,started_at TEXT,completed_at TEXT);
    CREATE TABLE projection_thread_activities(thread_id TEXT,turn_id TEXT,kind TEXT,summary TEXT,created_at TEXT);`);
  const now = new Date(); const started = new Date(now.getTime() - 180_000).toISOString(); const completed = now.toISOString();
  db.prepare("INSERT INTO projection_threads VALUES(?,?,?,?,NULL,0,1,0,NULL)").run("thread-1", "Inbox bauen", "project-1", completed);
  db.prepare("INSERT INTO projection_thread_sessions VALUES(?,?,NULL)").run("thread-1", "running");
  db.prepare("INSERT INTO projection_turns VALUES(1,?,?,?,?,?)").run("thread-1", "turn-1", "running", started, null);
  db.prepare("INSERT INTO orchestration_events VALUES(1,'thread','thread-1')").run(); db.close();
  const environmentIdPath = join(directory, "environment-id"); writeFileSync(environmentIdPath, "environment-1\n");
  const notifications = new NotificationDatabase(join(directory, "notifications.sqlite"));
  const sync = new T3StatusSync({ databasePath: t3Path, environmentIdPath, notifications, pollSeconds: 5, completionMinimumSeconds: 120, miniTaskSeconds: 30, cursorPath: join(directory, "cursor.json") });
  return { dbPath: t3Path, notifications, sync, completed };
}

describe("T3-Status-Synchronisation", () => {
  it("erzeugt wartenden Input und löst ihn nach dem nächsten Event auf", () => {
    const { dbPath, notifications, sync } = fixture();
    sync.poll();
    expect(notifications.list().notifications[0]?.kind).toBe("agent.input-required");
    const db = new DatabaseSync(dbPath); db.prepare("UPDATE projection_threads SET pending_user_input_count=0 WHERE thread_id='thread-1'").run(); db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    sync.poll();
    expect(notifications.list().notifications).toEqual([]);
    notifications.close();
  });

  it("behält bei weiterer Thread-Aktivität dieselbe offene Remote-Meldung", () => {
    const { dbPath, notifications, sync } = fixture();
    sync.poll();
    const first = notifications.list().notifications[0]!;
    const db = new DatabaseSync(dbPath);
    const updated = new Date(Date.parse(first.createdAt) + 1_000).toISOString();
    db.prepare("UPDATE projection_threads SET title=?, updated_at=? WHERE thread_id='thread-1'").run("Inbox weiterbauen", updated);
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run();
    db.close();
    sync.poll();
    const current = notifications.list().notifications;
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe(first.id);
    expect(current[0]?.remoteId).toBe(first.remoteId);
    notifications.close();
  });

  it("verarbeitet Abschlüsse nur nach dem gespeicherten Event-Cursor", () => {
    const { dbPath, notifications, sync, completed } = fixture();
    sync.poll();
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE projection_threads SET pending_user_input_count=0, settled_at=?, updated_at=? WHERE thread_id='thread-1'").run(completed, completed);
    db.prepare("UPDATE projection_thread_sessions SET status='stopped' WHERE thread_id='thread-1'").run();
    db.prepare("UPDATE projection_turns SET state='completed',completed_at=? WHERE row_id=1").run(completed);
    db.prepare("INSERT INTO projection_thread_activities VALUES('thread-1','turn-1','tool.completed','Werkzeug ausgeführt',?)").run(completed);
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    sync.poll();
    expect(notifications.list().notifications.some((item) => item.kind === "agent.completed")).toBe(true);
    notifications.close();
  });
});
