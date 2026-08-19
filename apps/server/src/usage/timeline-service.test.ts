import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});
import type { ManagedAccount, UsageResponse } from "@wrapt/contracts";
import { buildTimelineLane, STALE_AFTER_MILLISECONDS, UsageTimelineService } from "./timeline-service.js";
import type { CodexbarClient } from "../adapters/codexbar/codexbar-client.js";
import type { CodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import type { AccountService } from "./account-service.js";
import type { UsageDatabase } from "./database.js";

const NOW = new Date("2026-07-29T10:00:00Z");

function managed(over: Partial<ManagedAccount> = {}): ManagedAccount {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    provider: "codex",
    label: "Privat",
    email: "privat@example.com",
    profilePath: "/home/test/.codex-privat",
    source: "local",
    enabled: true,
    active: true,
    plan: "plus",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

function liveResponse(over: Partial<UsageResponse> = {}): UsageResponse {
  return {
    providers: [],
    fetchedAt: NOW.toISOString(),
    lastSuccessfulFetchAt: NOW.toISOString(),
    cached: false,
    ...over,
  };
}

/** Damit die "stale"-Schwelle im Test nicht greift: jetzt + frische updatedAt. */
function fresh(updatedAt = NOW.toISOString()): string {
  return updatedAt;
}

function createService(options: {
  accounts?: Partial<AccountService>;
  client?: Partial<CodexbarClient>;
  live?: CodexbarUsageService;
  database?: Partial<UsageDatabase>;
  ttlMilliseconds?: number;
}) {
  const accounts = {
    list: () => [],
    listWithState: vi.fn().mockResolvedValue([]),
    ...options.accounts,
  } as AccountService;
  const client = {
    getClaudeUsageForProfiles: vi.fn().mockResolvedValue([]),
    getOpenCodeGoUsage: vi.fn().mockResolvedValue([]),
    ...options.client,
  } as CodexbarClient;
  const live = options.live ?? ({ getUsage: vi.fn().mockResolvedValue(liveResponse()), invalidate: vi.fn() } as CodexbarUsageService);
  const database = { resetCredits: () => ({}), ...options.database } as UsageDatabase;
  return new UsageTimelineService({ accounts, client, live, database, ...(options.ttlMilliseconds ? { ttlMilliseconds: options.ttlMilliseconds } : {}) });
}

describe("UsageTimelineService", () => {
  it("baut für jeden Codex-Account des Live-Abrufs eine Lane mit stabiler Zuordnung", async () => {
    const service = createService({
      accounts: {
        listWithState: vi.fn().mockResolvedValue([
          managed({ id: "a1", label: "Privat", email: "privat@example.com", plan: "plus", active: true }),
          managed({ id: "a2", label: "Arbeit", email: "arbeit@example.com", plan: "team", active: false }),
        ]),
      },
      live: {
        getUsage: vi.fn().mockResolvedValue(liveResponse({
          providers: [{
            providerId: "codex",
            providerName: "Codex",
            status: "available",
            updatedAt: fresh(),
            error: null,
            accounts: [
              { id: "codex-1", label: "Account", email: "privat@example.com", plan: "plus", windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 60, remainingPercent: 40, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" }] },
              { id: "codex-2", label: "Account", email: "arbeit@example.com", plan: "team", windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 90, remainingPercent: 10, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" }] },
            ],
          }],
        })),
      } as unknown as CodexbarUsageService,
    });

    const result = await service.get();
    expect(result.lanes).toHaveLength(2);
    const privat = result.lanes.find((lane) => lane.accountId === "a1");
    const arbeit = result.lanes.find((lane) => lane.accountId === "a2");
    expect(privat).toMatchObject({ providerId: "codex", accountLabel: "Privat", email: "privat@example.com", active: true, status: "available" });
    expect(privat?.windows).toEqual([expect.objectContaining({ remainingPercent: 40 })]);
    expect(arbeit).toMatchObject({ accountLabel: "Arbeit", active: false, status: "available" });
  });

  it("liefert Claude-Lanes aus aktiven Kontext und isolierten Profilabfragen ohne doppelte Identität", async () => {
    const service = createService({
      accounts: {
        listWithState: vi.fn().mockResolvedValue([
          managed({ id: "c1", provider: "claude", label: "Alice", email: "alice@example.com", plan: "pro", profilePath: "/home/test/.wrapt-profiles/claude/alice", active: false }),
        ]),
      },
      client: {
        getClaudeUsageForProfiles: vi.fn().mockResolvedValue([
          {
            profilePath: "/home/test/.wrapt-profiles/claude/alice",
            payload: { provider: "claude", source: "oauth", usage: { accountEmail: "alice@example.com", loginMethod: "pro", secondary: { usedPercent: 34, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" } } },
          },
        ]),
      },
      live: {
        getUsage: vi.fn().mockResolvedValue(liveResponse({
          providers: [{
            providerId: "claude",
            providerName: "Claude Code",
            status: "available",
            updatedAt: fresh(),
            error: null,
            accounts: [
              { id: "claude-1", label: "Alice", email: "alice@example.com", plan: "pro", windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 34, remainingPercent: 66, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" }] },
            ],
          }],
        })),
      } as unknown as CodexbarUsageService,
    });

    const result = await service.get();
    // Der isolierte Profilabruf liefert dieselbe Identität wie der aktive
    // Kontext: Es entsteht genau eine Lane für Alice.
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0]).toMatchObject({ providerId: "claude", accountId: "c1", accountLabel: "Alice", status: "available" });
  });

  it("isoliert einen kaputten Claude-Account: seine Lane ist unavailable, die anderen bleiben", async () => {
    const service = createService({
      accounts: {
        listWithState: vi.fn().mockResolvedValue([
          managed({ id: "c1", provider: "claude", label: "Alice", email: "alice@example.com", profilePath: "/home/test/profiles/alice" }),
          managed({ id: "c2", provider: "claude", label: "Bob", email: "bob@example.com", profilePath: "/home/test/profiles/bob" }),
        ]),
      },
      client: {
        getClaudeUsageForProfiles: vi.fn().mockResolvedValue([
          {
            profilePath: "/home/test/profiles/alice",
            payload: { provider: "claude", source: "oauth", usage: { accountEmail: "alice@example.com", secondary: { usedPercent: 10, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" } } },
          },
          {
            profilePath: "/home/test/profiles/bob",
            payload: { provider: "claude", source: "cli", error: { code: "PROFILE_UNAVAILABLE", message: "Für dieses Claude-Profil sind keine Limitdaten verfügbar." } },
          },
        ]),
      },
      live: {
        getUsage: vi.fn().mockResolvedValue(liveResponse({
          providers: [{
            providerId: "claude",
            providerName: "Claude Code",
            status: "available",
            updatedAt: fresh(),
            error: null,
            accounts: [],
          }],
        })),
      } as unknown as CodexbarUsageService,
    });

    const result = await service.get();
    expect(result.lanes).toHaveLength(2);
    const alice = result.lanes.find((lane) => lane.accountId === "c1");
    const bob = result.lanes.find((lane) => lane.accountId === "c2");
    expect(alice?.status).toBe("available");
    expect(bob?.status).toBe("unavailable");
    expect(bob?.error?.code).toBe("PROFILE_UNAVAILABLE");
  });

  it("nutzt für OpenCode Go bevorzugt alle Quota-Accounts mit stabilen IDs", async () => {
    const service = createService({
      accounts: {
        listWithState: vi.fn().mockResolvedValue([]),
      },
      client: {
        getOpenCodeGoUsage: vi.fn().mockResolvedValue([
          { provider: "opencodego", source: "web", usage: { accountEmail: "one@example.com", secondary: { usedPercent: 61, windowMinutes: 10_080, resetsAt: "2026-08-10T00:00:00Z" } } },
          { provider: "opencodego", source: "web", usage: { accountEmail: "two@example.com", secondary: { usedPercent: 20, windowMinutes: 10_080, resetsAt: "2026-08-10T00:00:00Z" } } },
        ]),
      },
      live: {
        getUsage: vi.fn().mockResolvedValue(liveResponse()),
      } as unknown as CodexbarUsageService,
    });

    const result = await service.get();
    expect(result.lanes).toHaveLength(2);
    const one = result.lanes.find((lane) => lane.email === "one@example.com");
    const two = result.lanes.find((lane) => lane.email === "two@example.com");
    expect(one?.status).toBe("available");
    expect(one?.providerId).toBe("opencode");
    expect(two?.status).toBe("available");
    // Deterministische IDs statt Array-Position: zweimal derselbe Abruf ergibt dieselbe ID.
    const again = await service.get();
    expect(again.lanes.find((lane) => lane.email === "one@example.com")?.accountId).toBe(one?.accountId);
  });

  it("fällt ohne OpenCode-Token-Accounts auf den Einzelaccount des Caches zurück", async () => {
    const service = createService({
      accounts: {
        listWithState: vi.fn().mockResolvedValue([
          managed({ id: "o1", provider: "opencode", label: "OpenCode Go", email: "go@example.com", profilePath: "/home/test/opencode", active: true }),
        ]),
      },
      client: {
        getOpenCodeGoUsage: vi.fn().mockResolvedValue([]),
      },
      live: {
        getUsage: vi.fn().mockResolvedValue(liveResponse({
          providers: [{
            providerId: "opencode",
            providerName: "OpenCode Go",
            status: "available",
            updatedAt: fresh(),
            error: null,
            accounts: [
              { id: "opencode-1", label: "OpenCode Go", email: "go@example.com", plan: null, windows: [{ id: "tertiary", label: "Monatslimit", usedPercent: 45, remainingPercent: 55, windowMinutes: 43_200, resetsAt: "2026-08-22T04:05:14Z" }] },
            ],
          }],
        })),
      } as unknown as CodexbarUsageService,
    });

    const result = await service.get();
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0]).toMatchObject({ providerId: "opencode", accountId: "o1", status: "available", windows: [expect.objectContaining({ remainingPercent: 55 })] });
  });

  it("markiert einen deaktivierten registrierten Account als disabled, ohne ihn abzufragen", async () => {
    const service = createService({
      accounts: {
        listWithState: vi.fn().mockResolvedValue([
          managed({ id: "c1", provider: "claude", label: "Alice", email: "alice@example.com", enabled: false }),
        ]),
      },
      client: {
        getClaudeUsageForProfiles: vi.fn().mockResolvedValue([]),
      },
      live: {
        getUsage: vi.fn().mockResolvedValue(liveResponse({
          providers: [{
            providerId: "claude",
            providerName: "Claude Code",
            status: "available",
            updatedAt: fresh(),
            error: null,
            accounts: [],
          }],
        })),
      } as unknown as CodexbarUsageService,
    });

    const result = await service.get();
    expect(result.lanes).toHaveLength(1);
    expect(result.lanes[0]).toMatchObject({ status: "disabled", accountId: "c1" });
    expect(service["options"].client.getClaudeUsageForProfiles).not.toHaveBeenCalledWith(expect.arrayContaining(["/home/test/.codex-privat"]));
  });

  it("liest die Usage nie über eine Aktivierung: listWithState wird gerufen, activate nie", async () => {
    const listWithState = vi.fn().mockResolvedValue([]);
    const service = createService({ accounts: { listWithState } });
    await service.get();
    expect(listWithState).toHaveBeenCalledTimes(1);
  });

  it("liefert lastSuccessfulFetchAt aus dem Live-Abruf", async () => {
    const service = createService({});
    const result = await service.get();
    expect(result.lastSuccessfulFetchAt).toBe(NOW.toISOString());
    expect(result.lanes).toEqual([]);
  });

  it("liefert beim zweiten get() den Cache, ohne erneut abzufragen", async () => {
    const listWithState = vi.fn().mockResolvedValue([]);
    const service = createService({ accounts: { listWithState } });
    await service.get();
    const first = listWithState.mock.calls.length;

    const again = await service.get();
    expect(again.lanes).toEqual([]);
    expect(listWithState.mock.calls.length).toBe(first);
  });

  it("liefert nach TTL-Ablauf sofort den letzten Stand und lädt im Hintergrund nach", async () => {
    const listWithState = vi.fn().mockResolvedValue([]);
    const service = createService({ accounts: { listWithState }, ttlMilliseconds: 60_000 });
    await service.get();
    const first = listWithState.mock.calls.length;

    await vi.advanceTimersByTimeAsync(60_001);
    const stale = await service.get();
    expect(stale.lanes).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(listWithState.mock.calls.length).toBeGreaterThan(first);
  });

  it("start() wärmt den Cache im Hintergrund, ohne dass get() noch einmal lädt", async () => {
    const listWithState = vi.fn().mockResolvedValue([]);
    const service = createService({ accounts: { listWithState } });
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(listWithState).toHaveBeenCalled();

    const result = await service.get();
    expect(result.lanes).toEqual([]);
    expect(listWithState.mock.calls.length).toBe(1);
  });
});

describe("buildTimelineLane", () => {
  const now = NOW.getTime();

  it("stuft frische Daten als available ein", () => {
    const lane = buildTimelineLane({
      provider: "codex",
      managed: undefined,
      payload: { provider: "codex", usage: { accountEmail: "a@b.de", updatedAt: new Date(now).toISOString(), secondary: { usedPercent: 10, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" } } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    expect(lane.status).toBe("available");
    expect(lane.windows[0]).toEqual(expect.objectContaining({ usedPercent: 10, remainingPercent: 90 }));
  });

  it("stuft alte Daten als stale ein", () => {
    const lane = buildTimelineLane({
      provider: "codex",
      managed: undefined,
      payload: { provider: "codex", usage: { accountEmail: "a@b.de", updatedAt: new Date(now - STALE_AFTER_MILLISECONDS - 1).toISOString(), secondary: { usedPercent: 10, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" } } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    expect(lane.status).toBe("stale");
    expect(lane.error?.code).toBe("STALE_DATA");
  });

  it("stuft Payloads mit Fehler und Nutzung als partial ein", () => {
    const lane = buildTimelineLane({
      provider: "claude",
      managed: undefined,
      payload: { provider: "claude", error: { code: 1, message: "Teilweise kaputt" }, usage: { accountEmail: "a@b.de", secondary: { usedPercent: 10, windowMinutes: 10_080, resetsAt: "2026-08-01T20:00:00Z" } } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    expect(lane.status).toBe("partial");
    expect(lane.error?.message).toBe("Teilweise kaputt");
  });

  it("leitet die deterministische ID aus Provider, E-Mail oder Label ab — nicht aus Position", () => {
    const a = buildTimelineLane({
      provider: "opencode",
      managed: undefined,
      payload: { provider: "opencodego", usage: { accountEmail: "x@y.de" } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    const b = buildTimelineLane({
      provider: "opencode",
      managed: undefined,
      payload: { provider: "opencodego", usage: { accountEmail: "x@y.de" } },
      windows: undefined,
      updatedAt: undefined,
      monitoringDisabled: undefined,
      accountDisabled: undefined,
      error: undefined,
      now,
    });
    expect(a.accountId).toBe(b.accountId);
    expect(a.accountId.startsWith("opencode-")).toBe(true);
  });
});
