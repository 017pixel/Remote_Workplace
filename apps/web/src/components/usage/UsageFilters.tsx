import type { TimelineLane } from "../../lib/quotaTimeline";
import type { UsagePreferences } from "../../stores/usagePreferences";
import { useUsagePreferences } from "../../stores/usagePreferences";
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "../icons";

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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeCount = Number(prefs.providerFilter !== "all") + Number(prefs.onlyActive) + Number(prefs.onlyProblematic) + Number(prefs.hideAccountsWithoutData) + Number(prefs.hiddenAccountIds.length > 0);
  const reset = () => store.set({ providerFilter: "all", onlyActive: false, onlyProblematic: false, hideAccountsWithoutData: false, hiddenAccountIds: [] });
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button,select")?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  return (
    <div className="uf-shell"><div className="uf-mobile-bar" role="group" aria-label="Filter und Sortierung">
      <button ref={triggerRef} type="button" className="uf-mobile-button" aria-expanded={open} onClick={() => setOpen(true)}>Filter{activeCount ? ` ${activeCount}` : ""}</button>
      <label className="uf-mobile-sort"><span className="sr-only">Sortierung</span><select value={prefs.sortBy} onChange={(event) => store.set({ sortBy: event.target.value as UsagePreferences["sortBy"] })}><option value="default">Sortieren</option><option value="provider">Provider</option><option value="name">Accountname</option><option value="lowest">Niedrigstes Limit</option><option value="nextReset">Nächster Reset</option><option value="status">Status</option></select></label>
    </div><div className={`uf-backdrop ${open ? "is-open" : ""}`} onPointerDown={() => setOpen(false)} />
    <div ref={panelRef} className={`uf ${open ? "is-open" : ""}`} role={open ? "dialog" : "group"} aria-modal={open || undefined} aria-label="Filter und Sortierung">
      <header className="uf-sheet-head"><strong>Filter</strong>{activeCount ? <button type="button" onClick={reset}>Reset</button> : null}<button type="button" className="icon-button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="Filter schließen"><CloseIcon className="h-4 w-4" /></button></header>
      <label className="uf-select">
        <span className="uf-label">Provider</span>
        <select
          value={prefs.providerFilter}
          onChange={(event) => store.set({ providerFilter: event.target.value as UsagePreferences["providerFilter"] })}
        >
          <option value="all">Alle Provider</option>
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

      {([["onlyActive", "Aktiv", "Nur aktiv"], ["onlyProblematic", "Problematisch", "Nur problematische"], ["hideAccountsWithoutData", "Ohne Daten", "Ohne Daten ausblenden"]] as const).map(([key, label, ariaLabel]) => <button key={key} type="button" className="uf-chip" aria-label={ariaLabel} aria-pressed={prefs[key]} onClick={() => store.set({ [key]: !prefs[key] })}>{label}</button>)}

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

      {activeCount ? <button type="button" className="uf-reset" onClick={reset}>Alle Filter löschen</button> : null}
    </div></div>
  );
}
