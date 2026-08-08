import { createHash } from "node:crypto";
import type { ManagedAccount, UsageTimelineLane, UsageTimelineResponse, UsageWindow } from "@workbench/contracts";
import type { CodexbarClient, ClaudeProfileUsage } from "../adapters/codexbar/codexbar-client.js";
import type { CodexbarPayload } from "../adapters/codexbar/codexbar-schemas.js";
import type { CodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import type { AccountService } from "./account-service.js";
import type { UsageDatabase } from "./database.js";

/**
 * Baut die Multi-Account-Timeline-Lanes für die Limitübersicht.
 *
 * Jeder Account eines Providers bekommt genau eine Lane mit eigenem Zustand.
 * Ein fehlgeschlagener Account liefert eine unavailable-Lane mit lokaler
 * Fehlermeldung und zerstört die übrigen Lanes nicht. Diese Klasse liest nur:
 * registrierte Accounts (ohne Aktivierung), Live-Usage aus dem bestehenden
 * Cache und isolierte Claude-Profilabfragen. Sie schaltet nie den aktiven
 * CLI-Account um und legt keine Credentials in den Antworten ab.
 */

export const STALE_AFTER_MILLISECONDS = 90 * 60 * 1_000;

type WorkbenchProvider = "codex" | "claude" | "opencode";

function deterministicAccountId(provider: WorkbenchProvider, source: string): string {
  const hash = createHash("sha256").update(`${provider}:${source.toLowerCase()}`).digest("hex").slice(0, 12);
  return `${provider}-${hash}`;
}

function windowLabel(id: UsageWindow["id"], windowMinutes: number | undefined): string {
  if (windowMinutes === 300) return "5-Stunden-Limit";
  if (windowMinutes === 10_080) return "Wochenlimit";
  if (windowMinutes === 43_200) return "Monatslimit";
  if (id === "primary") return "Aktuelles Zeitfenster";
  if (id === "secondary") return "Längerer Zeitraum";
  return "Zusätzliches Zeitfenster";
}

function windowsFromPayload(payload: CodexbarPayload | undefined): UsageWindow[] {
  const usage = payload?.usage;
  if (!usage) return [];
  return (["primary", "secondary", "tertiary"] as const).flatMap((id) => {
    const window = usage[id];
    if (!window || window.usedPercent === undefined) return [];
    return [{
      id,
      label: windowLabel(id, window.windowMinutes),
      usedPercent: window.usedPercent,
      remainingPercent: Math.max(0, 100 - window.usedPercent),
      windowMinutes: window.windowMinutes ?? null,
      resetsAt: window.resetsAt ?? null,
    }];
  });
}

function payloadEmail(payload: CodexbarPayload | undefined): string | null {
  const email = payload?.usage?.accountEmail ?? payload?.usage?.identity?.accountEmail ?? payload?.account ?? null;
  return email ?? null;
}

interface LaneInput {
  provider: WorkbenchProvider;
  managed: ManagedAccount | undefined;
  windows: UsageWindow[] | undefined;
  payload: CodexbarPayload | undefined;
  updatedAt: string | null | undefined;
  /** Providerweite Limitüberwachung ist ausgeschaltet. */
  monitoringDisabled: boolean | undefined;
  /** Registrierter Account ist bewusst deaktiviert („nicht überwacht"). */
  accountDisabled: boolean | undefined;
  error: { code: string; message: string } | undefined;
  now: number;
}

export function buildTimelineLane(input: LaneInput): UsageTimelineLane {
  const { provider, managed, payload, now } = input;
  const email = managed?.email ?? payloadEmail(payload);
  const windows = input.windows ?? windowsFromPayload(payload);
  const hasUsage = windows.length > 0;
  const accountLabel = managed?.label ?? email ?? (provider === "codex" ? "Codex Account" : provider === "claude" ? "Claude Account" : "OpenCode Go Account");

  let status: UsageTimelineLane["status"];
  let error: UsageTimelineLane["error"];

  if (input.monitoringDisabled) {
    status = "disabled";
    error = { code: "MONITORING_DISABLED", message: "Die Limitüberwachung für diesen Anbieter ist in den Einstellungen deaktiviert." };
  } else if (input.accountDisabled) {
    status = "disabled";
    error = { code: "ACCOUNT_DISABLED", message: "Der Account ist in den Einstellungen deaktiviert." };
  } else if (input.error || !payload) {
    status = "unavailable";
    error = input.error ?? { code: "PROFILE_UNAVAILABLE", message: "Für diesen Account sind keine Limitdaten verfügbar." };
  } else if (payload.error) {
    // Fehler-Payload: Mit Nutzung ist das ein Teilausfall, ohne Nutzung ist
    // der Account schlicht nicht lesbar.
    status = hasUsage ? "partial" : "unavailable";
    error = { code: String(payload.error.code ?? (hasUsage ? "PARTIAL_DATA" : "PROFILE_UNAVAILABLE")), message: payload.error.message ?? (hasUsage ? "Ein Teil der Limitdaten fehlt." : "Für diesen Account sind keine Limitdaten verfügbar.") };
  } else if (!hasUsage) {
    status = "unavailable";
    error = { code: "NO_USAGE_DATA", message: "Für diesen Account liegen keine Limitfenster vor." };
  } else {
    const updatedAt = input.updatedAt ?? payload.usage?.updatedAt ?? null;
    const measuredAt = updatedAt ? Date.parse(updatedAt) : NaN;
    status = Number.isFinite(measuredAt) && now - measuredAt > STALE_AFTER_MILLISECONDS ? "stale" : "available";
    error = status === "stale" ? { code: "STALE_DATA", message: "Diese Limits sind älter als 90 Minuten." } : null;
  }

  return {
    providerId: provider,
    accountId: managed?.id ?? deterministicAccountId(provider, email ?? accountLabel),
    accountLabel,
    email,
    plan: managed?.plan ?? payload?.usage?.loginMethod ?? payload?.usage?.identity?.loginMethod ?? null,
    active: managed?.active ?? false,
    windows,
    resetCredits: [],
    status,
    error,
    updatedAt: payload?.usage?.updatedAt ?? input.updatedAt ?? null,
  };
}

export class UsageTimelineService {
  constructor(private readonly options: {
    accounts: AccountService;
    client: CodexbarClient;
    live: CodexbarUsageService;
    database: UsageDatabase;
    claudeProfileConcurrency?: number;
  }) {}

  async get(): Promise<UsageTimelineResponse> {
    const now = Date.now();
    const live = await this.options.live.getUsage();
    // Bevorzugt die Identitätsauflösung (E-Mail, Plan, aktiver Account); als
    // Fallback nur die Datenbankeinträge, wenn sie scheitert.
    let managed: ManagedAccount[];
    try {
      managed = await this.options.accounts.listWithState();
    } catch {
      managed = this.options.accounts.list();
    }
    const managedByEmail = new Map<string, ManagedAccount>();
    for (const account of managed) {
      if (account.email) managedByEmail.set(account.email.toLowerCase(), account);
    }

    const lanes: UsageTimelineLane[] = [
      ...this.codexLanes(live, managedByEmail, now),
      ...await this.claudeLanes(live, managed, managedByEmail, now),
      ...await this.opencodeLanes(live, managed, managedByEmail, now),
    ];

    return {
      lanes,
      fetchedAt: live.fetchedAt,
      lastSuccessfulFetchAt: live.lastSuccessfulFetchAt ?? live.fetchedAt,
    };
  }

  private codexLanes(live: UsageTimelineLive, managedByEmail: Map<string, ManagedAccount>, now: number): UsageTimelineLane[] {
    const provider = live.providers.find((item) => item.providerId === "codex");
    if (!provider) return [];
    if (provider.status === "disabled") {
      return [...managedByEmail.values()].filter((item) => item.provider === "codex")
        .map((account) => buildTimelineLane({ provider: "codex", managed: account, windows: undefined, payload: undefined, updatedAt: undefined, accountDisabled: undefined, error: undefined, monitoringDisabled: true, now }));
    }
    const lanes: UsageTimelineLane[] = [];
    for (const account of provider.accounts) {
      const managedAccount = account.email ? managedByEmail.get(account.email.toLowerCase()) : undefined;
      lanes.push(buildTimelineLane({
        provider: "codex",
        managed: managedAccount,
        windows: account.windows,
        updatedAt: provider.updatedAt,
        payload: account.windows.length ? { provider: "codex", usage: { accountEmail: account.email ?? undefined, loginMethod: account.plan ?? undefined } } : undefined,
        monitoringDisabled: undefined,
        accountDisabled: undefined,
        error: undefined,
        now,
      }));
    }
    return lanes;
  }

  private async claudeLanes(live: UsageTimelineLive, managed: ManagedAccount[], managedByEmail: Map<string, ManagedAccount>, now: number): Promise<UsageTimelineLane[]> {
    const provider = live.providers.find((item) => item.providerId === "claude");
    const monitoringDisabled = provider?.status === "disabled";
    const lanes: UsageTimelineLane[] = [];

    // 1) Aktiver Kontext: die normale CodexBar-Abfrage (OAuth/CLI des gemeinsamen Homes).
    if (provider && !monitoringDisabled) {
      for (const account of provider.accounts) {
        const managedAccount = account.email ? managedByEmail.get(account.email.toLowerCase()) : undefined;
        lanes.push(buildTimelineLane({
          provider: "claude",
          managed: managedAccount,
          windows: account.windows,
          updatedAt: provider.updatedAt,
          payload: account.windows.length ? { provider: "claude", usage: { accountEmail: account.email ?? undefined, loginMethod: account.plan ?? undefined } } : undefined,
          monitoringDisabled: undefined,
          accountDisabled: undefined,
          error: undefined,
          now,
        }));
      }
    }

    // 2) Registrierte Profile: isolierte Abfrage je Profilpfad. Der aktive
    //    Kontext des gemeinsamen Homes wird nicht umgeschaltet; jeder Pfad
    //    läuft mit eigenem CLAUDE_CONFIG_DIR. Ein Abruf, der denselben Account
    //    wie der aktive Kontext liefert, wird nicht doppelt angelegt.
    const registered = managed.filter((account) => account.provider === "claude");
    const profilePaths = registered.filter((account) => account.enabled).map((account) => account.profilePath);
    if (profilePaths.length > 0 && !monitoringDisabled) {
      const results = await this.options.client.getClaudeUsageForProfiles(profilePaths, this.options.claudeProfileConcurrency);
      const byPath = new Map(results.map((entry) => [entry.profilePath, entry]));
      for (const account of registered.filter((item) => item.enabled)) {
        const entry: ClaudeProfileUsage | undefined = byPath.get(account.profilePath);
        if (!entry) continue;
        const email = payloadEmail(entry.payload);
        if (email && managedByEmail.has(email.toLowerCase()) && lanes.some((lane) => lane.accountId === managedByEmail.get(email.toLowerCase())?.id)) continue;
        lanes.push(buildTimelineLane({ provider: "claude", managed: account, payload: entry.payload, windows: undefined, updatedAt: undefined, monitoringDisabled: undefined, accountDisabled: undefined, error: undefined, now }));
      }
    }

    // 3) Deaktivierte oder nicht erreichbare registrierte Accounts bekommen
    //    trotzdem ihre Lane mit passendem Zustand.
    for (const account of registered) {
      if (lanes.some((lane) => lane.accountId === account.id)) continue;
      lanes.push(buildTimelineLane({
        provider: "claude",
        managed: account,
        windows: undefined,
        payload: undefined,
        updatedAt: undefined,
        error: undefined,
        now,
        accountDisabled: !account.enabled,
        monitoringDisabled: monitoringDisabled ? true : undefined,
      }));
    }
    return lanes;
  }

  private async opencodeLanes(live: UsageTimelineLive, managed: ManagedAccount[], managedByEmail: Map<string, ManagedAccount>, now: number): Promise<UsageTimelineLane[]> {
    const provider = live.providers.find((item) => item.providerId === "opencode");
    const monitoringDisabled = provider?.status === "disabled";
    const lanes: UsageTimelineLane[] = [];

    // Bevorzugt alle Quota-Accounts (Token Accounts aus CodexBar); ohne
    // Token-Accounts liefert CodexBar den Einzelaccount des Provider-Headers.
    let payloads: CodexbarPayload[] = [];
    if (!monitoringDisabled) {
      try {
        payloads = await this.options.client.getOpenCodeGoUsage();
      } catch {
        payloads = [];
      }
    }
    const usable = payloads.filter((payload) => payload.usage);
    if (usable.length === 0 && provider && !monitoringDisabled) {
      for (const account of provider.accounts) {
        const managedAccount = account.email ? managedByEmail.get(account.email.toLowerCase()) : undefined;
        lanes.push(buildTimelineLane({
          provider: "opencode",
          managed: managedAccount,
          windows: account.windows,
          updatedAt: provider.updatedAt,
          payload: account.windows.length ? { provider: "opencodego", usage: { accountEmail: account.email ?? undefined, loginMethod: account.plan ?? undefined } } : undefined,
          monitoringDisabled: undefined,
          accountDisabled: undefined,
          error: undefined,
          now,
        }));
      }
    } else {
      // Ein Quota-Account ohne E-Mail wird dem einzigen registrierten
      // OpenCode-Account zugeordnet — deterministisch über die eindeutige
      // Kombination, nie über eine Array-Position.
      const registeredOpenCode = managed.filter((account) => account.provider === "opencode");
      for (const payload of usable) {
        const email = payloadEmail(payload);
        let managedAccount = email ? managedByEmail.get(email.toLowerCase()) : undefined;
        if (!managedAccount && !email && registeredOpenCode.length === 1 && usable.length === 1) {
          managedAccount = registeredOpenCode[0];
        }
        lanes.push(buildTimelineLane({ provider: "opencode", managed: managedAccount, payload, windows: undefined, updatedAt: undefined, monitoringDisabled: undefined, accountDisabled: undefined, error: undefined, now }));
      }
    }

    // Registrierte OpenCode-Accounts ohne Quota-Credential: eigene Lane mit
    // Zustand statt stillschweigend zu verschwinden.
    for (const account of managedByEmail.values()) {
      if (account.provider !== "opencode") continue;
      if (lanes.some((lane) => lane.accountId === account.id)) continue;
      lanes.push(buildTimelineLane({
        provider: "opencode",
        managed: account,
        windows: undefined,
        payload: undefined,
        updatedAt: undefined,
        error: undefined,
        now,
        accountDisabled: !account.enabled,
        monitoringDisabled: monitoringDisabled ? true : undefined,
      }));
    }
    return lanes;
  }
}

/** Nur die für die Lanes nötigen Felder der bestehenden Live-Usage. */
type UsageTimelineLive = Awaited<ReturnType<CodexbarUsageService["getUsage"]>>;
