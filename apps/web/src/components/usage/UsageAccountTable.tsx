import { useState } from "react";
import type { TimelineLane } from "../../lib/quotaTimeline";
import { formatUsageReset } from "../../lib/orbitUsage";
import { formatRelativeTime } from "../../lib/format";
import { formatCountdown, shortWindowLabel, type AccountLimitView } from "../../lib/usageView";
import { Badge } from "../primitives";
import { CoinsIcon, WarningIcon } from "../icons";
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

function nextReset(view: AccountLimitView): { at: number; relative: string; exact: string } | null {
  const resets = view.apiLane.windows
    .map((window) => window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN)
    .filter((value) => Number.isFinite(value) && value > Date.now())
    .sort((a, b) => a - b);
  const at = resets[0];
  if (at === undefined) return null;
  return {
    at,
    relative: `Reset in ${formatCountdown(at, Date.now())}`,
    exact: formatUsageReset(new Date(at).toISOString()),
  };
}

function LimitCell({ label, remaining }: { label: string; remaining: number | null }) {
  return (
    <span className={`uat-limit ${remaining === null ? "is-empty" : ""}`}>
      <span className="uat-limit-label">{shortWindowLabel(label)}</span>
      <strong className="uat-limit-value">{remaining === null ? "—" : `${Math.round(remaining)} %`}</strong>
    </span>
  );
}

function DetailRows({ view, showEmail, showPlan, showDataStatus }: { view: AccountLimitView; showEmail: boolean; showPlan: boolean; showDataStatus: boolean }) {
  const { apiLane, lane } = view;
  return (
    <div className="uat-details">
      <div className="uat-detail-summary">
        <div><span>Provider</span><strong>{providerName[lane.providerId]}</strong></div>
        <div><span>Status</span><strong>{lane.status === "available" ? "Aktuell" : lane.status === "partial" ? "Teilweise" : lane.status === "stale" ? "Veraltet" : lane.status === "disabled" ? "Deaktiviert" : "Nicht verfügbar"}</strong></div>
        <div><span>Letzter Limitabruf</span><strong>{lane.updatedAt ? formatRelativeTime(lane.updatedAt) : "Nicht bekannt"}</strong></div>
      </div>

      <section className="uat-detail-section">
        <h3>Limitfenster</h3>
        <dl className="uat-details-limits">
          {apiLane.windows.length > 0 ? apiLane.windows.map((window) => (
            <div key={window.id}>
              <dt>{shortWindowLabel(window.label)}</dt>
              <dd>
                <strong>{Math.round(window.remainingPercent)} % verbleibend</strong>
                <span>{Math.round(window.usedPercent)} % verbraucht</span>
                <small>{window.resetsAt ? formatUsageReset(window.resetsAt) : "Reset unbekannt"}</small>
              </dd>
            </div>
          )) : <p className="uat-detail-empty">Für diesen Account liegen keine Limitfenster vor.</p>}
        </dl>
      </section>

      <section className="uat-detail-section">
        <h3>Accountdaten</h3>
        <dl className="uat-details-meta">
          <div><dt>Account</dt><dd>{apiLane.accountLabel}</dd></div>
          {showEmail && apiLane.email ? <div><dt>E-Mail</dt><dd title={apiLane.email}>{apiLane.email}</dd></div> : null}
          {showPlan && apiLane.plan ? <div><dt>Plan</dt><dd>{apiLane.plan}</dd></div> : null}
          {showDataStatus ? <div><dt>Datenstatus</dt><dd>{lane.status}</dd></div> : null}
        </dl>
      </section>

      {lane.status !== "available" && lane.error ? (
        <p className="uat-detail-error"><WarningIcon className="h-3 w-3" />{lane.error.message}</p>
      ) : null}
      {apiLane.resetCredits.length > 0 ? (
        <p className="uat-detail-credits"><CoinsIcon className="h-3 w-3" />{apiLane.resetCredits.length} Reset-Guthaben verfügbar</p>
      ) : null}
    </div>
  );
}

export interface UsageAccountTableProps {
  views: AccountLimitView[];
  showProvider: boolean;
  showActiveBadge: boolean;
  showDataStatus: boolean;
  showEmail: boolean;
  showPlan: boolean;
}

export function UsageAccountTable({ views, showProvider, showActiveBadge, showDataStatus, showEmail, showPlan }: UsageAccountTableProps) {
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);
  const openView = openAccountId === null ? null : views.find((view) => view.lane.accountId === openAccountId) ?? null;

  if (views.length === 0) {
    return <p className="uat-empty" role="status">Für die gewählten Filter sind keine Accounts sichtbar.</p>;
  }

  return (
    <>
      <div className="uat" role="table" aria-label="Aktuelle Limits je Account">
        <div className="uat-head" role="row">
          <span>Account</span>
          <span>Limits</span>
          <span>Reset</span>
          <span aria-hidden="true" />
        </div>
        {views.map((view) => {
          const { lane, limits } = view;
          const reset = nextReset(view);
          const open = openAccountId === lane.accountId;
          return (
            <div className={`uat-row ${lane.active ? "is-active" : ""}`} role="row" key={lane.accountId}>
              <button
                type="button"
                className="uat-row-main"
                onClick={() => setOpenAccountId((current) => current === lane.accountId ? null : lane.accountId)}
                aria-expanded={open}
                aria-label={`${lane.accountLabel} Details`}
              >
                <span className="uat-account-cell">
                  <span className={`uat-provider-dot qt-provider-${providerLabel[lane.providerId]}`} aria-hidden="true" />
                  <span className="uat-account-copy">
                    <strong title={lane.accountLabel}>{lane.accountLabel}</strong>
                    <small>{[showProvider ? providerName[lane.providerId] : null, lane.email && lane.email !== lane.accountLabel ? lane.email : null, lane.plan].filter(Boolean).join(" · ") || providerName[lane.providerId]}</small>
                  </span>
                  {lane.active && showActiveBadge ? <Badge tone="ok">Aktiv</Badge> : null}
                </span>
                <span className="uat-cell-limits">
                  {limits.length > 0 ? limits.map((limit) => <LimitCell key={limit.label} label={limit.label} remaining={limit.remaining} />) : <span className="uat-no-limits">Keine Limitdaten</span>}
                </span>
                <span className="uat-cell-reset">
                  <strong>{reset?.relative ?? "Reset unbekannt"}</strong>
                  {reset ? <small>{reset.exact}</small> : null}
                </span>
                <span className="uat-cell-expand" aria-hidden="true">{open ? "−" : "+"}</span>
              </button>
            </div>
          );
        })}
      </div>

      <ModalFrame
        open={openView !== null}
        title={openView ? `${openView.lane.accountLabel} · Limits` : "Limitdetails"}
        description={openView ? `${providerName[openView.lane.providerId]}${openView.apiLane.plan ? ` · ${openView.apiLane.plan}` : ""}` : undefined}
        className="uat-dialog"
        onClose={() => setOpenAccountId(null)}
      >
        {() => openView ? <DetailRows view={openView} showEmail={showEmail} showPlan={showPlan} showDataStatus={showDataStatus} /> : null}
      </ModalFrame>
    </>
  );
}
