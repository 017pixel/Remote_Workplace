import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  buildTimelineLane,
  countLanesBelow,
  laneHasWindow,
  nextWindowResetMs,
  pickLaneWindow,
  projectLane,
  projectResetCredits,
  startOfDay,
  startOfWeek,
  timelineSpan,
  windowsIn,
  type TimelineLane,
} from "./quotaTimeline";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).getTime();

function apiLane(over: Partial<Parameters<typeof buildTimelineLane>[0]> = {}): Parameters<typeof buildTimelineLane>[0] {
  return {
    providerId: "codex",
    accountId: "codex-1",
    accountLabel: "Privat",
    email: "privat@example.com",
    plan: "plus",
    active: true,
    windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 60, remainingPercent: 40, windowMinutes: 10_080, resetsAt: "2026-07-19T20:00:00Z" }],
    resetCredits: [],
    status: "available",
    error: null,
    updatedAt: "2026-07-19T10:00:00Z",
    ...over,
  } as Parameters<typeof buildTimelineLane>[0];
}

function lane(over: Partial<TimelineLane> = {}): TimelineLane {
  return {
    providerId: "claude",
    accountId: "claude-1",
    accountLabel: "Alice",
    email: "alice@example.com",
    plan: "pro",
    active: false,
    status: "available",
    error: null,
    anchorMs: at(2026, 6, 29, 20),
    periodHours: 24 * 7,
    remaining: 40,
    limits: [{ label: "7d", remaining: 40 }],
    resetCredits: [],
    updatedAt: null,
    ...over,
  };
}

describe("windowsIn", () => {
  it("projiziert rückwärts und vorwärts vom Anker", () => {
    const anchor = at(2026, 6, 29, 12);
    const from = anchor - 2.5 * DAY_MS;
    const to = anchor + 1.5 * DAY_MS;
    const windows = windowsIn(anchor, DAY_MS, from, to);
    expect(windows.length).toBe(5);
    for (const window of windows) {
      expect(((window.endMs - anchor) % DAY_MS) + 0).toBe(0);
      expect(window.endMs - window.startMs).toBe(DAY_MS);
    }
    expect(windows.some((w) => w.startMs <= anchor && w.endMs >= anchor)).toBe(true);
    expect(windows[0]!.startMs).toBeLessThanOrEqual(from);
    expect(windows.at(-1)!.endMs).toBeGreaterThanOrEqual(to);
  });

  it("deckt den Bereich lückenlos und überlappungsfrei ab", () => {
    const windows = windowsIn(at(2026, 6, 29), 5 * HOUR_MS, at(2026, 6, 28), at(2026, 6, 30));
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i]!.startMs).toBe(windows[i - 1]!.endMs);
    }
  });

  it("lehnt entartete Anker, Perioden und Bereiche ab", () => {
    expect(windowsIn(1000, 0, 0, 5000)).toEqual([]);
    expect(windowsIn(NaN, 1000, 0, 5000)).toEqual([]);
    expect(windowsIn(1000, 1000, 5000, 5000)).toEqual([]);
  });

  it("bricht ab statt bei absurder Periode endlos zu laufen", () => {
    expect(windowsIn(0, 1, 0, 14 * DAY_MS)).toEqual([]);
  });
});

describe("Bereichsgrenzen", () => {
  it("startOfDay und startOfWeek landen auf lokaler Mitternacht", () => {
    const mid = at(2026, 6, 29, 14, 37);
    expect(new Date(startOfDay(mid)).getHours()).toBe(0);
    expect(new Date(startOfWeek(mid)).getDay()).toBe(0);
    expect(new Date(startOfWeek(mid)).getHours()).toBe(0);
  });

  it("Wochenbereich ist eine Vierzehntage-Spanne ab dem enthaltenen Sonntag", () => {
    const now = at(2026, 6, 29, 14, 0);
    const span = timelineSpan("weekly", 0, now);
    expect(new Date(span.startMs).getDay()).toBe(0);
    expect(span.days).toBe(14);
    expect(span.startMs).toBeLessThanOrEqual(now);
    expect(span.endMs).toBeGreaterThan(now);
  });

  it("Offsets schreiten in Wochen (weekly) und Tagen (session)", () => {
    const now = at(2026, 6, 29, 14, 0);
    const weekly = timelineSpan("weekly", 0, now);
    const weeklyNext = timelineSpan("weekly", 1, now);
    expect(Math.round((weeklyNext.startMs - weekly.startMs) / DAY_MS)).toBe(7);
    const session = timelineSpan("session", 0, now);
    const sessionNext = timelineSpan("session", 1, now);
    expect(Math.round((sessionNext.startMs - session.startMs) / DAY_MS)).toBe(1);
    expect(session.days).toBe(3);
  });

  it("Spanne ist auch über eine DST-Umstellung eine ganze Tageszahl", () => {
    const span = timelineSpan("weekly", 0, at(2026, 2, 10, 12));
    expect(new Date(span.startMs).getHours()).toBe(0);
    expect(new Date(span.endMs).getHours()).toBe(0);
  });
});

describe("projectLane", () => {
  const span = timelineSpan("weekly", 0, at(2026, 6, 29, 12));

  it("klassifiziert vergangene, aktuelle und zukünftige Fenster gegen now", () => {
    const windows = projectLane(lane(), span.startMs, span.endMs, at(2026, 6, 29, 12), "weekly");
    const live = windows.filter((w) => w.state === "live");
    expect(live.length).toBe(1);
    expect(live[0]!.startMs).toBeLessThanOrEqual(at(2026, 6, 29, 12));
    expect(live[0]!.endMs).toBeGreaterThan(at(2026, 6, 29, 12));
    expect(live[0]!.remaining).toBe(40);
    expect(windows.filter((w) => w.state === "past").every((w) => w.endMs <= at(2026, 6, 29, 12))).toBe(true);
    expect(windows.filter((w) => w.state === "next").every((w) => w.startMs > at(2026, 6, 29, 12))).toBe(true);
  });

  it("gibt den Remaining-Wert nach dem gemeldeten Reset nicht an projizierte Fenster weiter", () => {
    const windows = projectLane(lane(), span.startMs, span.endMs, at(2026, 6, 30, 12), "weekly");
    const live = windows.find((w) => w.state === "live");
    expect(live).toBeDefined();
    expect(live!.startMs).toBe(at(2026, 6, 29, 20));
    expect(live!.remaining).toBeNull();
  });

  it("beschneidet Balken am sichtbaren Bereich", () => {
    const windows = projectLane(lane(), span.startMs, span.endMs, at(2026, 6, 29, 12), "weekly");
    for (const window of windows) {
      expect(window.leftPercent).toBeGreaterThanOrEqual(0);
      expect(window.widthPercent).toBeGreaterThan(0);
      expect(window.leftPercent + window.widthPercent).toBeLessThanOrEqual(100.0001);
    }
  });

  it("liefert nichts ohne Anker oder Periode", () => {
    expect(projectLane(lane({ anchorMs: null }), span.startMs, span.endMs, at(2026, 6, 29, 12), "weekly")).toEqual([]);
    expect(projectLane(lane({ periodHours: null }), span.startMs, span.endMs, at(2026, 6, 29, 12), "weekly")).toEqual([]);
  });

  it("projiziert in der Session-Ansicht nur echte 5-Stunden-Fenster", () => {
    const sessionSpan = timelineSpan("session", 0, at(2026, 6, 29, 12));
    expect(projectLane(lane(), sessionSpan.startMs, sessionSpan.endMs, at(2026, 6, 29, 12), "session")).toEqual([]);
    const windows = projectLane(lane({ periodHours: 5 }), sessionSpan.startMs, sessionSpan.endMs, at(2026, 6, 29, 12), "session");
    expect(windows.some((w) => w.endMs - w.startMs === 5 * HOUR_MS)).toBe(true);
  });

  it("projiziert nur unverfallene Reset-Credits innerhalb des Bereichs", () => {
    const now = at(2026, 6, 29, 12);
    const visibleExpiry = at(2026, 7, 2, 12);
    const marks = projectResetCredits(
      lane({
        resetCredits: [
          { id: "expired", grantedAtMs: null, expiresAtMs: now - HOUR_MS },
          { id: "visible", grantedAtMs: now - DAY_MS, expiresAtMs: visibleExpiry },
          { id: "outside", grantedAtMs: now, expiresAtMs: span.endMs + HOUR_MS },
        ],
      }),
      span.startMs,
      span.endMs,
      now,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]!.id).toBe("visible");
    expect(marks[0]!.leftPercent).toBe(((visibleExpiry - span.startMs) / (span.endMs - span.startMs)) * 100);
  });
});

describe("pickLaneWindow", () => {
  it("ignoriert Fenster ohne Reset-Zeitpunkt", () => {
    const chosen = pickLaneWindow<{ resetAtMs?: number | null; periodHours?: number | null }>([
      { resetAtMs: null, periodHours: 168 },
      { resetAtMs: 1000, periodHours: 5 },
      { periodHours: 168 },
    ]);
    expect(chosen?.resetAtMs).toBe(1000);
  });

  it("bevorzugt das längste Fenster, das in die Spanne passt, nicht den frühesten Reset", () => {
    const fiveHour = { resetAtMs: 1_000, periodHours: 5 };
    const weekly = { resetAtMs: 9_000, periodHours: 168 };
    expect(pickLaneWindow([fiveHour, weekly], 14 * 24)).toBe(weekly);
    expect(pickLaneWindow([fiveHour, weekly], 3 * 24)).toBe(fiveHour);
  });

  it("bricht Gleichstände über den frühesten Reset", () => {
    const later = { resetAtMs: 9_000, periodHours: 168 };
    const sooner = { resetAtMs: 5_000, periodHours: 168 };
    expect(pickLaneWindow([later, sooner], 14 * 24)).toBe(sooner);
  });

  it("fällt auf das kürzeste verfügbare Fenster zurück statt nichts zu zeichnen", () => {
    const monthly = { resetAtMs: 5_000, periodHours: 720 };
    expect(pickLaneWindow([monthly], 3 * 24)).toBe(monthly);
  });

  it("liefert null, wenn nichts passt", () => {
    expect(pickLaneWindow([{ resetAtMs: null }])).toBeNull();
    expect(pickLaneWindow([])).toBeNull();
  });
});

describe("buildTimelineLane", () => {
  it("verankert am spannengerechten Fenster und leitet remaining aus remainingPercent ab", () => {
    const soon = new Date("2026-07-19T20:00:00Z").getTime();
    const later = new Date("2026-07-22T20:00:00Z").getTime();
    const api = apiLane({
      windows: [
        { id: "primary", label: "5-Stunden-Limit", usedPercent: 20, remainingPercent: 80, windowMinutes: 300, resetsAt: "2026-07-19T20:00:00Z" },
        { id: "secondary", label: "Wochenlimit", usedPercent: 60, remainingPercent: 40, windowMinutes: 10_080, resetsAt: "2026-07-22T20:00:00Z" },
      ],
    });
    const weekly = buildTimelineLane(api, 14 * 24);
    expect(weekly.anchorMs).toBe(later);
    expect(weekly.periodHours).toBe(168);
    expect(weekly.remaining).toBe(40);
    const session = buildTimelineLane(api, 3 * 24);
    expect(session.anchorMs).toBe(soon);
    expect(session.periodHours).toBe(5);
    expect(session.remaining).toBe(80);
    expect(weekly.limits).toEqual([
      { label: "5-Stunden-Limit", remaining: 80 },
      { label: "Wochenlimit", remaining: 40 },
    ]);
  });

  it("nimmt verfügbare Reset-Credits mit parsebarem Ablaufdatum auf", () => {
    const expiresAt = "2026-08-02T12:00:00Z";
    const built = buildTimelineLane(
      apiLane({
        resetCredits: [
          { id: "credit-1", title: "Full reset", description: "", status: "available", grantedAt: "2026-07-01T12:00:00Z", expiresAt },
          { id: "spent", title: "Full reset", description: "", status: "consumed", grantedAt: "2026-07-01T12:00:00Z", expiresAt },
          { id: "invalid", title: "Full reset", description: "", status: "available", grantedAt: null, expiresAt: null },
        ],
      }),
    );
    expect(built.resetCredits).toEqual([
      { id: "credit-1", grantedAtMs: new Date("2026-07-01T12:00:00Z").getTime(), expiresAtMs: new Date(expiresAt).getTime() },
    ]);
  });

  it("Fenster ohne Reset-Zeitpunkt verankern die Lane nicht", () => {
    const built = buildTimelineLane(apiLane({ windows: [{ id: "primary", label: "5-Stunden-Limit", usedPercent: 50, remainingPercent: 50, windowMinutes: 300, resetsAt: null }] }));
    expect(built.anchorMs).toBeNull();
    expect(laneHasWindow(built)).toBe(false);
  });

  it("behält die Prozent-Semantik: remainingPercent ist verbleibend", () => {
    const built = buildTimelineLane(apiLane({ windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 93, remainingPercent: 7, windowMinutes: 10_080, resetsAt: "2026-07-22T20:00:00Z" }] }));
    expect(built.remaining).toBe(7);
    expect(built.limits[0]).toEqual({ label: "Wochenlimit", remaining: 7 });
  });
});

describe("Aggregationen", () => {
  const now = at(2026, 6, 29, 12);

  it("nextWindowResetMs findet den frühesten zukünftigen Reset", () => {
    const lanes = [
      lane({ anchorMs: at(2026, 6, 30, 8) }),
      lane({ anchorMs: at(2026, 6, 29, 18) }),
      lane({ anchorMs: null }),
    ];
    expect(nextWindowResetMs(lanes, now)).toBe(at(2026, 6, 29, 18));
  });

  it("nextWindowResetMs ignoriert bereits verstrichene Resets", () => {
    expect(nextWindowResetMs([lane({ anchorMs: at(2026, 6, 29, 10) })], now)).toBeNull();
  });

  it("countLanesBelow zählt nur Lanes mit echtem Remaining-Wert", () => {
    const lanes = [
      lane({ remaining: 15 }),
      lane({ remaining: 50 }),
      lane({ remaining: null }),
      lane({ remaining: 0 }),
    ];
    expect(countLanesBelow(lanes, 20)).toBe(2);
  });
});
