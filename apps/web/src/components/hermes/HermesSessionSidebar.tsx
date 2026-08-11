import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListIcon, PlusIcon, SearchIcon, TrashIcon } from "../icons";
import { ConfirmDialog } from "../ModalDialog";
import { apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";
import type { HermesSession } from "@workbench/contracts";
import { formatHermesShortDate, hermesSourceLabels } from "../../lib/hermesPresentation";

export function HermesSessionSidebar({ active, activeSessionId, collapsed, drawer, onModalOpenChange, onToggle, onSelect, onNew }: { active: boolean; activeSessionId: string | null; collapsed: boolean; drawer: boolean; onModalOpenChange: (open: boolean) => void; onToggle: () => void; onSelect: (session: HermesSession) => void; onNew: () => void }) {
  const [query, setQuery] = useState("");
  const sessions = useQuery({ ...workbenchQueries.hermesSessions(query), enabled: active && !collapsed });
  const [confirmDelete, setConfirmDelete] = useState<HermesSession | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const closeConfirm = () => {
    setConfirmDelete(null);
    onModalOpenChange(false);
  };
  const remove = async (session: HermesSession) => {
    setDeleteError(null);
    try {
      await apiClient.deleteHermesSession(session.id);
      await sessions.refetch();
    } catch {
      setDeleteError("Die Session konnte nicht gelöscht werden.");
    } finally {
      closeConfirm();
    }
  };
  // Schmal wird daraus eine Drawer-Taste; das Wort passt dann nicht mehr in die
  // 44-px-Fläche, deshalb trägt das Icon die Bedeutung und der Text entfällt.
  if (collapsed) return <button type="button" className="hermes-sidebar-collapsed" onClick={onToggle} aria-label="Sessionliste öffnen" title="Sessionliste öffnen"><ListIcon className="h-4 w-4" /><span>Sessions</span></button>;
  return <><aside className="hermes-session-sidebar" aria-label="Hermes-Sessions" role={drawer ? "dialog" : undefined} aria-modal={drawer || undefined}>
    <div className="hermes-sidebar-header"><strong>Sessions</strong><button type="button" className="hermes-icon-button" onClick={onNew} aria-label="Neuen Chat starten" title="Neuer Chat"><PlusIcon className="h-4 w-4" /></button><button type="button" className="hermes-icon-button" onClick={onToggle} aria-label="Sessionliste einklappen" title="Einklappen" data-modal-autofocus={drawer ? "true" : undefined}>‹</button></div>
    <label className="hermes-search"><SearchIcon className="h-3.5 w-3.5" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sessions suchen" aria-label="Sessions suchen" /></label>
    <div className="hermes-session-list">
      {deleteError ? <span className="hermes-sidebar-muted is-error" role="alert">{deleteError}</span> : null}
      {sessions.isLoading ? <span className="hermes-sidebar-muted">Sessions werden geladen…</span> : null}
      {sessions.isError ? <span className="hermes-sidebar-muted">Sessionliste nicht erreichbar.</span> : null}
      {sessions.data?.sessions.map((session) => <div key={session.id} className={`hermes-session-row ${session.id === activeSessionId ? "is-active" : ""}`}>
        <button type="button" onClick={() => onSelect(session)} aria-current={session.id === activeSessionId ? "page" : undefined}>
          <span className={`hermes-session-status is-${session.status}`} />
          <span className="hermes-session-copy"><strong>{session.title || "Hermes-Session"}</strong><small>{hermesSourceLabels[session.source]} · {session.model ?? "Modell unbekannt"}</small></span>
          <time>{formatHermesShortDate(session.updatedAt)}</time>
        </button>
        <button type="button" className="hermes-row-delete" onClick={() => { setConfirmDelete(session); onModalOpenChange(true); }} aria-label={`${session.title} löschen`} title="Session löschen"><TrashIcon className="h-3.5 w-3.5" /></button>
      </div>)}
      {!sessions.isLoading && sessions.data?.sessions.length === 0 ? <span className="hermes-sidebar-muted">Noch keine Sessions.</span> : null}
    </div>
  </aside><ConfirmDialog open={confirmDelete !== null} title="Session löschen?" description={confirmDelete ? `„${confirmDelete.title || "Hermes-Session"}“ wird dauerhaft aus Hermes entfernt.` : ""} confirmLabel="Session löschen" danger className="hermes-confirm-dialog" backdropClassName="hermes-dialog-backdrop" onConfirm={() => { if (confirmDelete) void remove(confirmDelete); }} onClose={closeConfirm} /></>;
}
