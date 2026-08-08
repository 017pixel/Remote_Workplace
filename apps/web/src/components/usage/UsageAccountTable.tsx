import { useState } from "react";
import type { TimelineLane } from "../../lib/quotaTimeline";
import { formatUsageReset } from "../../lib/orbitUsage";
import { shortWindowLabel, type AccountLimitView, type LimitLevel } from "../../lib/usageView";
import { Badge } from "../primitives";
import { ChevronDownIcon, ChevronRightIcon, CoinsIcon, WarningIcon } from "../icons";

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

const levelClass: Record<LimitLevel, string> = {
  high: "is-high",
  medium: "is-medium",
  low: "is-low",
  critical: "is-critical",
};

function levelLabel(level: LimitLevel | null, hasData: boolean): string {
  if (!hasData) return "Keine Daten";
  switch (level) {
    case "high": return "Bereit";
    case "medium": return "Bereit";
    case "low": return "Niedrig";
    case "critical": return "Kritisch";
    case null: return "Unbekannt";
  }
}

function statusLabel(lane: TimelineLane): string {
  switch (lane.status) {
    case "available": return "Aktuell";
    case "partial": return "Teilweise";
    case "stale": return "Veraltet";
    case "unavailable": return "Nicht verfügbar";
    case "disabled": return "Deaktiviert";
  }
}

export interface UsageAccountTableProps {
  views: AccountLimitView[];
  showProvider: boolean;
  showActiveBadge: boolean;
  showDataStatus: boolean;
  showEmail: boolean;
  showPlan: boolean;
  /** Inline-Expand für Details (E-Mail, Plan, alle Fenster). */
  expanded?: (accountId: string) => boolean;
}

function LimitCell({ label, remaining }: { label: string; remaining: number }) {
  return (
    <span className="uat-limit" title={`${label} · ${Math.round(remaining)} % verbleibend`}>
      <span className="uat-limit-label">{label}</span>
      <span className="uat-limit-track" aria-hidden="true">
        <i style={{ width: `${Math.round(remaining)}%` }} />
      </span>
      <span className="uat-limit-value">{Math.round(remaining)} %</span>
    </span>
  );
}

function DetailRows({ view, showEmail, showPlan, showDataStatus }: { view: AccountLimitView; showEmail: boolean; showPlan: boolean; showDataStatus: boolean }) {
  const { apiLane, lane } = view;
  return (
    <div className="uat-details">
      <dl>
        {showEmail && apiLane.email ? <div><dt>E-Mail</dt><dd>{apiLane.email}</dd></div> : null}
        {showPlan && apiLane.plan ? <div><dt>Plan</dt><dd>{apiLane.plan}</dd></div> : null}
        {apiLane.windows.map((window) => (
          <div key={window.id}>
            <dt>{window.label}</dt>
            <dd>
              {Math.round(window.remainingPercent)} % verbleibend · {Math.round(window.usedPercent)} % verbraucht ·{" "}
              {window.resetsAt ? `Reset ${formatUsageReset(window.resetsAt)}` : "Reset unbekannt"}
            </dd>
          </div>
        ))}
        {showDataStatus && (
          <div>
            <dt>Status</dt>
            <dd>{statusLabel(lane)}</dd>
          </div>
        )}
        {lane.status !== "available" && lane.error ? (
          <div className="uat-detail-error"><WarningIcon className="h-3 w-3" />{lane.error.message}</div>
        ) : null}
        {apiLane.resetCredits.length > 0 ? (
          <div className="uat-detail-credits">
            <CoinsIcon className="h-3 w-3" />
            {apiLane.resetCredits.length} Reset-Guthaben verfügbar
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function UsageAccountTable({ views, showProvider, showActiveBadge, showDataStatus, showEmail, showPlan, expanded }: UsageAccountTableProps) {
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const isExpanded = (accountId: string) => (expanded ? expanded(accountId) : openAccountId === accountId);
  const toggle = (accountId: string) => setOpenAccountId((current) => (current === accountId ? null : accountId));

  if (views.length === 0) {
    return <p className="uat-empty" role="status">Für die gewählten Filter sind keine Accounts sichtbar.</p>;
  }

  return (
    <div className="uat" role="table" aria-label="Aktuelle Limits je Account">
      <div className="uat-head" role="row">
        <span className="uat-cell-account">Account</span>
        {showProvider ? <span className="uat-cell-provider">Provider</span> : null}
        <span className="uat-cell-limits">Limits</span>
        <span className="uat-cell-reset">Reset</span>
        <span className="uat-cell-status">Status</span>
        <span className="uat-cell-expand" aria-hidden="true" />
      </div>
      {views.map((view) => {
        const { lane, limits, level, urgentResetsAtMs, hasData } = view;
        const open = isExpanded(lane.accountId);
        const resetLabel = urgentResetsAtMs !== null
          ? formatUsageReset(new Date(urgentResetsAtMs).toISOString())
          : lane.anchorMs !== null
            ? formatUsageReset(new Date(lane.anchorMs).toISOString())
            : "Reset unbekannt";
        return (
          <div className={`uat-row ${level !== null ? levelClass[level] : ""} ${lane.active ? "is-active" : ""}`} role="row" key={lane.accountId}>
            <button type="button" className="uat-row-main" onClick={() => toggle(lane.accountId)} aria-expanded={open} aria-label={`${lane.accountLabel} Details`}>
              <span className={`uat-provider-dot qt-provider-${providerLabel[lane.providerId]}`} aria-hidden="true" />
              <span className="uat-cell-account">
                <strong>{lane.accountLabel}</strong>
                {lane.active && showActiveBadge ? <Badge tone="ok">Aktiv</Badge> : null}
                <span className="uat-cell-meta">
                  {[providerName[lane.providerId], lane.plan].filter(Boolean).join(" · ") || providerName[lane.providerId]}
                </span>
              </span>
              <span className={`uat-cell-limits ${showProvider ? "" : "uat-cell-limits-no-provider"}`}>
                {limits.length > 0
                  ? limits.slice(0, 3).map((limit) => <LimitCell key={limit.label} label={shortWindowLabel(limit.label)} remaining={limit.remaining} />)
                  : <span className="uat-no-limits">Keine Daten</span>}
              </span>
              <span className="uat-cell-reset">{resetLabel}</span>
              <span className="uat-cell-status">
                <span className={`uat-level uat-level-${level ?? "none"}`} aria-hidden="true" />
                <span className="uat-level-label">{levelLabel(level, hasData)}</span>
                {showDataStatus && lane.status !== "available" ? <Badge tone={lane.status === "unavailable" || lane.status === "disabled" ? "bad" : "warn"}>{statusLabel(lane)}</Badge> : null}
              </span>
              <span className="uat-cell-expand" aria-hidden="true">
                {open ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
              </span>
            </button>
            {open ? <div className="uat-details-wrap"><DetailRows view={view} showEmail={showEmail} showPlan={showPlan} showDataStatus={showDataStatus} /></div> : null}
          </div>
        );
      })}
    </div>
  );
}
