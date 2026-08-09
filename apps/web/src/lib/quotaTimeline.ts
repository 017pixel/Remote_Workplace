import type { UsageTimelineLane as ApiTimelineLane, UsageTimelineStatus, UsageWindow } from "@workbench/contracts";

/**
 * Quota-Timeline: Lanes und Fensterprojektion.
 *
 * Pure Funktionen über den bestehenden Usage-Daten — kein React, keine eigene
 * Uhr (`now` wird immer übergeben), dadurch direkt testbar. Das Modell ist an
 * der QuotaTimeline aus dem MIT-Projekt "Cli-Proxy-API-Management-Center"
 * (Router-for.ME) orientiert, nutzt aber ausschließlich die UsageWindow- und
 * UsageTimelineLane-Strukturen von Remote_Workplace und rechnet in
 * Millisekunden statt in Prozent-Brüchen.
 */

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
const SESSION_PERIOD_HOURS = 5;

/** Wochenansicht: 14 Tage ab Wochenbeginn. 5-Stunden-Ansicht: ca. drei Tage. */
export type TimelineMode = "weekly" | "session";

export const TIMELINE_SPAN_DAYS: Record<TimelineMode, number> = {
  weekly: 14,
  session: 3,
};

export interface TimelineLimit {
  label: string;
  remaining: number;
}

export interface TimelineResetCredit {
  id: string;
  grantedAtMs: number | null;
  expiresAtMs: number;
}

export interface TimelineResetCreditMark extends TimelineResetCredit {
  leftPercent: number;
}

/** Eine Account-Zeile der Timeline, abgeleitet aus den bestehenden Usage-Daten. */
export interface TimelineLane {
  providerId: "codex" | "claude" | "opencode";
  accountId: string;
  accountLabel: string;
  email: string | null;
  plan: string | null;
  active: boolean;
  status: UsageTimelineStatus;
  error: { code: string; message: string } | null;
  /** Bekannter Reset-Zeitpunkt (Fensterende); alle Grenzen leiten sich davon ab. */
  anchorMs: number | null;
  /** Fensterlänge in Stunden. */
  periodHours: number | null;
  /** Verbleibender Prozentsatz des aktuell gemessenen Fensters. */
  remaining: number | null;
  limits: TimelineLimit[];
  resetCredits: TimelineResetCredit[];
  updatedAt: string | null;
}

/** Ein gezeichneter Balken: ein Fenster innerhalb des sichtbaren Bereichs. */
export interface TimelineWindow {
  startMs: number;
  endMs: number;
  leftPercent: number;
  widthPercent: number;
  state: "past" | "live" | "next";
  /** Verbleibender Prozentsatz nur beim API-gemeldeten aktuellen Fenster. */
  remaining: number | null;
}

/**
 * Alle Fenstergrenzen von `periodMs` ausgerichtet an `anchorMs` für
 * [fromMs, toMs]. Der Anker ist ein bekannter Reset, von dem aus vorwärts und
 * rückwärts in ganzen Perioden projiziert wird.
 */
export function windowsIn(anchorMs: number, periodMs: number, fromMs: number, toMs: number): Array<{ startMs: number; endMs: number }> {
  if (!Number.isFinite(anchorMs) || !(periodMs > 0)) return [];
  if (!(toMs > fromMs)) return [];

  const maxWindows = Math.ceil((toMs - fromMs) / periodMs) + 2;
  if (maxWindows > 1_000) return [];

  let end = anchorMs + Math.ceil((fromMs - anchorMs) / periodMs) * periodMs;
  const out: Array<{ startMs: number; endMs: number }> = [];
  while (end - periodMs < toMs) {
    out.push({ startMs: end - periodMs, endMs: end });
    end += periodMs;
  }
  return out;
}

/** Beginn des lokalen Tages, der `ms` enthält. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Beginn der lokalen Woche (Sonntag), die `ms` enthält. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

/**
 * Sichtbarer Bereich für einen Modus und Offset. Die Wochenansicht schreitet
 * in ganzen Wochen ab dem enthaltenen Sonntag, die 5-Stunden-Ansicht in Tagen
 * ab heute. Datumsarithmetik statt fester Millisekunden, damit eine
 * DST-Umstellung innerhalb des Bereichs keinen Tag verschiebt.
 */
export function timelineSpan(mode: TimelineMode, offset: number, now: number): { startMs: number; endMs: number; days: number } {
  const days = TIMELINE_SPAN_DAYS[mode];
  const base = new Date(mode === "weekly" ? startOfWeek(now) : startOfDay(now));
  base.setDate(base.getDate() + offset * (mode === "weekly" ? 7 : 1));
  const startMs = base.getTime();
  const end = new Date(startMs);
  end.setDate(end.getDate() + days);
  return { startMs, endMs: end.getTime(), days };
}

/**
 * Projiziert die Fenster einer Lane auf den sichtbaren Bereich, beschnitten
 * und positioniert. Fenster außerhalb des Bereichs werden verworfen.
 */
export function projectLane(lane: TimelineLane, spanStartMs: number, spanEndMs: number, now: number, mode: TimelineMode): TimelineWindow[] {
  const periodHours = lane.periodHours;
  if (lane.anchorMs === null || !periodHours) return [];
  if (mode === "session" && periodHours !== SESSION_PERIOD_HOURS) return [];

  const span = spanEndMs - spanStartMs;
  if (span <= 0) return [];

  const toPercent = (ms: number) => ((ms - spanStartMs) / span) * 100;

  return windowsIn(lane.anchorMs, periodHours * HOUR_MS, spanStartMs, spanEndMs)
    .map((window): TimelineWindow | null => {
      const left = Math.max(0, toPercent(window.startMs));
      const right = Math.min(100, toPercent(window.endMs));
      if (right <= 0 || left >= 100 || right <= left) return null;

      const state: TimelineWindow["state"] = window.endMs <= now ? "past" : window.startMs <= now ? "live" : "next";

      return {
        startMs: window.startMs,
        endMs: window.endMs,
        leftPercent: left,
        widthPercent: right - left,
        state,
        // `lane.remaining` gilt ausschließlich für das aktuell gemessene
        // Fenster, das am Anker endet. Nach dem Reset wird es nicht weitergereicht.
        remaining: state === "live" && window.endMs === lane.anchorMs ? lane.remaining : null,
      };
    })
    .filter((window): window is TimelineWindow => window !== null);
}

/** Projiziert nicht abgelaufene Reset-Credit-Ablaufzeitpunkte auf den Bereich. */
export function projectResetCredits(lane: TimelineLane, spanStartMs: number, spanEndMs: number, now: number): TimelineResetCreditMark[] {
  const span = spanEndMs - spanStartMs;
  if (span <= 0) return [];

  return lane.resetCredits
    .filter((credit) => credit.expiresAtMs > now && credit.expiresAtMs >= spanStartMs && credit.expiresAtMs < spanEndMs)
    .map((credit) => ({ ...credit, leftPercent: ((credit.expiresAtMs - spanStartMs) / span) * 100 }));
}

/**
 * Wählt das Fenster, aus dem eine Lane gezeichnet wird: das längste, das in
 * den sichtbaren Bereich passt; bei Gleichstand das mit dem frühesten Reset.
 * Passt nichts, wird das kürzeste verfügbare Fenster genutzt, statt nichts zu
 * zeichnen. Ohne Reset-Zeitpunkt gibt es keinen Anker — dann wird nicht geraten.
 */
export function pickLaneWindow<T extends { resetAtMs?: number | null; periodHours?: number | null }>(windows: readonly T[], maxPeriodHours?: number): T | null {
  const usable = windows.filter((window) => typeof window.resetAtMs === "number" && Number.isFinite(window.resetAtMs));
  if (usable.length === 0) return null;

  const periodOf = (window: T) => (typeof window.periodHours === "number" && window.periodHours > 0 ? window.periodHours : 0);

  const fitting = maxPeriodHours === undefined ? usable : usable.filter((window) => periodOf(window) <= maxPeriodHours);

  const pool = fitting.length > 0 ? fitting : usable;
  return pool.reduce((best, window) => {
    const byPeriod = periodOf(window) - periodOf(best);
    if (byPeriod !== 0) return byPeriod > 0 ? window : best;
    return (window.resetAtMs as number) < (best.resetAtMs as number) ? window : best;
  });
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

interface ApiWindowLike extends UsageWindow {
  resetsAt: string | null;
  windowMinutes: number | null;
}

/**
 * Baut eine Timeline-Lane aus einer API-Lane. Semantik der bestehenden
 * UsageWindow-Struktur: `remainingPercent` ist verbleibend, `usedPercent`
 * verbraucht. Der Anker ist der Reset des gewählten Fensters; der angezeigte
 * `remaining` Wert stammt ausschließlich aus dem Fenster des API-Status.
 */
export function buildTimelineLane(lane: ApiTimelineLane, maxPeriodHours?: number): TimelineLane {
  const windows: Array<ApiWindowLike & { periodHours: number | null; resetAtMs: number | null }> = lane.windows.map((window) => ({
    ...window,
    periodHours: window.windowMinutes === null ? null : window.windowMinutes / 60,
    resetAtMs: window.resetsAt ? Date.parse(window.resetsAt) : null,
  }));

  const chosen = pickLaneWindow(windows, maxPeriodHours);

  return {
    providerId: lane.providerId,
    accountId: lane.accountId,
    accountLabel: lane.accountLabel,
    email: lane.email,
    plan: lane.plan,
    active: lane.active,
    status: lane.status,
    error: lane.error,
    anchorMs: chosen?.resetAtMs ?? null,
    periodHours: chosen?.periodHours ?? null,
    remaining: chosen?.remainingPercent !== undefined && chosen !== null ? clampPercent(chosen.remainingPercent) : null,
    limits: lane.windows
      .filter((window) => window.remainingPercent !== undefined)
      .map((window) => ({ label: window.label, remaining: clampPercent(window.remainingPercent) })),
    resetCredits: lane.resetCredits
      .filter((credit) => credit.status.toLowerCase() === "available" && credit.expiresAt !== null)
      .map((credit) => {
        const expiresAtMs = Date.parse(credit.expiresAt!);
        if (!Number.isFinite(expiresAtMs)) return null;
        const grantedAtMs = credit.grantedAt ? Date.parse(credit.grantedAt) : NaN;
        return {
          id: credit.id,
          grantedAtMs: Number.isFinite(grantedAtMs) ? grantedAtMs : null,
          expiresAtMs,
        };
      })
      .filter((credit): credit is TimelineResetCredit => credit !== null),
    updatedAt: lane.updatedAt,
  };
}

/** Hat die Lane einen Anker und kann also überhaupt einen Balken zeichnen? */
export function laneHasWindow(lane: TimelineLane): boolean {
  return lane.anchorMs !== null;
}

/** Nächster anstehender Reset über alle Lanes (nur Fenster, keine Credits). */
export function nextWindowResetMs(lanes: readonly TimelineLane[], now: number): number | null {
  let best: number | null = null;
  for (const lane of lanes) {
    if (lane.anchorMs === null) continue;
    if (lane.anchorMs <= now) continue;
    if (best === null || lane.anchorMs < best) best = lane.anchorMs;
  }
  return best;
}

/** Anzahl Lanes mit einem verbleibenden Wert unter der Schwelle (z. B. 20 %). */
export function countLanesBelow(lanes: readonly TimelineLane[], threshold: number): number {
  return lanes.filter((lane) => lane.remaining !== null && lane.remaining < threshold).length;
}
