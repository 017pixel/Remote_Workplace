import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListIcon, PlusIcon, SearchIcon, TrashIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";
import type { HermesSession, HermesSessionSource } from "@workbench/contracts";

const sourceLabels: Record<HermesSessionSource, string> = { web: "Web", cli: "CLI", telegram: "Telegram", cron: "Cron", acp: "ACP", other: "Sonstiges" };

export function HermesSessionSidebar({ activeSessionId, collapsed, onToggle, onSelect, onNew }: { activeSessionId: string | null; collapsed: boolean; onToggle: () => void; onSelect: (session: HermesSession) => void; onNew: () => void }) {
  const [query, setQuery] = useState("");
  const sessions = useQuery(workbenchQueries.hermesSessions(query));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Schmal wird daraus eine Drawer-Taste; das Wort passt dann nicht mehr in die
  // 44-px-Fläche, deshalb trägt das Icon die Bedeutung und der Text entfällt.
  if (collapsed) return <button type="button" className="hermes-sidebar-collapsed" onClick={onToggle} aria-label="Sessionliste öffnen" title="Sessionliste öffnen"><ListIcon className="h-4 w-4" /><span>Sessions</span></button>;
  return <aside className="hermes-session-sidebar" aria-label="Hermes-Sessions">
    <div className="hermes-sidebar-header"><strong>Sessions</strong><button type="button" className="hermes-icon-button" onClick={onNew} aria-label="Neuen Chat starten" title="Neuer Chat"><PlusIcon className="h-4 w-4" /></button><button type="button" className="hermes-icon-button" onClick={onToggle} aria-label="Sessionliste einklappen" title="Einklappen">‹</button></div>
    <label className="hermes-search"><SearchIcon className="h-3.5 w-3.5" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sessions suchen" aria-label="Sessions suchen" /></label>
    <div className="hermes-session-list">
      {sessions.isLoading ? <span className="hermes-sidebar-muted">Sessions werden geladen…</span> : null}
      {sessions.isError ? <span className="hermes-sidebar-muted">Sessionliste nicht erreichbar.</span> : null}
      {sessions.data?.sessions.map((session) => <div key={session.id} className={`hermes-session-row ${session.id === activeSessionId ? "is-active" : ""}`}>
        <button type="button" onClick={() => onSelect(session)} aria-current={session.id === activeSessionId ? "page" : undefined}>
          <span className={`hermes-session-status is-${session.status}`} />
          <span className="hermes-session-copy"><strong>{session.title || "Hermes-Session"}</strong><small>{sourceLabels[session.source]} · {session.model ?? "Modell unbekannt"}</small></span>
          <time>{session.updatedAt ? new Date(session.updatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}</time>
        </button>
        {confirmDelete === session.id ? <span className="hermes-delete-confirm"><button type="button" onClick={() => setConfirmDelete(null)}>Nein</button><button type="button" onClick={() => { void apiClient.deleteHermesSession(session.id).then(() => sessions.refetch()); setConfirmDelete(null); }}>Löschen</button></span> : <button type="button" className="hermes-row-delete" onClick={() => setConfirmDelete(session.id)} aria-label={`${session.title} löschen`} title="Session löschen"><TrashIcon className="h-3.5 w-3.5" /></button>}
      </div>)}
      {!sessions.isLoading && sessions.data?.sessions.length === 0 ? <span className="hermes-sidebar-muted">Noch keine Sessions.</span> : null}
    </div>
  </aside>;
}
