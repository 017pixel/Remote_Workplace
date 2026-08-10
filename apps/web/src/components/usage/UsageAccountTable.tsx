import { useEffect, useState } from "react";
import type { TimelineLane } from "../../lib/quotaTimeline";
import { formatUsageReset } from "../../lib/orbitUsage";
import { shortWindowLabel, type AccountLimitView, type LimitLevel } from "../../lib/usageView";
import { Badge } from "../primitives";
import { ChevronDownIcon, ChevronRightIcon, CoinsIcon, WarningIcon } from "../icons";
import { ModalFrame } from "../ModalDialog";

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

const mobileMediaQuery = "(max-width: 640px)";

function useMobileUsageTable(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(mobileMediaQuery).matches);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(mobileMediaQuery);
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return mobile;
}

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

function LimitCell({ label, remaining }: { label: string; remaining: number | null }) {
  return (
    <span className={`uat-limit ${remaining === null ? "is-empty" : ""}`} title={remaining === null ? `${label}: nicht verfügbar` : `${label} · ${Math.round(remaining)} % verbleibend`}>
      <span className="uat-limit-label">{label}</span>
      {remaining !== null ? <span className="uat-limit-track" aria-hidden="true"><i style={{ width: `${Math.round(remaining)}%` }} /></span> : null}
      <span className="uat-limit-value">{remaining === null ? "—" : `${Math.round(remaining)} %`}</span>
    </span>
  );
}

function DetailRows({ view, showEmail, showPlan, showDataStatus }: { view: AccountLimitView; showEmail: boolean; showPlan: boolean; showDataStatus: boolean }) {
  const { apiLane, lane } = view;
  return (
    <div className="uat-details">
      <strong className="uat-details-title">Details</strong>
      <dl className="uat-details-limits">
        {apiLane.windows.map((window) => (
          <div key={window.id}>
            <dt>{shortWindowLabel(window.label)}</dt>
            <dd><strong>{Math.round(window.remainingPercent)} % verbleibend</strong><span>{Math.round(window.usedPercent)} % verbraucht</span><small>{window.resetsAt ? formatUsageReset(window.resetsAt) : "Reset unbekannt"}</small></dd>
          </div>
        ))}
      </dl>
      <dl className="uat-details-meta">
        {showEmail && apiLane.email ? <div><dt>E-Mail</dt><dd title={apiLane.email}>{apiLane.email}</dd></div> : null}
        {showPlan && apiLane.plan ? <div><dt>Plan</dt><dd>{apiLane.plan}</dd></div> : null}
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
  const [mobileAccountId, setMobileAccountId] = useState<string | null>(null);
  const mobile = useMobileUsageTable();
  const isExpanded = (accountId: string) => (expanded ? expanded(accountId) : openAccountId === accountId);
  const toggle = (accountId: string) => {
    if (mobile) {
      setMobileAccountId(accountId);
      return;
    }
    setOpenAccountId((current) => (current === accountId ? null : accountId));
  };
  const mobileView = mobileAccountId === null ? null : views.find((view) => view.lane.accountId === mobileAccountId) ?? null;

  if (views.length === 0) {
    return <p className="uat-empty" role="status">Für die gewählten Filter sind keine Accounts sichtbar.</p>;
  }

  return (
    <>
      <div className={`uat ${showProvider ? "has-provider" : ""}`} role="table" aria-label="Aktuelle Limits je Account">
        <div className="uat-head" role="row">
          <span className="uat-cell-account">Account</span>
          {showProvider ? <span className="uat-cell-provider">Provider</span> : null}
          <span className="uat-cell-limit uat-cell-limit-5h">5 Std.</span>
          <span className="uat-cell-limit uat-cell-limit-week">Woche</span>
          <span className="uat-cell-limit uat-cell-limit-month">Monat</span>
          <span className="uat-cell-reset">Reset</span>
          <span className="uat-cell-status">Status</span>
          <span className="uat-cell-expand" aria-hidden="true" />
        </div>
        {views.map((view) => {
          const { lane, limits, level, urgentResetsAtMs, hasData } = view;
          const open = mobile ? mobileAccountId === lane.accountId : isExpanded(lane.accountId);
          const findLimit = (kind: "5h" | "week" | "month") => limits.find((limit) => kind === "5h" ? /5/.test(limit.label) : kind === "week" ? /Woche|7\s*T|7d/i.test(limit.label) : /Monat|30\s*T|30d/i.test(limit.label))?.remaining ?? null;
          const primaryLimit = limits.length > 0 ? limits.reduce((lowest, limit) => limit.remaining < lowest.remaining ? limit : lowest) : null;
          const resetLabel = urgentResetsAtMs !== null
            ? formatUsageReset(new Date(urgentResetsAtMs).toISOString())
            : lane.anchorMs !== null
              ? formatUsageReset(new Date(lane.anchorMs).toISOString())
              : "Reset unbekannt";
          return (
            <div className={`uat-row ${level !== null ? levelClass[level] : ""} ${lane.active ? "is-active" : ""}`} role="row" key={lane.accountId}>
              <button type="button" className="uat-row-main" onClick={() => toggle(lane.accountId)} aria-expanded={open} aria-label={`${lane.accountLabel} Details öffnen`}>
                <span className="uat-cell-account">
                  <span className={`uat-provider-dot qt-provider-${providerLabel[lane.providerId]}`} aria-hidden="true" />
                  <strong title={lane.accountLabel}>{lane.accountLabel}</strong>
                  {lane.active && showActiveBadge ? <Badge tone="ok">Aktiv</Badge> : null}
                  <span className="uat-cell-meta">
                    {[showProvider ? providerName[lane.providerId] : null, lane.email && lane.email !== lane.accountLabel ? lane.email : null, lane.plan].filter(Boolean).join(" · ") || providerName[lane.providerId]}
                  </span>
                </span>
                {showProvider ? <span className="uat-cell-provider">{providerName[lane.providerId]}</span> : null}
                <span className="uat-cell-limit uat-cell-limit-5h"><LimitCell label="5 Std." remaining={findLimit("5h")} /></span>
                <span className="uat-cell-limit uat-cell-limit-week"><LimitCell label="Woche" remaining={findLimit("week")} /></span>
                <span className="uat-cell-limit uat-cell-limit-month"><LimitCell label="Monat" remaining={findLimit("month")} /></span>
                <span className="uat-mobile-summary" aria-label={primaryLimit ? `${shortWindowLabel(primaryLimit.label)} ${Math.round(primaryLimit.remaining)} Prozent verbleibend` : "Keine Limitdaten"}>
                  <span>{primaryLimit ? shortWindowLabel(primaryLimit.label) : "Keine Daten"}</span>
                  <strong>{primaryLimit ? `${Math.round(primaryLimit.remaining)} %` : "—"}</strong>
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
              {!mobile && open ? <div className="uat-details-wrap"><DetailRows view={view} showEmail={showEmail} showPlan={showPlan} showDataStatus={showDataStatus} /></div> : null}
            </div>
          );
        })}
      </div>

      <ModalFrame
        open={mobile && mobileView !== null}
        title={mobileView ? `${mobileView.lane.accountLabel} Limits` : "Limitdetails"}
        description={mobileView ? [providerName[mobileView.lane.providerId], mobileView.apiLane.plan].filter(Boolean).join(" · ") : undefined}
        className="uat-mobile-dialog"
        backdropClassName="uat-mobile-dialog-backdrop"
        onClose={() => setMobileAccountId(null)}
      >
        {() => mobileView ? <div className="uat-mobile-dialog-body"><DetailRows view={mobileView} showEmail showPlan showDataStatus /></div> : null}
      </ModalFrame>
    </>
  );
}
