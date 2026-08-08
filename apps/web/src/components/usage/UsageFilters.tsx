import type { TimelineLane } from "../../lib/quotaTimeline";
import type { UsagePreferences } from "../../stores/usagePreferences";
import { useUsagePreferences } from "../../stores/usagePreferences";
import { ChevronDownIcon } from "../icons";

const providerName: Record<TimelineLane["providerId"], string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode Go",
};

export interface UsageFiltersProps {
  /** Alle bekannten Lanes (vor dem Filtern), für Account-Optionen. */
  lanes: TimelineLane[];
  prefs: UsagePreferences;
}

export function UsageFilters({ lanes, prefs }: UsageFiltersProps) {
  const store = useUsagePreferences();

  return (
    <div className="uf" role="group" aria-label="Filter und Sortierung">
      <label className="uf-select">
        <span className="uf-label">Provider</span>
        <select
          value={prefs.providerFilter}
          onChange={(event) => store.set({ providerFilter: event.target.value as UsagePreferences["providerFilter"] })}
        >
          <option value="all">Alle</option>
          {(["codex", "claude", "opencode"] as const).map((provider) => (
            <option key={provider} value={provider}>{providerName[provider]}</option>
          ))}
        </select>
      </label>

      <label className="uf-select">
        <span className="uf-label">Sortierung</span>
        <select value={prefs.sortBy} onChange={(event) => store.set({ sortBy: event.target.value as UsagePreferences["sortBy"] })}>
          <option value="default">Aktiv zuerst, niedrigstes Limit</option>
          <option value="provider">Provider</option>
          <option value="name">Accountname</option>
          <option value="lowest">Niedrigstes Restlimit</option>
          <option value="nextReset">Nächster Reset</option>
          <option value="status">Status</option>
        </select>
      </label>

      <label className="uf-check">
        <input type="checkbox" checked={prefs.onlyActive} onChange={(event) => store.set({ onlyActive: event.target.checked })} />
        <span>Nur aktiv</span>
      </label>
      <label className="uf-check">
        <input type="checkbox" checked={prefs.onlyProblematic} onChange={(event) => store.set({ onlyProblematic: event.target.checked })} />
        <span>Nur problematische</span>
      </label>
      <label className="uf-check">
        <input type="checkbox" checked={prefs.hideAccountsWithoutData} onChange={(event) => store.set({ hideAccountsWithoutData: event.target.checked })} />
        <span>Ohne Daten ausblenden</span>
      </label>

      {lanes.length > 1 ? (
        <label className="uf-select uf-account-select">
          <span className="uf-label">Account</span>
          <select
            value=""
            onChange={(event) => {
              const accountId = event.target.value;
              if (!accountId) return;
              store.set({ hiddenAccountIds: [...prefs.hiddenAccountIds, accountId] });
              // Auswahl zurücksetzen, damit derselbe Account erneut gewählt werden kann.
              event.target.value = "";
            }}
          >
            <option value="">Ausblenden…</option>
            {lanes
              .filter((lane) => !prefs.hiddenAccountIds.includes(lane.accountId))
              .map((lane) => (
                <option key={lane.accountId} value={lane.accountId}>{lane.accountLabel}</option>
              ))}
          </select>
        </label>
      ) : null}

      {prefs.hiddenAccountIds.length > 0 ? (
        <button type="button" className="uf-reset" onClick={() => store.set({ hiddenAccountIds: [] })}>
          <ChevronDownIcon className="h-3 w-3" />
          Ausgeblendete zeigen
        </button>
      ) : null}
    </div>
  );
}
