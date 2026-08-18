import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationDatabase } from "./database.js";
import { REMOTE_READER_SCRIPT, T3StatusSync, type ThreadRow } from "./t3-status-sync.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "remote-workplace-t3-sync-")); directories.push(directory);
  const t3Path = join(directory, "t3.sqlite"); const db = new DatabaseSync(t3Path);
  db.exec(`CREATE TABLE orchestration_events(sequence INTEGER PRIMARY KEY, aggregate_kind TEXT, stream_id TEXT);
    CREATE TABLE projection_projects(project_id TEXT PRIMARY KEY,title TEXT,workspace_root TEXT,scripts_json TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,default_model_selection_json TEXT);
    CREATE TABLE projection_threads(thread_id TEXT PRIMARY KEY,title TEXT,project_id TEXT,updated_at TEXT,deleted_at TEXT,pending_approval_count INTEGER,pending_user_input_count INTEGER,has_actionable_proposed_plan INTEGER,settled_at TEXT);
    CREATE TABLE projection_thread_sessions(thread_id TEXT PRIMARY KEY,status TEXT,last_error TEXT);
    CREATE TABLE projection_turns(row_id INTEGER PRIMARY KEY,thread_id TEXT,turn_id TEXT,state TEXT,started_at TEXT,completed_at TEXT);
    CREATE TABLE projection_thread_activities(thread_id TEXT,turn_id TEXT,kind TEXT,summary TEXT,created_at TEXT);`);
  db.prepare("INSERT INTO projection_projects VALUES(?,?,?,?,?,?,NULL,NULL)").run("project-1", "Workbench", "/srv/projects/workbench", "{}", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
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
  it("erzeugt wartenden Input und löst ihn nach dem nächsten Event auf", async () => {
    const { dbPath, notifications, sync } = fixture();
    await sync.poll();
    const first = notifications.list().notifications[0]!;
    expect(first.kind).toBe("agent.input-required");
    // Tiefenlink in die SPA statt in den T3-Proxy; Body nennt Projekt und Thread.
    expect(first.link).toBe("/workbench/t3-code?thread=thread-1&env=environment-1");
    expect(first.body).toBe("Workbench · Inbox bauen");
    const db = new DatabaseSync(dbPath); db.prepare("UPDATE projection_threads SET pending_user_input_count=0 WHERE thread_id='thread-1'").run(); db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    await sync.poll();
    expect(notifications.list().notifications).toEqual([]);
    notifications.close();
  });

  it("meldet Pläne als Info statt Warning", async () => {
    const { dbPath, notifications, sync } = fixture();
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE projection_threads SET pending_user_input_count=0, has_actionable_proposed_plan=1 WHERE thread_id='thread-1'").run();
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    await sync.poll();
    const plan = notifications.list().notifications.find((item) => item.kind === "agent.plan-ready");
    expect(plan?.severity).toBe("info");
    notifications.close();
  });

  it("behält bei weiterer Thread-Aktivität dieselbe offene Remote-Meldung", async () => {
    const { dbPath, notifications, sync } = fixture();
    await sync.poll();
    const first = notifications.list().notifications[0]!;
    const db = new DatabaseSync(dbPath);
    const updated = new Date(Date.parse(first.createdAt) + 1_000).toISOString();
    db.prepare("UPDATE projection_threads SET title=?, updated_at=? WHERE thread_id='thread-1'").run("Inbox weiterbauen", updated);
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run();
    db.close();
    await sync.poll();
    const current = notifications.list().notifications;
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe(first.id);
    expect(current[0]?.remoteId).toBe(first.remoteId);
    notifications.close();
  });

  it("verarbeitet Abschlüsse nur nach dem gespeicherten Event-Cursor", async () => {
    const { dbPath, notifications, sync, completed } = fixture();
    await sync.poll();
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE projection_threads SET pending_user_input_count=0, settled_at=?, updated_at=? WHERE thread_id='thread-1'").run(completed, completed);
    db.prepare("UPDATE projection_thread_sessions SET status='stopped' WHERE thread_id='thread-1'").run();
    db.prepare("UPDATE projection_turns SET state='completed',completed_at=? WHERE row_id=1").run(completed);
    db.prepare("INSERT INTO projection_thread_activities VALUES('thread-1','turn-1','tool.completed','Werkzeug ausgeführt',?)").run(completed);
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    await sync.poll();
    expect(notifications.list().notifications.some((item) => item.kind === "agent.completed")).toBe(true);
    notifications.close();
  });

  it("liest entfernte T3-Instanzen über das Python-Skript und meldet deren Threads", async () => {
    const { dbPath, notifications } = fixture();
    const environmentIdPath = join(dirname(dbPath), "environment-id");
    // Das Skript direkt ausführen, wie es ssh über `echo | base64 -d |
    // python3 -` tut. Der SSH-Aufruf selbst ist nur execFile und wird hier
    // nicht geprüft.
    const stdout = execFileSync("python3", ["-c", REMOTE_READER_SCRIPT, dbPath, environmentIdPath, "0", "0"], { encoding: "utf8" });
    const snapshot = JSON.parse(stdout) as { environmentId: string; rows: Array<{ threadId: string; title: string }> };
    expect(snapshot.environmentId).toBe("environment-1");
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]?.threadId).toBe("thread-1");
    expect(snapshot.rows[0]?.title).toBe("Inbox bauen");
    // Die Remote-Verarbeitung mit der gelieferten Umgebung: gleicher
    // Deep-Link wie lokal, aber mit der entfernten environmentId.
    const syncWithRemote = new T3StatusSync({ databasePath: dbPath, environmentIdPath, notifications, pollSeconds: 5, completionMinimumSeconds: 120, miniTaskSeconds: 30, cursorPath: join(dirname(dbPath), "cursor.json") });
    const rows = snapshot.rows;
    const first = notifications.list().notifications[0];
    expect(first).toBeUndefined();
    // process läuft über poll(); da die Quelle lokal dieselbe DB ist, entsteht
    // hier keine zweite Meldung (Dedupe über remoteId).
    syncWithRemote["process"](rows[0] as ThreadRow, "environment-2", () => [], false);
    const created = notifications.list().notifications[0]!;
    expect(created.kind).toBe("agent.input-required");
    expect(created.link).toBe("/workbench/t3-code?thread=thread-1&env=environment-2");
    notifications.close();
  });
});
