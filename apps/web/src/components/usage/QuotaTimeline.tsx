import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { UsageTimelineResponse } from "@workbench/contracts";
import { Badge } from "../primitives";
import { ChevronLeftIcon, ChevronRightIcon, CoinsIcon, WarningIcon } from "../icons";
import {
  buildTimelineLane,
  laneHasWindow,
  projectLane,
  projectResetCredits,
  timelineSpan,
  type TimelineLane,
  type TimelineMode,
  type TimelineWindow,
} from "../../lib/quotaTimeline";
import { filterLanes, sortLanes, type UsageFilterState } from "../../lib/usageView";
import type { UsagePreferences } from "../../stores/usagePreferences";
import { useNow } from "../../lib/useNow";
import { formatUsageReset } from "../../lib/orbitUsage";

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const pad = (value: number) => String(value).padStart(2, "0");
const formatDay = (ms: number) => `${pad(new Date(ms).getMonth() + 1)}.${pad(new Date(ms).getDate())}`;
const formatTime = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;

const providerName: Record<TimelineLane["providerId"], string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode Go",
};

const providerLabel: Record<TimelineLane["providerId"], string> = {
  codex: "codex",
  claude: "claude",
  opencode: "opencode",
};

/** Provider-Akzentfarbe als CSS-Variable — ausschließlich bestehende Theme-Tokens. */
const providerAccent: Record<TimelineLane["providerId"], string> = {
  codex: "var(--color-info)",
  claude: "var(--color-warn)",
  opencode: "var(--color-ok)",
};

function laneStatusLabel(status: TimelineLane["status"]): string {
  switch (status) {
    case "available": return "Aktuell";
    case "partial": return "Teilweise";
    case "stale": return "Veraltet";
    case "unavailable": return "Nicht verfügbar";
    case "disabled": return "Deaktiviert";
  }
}

/** Alter der Daten in Minuten oder Stunden, für die „veraltet“-Anzeige. */
function ageLabel(updatedAt: string | null, now: number): string | null {
  if (!updatedAt) return null;
  const minutes = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 60_000));
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 60) return `vor ${minutes} Min.`;
  return `vor ${Math.floor(minutes / 60)} Std.`;
}

export interface QuotaTimelineProps {
  data: UsageTimelineResponse;
  /** Injectable für Tests; standardmäßig die echte Uhr. */
  now?: number;
  /** Injectable für Tests; standardmäßig die Wochenansicht. */
  initialMode?: TimelineMode;
  initialOffset?: number;
  /** Darstellungspräferenzen aus dem UsagePreferences-Store. */
  prefs: UsagePreferences;
}

export function QuotaTimeline({ data, now: nowProp, initialMode = "weekly", initialOffset = 0, prefs }: QuotaTimelineProps) {
  const [mode, setMode] = useState<TimelineMode>(initialMode);
  const [offset, setOffset] = useState(initialOffset);
  const [viewport, setViewport] = useState<"fit" | "detail">("fit");
  // Ein geteilter Minuten-Tick für alle Lanes — keine eigene Uhr pro Balken.
  const tick = useNow(nowProp);
  const now = nowProp ?? tick;

  const span = useMemo(() => timelineSpan(mode, offset, now), [mode, offset, now]);

  const filterState = useMemo<UsageFilterState>(() => ({
    providerFilter: prefs.providerFilter,
    onlyActive: prefs.onlyActive,
    onlyProblematic: prefs.onlyProblematic,
    hideAccountsWithoutData: prefs.hideAccountsWithoutData,
    hiddenAccountIds: prefs.hiddenAccountIds,
    warningThreshold: prefs.warningThreshold,
  }), [prefs]);

  const lanes = useMemo(() => {
    const weeklyLanes = data.lanes.map((lane) => buildTimelineLane(lane, span.days * 24));
    // Wochenansicht: Fenster mit dem längsten passenden Zeitraum. Session:
    // nur 5-Stunden-Fenster werden gezeichnet, alle Lanes bleiben sichtbar.
    const sessionLanes = data.lanes.map((lane) => buildTimelineLane(lane, 5));
    const base = mode === "session" ? sessionLanes : weeklyLanes;
    const drawable = base.filter((lane) => laneHasWindow(lane) && (mode !== "session" || lane.periodHours === 5));
    const withoutWindow = base.filter((lane) => !laneHasWindow(lane) || (mode === "session" && lane.periodHours !== 5));
    return sortLanes(filterLanes([...drawable, ...withoutWindow], filterState), prefs.sortBy);
  }, [data.lanes, mode, span.days, filterState, prefs.sortBy]);

  const cells = useMemo(() => {
    const zoomed = mode === "session";
    const count = zoomed ? span.days * 4 : span.days;
    const cellMs = (span.endMs - span.startMs) / count;
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    return Array.from({ length: count }, (_, index) => {
      const at = span.startMs + index * cellMs;
      const date = new Date(at);
      const isDayStart = !zoomed || date.getHours() === 0;
      const isToday = new Date(at).setHours(0, 0, 0, 0) === todayStart;
      return {
        at,
        isDayStart,
        isToday,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        label: isDayStart ? formatDay(at) : `${pad(date.getHours())}:00`,
        weekday: isDayStart ? WEEKDAY_LABELS[date.getDay()] ?? "" : "",
      };
    });
  }, [mode, span, now]);

  const nowPercent = now >= span.startMs && now < span.endMs ? ((now - span.startMs) / (span.endMs - span.startMs)) * 100 : null;

  const navigationLabel = offset === 0 ? "Heute" : formatDay(span.startMs);
  const showPast = prefs.showPastWindows;
  const showProjections = prefs.showProjections;
  const showNowLine = prefs.showNowLine && nowPercent !== null;
  const showWeekends = prefs.showWeekends;
  const showLabels = prefs.showWindowLabels;
  const showCredits = prefs.showResetCreditMarkers;
  const showEmptyLanes = prefs.showAccountsWithoutReset;
  const compactColumn = prefs.accountColumn === "compact";

  const filteredCells = showWeekends ? cells : cells;

  return (
    <section className="quota-timeline" data-density={prefs.density} data-column={prefs.accountColumn} data-viewport={viewport}>
      <header className="qt-head">
        <div className="qt-heading">
          <p className="usage-provider-kicker">Zeitliche Analyse</p>
          <h2>Quota-Timeline</h2>
          <p className="qt-range">
            {formatDay(span.startMs)} – {formatDay(span.endMs - 1)}{" "}
            <span>
              · {mode === "weekly" ? "14 Tage" : "3 Tage"} {offset === 0 ? "· aktueller Zeitraum" : ""}
            </span>
          </p>
        </div>
        <div className="qt-controls">
          <div className="qt-nav" role="group" aria-label="Zeitraum wählen">
            <button type="button" className="icon-button" onClick={() => setOffset((value) => value - 1)} aria-label="Vorheriger Zeitraum">
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button type="button" className="qt-today" onClick={() => setOffset(0)} disabled={offset === 0} aria-label="Heute">
              {navigationLabel}
            </button>
            <button type="button" className="icon-button" onClick={() => setOffset((value) => value + 1)} aria-label="Nächster Zeitraum">
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="qt-modes" role="group" aria-label="Ansicht">
            {(["weekly", "session"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setOffset(0);
                }}
              >
                {value === "weekly" ? "Wochen" : "5 Std."}
              </button>
            ))}
          </div>
          <div className="qt-viewport" role="group" aria-label="Timeline-Breite">
            {(["fit", "detail"] as const).map((value) => <button key={value} type="button" aria-pressed={viewport === value} onClick={() => setViewport(value)}>{value === "fit" ? "Einpassen" : "Detail"}</button>)}
          </div>
        </div>
      </header>

      <div className="qt-scroll">
        <div className={`qt-chart ${compactColumn ? "is-compact" : ""}`} style={{ "--qt-detail-width": mode === "session" ? "840px" : "1100px", "--qt-track-width": mode === "session" ? "840px" : "1100px" } as CSSProperties}>
          <div className="qt-axis qt-axis-head">
            <span className="qt-axis-label">Account</span>
          </div>
          <div className="qt-axis">
            {filteredCells.map((cell) => (
              <div
                key={cell.at}
                className="qt-axis-cell"
                data-today={cell.isToday ? 1 : 0}
                data-weekend={cell.isWeekend ? 1 : 0}
                data-daystart={cell.isDayStart ? 1 : 0}
              >
                <span className="qt-axis-weekday">{cell.weekday}</span>
                <span className="qt-axis-date">{cell.label}</span>
              </div>
            ))}
          </div>

          {lanes.length === 0 ? (
            <div className="qt-empty" role="status">
              Keine Accounts mit einem zählenden Limitfenster im sichtbaren Zeitraum.
            </div>
          ) : (
            lanes.map((lane) => (
              <LaneRow
                key={lane.accountId}
                lane={lane}
                span={span}
                now={now}
                mode={mode}
                cells={filteredCells}
                nowPercent={nowPercent}
                showPast={showPast}
                showProjections={showProjections}
                showNowLine={showNowLine}
                showLabels={showLabels}
                showCredits={showCredits}
                showEmptyLane={showEmptyLanes}
                prefs={prefs}
              />
            ))
          )}
        </div>
      </div>

      {prefs.showTimelineLegend ? (
        <footer className="qt-legend">
          <span><i className="qt-legend-live" />aktuelles Fenster</span>
          <span><i className="qt-legend-next" />kommendes Fenster</span>
          <span><i className="qt-legend-past" />vergangen</span>
          <span><i className="qt-legend-credit" />Reset-Guthaben</span>
          <span className="qt-legend-note">
            {mode === "weekly"
              ? "Jeder Balken ist ein komplettes Limitfenster von Öffnung bis Reset."
              : "Jeder Balken ist ein 5-Stunden-Fenster. Nur Accounts mit zählendem Fenster werden projiziert."}
          </span>
        </footer>
      ) : null}
    </section>
  );
}

interface LaneRowProps {
  lane: TimelineLane;
  span: { startMs: number; endMs: number; days: number };
  now: number;
  mode: TimelineMode;
  cells: Array<{ at: number; isWeekend: boolean; isDayStart: boolean }>;
  nowPercent: number | null;
  showPast: boolean;
  showProjections: boolean;
  showNowLine: boolean;
  showLabels: boolean;
  showCredits: boolean;
  showEmptyLane: boolean;
  prefs: UsagePreferences;
}

function LaneRow({ lane, span, now, mode, cells, nowPercent, showPast, showProjections, showNowLine, showLabels, showCredits, showEmptyLane, prefs }: LaneRowProps) {
  const windows = useMemo(() => {
    const projected = projectLane(lane, span.startMs, span.endMs, now, mode);
    return projected.filter((window) => {
      if (window.state === "past" && !showPast) return false;
      if (window.state === "next" && !showProjections) return false;
      return true;
    });
  }, [lane, span, now, mode, showPast, showProjections]);
  const resetCredits = useMemo(() => projectResetCredits(lane, span.startMs, span.endMs, now), [lane, span, now]);
  const staleAge = ageLabel(lane.updatedAt, now);

  if (!showEmptyLane && windows.length === 0 && lane.limits.length === 0) return null;

  return (
    <div className="qt-lane" style={{ "--qt-accent": providerAccent[lane.providerId] } as CSSProperties}>
      <div className="qt-lane-head">
        <span className={`qt-provider-dot qt-provider-${providerLabel[lane.providerId]}`} aria-hidden="true" />
        <div className="qt-lane-identity">
          <div className="qt-lane-name">
            <strong>{lane.accountLabel}</strong>
            {lane.active && prefs.showActiveBadge ? <Badge tone="ok">Aktiv</Badge> : null}
          </div>
          {lane.status !== "available" && prefs.showDataStatus ? (
            <div className="qt-lane-status">
              <Badge tone={lane.status === "unavailable" || lane.status === "disabled" ? "bad" : "warn"}>
                {lane.status === "stale" && staleAge ? `${laneStatusLabel(lane.status)} · ${staleAge}` : laneStatusLabel(lane.status)}
              </Badge>
            </div>
          ) : null}
          <div className="qt-lane-meta" title={lane.email ?? undefined}>
            {[prefs.showProvider ? providerName[lane.providerId] : null, prefs.showPlan ? lane.plan : null, prefs.showEmail ? lane.email : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="qt-lane-limits">
          {lane.limits.slice(0, 3).map((limit) => (
            <span key={limit.label} className="qt-lane-limit">
              <small>{limit.label.includes("5") ? "5h" : limit.label.includes("Woche") ? "7d" : limit.label.includes("Monat") ? "30d" : limit.label}</small><b>{Math.round(limit.remaining)}%</b>
            </span>
          ))}
        </div>
      </div>

      <div className="qt-track">
        <div className="qt-track-grid" aria-hidden="true">
          {cells.map((cell) => (
            <span key={cell.at} data-weekend={cell.isWeekend ? 1 : 0} data-daystart={cell.isDayStart ? 1 : 0} />
          ))}
        </div>

        {showNowLine && nowPercent !== null && <div className="qt-now-line" style={{ left: `${nowPercent}%` }} aria-hidden="true" />}

        {windows.length === 0 ? (
          <span className="qt-lane-idle">
            {lane.status === "unavailable"
              ? "kein Fenster zählend"
              : lane.limits.length > 0
                ? "Reset unbekannt"
                : mode === "session"
                  ? "kein 5-Stunden-Fenster"
                  : "kein Fenster im Zeitraum"}
          </span>
        ) : (
          windows.map((window) => (
            <WindowBar key={window.startMs} lane={lane} window={window} mode={mode} showLabel={showLabels} />
          ))
        )}

        {showCredits &&
          resetCredits.map((credit) => {
            const label = `Reset-Guthaben · Ablauf ${formatDay(credit.expiresAtMs)} ${formatTime(credit.expiresAtMs)}`;
            return (
              <span
                key={`${credit.id}-${credit.expiresAtMs}`}
                className="qt-credit-tick"
                style={{ left: `${credit.leftPercent}%` }}
                title={label}
                role="img"
                aria-label={label}
              >
                <CoinsIcon className="h-3 w-3" />
              </span>
            );
          })}

        {lane.status === "unavailable" && lane.error ? (
          <span className="qt-lane-error" role="status">
            <WarningIcon className="h-3 w-3" />
            {lane.error.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WindowBar({ lane, window, mode, showLabel }: { lane: TimelineLane; window: TimelineWindow; mode: TimelineMode; showLabel: boolean }) {
  const canShowLabel = window.widthPercent > (mode === "session" ? 4.5 : 9);
  const endText = mode === "session" ? `Reset ${formatTime(window.endMs)}` : `Reset ${formatDay(window.endMs)} ${formatTime(window.endMs)}`;
  const remainingText = window.remaining !== null ? `${Math.round(window.remaining)} % verbleibend · ${formatUsageReset(new Date(window.endMs).toISOString())}` : null;

  return (
    <div
      className={`qt-window qt-window-${window.state}`}
      style={{ left: `${window.leftPercent}%`, width: `${window.widthPercent}%` }}
      title={`${lane.accountLabel} · ${formatDay(window.startMs)} ${formatTime(window.startMs)} – ${formatDay(window.endMs)} ${formatTime(window.endMs)}${remainingText ? `\n${remainingText}` : ""}`}
    >
      {window.remaining !== null && (
        <span
          className="qt-window-fill"
          style={{ width: `${100 - window.remaining}%` }}
          role="progressbar"
          aria-label={`${lane.accountLabel}: ${Math.round(window.remaining)} % verbleibend, ${formatUsageReset(new Date(window.endMs).toISOString())}`}
          aria-valuenow={Math.round(window.remaining)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      )}
      {showLabel && canShowLabel && (
        <span className="qt-window-label">
          {window.remaining !== null ? <><strong>{Math.round(window.remaining)}%</strong><small>{endText}</small></> : window.state === "next" ? "(Projektion)" : endText}
        </span>
      )}
    </div>
  );
}
