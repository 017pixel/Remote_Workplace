import type { UsageTimelineLane } from "@wrapt/contracts";
import { buildTimelineLane, type TimelineLane, type TimelineLimit } from "./quotaTimeline";

/**
 * Zentrale Schwellenwerte und reine View-Logik für die Limit-Ansicht.
 * Filter und Sortierung laufen ausschließlich clientseitig aus den
 * bestehenden Timeline-Lanes — keine neuen API-Abfragen.
 */

/** Feste kritische Schwelle; die Warnschwelle ist konfigurierbar (10/20/30 %). */
export const CRITICAL_THRESHOLD = 10;

export type LimitLevel = "high" | "medium" | "low" | "critical";

export function limitLevel(remaining: number, warningThreshold: number): LimitLevel {
  if (remaining <= CRITICAL_THRESHOLD) return "critical";
  if (remaining < warningThreshold) return "low";
  if (remaining < 50) return "medium";
  return "high";
}

/** Die fünf Minuten- und Stundenwerte als kompakte Label. */
const windowLabelShort: Record<string, string> = {
  "5-Stunden-Limit": "5 Std.",
  Wochenlimit: "Woche",
  Monatslimit: "Monat",
};

export function shortWindowLabel(label: string): string {
  return windowLabelShort[label] ?? label;
}

export interface AccountLimitView {
  /** Original-Lane aus der API (enthält alle Fenster samt Resetzeiten). */
  apiLane: UsageTimelineLane;
  /** Abgeleitete Timeline-Lane (Status, aktiver Account, Limits). */
  lane: TimelineLane;
  /** Primäre Fenster (5h, Woche, Monat) mit kompakten Labeln, sofern vorhanden. */
  limits: TimelineLimit[];
  /** Kleinster verbleibender Prozentwert über alle Fenster, oder null. */
  lowestRemaining: number | null;
  /** Zustands-Level des Accounts über das niedrigste Limit. */
  level: LimitLevel | null;
  /** Resetzeit des Fensters mit dem niedrigsten Limit, oder null. */
  urgentResetsAtMs: number | null;
  hasData: boolean;
}

/** Vollständige Anreicherung: niedrigstes Limit + Reset des niedrigsten Fensters. */
export function accountLimitViews(apiLanes: UsageTimelineLane[], warningThreshold: number): AccountLimitView[] {
  return apiLanes.map((apiLane) => {
    const lane = buildTimelineLane(apiLane);
    const limits = lane.limits;
    const lowest = limits.length > 0 ? Math.min(...limits.map((limit) => limit.remaining)) : null;
    let urgentResetsAtMs: number | null = null;
    if (lowest !== null) {
      const lowestWindow = apiLane.windows.find((window) => window.remainingPercent === lowest);
      if (lowestWindow?.resetsAt) urgentResetsAtMs = Date.parse(lowestWindow.resetsAt);
    }
    return {
      apiLane,
      lane,
      limits,
      lowestRemaining: lowest,
      level: lowest === null ? null : limitLevel(lowest, warningThreshold),
      urgentResetsAtMs,
      hasData: limits.length > 0,
    };
  });
}

/** Anzahl Accounts mit einem echten Limit unter der Warnschwelle. */
export function countLowAccounts(lanes: TimelineLane[], warningThreshold: number): number {
  return lanes.filter((lane) => {
    const lowest = lane.limits.length > 0 ? Math.min(...lane.limits.map((limit) => limit.remaining)) : null;
    return lowest !== null && lowest < warningThreshold;
  }).length;
}

/** Nächster anstehender Reset über alle Accounts, oder null. */
export function nextReset(lanes: TimelineLane[], now: number): number | null {
  let best: number | null = null;
  for (const lane of lanes) {
    if (lane.anchorMs === null || lane.anchorMs <= now) continue;
    if (best === null || lane.anchorMs < best) best = lane.anchorMs;
  }
  return best;
}

/** Nächster Reset über ALLE Fenster aller API-Lanes — für die Statuszeile. */
export function nextResetFromApi(apiLanes: UsageTimelineLane[], now: number): number | null {
  let best: number | null = null;
  for (const lane of apiLanes) {
    for (const window of lane.windows) {
      if (!window.resetsAt) continue;
      const at = Date.parse(window.resetsAt);
      if (!Number.isFinite(at) || at <= now) continue;
      if (best === null || at < best) best = at;
    }
  }
  return best;
}

/**
 * Der sinnvollste verfügbare Account: der mit dem höchsten niedrigsten
 * Limit — also der meiste Restkapazität über alle Fenster hinweg. Accounts
 * ohne verlässliche Daten (kein Limitwert) werden nie bevorzugt.
 */
export function bestAvailableAccount(lanes: TimelineLane[]): TimelineLane | null {
  let best: TimelineLane | null = null;
  let bestLowest = -1;
  for (const lane of lanes) {
    if (lane.status === "unavailable" || lane.status === "disabled" || lane.status === "stale") continue;
    if (lane.limits.length === 0) continue;
    const lowest = Math.min(...lane.limits.map((limit) => limit.remaining));
    if (lowest > bestLowest) {
      best = lane;
      bestLowest = lowest;
    }
  }
  return best;
}

/** Kompakte Statuszeile: „8 Accounts · 2 niedrig · nächster Reset in 2h 14m". */
export function summaryLine(apiLanes: UsageTimelineLane[], lanes: TimelineLane[], now: number, warningThreshold: number): { accounts: number; low: number; nextResetAt: number | null; updatedAt: string | null } {
  return {
    accounts: lanes.length,
    low: countLowAccounts(lanes, warningThreshold),
    nextResetAt: nextResetFromApi(apiLanes, now),
    updatedAt: lanes.map((lane) => lane.updatedAt).find((value): value is string => value !== null) ?? null,
  };
}

/** Zeit bis zum nächsten Reset als „2h 14m" — ab drei Tagen „6 Tagen". */
export function formatCountdown(ms: number, now: number): string {
  const delta = Math.max(0, ms - now);
  const minutes = Math.floor(delta / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 3) return `${days} Tagen`;
  const restMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${restMinutes}m`;
  return `${restMinutes}m`;
}

/* ------------------------------- Filter ------------------------------- */

export interface UsageFilterState {
  providerFilter: "all" | TimelineLane["providerId"];
  onlyActive: boolean;
  onlyProblematic: boolean;
  hideAccountsWithoutData: boolean;
  hiddenAccountIds: string[];
  warningThreshold: number;
}

export function filterLanes(lanes: TimelineLane[], filter: UsageFilterState): TimelineLane[] {
  return lanes.filter((lane) => {
    if (filter.providerFilter !== "all" && lane.providerId !== filter.providerFilter) return false;
    if (filter.onlyActive && !lane.active) return false;
    if (filter.onlyProblematic) {
      const level = lane.limits.length > 0 ? limitLevel(Math.min(...lane.limits.map((limit) => limit.remaining)), filter.warningThreshold) : null;
      // Problematsch: kritisches/niedriges Limit oder ein Account ohne Daten.
      if (level === "low" || level === "critical") return true;
      if (lane.status === "unavailable" || lane.status === "disabled") return true;
      return false;
    }
    if (filter.hiddenAccountIds.includes(lane.accountId)) return false;
    if (filter.hideAccountsWithoutData && lane.limits.length === 0) return false;
    return true;
  });
}

/* ------------------------------ Sortierung ------------------------------ */

export type UsageSortBy = "default" | "provider" | "name" | "lowest" | "nextReset" | "status";

const providerOrder: Record<TimelineLane["providerId"], number> = { codex: 0, claude: 1, opencode: 2 };

/** Sortierung nach Vorgabe; "default" = aktiver zuerst, dann niedrigstes Limit. */
export function sortLanes(lanes: TimelineLane[], sortBy: UsageSortBy): TimelineLane[] {
  const lowestOf = (lane: TimelineLane) => (lane.limits.length > 0 ? Math.min(...lane.limits.map((limit) => limit.remaining)) : Number.POSITIVE_INFINITY);
  const copy = [...lanes];
  switch (sortBy) {
    case "provider":
      return copy.sort((a, b) => providerOrder[a.providerId] - providerOrder[b.providerId] || a.accountLabel.localeCompare(b.accountLabel, "de"));
    case "name":
      return copy.sort((a, b) => a.accountLabel.localeCompare(b.accountLabel, "de"));
    case "lowest":
      return copy.sort((a, b) => lowestOf(a) - lowestOf(b));
    case "nextReset": {
      const resetOf = (lane: TimelineLane) => lane.anchorMs ?? Number.POSITIVE_INFINITY;
      return copy.sort((a, b) => resetOf(a) - resetOf(b));
    }
    case "status":
      return copy.sort((a, b) => {
        const order: Record<TimelineLane["status"], number> = { available: 0, partial: 1, stale: 2, unavailable: 3, disabled: 4 };
        return order[a.status] - order[b.status] || a.accountLabel.localeCompare(b.accountLabel, "de");
      });
    case "default":
    default:
      return copy.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        const byLowest = lowestOf(a) - lowestOf(b);
        if (byLowest !== 0) return byLowest;
        return providerOrder[a.providerId] - providerOrder[b.providerId] || a.accountLabel.localeCompare(b.accountLabel, "de");
      });
  }
}

/** Gruppenstruktur für die optionale Provider-Gruppierung. */
export function groupLanesByProvider(lanes: TimelineLane[]): Array<{ provider: TimelineLane["providerId"]; lanes: TimelineLane[] }> {
  const groups = new Map<TimelineLane["providerId"], TimelineLane[]>();
  for (const lane of lanes) {
    const list = groups.get(lane.providerId) ?? [];
    list.push(lane);
    groups.set(lane.providerId, list);
  }
  return (["codex", "claude", "opencode"] as const)
    .filter((provider) => groups.has(provider))
    .map((provider) => ({ provider, lanes: groups.get(provider)! }));
}
