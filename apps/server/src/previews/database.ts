import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  PreviewDependency,
  PreviewServiceCandidate,
  PreviewServiceEdge,
  PreviewSlotState,
} from "@workbench/contracts";

export interface SlotRow {
  slotId: number;
  targetPort: number | null;
  updatedAt: string | null;
}

export interface SessionRow {
  id: string;
  userId: string;
  sessionKey: string;
  projectId: string | null;
  primaryPort: number;
  storageProfileId: string | null;
  routingRevision: number;
  idempotencyKey: string | null;
  requestFingerprint: string | null;
  leaseExpiresAt: string;
}

export interface BindingRow {
  sessionId: string;
  slotId: number;
  targetPort: number;
  targetProtocol: "http" | "https";
  role: "primary" | "dependency";
  label: string;
}

export interface AffinityRow {
  slotId: number;
  storageOwnerKey: string | null;
  storageProfileId: string | null;
  generation: number;
  state: PreviewSlotState;
  lastVerifiedResetAt: string | null;
  resetNonce: string | null;
  resetStartedAt: string | null;
}

export interface DevicePreferenceRow {
  deviceId: string;
  orientation: "portrait" | "landscape";
  updatedAt: string;
}

export interface SnapshotRow {
  storageProfileId: string;
  revision: number;
  createdAt: string;
  keyCount: number;
  byteCount: number;
  hash: string;
  bridgeVersion: string;
}

export interface SnapshotPayloadRow extends SnapshotRow {
  iv: Uint8Array;
  authTag: Uint8Array;
  ciphertext: Uint8Array;
}

export interface RepairAuditEntry {
  id: string;
  at: string;
  actor: string;
  userId: string | null;
  action: string;
  target: string;
  beforeState: string;
  afterState: string;
  result: string;
}

/**
 * Persistenz aller Preview-Daten in der bestehenden Workbench-SQLite. Bindings,
 * Slotzustände und Affinitäten werden ausschließlich in `BEGIN IMMEDIATE`
 * geändert, damit eine Routing-Revision entweder vollständig oder gar nicht
 * sichtbar wird.
 */
export class PreviewSlotDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
    this.migrate();
  }

  private appliedVersions(): Set<number> {
    this.db.exec(`CREATE TABLE IF NOT EXISTS preview_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );`);
    const rows = this.db.prepare("SELECT version FROM preview_schema_migrations").all() as unknown as Array<{ version: number }>;
    return new Set(rows.map((row) => row.version));
  }

  private migrate() {
    const applied = this.appliedVersions();
    const steps: Array<{ version: number; sql: string }> = [
      {
        version: 1,
        sql: `
          CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS preview_slots (
            slot_id INTEGER PRIMARY KEY,
            target_port INTEGER,
            updated_at TEXT
          );
          CREATE TABLE IF NOT EXISTS preview_project_port_rules (
            project_id TEXT NOT NULL,
            primary_port INTEGER NOT NULL,
            dependency_port INTEGER NOT NULL,
            label TEXT NOT NULL,
            protocol TEXT NOT NULL CHECK(protocol IN ('auto','http','https')),
            enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
            updated_at TEXT NOT NULL,
            PRIMARY KEY(project_id, primary_port, dependency_port)
          ) STRICT;
        `,
      },
      {
        version: 2,
        sql: `
          CREATE TABLE IF NOT EXISTS preview_sessions (
            id TEXT PRIMARY KEY,
            session_key TEXT NOT NULL UNIQUE,
            project_id TEXT,
            primary_port INTEGER NOT NULL,
            lease_expires_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE TABLE IF NOT EXISTS preview_session_bindings (
            session_id TEXT NOT NULL REFERENCES preview_sessions(id) ON DELETE CASCADE,
            slot_id INTEGER NOT NULL,
            target_port INTEGER NOT NULL,
            target_protocol TEXT NOT NULL CHECK(target_protocol IN ('http','https')),
            role TEXT NOT NULL CHECK(role IN ('primary','dependency')),
            label TEXT NOT NULL,
            PRIMARY KEY(session_id, slot_id)
          ) STRICT;
        `,
      },
      {
        // Benutzerbezogene Sessions, Slot-Affinität, Service-Graphen, verschlüsselte
        // Storage-Snapshots und Audit. Die Tabellen aus Version 2 bleiben als
        // `*_v1` erhalten, damit ein Rollback keine Daten verliert.
        version: 3,
        sql: `
          ALTER TABLE preview_sessions RENAME TO preview_sessions_v1;
          ALTER TABLE preview_session_bindings RENAME TO preview_session_bindings_v1;

          CREATE TABLE preview_runtime_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            session_key TEXT NOT NULL,
            project_id TEXT,
            primary_port INTEGER NOT NULL,
            storage_profile_id TEXT,
            routing_revision INTEGER NOT NULL DEFAULT 0,
            idempotency_key TEXT,
            lease_expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, session_key)
          ) STRICT;
          CREATE INDEX preview_runtime_sessions_lease ON preview_runtime_sessions(lease_expires_at);

          CREATE TABLE preview_session_bindings (
            session_id TEXT NOT NULL REFERENCES preview_runtime_sessions(id) ON DELETE CASCADE,
            slot_id INTEGER NOT NULL,
            target_port INTEGER NOT NULL,
            target_protocol TEXT NOT NULL CHECK(target_protocol IN ('http','https')),
            role TEXT NOT NULL CHECK(role IN ('primary','dependency')),
            label TEXT NOT NULL,
            PRIMARY KEY(session_id, slot_id)
          ) STRICT;
          CREATE INDEX preview_session_bindings_slot ON preview_session_bindings(slot_id);

          CREATE TABLE preview_slot_affinities (
            slot_id INTEGER PRIMARY KEY,
            storage_owner_key TEXT,
            storage_profile_id TEXT,
            generation INTEGER NOT NULL DEFAULT 0,
            state TEXT NOT NULL CHECK(state IN ('free','active','resetting','quarantined')) DEFAULT 'free',
            last_verified_reset_at TEXT,
            reset_nonce TEXT,
            reset_started_at TEXT,
            updated_at TEXT NOT NULL
          ) STRICT;

          CREATE TABLE preview_device_preferences (
            user_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            orientation TEXT NOT NULL CHECK(orientation IN ('portrait','landscape')),
            updated_at TEXT NOT NULL
          ) STRICT;

          CREATE TABLE preview_service_candidates (
            service_id TEXT PRIMARY KEY,
            project_id TEXT,
            port INTEGER NOT NULL,
            payload TEXT NOT NULL,
            detected_at TEXT NOT NULL
          ) STRICT;
          CREATE INDEX preview_service_candidates_project ON preview_service_candidates(project_id);

          CREATE TABLE preview_service_graphs (
            project_id TEXT NOT NULL,
            primary_service_id TEXT NOT NULL,
            edges TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(project_id, primary_service_id)
          ) STRICT;

          CREATE TABLE preview_local_storage_settings (
            user_id TEXT NOT NULL,
            storage_profile_id TEXT NOT NULL,
            enabled INTEGER NOT NULL CHECK(enabled IN (0,1)) DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(user_id, storage_profile_id)
          ) STRICT;

          CREATE TABLE preview_local_storage_snapshots (
            user_id TEXT NOT NULL,
            storage_profile_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            key_count INTEGER NOT NULL,
            byte_count INTEGER NOT NULL,
            hash TEXT NOT NULL,
            bridge_version TEXT NOT NULL,
            iv BLOB NOT NULL,
            auth_tag BLOB NOT NULL,
            ciphertext BLOB NOT NULL,
            PRIMARY KEY(user_id, storage_profile_id, revision)
          ) STRICT;

          CREATE TABLE preview_repair_audit (
            id TEXT PRIMARY KEY,
            at TEXT NOT NULL,
            actor TEXT NOT NULL,
            user_id TEXT,
            action TEXT NOT NULL,
            target TEXT NOT NULL,
            before_state TEXT NOT NULL,
            after_state TEXT NOT NULL,
            result TEXT NOT NULL
          ) STRICT;
          CREATE INDEX preview_repair_audit_at ON preview_repair_audit(at);

          CREATE TABLE preview_routing_revision (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            revision INTEGER NOT NULL
          ) STRICT;
          INSERT INTO preview_routing_revision(id, revision) VALUES (1, 1);
        `,
      },
      {
        version: 4,
        sql: `
          ALTER TABLE preview_runtime_sessions ADD COLUMN request_fingerprint TEXT;
          CREATE UNIQUE INDEX preview_runtime_sessions_idempotency
            ON preview_runtime_sessions(user_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL;
        `,
      },
    ];

    for (const step of steps) {
      if (applied.has(step.version)) continue;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(step.sql);
        this.db.prepare("INSERT OR IGNORE INTO preview_schema_migrations(version, applied_at) VALUES (?, ?)")
          .run(step.version, new Date().toISOString());
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  close() {
    this.db.close();
  }

  /** Führt `work` in einer `BEGIN IMMEDIATE`-Transaktion aus. */
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  // ── Slots ────────────────────────────────────────────────────────────────────

  list(): SlotRow[] {
    return this.db.prepare(`
      SELECT slot_id slotId, target_port targetPort, updated_at updatedAt
      FROM preview_slots
      ORDER BY slot_id
    `).all() as unknown as SlotRow[];
  }

  target(slotId: number): number | null {
    const row = this.db.prepare("SELECT target_port targetPort FROM preview_slots WHERE slot_id = ?")
      .get(slotId) as { targetPort: number | null } | undefined;
    return row?.targetPort ?? null;
  }

  assign(slotId: number, targetPort: number | null): string {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO preview_slots(slot_id, target_port, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(slot_id) DO UPDATE SET target_port=excluded.target_port, updated_at=excluded.updated_at
    `).run(slotId, targetPort, updatedAt);
    return updatedAt;
  }

  // ── Abhängigkeitsregeln (Bestandsformat) ─────────────────────────────────────

  dependencies(projectId: string, primaryPort: number): PreviewDependency[] {
    return this.db.prepare(`SELECT dependency_port port, label, protocol, enabled
      FROM preview_project_port_rules WHERE project_id = ? AND primary_port = ? ORDER BY dependency_port`)
      .all(projectId, primaryPort).map((row) => ({ ...(row as object), enabled: Boolean((row as { enabled: number }).enabled) })) as PreviewDependency[];
  }

  saveDependencies(projectId: string, primaryPort: number, dependencies: PreviewDependency[]): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db.prepare("DELETE FROM preview_project_port_rules WHERE project_id = ? AND primary_port = ?").run(projectId, primaryPort);
      const insert = this.db.prepare(`INSERT INTO preview_project_port_rules
        (project_id, primary_port, dependency_port, label, protocol, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const item of dependencies) insert.run(projectId, primaryPort, item.port, item.label, item.protocol, item.enabled ? 1 : 0, now);
      this.nextRoutingRevision();
    });
  }

  // ── Sessions und Bindings ────────────────────────────────────────────────────

  private static readonly sessionColumns = `id, user_id userId, session_key sessionKey, project_id projectId,
    primary_port primaryPort, storage_profile_id storageProfileId, routing_revision routingRevision,
    idempotency_key idempotencyKey, request_fingerprint requestFingerprint, lease_expires_at leaseExpiresAt`;

  sessionByKey(userId: string, sessionKey: string): SessionRow | null {
    return (this.db.prepare(`SELECT ${PreviewSlotDatabase.sessionColumns} FROM preview_runtime_sessions
      WHERE user_id = ? AND session_key = ?`).get(userId, sessionKey) as SessionRow | undefined) ?? null;
  }

  sessionById(sessionId: string): SessionRow | null {
    return (this.db.prepare(`SELECT ${PreviewSlotDatabase.sessionColumns} FROM preview_runtime_sessions WHERE id = ?`)
      .get(sessionId) as SessionRow | undefined) ?? null;
  }

  allSessions(): SessionRow[] {
    return this.db.prepare(`SELECT ${PreviewSlotDatabase.sessionColumns} FROM preview_runtime_sessions ORDER BY created_at`)
      .all() as unknown as SessionRow[];
  }

  sessionsForSlot(slotId: number): SessionRow[] {
    return this.db.prepare(`SELECT ${PreviewSlotDatabase.sessionColumns.split(", ").map((column) => `s.${column}`).join(", ")}
      FROM preview_runtime_sessions s JOIN preview_session_bindings b ON b.session_id = s.id
      WHERE b.slot_id = ? ORDER BY s.updated_at DESC`).all(slotId) as unknown as SessionRow[];
  }

  bindings(sessionId: string): BindingRow[] {
    return this.db.prepare(`SELECT session_id sessionId, slot_id slotId, target_port targetPort,
      target_protocol targetProtocol, role, label FROM preview_session_bindings WHERE session_id = ?
      ORDER BY role DESC, slot_id`).all(sessionId) as unknown as BindingRow[];
  }

  allBindings(): BindingRow[] {
    return this.db.prepare(`SELECT session_id sessionId, slot_id slotId, target_port targetPort,
      target_protocol targetProtocol, role, label FROM preview_session_bindings ORDER BY slot_id, role DESC`)
      .all() as unknown as BindingRow[];
  }

  /** Schreibt Session und Bindings. Muss innerhalb einer Transaktion laufen. */
  writeSession(session: SessionRow, bindings: BindingRow[]): void {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO preview_runtime_sessions
      (id, user_id, session_key, project_id, primary_port, storage_profile_id, routing_revision, idempotency_key, request_fingerprint, lease_expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, session_key) DO UPDATE SET project_id=excluded.project_id,
        primary_port=excluded.primary_port, storage_profile_id=excluded.storage_profile_id,
        routing_revision=excluded.routing_revision, idempotency_key=excluded.idempotency_key,
        request_fingerprint=excluded.request_fingerprint,
        lease_expires_at=excluded.lease_expires_at, updated_at=excluded.updated_at`)
      .run(session.id, session.userId, session.sessionKey, session.projectId, session.primaryPort,
        session.storageProfileId, session.routingRevision, session.idempotencyKey, session.requestFingerprint,
        session.leaseExpiresAt, now, now);
    this.db.prepare("DELETE FROM preview_session_bindings WHERE session_id = ?").run(session.id);
    const insert = this.db.prepare(`INSERT INTO preview_session_bindings
      (session_id, slot_id, target_port, target_protocol, role, label) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const item of bindings) insert.run(session.id, item.slotId, item.targetPort, item.targetProtocol, item.role, item.label);
  }

  renewLease(sessionId: string, leaseExpiresAt: string): void {
    this.db.prepare("UPDATE preview_runtime_sessions SET lease_expires_at = ?, updated_at = ? WHERE id = ?")
      .run(leaseExpiresAt, new Date().toISOString(), sessionId);
  }

  deleteSession(sessionId: string): number[] {
    const slots = this.bindings(sessionId).map((binding) => binding.slotId);
    this.db.prepare("DELETE FROM preview_session_bindings WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM preview_runtime_sessions WHERE id = ?").run(sessionId);
    return slots;
  }

  bindingCount(slotId: number): number {
    return (this.db.prepare("SELECT count(*) count FROM preview_session_bindings WHERE slot_id = ?")
      .get(slotId) as { count: number }).count;
  }

  deleteExpiredSessions(now: string): number[] {
    const rows = this.db.prepare(`SELECT DISTINCT b.slot_id slotId FROM preview_session_bindings b
      JOIN preview_runtime_sessions s ON s.id = b.session_id WHERE s.lease_expires_at < ?`)
      .all(now) as unknown as Array<{ slotId: number }>;
    this.db.prepare(`DELETE FROM preview_session_bindings WHERE session_id IN
      (SELECT id FROM preview_runtime_sessions WHERE lease_expires_at < ?)`).run(now);
    this.db.prepare("DELETE FROM preview_runtime_sessions WHERE lease_expires_at < ?").run(now);
    return rows.map((row) => row.slotId);
  }

  // ── Routing-Revision ─────────────────────────────────────────────────────────

  routingRevision(): number {
    return (this.db.prepare("SELECT revision FROM preview_routing_revision WHERE id = 1").get() as { revision: number }).revision;
  }

  nextRoutingRevision(): number {
    this.db.prepare("UPDATE preview_routing_revision SET revision = revision + 1 WHERE id = 1").run();
    return this.routingRevision();
  }

  // ── Slot-Affinität ───────────────────────────────────────────────────────────

  affinity(slotId: number): AffinityRow | null {
    return (this.db.prepare(`SELECT slot_id slotId, storage_owner_key storageOwnerKey,
      storage_profile_id storageProfileId, generation, state, last_verified_reset_at lastVerifiedResetAt,
      reset_nonce resetNonce, reset_started_at resetStartedAt
      FROM preview_slot_affinities WHERE slot_id = ?`).get(slotId) as AffinityRow | undefined) ?? null;
  }

  affinities(): AffinityRow[] {
    return this.db.prepare(`SELECT slot_id slotId, storage_owner_key storageOwnerKey,
      storage_profile_id storageProfileId, generation, state, last_verified_reset_at lastVerifiedResetAt,
      reset_nonce resetNonce, reset_started_at resetStartedAt
      FROM preview_slot_affinities ORDER BY slot_id`).all() as unknown as AffinityRow[];
  }

  writeAffinity(row: AffinityRow): void {
    this.db.prepare(`INSERT INTO preview_slot_affinities
      (slot_id, storage_owner_key, storage_profile_id, generation, state, last_verified_reset_at, reset_nonce, reset_started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slot_id) DO UPDATE SET storage_owner_key=excluded.storage_owner_key,
        storage_profile_id=excluded.storage_profile_id, generation=excluded.generation, state=excluded.state,
        last_verified_reset_at=excluded.last_verified_reset_at, reset_nonce=excluded.reset_nonce,
        reset_started_at=excluded.reset_started_at, updated_at=excluded.updated_at`)
      .run(row.slotId, row.storageOwnerKey, row.storageProfileId, row.generation, row.state,
        row.lastVerifiedResetAt, row.resetNonce, row.resetStartedAt, new Date().toISOString());
  }

  // ── Gerätepräferenz ──────────────────────────────────────────────────────────

  devicePreference(userId: string): DevicePreferenceRow | null {
    return (this.db.prepare(`SELECT device_id deviceId, orientation, updated_at updatedAt
      FROM preview_device_preferences WHERE user_id = ?`).get(userId) as DevicePreferenceRow | undefined) ?? null;
  }

  saveDevicePreference(userId: string, deviceId: string, orientation: "portrait" | "landscape"): DevicePreferenceRow {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`INSERT INTO preview_device_preferences(user_id, device_id, orientation, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET device_id=excluded.device_id,
      orientation=excluded.orientation, updated_at=excluded.updated_at`).run(userId, deviceId, orientation, updatedAt);
    return { deviceId, orientation, updatedAt };
  }

  // ── Service-Kandidaten und Graphen ───────────────────────────────────────────

  replaceCandidates(candidates: PreviewServiceCandidate[]): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM preview_service_candidates").run();
      const insert = this.db.prepare(`INSERT INTO preview_service_candidates
        (service_id, project_id, port, payload, detected_at) VALUES (?, ?, ?, ?, ?)`);
      for (const candidate of candidates) {
        insert.run(candidate.serviceId, candidate.projectId, candidate.port, JSON.stringify(candidate), candidate.detectedAt);
      }
    });
  }

  candidates(projectId: string | null): PreviewServiceCandidate[] {
    const rows = projectId === null
      ? this.db.prepare("SELECT payload FROM preview_service_candidates ORDER BY port").all()
      : this.db.prepare("SELECT payload FROM preview_service_candidates WHERE project_id = ? ORDER BY port").all(projectId);
    return (rows as unknown as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as PreviewServiceCandidate);
  }

  serviceGraph(projectId: string, primaryServiceId: string): { edges: PreviewServiceEdge[]; updatedAt: string } | null {
    const row = this.db.prepare(`SELECT edges, updated_at updatedAt FROM preview_service_graphs
      WHERE project_id = ? AND primary_service_id = ?`).get(projectId, primaryServiceId) as { edges: string; updatedAt: string } | undefined;
    if (!row) return null;
    return { edges: JSON.parse(row.edges) as PreviewServiceEdge[], updatedAt: row.updatedAt };
  }

  saveServiceGraph(projectId: string, primaryServiceId: string, edges: PreviewServiceEdge[]): string {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`INSERT INTO preview_service_graphs(project_id, primary_service_id, edges, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(project_id, primary_service_id) DO UPDATE SET
      edges=excluded.edges, updated_at=excluded.updated_at`).run(projectId, primaryServiceId, JSON.stringify(edges), updatedAt);
    return updatedAt;
  }

  // ── localStorage-Snapshots ───────────────────────────────────────────────────

  storageEnabled(userId: string, storageProfileId: string): boolean {
    const row = this.db.prepare(`SELECT enabled FROM preview_local_storage_settings
      WHERE user_id = ? AND storage_profile_id = ?`).get(userId, storageProfileId) as { enabled: number } | undefined;
    return Boolean(row?.enabled);
  }

  setStorageEnabled(userId: string, storageProfileId: string, enabled: boolean): void {
    this.db.prepare(`INSERT INTO preview_local_storage_settings(user_id, storage_profile_id, enabled, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(user_id, storage_profile_id) DO UPDATE SET
      enabled=excluded.enabled, updated_at=excluded.updated_at`)
      .run(userId, storageProfileId, enabled ? 1 : 0, new Date().toISOString());
  }

  snapshots(userId: string, storageProfileId: string): SnapshotRow[] {
    return this.db.prepare(`SELECT storage_profile_id storageProfileId, revision, created_at createdAt,
      key_count keyCount, byte_count byteCount, hash, bridge_version bridgeVersion
      FROM preview_local_storage_snapshots WHERE user_id = ? AND storage_profile_id = ?
      ORDER BY revision DESC`).all(userId, storageProfileId) as unknown as SnapshotRow[];
  }

  snapshotPayload(userId: string, storageProfileId: string, revision: number): SnapshotPayloadRow | null {
    return (this.db.prepare(`SELECT storage_profile_id storageProfileId, revision, created_at createdAt,
      key_count keyCount, byte_count byteCount, hash, bridge_version bridgeVersion, iv, auth_tag authTag, ciphertext
      FROM preview_local_storage_snapshots WHERE user_id = ? AND storage_profile_id = ? AND revision = ?`)
      .get(userId, storageProfileId, revision) as SnapshotPayloadRow | undefined) ?? null;
  }

  /**
   * Schreibt eine Revision und hält höchstens `maxHistory` ältere Stände vor.
   * Die erwartete Revision wird innerhalb derselben Schreibtransaktion geprüft;
   * dadurch wird ein paralleler Write als fachlicher Konflikt und nicht als
   * unverständlicher SQLite-Unique-Constraint-Fehler sichtbar.
   */
  writeSnapshot(userId: string, row: SnapshotPayloadRow, maxHistory: number, expectedRevision: number): boolean {
    return this.transaction(() => {
      const current = this.db.prepare(`SELECT COALESCE(MAX(revision), 0) revision
        FROM preview_local_storage_snapshots WHERE user_id = ? AND storage_profile_id = ?`)
        .get(userId, row.storageProfileId) as { revision: number };
      if (current.revision !== expectedRevision) return false;
      this.db.prepare(`INSERT INTO preview_local_storage_snapshots
        (user_id, storage_profile_id, revision, created_at, key_count, byte_count, hash, bridge_version, iv, auth_tag, ciphertext)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(userId, row.storageProfileId, row.revision, row.createdAt, row.keyCount, row.byteCount,
          row.hash, row.bridgeVersion, row.iv, row.authTag, row.ciphertext);
      this.db.prepare(`DELETE FROM preview_local_storage_snapshots
        WHERE user_id = ? AND storage_profile_id = ? AND revision <= ?`)
        .run(userId, row.storageProfileId, row.revision - maxHistory - 1);
      return true;
    });
  }

  deleteSnapshots(userId: string, storageProfileId: string): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM preview_local_storage_snapshots WHERE user_id = ? AND storage_profile_id = ?")
        .run(userId, storageProfileId);
      this.db.prepare("DELETE FROM preview_local_storage_settings WHERE user_id = ? AND storage_profile_id = ?")
        .run(userId, storageProfileId);
    });
  }

  // ── Audit ────────────────────────────────────────────────────────────────────

  writeAudit(entry: RepairAuditEntry): void {
    this.db.prepare(`INSERT INTO preview_repair_audit
      (id, at, actor, user_id, action, target, before_state, after_state, result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(entry.id, entry.at, entry.actor, entry.userId, entry.action, entry.target,
        entry.beforeState, entry.afterState, entry.result);
  }

  auditTrail(limit: number): RepairAuditEntry[] {
    return this.db.prepare(`SELECT id, at, actor, user_id userId, action, target,
      before_state beforeState, after_state afterState, result FROM preview_repair_audit
      ORDER BY at DESC LIMIT ?`).all(limit) as unknown as RepairAuditEntry[];
  }
}
