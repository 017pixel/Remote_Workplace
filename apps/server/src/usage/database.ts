import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ManagedAccount, ResetCredit, UsageBreakdown, UsageDailyPoint, UsageForecast, UsageProviderId, UsageRange } from "@workbench/contracts";
import type { CodexbarCostPayload, CodexbarPayload } from "../adapters/codexbar/codexbar-schemas.js";

const rangeDays: Record<UsageRange, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

export class UsageDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
    this.migrate();
  }

  close() { this.db.close(); }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('codex','opencode','claude')),
        label TEXT NOT NULL, email TEXT, profile_path TEXT NOT NULL, source TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(provider, profile_path)
      );
      CREATE TABLE IF NOT EXISTS usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_key TEXT NOT NULL, provider TEXT NOT NULL,
        window_id TEXT NOT NULL, used_percent REAL NOT NULL, window_minutes INTEGER,
        resets_at TEXT, captured_at TEXT NOT NULL,
        UNIQUE(account_key, provider, window_id, captured_at)
      );
      CREATE INDEX IF NOT EXISTS usage_snapshot_lookup ON usage_snapshots(account_key, window_id, resets_at, captured_at);
      CREATE TABLE IF NOT EXISTS daily_usage (
        provider TEXT NOT NULL, date TEXT NOT NULL, input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL, cache_read_tokens INTEGER NOT NULL,
        cache_creation_tokens INTEGER NOT NULL, total_tokens INTEGER NOT NULL,
        total_cost REAL NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(provider, date)
      );
      CREATE TABLE IF NOT EXISTS model_usage (
        provider TEXT NOT NULL, date TEXT NOT NULL, model TEXT NOT NULL,
        total_tokens INTEGER NOT NULL, total_cost REAL NOT NULL,
        PRIMARY KEY(provider, date, model)
      );
      CREATE TABLE IF NOT EXISTS project_usage (
        provider TEXT NOT NULL, project_key TEXT NOT NULL, label TEXT NOT NULL,
        total_tokens INTEGER NOT NULL, total_cost REAL NOT NULL, updated_at TEXT NOT NULL,
        quality TEXT NOT NULL DEFAULT 'exact', PRIMARY KEY(provider, project_key)
      );
      CREATE TABLE IF NOT EXISTS reset_credits (
        account_key TEXT NOT NULL, credit_id TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT NOT NULL, status TEXT NOT NULL, granted_at TEXT, expires_at TEXT,
        PRIMARY KEY(account_key, credit_id)
      );
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
    `);
    const accountTable = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='accounts'").get() as {sql?:string} | undefined;
    if (!accountTable?.sql?.includes("'claude'")) {
      this.db.exec(`
        BEGIN;
        ALTER TABLE accounts RENAME TO accounts_before_claude;
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('codex','opencode','claude')),
          label TEXT NOT NULL, email TEXT, profile_path TEXT NOT NULL, source TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          UNIQUE(provider, profile_path)
        );
        INSERT INTO accounts SELECT * FROM accounts_before_claude;
        DROP TABLE accounts_before_claude;
        COMMIT;
      `);
    }
    this.db.exec("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, datetime('now'))");
    // Zuletzt aktivierter Account je Werkzeug. Die Wahrheit über den tatsächlich aktiven Account
    // steht im Symlink des gemeinsamen Homes; dieser Eintrag sagt nur, wohin er zeigen soll —
    // nötig, um den Symlink zu reparieren, wenn ein CLI ihn durch eine reguläre Datei ersetzt.
    this.db.exec(`CREATE TABLE IF NOT EXISTS active_accounts (
      provider TEXT PRIMARY KEY CHECK(provider IN ('codex','opencode','claude')),
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_activation_journal (
      provider TEXT PRIMARY KEY CHECK(provider IN ('codex','opencode','claude')),
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      phase TEXT NOT NULL CHECK(phase IN ('requested','filesystem-switched','failed')),
      error TEXT,
      updated_at TEXT NOT NULL
    )`);
  }

  importUsage(provider: UsageProviderId, payloads: CodexbarPayload[], capturedAt: string) {
    const insertWindow = this.db.prepare(`INSERT OR IGNORE INTO usage_snapshots
      (account_key, provider, window_id, used_percent, window_minutes, resets_at, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const deleteCredits = this.db.prepare("DELETE FROM reset_credits WHERE account_key = ?");
    const insertCredit = this.db.prepare(`INSERT INTO reset_credits
      (account_key, credit_id, title, description, status, granted_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(account_key, credit_id) DO UPDATE SET
      title=excluded.title, description=excluded.description, status=excluded.status,
      granted_at=excluded.granted_at, expires_at=excluded.expires_at`);
    const usagePayloads = payloads.filter((payload) => payload.usage && [payload.usage.primary, payload.usage.secondary, payload.usage.tertiary]
      .some((window) => window?.usedPercent !== undefined));
    const resetCreditsAreAuthoritative = provider === "codex" && usagePayloads.length > 0
      && usagePayloads.every((payload) => payload.usage?.codexResetCredits !== undefined);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Limitfenster sind kurzlebige Messreihen. Eine feste Retention hält
      // Prognosen schnell und verhindert unbegrenztes Tabellenwachstum.
      this.db.prepare("DELETE FROM usage_snapshots WHERE captured_at < datetime(?, '-400 days')").run(capturedAt);
      if (resetCreditsAreAuthoritative) this.db.exec("DELETE FROM reset_credits");
      for (const [index, payload] of payloads.entries()) {
        if (!payload.usage) continue;
        const key = payload.usage.accountEmail ?? payload.usage.identity?.accountEmail ?? payload.account ?? `${provider}-${index}`;
        for (const windowId of ["primary", "secondary", "tertiary"] as const) {
          const window = payload.usage[windowId];
          if (window?.usedPercent === undefined) continue;
          insertWindow.run(key, provider, windowId, window.usedPercent, window.windowMinutes ?? null, window.resetsAt ?? null, capturedAt);
        }
        if (payload.usage.codexResetCredits) {
          if (!resetCreditsAreAuthoritative) deleteCredits.run(key);
          for (const credit of payload.usage.codexResetCredits.credits) {
            insertCredit.run(key, credit.id, credit.title, credit.description, credit.status, credit.granted_at ?? null, credit.expires_at ?? null);
          }
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  importCost(payloads: CodexbarCostPayload[], scope: "daily" | "projects" | "both" = "both") {
    const daily = this.db.prepare(`INSERT INTO daily_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider,date) DO UPDATE SET input_tokens=excluded.input_tokens,
      output_tokens=excluded.output_tokens, cache_read_tokens=excluded.cache_read_tokens,
      cache_creation_tokens=excluded.cache_creation_tokens, total_tokens=excluded.total_tokens,
      total_cost=excluded.total_cost, updated_at=excluded.updated_at`);
    const model = this.db.prepare(`INSERT INTO model_usage VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider,date,model) DO UPDATE SET total_tokens=excluded.total_tokens,total_cost=excluded.total_cost`);
    const project = this.db.prepare(`INSERT INTO project_usage VALUES (?, ?, ?, ?, ?, ?, 'exact')
      ON CONFLICT(provider,project_key) DO UPDATE SET label=excluded.label,total_tokens=excluded.total_tokens,total_cost=excluded.total_cost,updated_at=excluded.updated_at`);
    const providers = [...new Set(payloads.map((payload) => payload.provider))];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (scope === "daily" || scope === "both") {
        const deleteDaily = this.db.prepare("DELETE FROM daily_usage WHERE provider = ?");
        const deleteModels = this.db.prepare("DELETE FROM model_usage WHERE provider = ?");
        for (const provider of providers) {
          deleteDaily.run(provider);
          deleteModels.run(provider);
        }
      }
      if (scope === "projects" || scope === "both") {
        const deleteProjects = this.db.prepare("DELETE FROM project_usage WHERE provider = ?");
        for (const provider of providers) deleteProjects.run(provider);
      }
      for (const payload of payloads) {
        if (scope === "daily" || scope === "both") {
          for (const point of payload.daily) {
            daily.run(payload.provider, point.date, point.inputTokens, point.outputTokens, point.cacheReadTokens, point.cacheCreationTokens, point.totalTokens, point.totalCost, payload.updatedAt);
            for (const item of point.modelBreakdowns) model.run(payload.provider, point.date, item.modelName, item.totalTokens, item.cost);
          }
        }
        if (scope === "projects" || scope === "both") {
          for (const [index, item] of payload.projects.entries()) {
            const key = item.projectPath ?? item.project ?? item.name ?? `project-${index}`;
            project.run(payload.provider, key, item.name ?? item.project ?? item.projectPath ?? "Unbekannt", item.totalTokens, item.totalCost, payload.updatedAt);
          }
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  dashboard(range: UsageRange) {
    const days = rangeDays[range];
    const cutoff = `-${days - 1} days`;
    // Pro Tag liegt bis zu eine Zeile je Provider vor. Erst die Aggregation über
    // alle Provider macht die Tageswerte, „Tokens heute" und die 30-Tage-Projektion
    // korrekt — sonst zählt die Zeilenzahl statt der Tagesszahl (F03-1).
    const daily = this.db.prepare(`SELECT date, SUM(input_tokens) inputTokens, SUM(output_tokens) outputTokens,
      SUM(cache_read_tokens) cacheReadTokens, SUM(cache_creation_tokens) cacheCreationTokens,
      SUM(total_tokens) totalTokens, SUM(total_cost) totalCost FROM daily_usage
      WHERE date >= date('now', ?) GROUP BY date ORDER BY date`).all(cutoff) as UsageDailyPoint[];
    const projects = this.db.prepare(`SELECT project_key id, label, total_tokens totalTokens,
      total_cost totalCost, quality FROM project_usage ORDER BY total_tokens DESC LIMIT 20`).all() as UsageBreakdown[];
    const models = this.db.prepare(`SELECT model id, model label, SUM(total_tokens) totalTokens,
      SUM(total_cost) totalCost, 'exact' quality FROM model_usage WHERE date >= date('now', ?)
      GROUP BY model ORDER BY totalTokens DESC`).all(cutoff) as UsageBreakdown[];
    const totals = daily.reduce((sum, point) => ({ tokens: sum.tokens + point.totalTokens, cost: sum.cost + point.totalCost }), { tokens: 0, cost: 0 });
    const todayTokens = daily.find((point) => point.date === new Date().toISOString().slice(0, 10))?.totalTokens ?? 0;
    const observed = Math.max(1, daily.length);
    return {
      daily, projects, projectRange: "365d" as const, models,
      totals: {
        totalTokens: totals.tokens, totalCost: totals.cost, todayTokens,
        projected30DayTokens: Math.round(totals.tokens / observed * 30),
        projected30DayCost: totals.cost / observed * 30,
      },
      historyStartedAt: daily[0] ? new Date(`${daily[0].date}T00:00:00Z`).toISOString() : null,
    };
  }

  forecasts(): UsageForecast[] {
    type ForecastRow = {accountKey:string;provider:UsageProviderId;windowId:"primary"|"secondary"|"tertiary";windowMinutes:number|null;resetsAt:string;usedPercent:number;capturedAt:string};
    const rows = this.db.prepare(`WITH ranked AS (
      SELECT account_key accountKey, provider, window_id windowId,
        window_minutes windowMinutes, resets_at resetsAt, used_percent usedPercent, captured_at capturedAt,
        ROW_NUMBER() OVER (
          PARTITION BY account_key, provider, window_id
          ORDER BY captured_at DESC
        ) sample_rank
      FROM usage_snapshots
      WHERE resets_at IS NOT NULL AND resets_at > datetime('now')
    )
    SELECT accountKey, provider, windowId, windowMinutes, resetsAt, usedPercent, capturedAt
    FROM ranked WHERE sample_rank <= 96 ORDER BY capturedAt`).all() as ForecastRow[];
    const byIdentity = new Map<string, ForecastRow[]>();
    for (const row of rows) {
      const key = `${row.provider}|${row.accountKey}|${row.windowId}`;
      byIdentity.set(key, [...(byIdentity.get(key) ?? []), row]);
    }
    return [...byIdentity.values()].flatMap((allRows) => {
      const latestIdentityRow = allRows.at(-1);
      if (!latestIdentityRow) return [];
      const currentRows = allRows.filter((row) => row.resetsAt === latestIdentityRow.resetsAt);
      const latest = currentRows.at(-1); if (!latest || currentRows.length < 3) return [];
      const rows = currentRows;
      const first = rows[0]!; const elapsedHours = (Date.parse(latest.capturedAt) - Date.parse(first.capturedAt)) / 3_600_000;
      if (elapsedHours <= 0 || latest.usedPercent < first.usedPercent) return [];
      const rate = (latest.usedPercent - first.usedPercent) / elapsedHours;
      const hoursToReset = Math.max(0, (Date.parse(latest.resetsAt) - Date.now()) / 3_600_000);
      const predicted = latest.usedPercent + rate * hoursToReset;
      const hoursToLimit = rate > 0 ? (100 - latest.usedPercent) / rate : Number.POSITIVE_INFINITY;
      const reaches = hoursToLimit <= hoursToReset ? new Date(Date.now() + hoursToLimit * 3_600_000).toISOString() : null;
      const providerLabel = latest.provider === "codex" ? "Codex" : latest.provider === "claude" ? "Claude Code" : "OpenCode Go";
      const accountLabel = latest.accountKey.includes("@") ? latest.accountKey : providerLabel;
      const windowLabel = latest.windowMinutes === 300 ? "5-Stunden-Limit"
        : latest.windowMinutes === 10_080 ? "Wochenlimit"
        : latest.windowMinutes === 43_200 ? "Monatslimit"
        : latest.windowId === "primary" ? "Aktuelles Zeitfenster"
        : latest.windowId === "secondary" ? "Längerer Zeitraum" : "Zusätzliches Zeitfenster";
      return [{ providerId: latest.provider, accountId: latest.accountKey, accountLabel, windowId: latest.windowId, windowLabel, resetsAt: latest.resetsAt, predictedUsedPercentAtReset: Math.max(0, predicted), reachesLimitAt: reaches,
        confidence: rows.length >= 12 ? "high" as const : rows.length >= 6 ? "medium" as const : "low" as const, sampleCount: rows.length,
        message: reaches ? "Bei aktuellem Tempo wird das Limit voraussichtlich vor dem Reset erreicht." : "Bei aktuellem Tempo wird das Limit voraussichtlich nicht vor dem Reset erreicht." }];
    });
  }

  resetCredits() {
    const rows = this.db.prepare(`SELECT account_key accountKey, credit_id id, title, description, status,
      granted_at grantedAt, expires_at expiresAt FROM reset_credits ORDER BY expires_at`).all() as Array<ResetCredit & {accountKey:string}>;
    const result: Record<string, ResetCredit[]> = {};
    for (const row of rows) { const {accountKey,...credit}=row; (result[accountKey] ??= []).push(credit); }
    return result;
  }

  listAccounts(): ManagedAccount[] {
    return this.db.prepare(`SELECT id,provider,label,email,profile_path profilePath,source,
      enabled,created_at createdAt,updated_at updatedAt FROM accounts ORDER BY provider,label`).all()
      // `active` und `plan` stammen nicht aus der Datenbank: Sie werden vom AccountService aus
      // dem gemeinsamen Codex-Home und der auth.json ermittelt, damit sie nie veralten können.
      .map((row) => ({ ...(row as Omit<ManagedAccount,"enabled"|"active"|"plan"> & {enabled:number}), enabled: Boolean((row as {enabled:number}).enabled), active: false, plan: null }));
  }
  createAccount(input: { provider: UsageProviderId; label: string; profilePath: string; source: "local"|"login" }): ManagedAccount {
    const now = new Date().toISOString(); const id = randomUUID();
    this.db.prepare(`INSERT INTO accounts(id,provider,label,email,profile_path,source,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)`)
      .run(id,input.provider,input.label,null,input.profilePath,input.source,now,now);
    return this.getAccount(id);
  }
  getAccount(id: string): ManagedAccount { const account = this.listAccounts().find((item) => item.id === id); if (!account) throw new Error("ACCOUNT_NOT_FOUND"); return account; }
  updateAccount(id: string, input: { label?: string; enabled?: boolean }): ManagedAccount {
    const current = this.getAccount(id); const now = new Date().toISOString();
    this.db.prepare(`UPDATE accounts SET label=?,enabled=?,updated_at=? WHERE id=?`).run(input.label ?? current.label, input.enabled === undefined ? Number(current.enabled) : Number(input.enabled), now, id);
    return this.getAccount(id);
  }
  deleteAccount(id: string) { this.getAccount(id); this.db.prepare("DELETE FROM accounts WHERE id=?").run(id); }
  setAccountProfilePath(id: string, profilePath: string): ManagedAccount {
    this.db.prepare("UPDATE accounts SET profile_path=?,updated_at=? WHERE id=?").run(profilePath, new Date().toISOString(), id);
    return this.getAccount(id);
  }
  /** Zuletzt aktivierter Account je Werkzeug, als Zuordnung Werkzeug → Account-ID. */
  listActiveAccounts(): Partial<Record<UsageProviderId, string>> {
    const rows = this.db.prepare("SELECT provider, account_id accountId FROM active_accounts").all() as Array<{provider:UsageProviderId;accountId:string}>;
    return Object.fromEntries(rows.map((row) => [row.provider, row.accountId]));
  }
  setActiveAccount(provider: UsageProviderId, accountId: string) {
    this.db.prepare(`INSERT INTO active_accounts(provider,account_id,updated_at) VALUES(?,?,?)
      ON CONFLICT(provider) DO UPDATE SET account_id=excluded.account_id, updated_at=excluded.updated_at`)
      .run(provider, accountId, new Date().toISOString());
  }
  setActivationJournal(provider: UsageProviderId, accountId: string, phase: "requested" | "filesystem-switched" | "failed", error: string | null = null) {
    this.db.prepare(`INSERT INTO account_activation_journal(provider,account_id,phase,error,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET
      account_id=excluded.account_id,phase=excluded.phase,error=excluded.error,updated_at=excluded.updated_at`)
      .run(provider, accountId, phase, error, new Date().toISOString());
  }
  listActivationJournal() {
    return this.db.prepare(`SELECT provider,account_id accountId,phase,error,updated_at updatedAt
      FROM account_activation_journal ORDER BY provider`).all() as Array<{
        provider: UsageProviderId;
        accountId: string;
        phase: "requested" | "filesystem-switched" | "failed";
        error: string | null;
        updatedAt: string;
      }>;
  }
  clearActivationJournal(provider: UsageProviderId) {
    this.db.prepare("DELETE FROM account_activation_journal WHERE provider=?").run(provider);
  }
}
