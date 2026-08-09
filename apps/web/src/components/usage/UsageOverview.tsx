import { useMemo } from "react";
import type { UsageTimelineResponse } from "@workbench/contracts";
import { useUsagePreferences } from "../../stores/usagePreferences";
import { buildTimelineLane } from "../../lib/quotaTimeline";
import {
  accountLimitViews,
  bestAvailableAccount,
  filterLanes,
  formatCountdown,
  groupLanesByProvider,
  shortWindowLabel,
  sortLanes,
  summaryLine,
  type UsageFilterState,
} from "../../lib/usageView";
import { useNow } from "../../lib/useNow";
import { formatRelativeTime } from "../../lib/format";
import { QuotaTimeline, type QuotaTimelineProps } from "./QuotaTimeline";
import { UsageAccountTable } from "./UsageAccountTable";
import { UsageFilters } from "./UsageFilters";
import { UsageViewSettings } from "./UsageViewSettings";
import { WarningIcon } from "../icons";
import { UsageViewSwitcher } from "./UsageViewSwitcher";

const providerName: Record<"codex" | "claude" | "opencode", string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode Go",
};

export interface UsageOverviewProps {
  timeline: UsageTimelineResponse;
  now?: number;
  timelineProps?: Partial<QuotaTimelineProps>;
}

/** Zusammenfassende Statuszeile unterhalb der Toolbar (Ebene 1). */
function LimitSummary({ data, warningThreshold, now }: { data: UsageTimelineResponse; warningThreshold: number; now: number }) {
  const lanes = useMemo(() => data.lanes.map((lane) => buildTimelineLane(lane)), [data.lanes]);
  const summary = useMemo(() => summaryLine(data.lanes, lanes, now, warningThreshold), [data.lanes, lanes, now, warningThreshold]);
  const best = useMemo(() => bestAvailableAccount(lanes), [lanes]);

  return (
    <div className="usage-limit-summary" aria-label="Zusammenfassung der Limits" data-has-best={best !== null ? "true" : "false"}>
      <p className="usage-limit-summary-line">
        <strong>{summary.accounts}</strong> Accounts
        {" · "}
        <strong className={summary.low > 0 ? "usage-summary-low" : undefined}>{summary.low}</strong>{" "}
        {summary.low === 1 ? "niedrig" : "niedrig"}
        {summary.nextResetAt !== null ? (
          <>
            {" · "}nächster Reset in <strong>{formatCountdown(summary.nextResetAt, now)}</strong>
          </>
        ) : null}
        {data.lastSuccessfulFetchAt ? (
          <>
            {" · "}aktualisiert {formatRelativeTime(data.lastSuccessfulFetchAt)}
          </>
        ) : null}
      </p>
      {best !== null ? (
        <p className="usage-limit-summary-best">
          <span className="usage-summary-best-label">Beste verfügbare Kapazität</span>
          <strong>{best.accountLabel}</strong>
          {" · "}{providerName[best.providerId]}
          {best.limits.length ? <span className="usage-summary-best-limit">{shortWindowLabel(best.limits.reduce((a, b) => a.remaining < b.remaining ? a : b).label)} {Math.round(Math.min(...best.limits.map((limit) => limit.remaining)))} %</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/** Leere Ansicht bei aktiven Filtern: verständlich statt leerer Seite. */
function NoAccounts({ hasActiveFilters, onReset }: { hasActiveFilters: boolean; onReset: () => void }) {
  return (
    <div className="usage-empty-filtered" role="status">
      <WarningIcon className="h-4 w-4" />
      <span>{hasActiveFilters ? "Keine Accounts entsprechen den gewählten Filtern." : "Keine überwachten Accounts vorhanden."}</span>
      {hasActiveFilters ? <button type="button" className="quiet-button" onClick={onReset}>Filter zurücksetzen</button> : null}
    </div>
  );
}

export function UsageOverview({ timeline, now: nowProp, timelineProps }: UsageOverviewProps) {
  const prefs = useUsagePreferences();
  const tick = useNow();
  const now = nowProp ?? tick;

  // Deaktivierte Anbieter („Limitüberwachung aus") und einzelne Accounts
  // („nicht überwacht") erscheinen in der Übersicht nicht — nur aktiv
  // getrackte Einträge werden angezeigt. Summary, Tabelle und Timeline
  // bekommen dafür dieselbe gefilterte Response.
  const trackedTimeline = useMemo<UsageTimelineResponse>(
    () => ({ ...timeline, lanes: timeline.lanes.filter((lane) => lane.status !== "disabled") }),
    [timeline],
  );

  const baseLanes = useMemo(() => trackedTimeline.lanes.map((lane) => buildTimelineLane(lane)), [trackedTimeline.lanes]);
  const apiLaneById = useMemo(() => new Map(trackedTimeline.lanes.map((lane) => [lane.accountId, lane])), [trackedTimeline.lanes]);
  const filterState = useMemo<UsageFilterState>(() => ({
    providerFilter: prefs.providerFilter,
    onlyActive: prefs.onlyActive,
    onlyProblematic: prefs.onlyProblematic,
    hideAccountsWithoutData: prefs.hideAccountsWithoutData,
    hiddenAccountIds: prefs.hiddenAccountIds,
    warningThreshold: prefs.warningThreshold,
  }), [prefs.providerFilter, prefs.onlyActive, prefs.onlyProblematic, prefs.hideAccountsWithoutData, prefs.hiddenAccountIds, prefs.warningThreshold]);

  // Filter nur auf Lanes mit Daten anwenden; Lanes ohne Daten bleiben sichtbar,
  // solange sie nicht explizit ausgeblendet werden.
  const filteredLanes = useMemo(() => filterLanes(baseLanes, filterState), [baseLanes, filterState]);
  const sortedLanes = useMemo(() => sortLanes(filteredLanes, prefs.sortBy), [filteredLanes, prefs.sortBy]);
  const sortedApiLanes = useMemo(() => sortedLanes.map((lane) => apiLaneById.get(lane.accountId)).filter((lane): lane is NonNullable<typeof lane> => Boolean(lane)), [sortedLanes, apiLaneById]);
  const views = useMemo(() => accountLimitViews(sortedApiLanes, prefs.warningThreshold), [sortedApiLanes, prefs.warningThreshold]);
  const grouped = useMemo(() => groupLanesByProvider(sortedLanes), [sortedLanes]);

  const hasActiveFilters = prefs.providerFilter !== "all" || prefs.onlyActive || prefs.onlyProblematic || prefs.hideAccountsWithoutData || prefs.hiddenAccountIds.length > 0;
  const resetFilters = () => {
    const { set } = useUsagePreferences.getState();
    set({ providerFilter: "all", onlyActive: false, onlyProblematic: false, hideAccountsWithoutData: false, hiddenAccountIds: [] });
  };

  const showTimeline = prefs.showTimeline && (prefs.limitsView === "timeline" || prefs.limitsView === "both");
  const showTable = prefs.showAccountOverview && (prefs.limitsView === "list" || prefs.limitsView === "both");

  return (
    <div className="usage-overview">
      {prefs.showLimitSummary ? <LimitSummary data={trackedTimeline} warningThreshold={prefs.warningThreshold} now={now} /> : null}
      <div className="usage-overview-toolbar">
        <UsageFilters lanes={baseLanes} prefs={prefs} />
        <div className="usage-overview-actions"><UsageViewSettings prefs={prefs} /></div>
      </div>
      <div className="usage-view-switcher-row"><UsageViewSwitcher value={prefs.limitsView} /></div>

      {showTable ? (
        <section className="usage-accounts-now">
          <header className="usage-section-heading">
            <div>
              <p className="usage-provider-kicker">Sofortübersicht</p>
              <h2>Limits jetzt</h2>
            </div>
          </header>
          {sortedLanes.length === 0 ? (
            <NoAccounts hasActiveFilters={hasActiveFilters} onReset={resetFilters} />
          ) : prefs.groupByProvider ? (
            grouped.map((group) => (
              <div className="uat-group" key={group.provider}>
                <h3 className="uat-group-title">{providerName[group.provider]}<span>{group.lanes.length}</span></h3>
                <UsageAccountTable
                  views={accountLimitViews(group.lanes.map((lane) => apiLaneById.get(lane.accountId)!).filter(Boolean), prefs.warningThreshold)}
                  showProvider={prefs.showProvider}
                  showActiveBadge={prefs.showActiveBadge}
                  showDataStatus={prefs.showDataStatus}
                  showEmail={prefs.showEmail}
                  showPlan={prefs.showPlan}
                />
              </div>
            ))
          ) : (
            <UsageAccountTable
              views={views}
              showProvider={prefs.showProvider}
              showActiveBadge={prefs.showActiveBadge}
              showDataStatus={prefs.showDataStatus}
              showEmail={prefs.showEmail}
              showPlan={prefs.showPlan}
            />
          )}
        </section>
      ) : null}

      {showTimeline ? (
        <QuotaTimeline
          data={trackedTimeline}
          now={now}
          prefs={prefs}
          {...timelineProps}
        />
      ) : null}


    </div>
  );
}
