import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  terminalWorkspaceSchema,
  type TerminalKind,
  type TerminalSessionStatus,
  type TerminalWorkspace,
} from "@workbench/contracts";
import { AppError } from "../utils/errors.js";

export interface StoredTerminalSession {
  id: string;
  userId: string;
  runtimeId: string;
  kind: TerminalKind;
  mode: "agent" | "login";
  projectId: string | null;
  profilePath: string | null;
  supervisorName: string | null;
  cwd: string;
  pid: number;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  exitSignal: number | null;
}

interface SessionRow {
  id: string;
  userId: string;
  runtimeId: string;
  kind: TerminalKind;
  mode: "agent" | "login";
  projectId: string | null;
  profilePath: string | null;
  supervisorName: string | null;
  cwd: string;
  pid: number;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  exitSignal: number | null;
}

interface WorkspaceRow { documentJson: string; revision: number; updatedAt: string; }

const DEFAULT_WORKSPACE: TerminalWorkspace = { version: 1, areas: {} };

function rowToSession(row: SessionRow): StoredTerminalSession { return { ...row }; }

export class TerminalDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS terminal_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS terminal_sessions (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        runtime_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        mode TEXT NOT NULL,
        project_id TEXT,
        profile_path TEXT,
        supervisor_name TEXT,
        cwd TEXT NOT NULL,
        pid INTEGER NOT NULL,
        cols INTEGER NOT NULL,
        rows INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        exit_code INTEGER,
        exit_signal INTEGER,
        UNIQUE(owner_id, runtime_id)
      );
      CREATE INDEX IF NOT EXISTS terminal_sessions_owner_updated
        ON terminal_sessions(owner_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS terminal_workspaces (
        owner_id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO terminal_schema_migrations(version, applied_at)
        VALUES (1, datetime('now'));
    `);
    const columns = this.db.prepare("PRAGMA table_info(terminal_sessions)").all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "supervisor_name")) {
      this.db.exec("ALTER TABLE terminal_sessions ADD COLUMN supervisor_name TEXT");
    }
  }

  close() { this.db.close(); }

  markRunningSessionsInterrupted() {
    this.db.prepare(`UPDATE terminal_sessions SET status = 'interrupted', updated_at = ? WHERE status IN ('starting', 'running')`).run(Date.now());
  }

  reconcileSupervisorSessions(activeNames: ReadonlySet<string>) {
    const rows = this.db.prepare("SELECT id, supervisor_name supervisorName FROM terminal_sessions WHERE status IN ('starting', 'running')").all() as unknown as Array<{ id: string; supervisorName: string | null }>;
    const update = this.db.prepare("UPDATE terminal_sessions SET status = 'interrupted', updated_at = ? WHERE id = ?");
    for (const row of rows) {
      if (!row.supervisorName || !activeNames.has(row.supervisorName)) update.run(Date.now(), row.id);
    }
  }

  findSession(userId: string, runtimeId: string): StoredTerminalSession | undefined {
    const row = this.db.prepare(`SELECT id, owner_id userId, runtime_id runtimeId, kind, mode,
      project_id projectId, profile_path profilePath, supervisor_name supervisorName, cwd, pid, cols, rows, status,
      created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal
      FROM terminal_sessions WHERE owner_id = ? AND runtime_id = ?`).get(userId, runtimeId) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  findSessionById(userId: string, sessionId: string): StoredTerminalSession | undefined {
    const row = this.db.prepare(`SELECT id, owner_id userId, runtime_id runtimeId, kind, mode,
      project_id projectId, profile_path profilePath, supervisor_name supervisorName, cwd, pid, cols, rows, status,
      created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal
      FROM terminal_sessions WHERE owner_id = ? AND id = ?`).get(userId, sessionId) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  findSessionBySupervisor(supervisorName: string): StoredTerminalSession | undefined {
    const row = this.db.prepare(`SELECT id, owner_id userId, runtime_id runtimeId, kind, mode,
      project_id projectId, profile_path profilePath, supervisor_name supervisorName, cwd, pid, cols, rows, status,
      created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal
      FROM terminal_sessions WHERE supervisor_name = ?`).get(supervisorName) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  listSessions(userId: string, connectedClients: (sessionId: string) => number) {
    const rows = this.db.prepare(`SELECT id, owner_id userId, runtime_id runtimeId, kind, mode,
      project_id projectId, profile_path profilePath, supervisor_name supervisorName, cwd, pid, cols, rows, status,
      created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal
      FROM terminal_sessions WHERE owner_id = ? AND status <> 'closed' ORDER BY updated_at DESC`).all(userId) as unknown as SessionRow[];
    return rows.map((row) => ({ ...rowToSession(row), connectedClients: connectedClients(row.id) }));
  }

  saveSession(session: StoredTerminalSession) {
    this.db.prepare(`INSERT INTO terminal_sessions(
      id, owner_id, runtime_id, kind, mode, project_id, profile_path, supervisor_name, cwd, pid, cols, rows,
      status, created_at, updated_at, exit_code, exit_signal
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      runtime_id=excluded.runtime_id, kind=excluded.kind, mode=excluded.mode,
      project_id=excluded.project_id, profile_path=excluded.profile_path, supervisor_name=excluded.supervisor_name, cwd=excluded.cwd,
      pid=excluded.pid, cols=excluded.cols, rows=excluded.rows, status=excluded.status,
      created_at=excluded.created_at, updated_at=excluded.updated_at,
      exit_code=excluded.exit_code, exit_signal=excluded.exit_signal`).run(
      session.id, session.userId, session.runtimeId, session.kind, session.mode, session.projectId,
      session.profilePath, session.supervisorName, session.cwd, session.pid, session.cols, session.rows, session.status,
      session.createdAt, session.updatedAt, session.exitCode, session.exitSignal,
    );
  }

  updateSession(session: StoredTerminalSession) { this.saveSession(session); }

  deleteSession(userId: string, sessionId: string) {
    this.db.prepare("DELETE FROM terminal_sessions WHERE owner_id = ? AND id = ?").run(userId, sessionId);
  }

  getWorkspace(userId: string) {
    const row = this.db.prepare("SELECT document_json documentJson, revision, updated_at updatedAt FROM terminal_workspaces WHERE owner_id = ?").get(userId) as WorkspaceRow | undefined;
    if (!row) return { document: DEFAULT_WORKSPACE, revision: 0, updatedAt: new Date(0).toISOString() };
    return { document: terminalWorkspaceSchema.parse(JSON.parse(row.documentJson) as unknown), revision: row.revision, updatedAt: row.updatedAt };
  }

  saveWorkspace(userId: string, document: TerminalWorkspace, expectedRevision: number | null) {
    const parsed = terminalWorkspaceSchema.parse(document);
    let revision: number;
    let updatedAt: string;
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Revision und Dokument müssen unter derselben Schreibsperre gelesen
      // und geschrieben werden. Sonst können zwei Tabs denselben Stand lesen
      // und der spätere Save überschreibt die Änderung des ersten Tabs.
      const current = this.getWorkspace(userId);
      if (expectedRevision !== null && expectedRevision !== current.revision) {
        throw new AppError(409, "TERMINAL_WORKSPACE_CONFLICT", "Das Terminal-Layout wurde auf einem anderen Gerät geändert.");
      }
      revision = current.revision + 1;
      updatedAt = new Date().toISOString();
      this.db.prepare(`INSERT INTO terminal_workspaces(owner_id, document_json, revision, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET document_json=excluded.document_json,
        revision=excluded.revision, updated_at=excluded.updated_at`).run(userId, JSON.stringify(parsed), revision, updatedAt);
      this.db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    return { document: parsed, revision, updatedAt };
  }
}
