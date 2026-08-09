import { describe, expect, it } from "vitest";
import type { TimelineLane } from "./quotaTimeline";
import {
  accountLimitViews,
  bestAvailableAccount,
  countLowAccounts,
  CRITICAL_THRESHOLD,
  filterLanes,
  formatCountdown,
  limitLevel,
  nextReset,
  sortLanes,
  summaryLine,
} from "./usageView";

const at = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h).getTime();

function lane(over: Partial<TimelineLane> = {}): TimelineLane {
  return {
    providerId: "codex",
    accountId: "codex-1",
    accountLabel: "Privat",
    email: "privat@example.com",
    plan: "plus",
    active: false,
    status: "available",
    error: null,
    anchorMs: at(2026, 7, 20, 18),
    periodHours: 168,
    remaining: 40,
    limits: [{ label: "Wochenlimit", remaining: 40 }],
    resetCredits: [],
    updatedAt: "2026-07-19T10:00:00Z",
    ...over,
  };
}

function apiLane(over: Partial<Parameters<typeof accountLimitViews>[0][number]> = {}) {
  return {
    providerId: "codex" as const,
    accountId: "codex-1",
    accountLabel: "Privat",
    email: "privat@example.com",
    plan: "plus",
    active: false,
    windows: [{ id: "secondary" as const, label: "Wochenlimit", usedPercent: 60, remainingPercent: 40, windowMinutes: 10_080, resetsAt: "2026-07-20T18:00:00Z" }],
    resetCredits: [],
    status: "available" as const,
    error: null,
    updatedAt: "2026-07-19T10:00:00Z",
    ...over,
  };
}

describe("limitLevel und Schwellen", () => {
  it("nutzt die zentrale kritische Schwelle von 10 %", () => {
    expect(CRITICAL_THRESHOLD).toBe(10);
    expect(limitLevel(0, 20)).toBe("critical");
    expect(limitLevel(10, 20)).toBe("critical");
    expect(limitLevel(11, 20)).toBe("low");
    expect(limitLevel(19, 20)).toBe("low");
    expect(limitLevel(20, 20)).toBe("medium");
    expect(limitLevel(50, 20)).toBe("high");
  });

  it("reagiert auf eine konfigurierbare Warnschwelle", () => {
    expect(limitLevel(15, 10)).toBe("medium");
    expect(limitLevel(15, 20)).toBe("low");
    expect(limitLevel(15, 30)).toBe("low");
    expect(limitLevel(25, 30)).toBe("low");
    expect(limitLevel(25, 20)).toBe("medium");
  });
});

describe("accountLimitViews", () => {
  it("leitet das niedrigste Limit und dessen Reset ab", () => {
    const views = accountLimitViews([
      apiLane({
        windows: [
          { id: "primary", label: "5-Stunden-Limit", usedPercent: 20, remainingPercent: 80, windowMinutes: 300, resetsAt: "2026-07-19T18:00:00Z" },
          { id: "secondary", label: "Wochenlimit", usedPercent: 85, remainingPercent: 15, windowMinutes: 10_080, resetsAt: "2026-07-20T18:00:00Z" },
        ],
      }),
    ], 20);
    expect(views[0]!.lowestRemaining).toBe(15);
    expect(views[0]!.level).toBe("low");
    expect(views[0]!.urgentResetsAtMs).toBe(at(2026, 6, 20, 18));
    expect(views[0]!.hasData).toBe(true);
  });

  it("markiert Accounts ohne Limits als ohne Daten", () => {
    const views = accountLimitViews([apiLane({ windows: [] })], 20);
    expect(views[0]!.lowestRemaining).toBeNull();
    expect(views[0]!.hasData).toBe(false);
    expect(views[0]!.level).toBeNull();
  });
});

describe("countLowAccounts und summaryLine", () => {
  const lanes = [
    lane({ limits: [{ label: "Wochenlimit", remaining: 15 }] }),
    lane({ limits: [{ label: "Wochenlimit", remaining: 60 }] }),
    lane({ limits: [] }),
    lane({ limits: [{ label: "Wochenlimit", remaining: 5 }] }),
  ];

  it("zählt nur Accounts mit echtem Limit unter der Schwelle", () => {
    expect(countLowAccounts(lanes, 20)).toBe(2);
    expect(countLowAccounts(lanes, 10)).toBe(1);
  });

  it("baut die kompakte Statuszeile und nutzt den nächsten Reset über alle Fenster", () => {
    const api = [
      apiLane({ accountId: "a", windows: [{ id: "primary", label: "5-Stunden-Limit", usedPercent: 90, remainingPercent: 10, windowMinutes: 300, resetsAt: "2026-08-19T18:00:00Z" }] }),
      apiLane({ accountId: "b", windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 40, remainingPercent: 60, windowMinutes: 10_080, resetsAt: "2026-08-22T18:00:00Z" }] }),
    ];
    const summary = summaryLine(api, lanes, Date.parse("2026-08-19T12:00:00Z"), 20);
    expect(summary.accounts).toBe(4);
    expect(summary.low).toBe(2);
    // Das 5-Stunden-Fenster von a resetet früher als das Wochenfenster von b.
    expect(summary.nextResetAt).toBe(Date.parse("2026-08-19T18:00:00Z"));
  });

  it("findet den nächsten Reset nur in der Zukunft", () => {
    expect(nextReset([lane({ anchorMs: at(2026, 7, 18, 9) })], at(2026, 7, 19, 12))).toBeNull();
    expect(nextReset([lane({ anchorMs: at(2026, 7, 21, 9) })], at(2026, 7, 19, 12))).toBe(at(2026, 7, 21, 9));
  });
});

describe("bestAvailableAccount", () => {
  it("bevorzugt den Account mit dem höchsten niedrigsten Limit", () => {
    const lanes = [
      lane({ accountId: "a", accountLabel: "Knapp", limits: [{ label: "Wochenlimit", remaining: 12 }] }),
      lane({ accountId: "b", accountLabel: "Reichlich", limits: [{ label: "Wochenlimit", remaining: 96 }] }),
      lane({ accountId: "c", accountLabel: "Mittel", limits: [{ label: "Wochenlimit", remaining: 50 }] }),
    ];
    expect(bestAvailableAccount(lanes)?.accountId).toBe("b");
  });

  it("ignoriert Accounts ohne verlässliche Daten", () => {
    const lanes = [
      lane({ accountId: "ok", limits: [{ label: "Wochenlimit", remaining: 80 }] }),
      lane({ accountId: "leer", limits: [] }),
      lane({ accountId: "kaputt", status: "unavailable", limits: [{ label: "Wochenlimit", remaining: 100 }] }),
    ];
    expect(bestAvailableAccount(lanes)?.accountId).toBe("ok");
  });

  it("liefert null, wenn kein Account nutzbar ist", () => {
    expect(bestAvailableAccount([])).toBeNull();
    expect(bestAvailableAccount([lane({ limits: [] })])).toBeNull();
  });
});

describe("filterLanes", () => {
  const lanes = [
    lane({ accountId: "a", providerId: "codex", active: true, limits: [{ label: "Wochenlimit", remaining: 15 }] }),
    lane({ accountId: "b", providerId: "claude", active: false, limits: [{ label: "Wochenlimit", remaining: 60 }] }),
    lane({ accountId: "c", providerId: "opencode", active: false, limits: [] }),
  ];

  it("filtert nach Provider", () => {
    const filtered = filterLanes(lanes, { providerFilter: "claude", onlyActive: false, onlyProblematic: false, hideAccountsWithoutData: false, hiddenAccountIds: [], warningThreshold: 20 });
    expect(filtered.map((item) => item.accountId)).toEqual(["b"]);
  });

  it("filtert nach aktivem Account", () => {
    const filtered = filterLanes(lanes, { providerFilter: "all", onlyActive: true, onlyProblematic: false, hideAccountsWithoutData: false, hiddenAccountIds: [], warningThreshold: 20 });
    expect(filtered.map((item) => item.accountId)).toEqual(["a"]);
  });

  it("filtert problematische Accounts (niedriges oder kritisches Limit)", () => {
    const filtered = filterLanes(lanes, { providerFilter: "all", onlyActive: false, onlyProblematic: true, hideAccountsWithoutData: false, hiddenAccountIds: [], warningThreshold: 20 });
    // Nur a (15 %) ist niedrig; c ohne Daten ist nicht „problematisch“.
    expect(filtered.map((item) => item.accountId)).toEqual(["a"]);
  });

  it("blendet Accounts ohne Daten aus", () => {
    const filtered = filterLanes(lanes, { providerFilter: "all", onlyActive: false, onlyProblematic: false, hideAccountsWithoutData: true, hiddenAccountIds: [], warningThreshold: 20 });
    expect(filtered.map((item) => item.accountId)).toEqual(["a", "b"]);
  });

  it("respektiert explizit ausgeblendete Account-IDs", () => {
    const filtered = filterLanes(lanes, { providerFilter: "all", onlyActive: false, onlyProblematic: false, hideAccountsWithoutData: false, hiddenAccountIds: ["b"], warningThreshold: 20 });
    expect(filtered.map((item) => item.accountId)).toEqual(["a", "c"]);
  });
});

describe("sortLanes", () => {
  const lanes = [
    lane({ accountId: "a", accountLabel: "Arbeit", providerId: "codex", active: false, limits: [{ label: "Wochenlimit", remaining: 90 }], anchorMs: at(2026, 7, 22, 9) }),
    lane({ accountId: "b", accountLabel: "Privat", providerId: "codex", active: true, limits: [{ label: "Wochenlimit", remaining: 30 }], anchorMs: at(2026, 7, 20, 9) }),
    lane({ accountId: "c", accountLabel: "Claude-Konto", providerId: "claude", active: false, limits: [{ label: "Wochenlimit", remaining: 60 }], anchorMs: at(2026, 7, 21, 9) }),
  ];

  it("sortiert im Default aktive zuerst, dann niedrigstes Limit", () => {
    const sorted = sortLanes(lanes, "default");
    // b ist aktiv; danach das niedrigste Limit (c mit 60 vor a mit 90).
    expect(sorted.map((item) => item.accountId)).toEqual(["b", "c", "a"]);
  });

  it("sortiert nach niedrigstem Restlimit", () => {
    const sorted = sortLanes(lanes, "lowest");
    expect(sorted.map((item) => item.accountId)).toEqual(["b", "c", "a"]);
  });

  it("sortiert nach nächstem Reset", () => {
    const sorted = sortLanes(lanes, "nextReset");
    expect(sorted.map((item) => item.accountId)).toEqual(["b", "c", "a"]);
  });

  it("sortiert nach Provider", () => {
    const sorted = sortLanes(lanes, "provider");
    expect(sorted[0]!.providerId).toBe("codex");
    expect(sorted[2]!.providerId).toBe("claude");
  });

  it("sortiert nach Status", () => {
    const mixed = [
      lane({ accountId: "kaputt", status: "unavailable" }),
      lane({ accountId: "veraltet", status: "stale" }),
      lane({ accountId: "frisch", status: "available" }),
    ];
    expect(sortLanes(mixed, "status").map((item) => item.accountId)).toEqual(["frisch", "veraltet", "kaputt"]);
  });
});

describe("formatCountdown", () => {
  it("formatiert minuten- und stundenaufgelöst", () => {
    const now = at(2026, 7, 19, 12);
    expect(formatCountdown(now + 3_600_000 * 2 + 60_000 * 14, now)).toBe("2h 14m");
    expect(formatCountdown(now + 60_000 * 42, now)).toBe("42m");
  });
});
