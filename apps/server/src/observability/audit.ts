import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface OperationalAuditEvent {
  requestId: string;
  actor: string;
  action: string;
  target: string;
  statusCode: number;
  at?: string;
}

/**
 * Append-only Auditspur für kritische Workbench-Mutationen. Die Hashkette
 * macht nachträgliche Änderungen sichtbar; Request-Bodies und Secrets werden
 * bewusst nie übernommen.
 */
export class OperationalAuditDatabase {
  private readonly database: DatabaseSync;
  private verifiedAt = 0;
  private verifiedValue: { valid: boolean; entries: number; latestAt: string | null } | null = null;

  constructor(path: string, private readonly verifyCacheMilliseconds = 5_000) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.database.exec(`CREATE TABLE IF NOT EXISTS operational_audit (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      at TEXT NOT NULL,
      request_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      previous_hash TEXT,
      entry_hash TEXT NOT NULL UNIQUE
    ) STRICT;
    CREATE INDEX IF NOT EXISTS operational_audit_at ON operational_audit(at);
    CREATE INDEX IF NOT EXISTS operational_audit_request ON operational_audit(request_id);`);
  }

  record(event: OperationalAuditEvent) {
    const at = event.at ?? new Date().toISOString();
    const id = randomUUID();
    const actorHash = createHash("sha256").update(`workbench-audit-actor:${event.actor}`).digest("hex");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.database.prepare("SELECT entry_hash entryHash FROM operational_audit ORDER BY sequence DESC LIMIT 1")
        .get() as { entryHash: string } | undefined;
      const canonical = JSON.stringify({
        id,
        at,
        requestId: event.requestId,
        actor: actorHash,
        action: event.action,
        target: event.target,
        statusCode: event.statusCode,
        previousHash: previous?.entryHash ?? null,
      });
      const entryHash = createHash("sha256").update(canonical).digest("hex");
      this.database.prepare(`INSERT INTO operational_audit(
        id,at,request_id,actor,action,target,status_code,previous_hash,entry_hash
      ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
        id,
        at,
        event.requestId,
        actorHash,
        event.action,
        event.target,
        event.statusCode,
        previous?.entryHash ?? null,
        entryHash,
      );
      // Lokale Einzelbenutzer-Installation: 10.000 kritische Mutationen sind
      // ausreichend Historie, ohne die gemeinsame SQLite unbegrenzt wachsen zu lassen.
      this.database.exec(`DELETE FROM operational_audit WHERE sequence NOT IN (
        SELECT sequence FROM operational_audit ORDER BY sequence DESC LIMIT 10000
      )`);
      this.database.exec("COMMIT");
      this.verifiedValue = null;
      this.verifiedAt = 0;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  verify(): { valid: boolean; entries: number; latestAt: string | null } {
    if (this.verifiedValue && Date.now() - this.verifiedAt < this.verifyCacheMilliseconds) return this.verifiedValue;
    const rows = this.database.prepare(`SELECT id,at,request_id requestId,actor,action,target,status_code statusCode,
      previous_hash previousHash,entry_hash entryHash FROM operational_audit ORDER BY sequence`).all() as Array<{
      id: string; at: string; requestId: string; actor: string; action: string; target: string;
      statusCode: number; previousHash: string | null; entryHash: string;
    }>;
    let valid = true;
    let previousRetainedHash: string | null = null;
    rows.forEach((row, index) => {
      const canonical = JSON.stringify({
        id: row.id,
        at: row.at,
        requestId: row.requestId,
        actor: row.actor,
        action: row.action,
        target: row.target,
        statusCode: row.statusCode,
        previousHash: row.previousHash,
      });
      if (createHash("sha256").update(canonical).digest("hex") !== row.entryHash) valid = false;
      // Der erste aufbewahrte Datensatz darf auf einen bereits durch Retention
      // entfernten Vorgänger zeigen; ab dem zweiten muss die Kette lückenlos sein.
      if (index > 0 && row.previousHash !== previousRetainedHash) valid = false;
      previousRetainedHash = row.entryHash;
    });
    const result = { valid, entries: rows.length, latestAt: rows.at(-1)?.at ?? null };
    this.verifiedValue = result;
    this.verifiedAt = Date.now();
    return result;
  }

  close() { this.database.close(); }
}

export function isAuditedMutation(method: string, url: string): boolean {
  if (!["DELETE", "PATCH", "POST", "PUT"].includes(method)) return false;
  // Presence-Meldungen sind hochfrequente, nicht sicherheitsrelevante
  // Statusupdates und würden das Audit-Log sonst mit jedem Ansichtswechsel füllen.
  if (url === "/api/v1/notifications/presence") return false;
  return [
    "/api/v1/system/",
    "/api/v1/accounts",
    "/api/v1/orbit",
    "/api/v1/files",
    "/api/v1/projects/",
    "/api/v1/previews/repair",
    "/api/v1/previews/slots",
    "/api/v1/previews/storage",
    "/api/v1/terminal/sessions",
    "/api/v1/hermes/",
    "/api/v1/notifications",
  ].some((prefix) => url.startsWith(prefix));
}
