import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, CloseIcon, HermesIcon, SearchIcon, TrashIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import type { HermesSession, HermesSessionSource } from "@workbench/contracts";

const sourceLabels: Record<HermesSessionSource, string> = { web: "Web", cli: "CLI", telegram: "Telegram", cron: "Cron", acp: "ACP", other: "Sonstiges" };
const filters: Array<{ value: HermesSessionSource | "all"; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "cron", label: "Cron" },
  { value: "acp", label: "Chat" },
  { value: "telegram", label: "Telegram" },
  { value: "web", label: "Web" },
  { value: "cli", label: "CLI" },
];

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + " " + new Date(value).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Verlauf aller Hermes-Sessions mit Filter, Öffnen im Chat und Löschen. */
export function HermesHistorySurface({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const [filter, setFilter] = useState<HermesSessionSource | "all">("all");
  const [query, setQuery] = useState("");
  const sessions = useQuery({
    queryKey: ["hermes", "sessions", filter, query],
    queryFn: ({ signal }) => apiClient.hermesSessions({ limit: 100, ...(filter !== "all" ? { source: filter } : {}), ...(query.trim() ? { q: query.trim() } : {}) }, signal),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const visible = sessions.data?.sessions ?? [];

  const remove = async (session: HermesSession) => {
    setDeleteError(null);
    try {
      await apiClient.deleteHermesSession(session.id);
      await sessions.refetch();
    } catch {
      setDeleteError("Die Session konnte nicht gelöscht werden.");
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="hermes-surface-pane" role="region" aria-label="Hermes-Verlauf">
      {deleteError ? <div className="hermes-chat-error" role="alert">{deleteError}</div> : null}
      <div className="hermes-history-toolbar">
        <label className="hermes-search"><SearchIcon className="h-3.5 w-3.5" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sessions durchsuchen" aria-label="Sessions durchsuchen" /></label>
        <div className="hermes-filter-tabs" role="tablist" aria-label="Nach Quelle filtern">
          {filters.map((entry) => (
            <button key={entry.value} type="button" role="tab" aria-selected={filter === entry.value} className={filter === entry.value ? "is-active" : ""} onClick={() => setFilter(entry.value)}>
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hermes-history-body">
        {sessions.isLoading ? <span className="hermes-sidebar-muted">Verlauf wird geladen…</span> : null}
        {sessions.isError ? <span className="hermes-sidebar-muted">Der Verlauf ist gerade nicht erreichbar.</span> : null}
        {visible.length === 0 && !sessions.isLoading ? (
          <div className="hermes-empty-chat"><HermesIcon className="hermes-empty-mark" /><strong>Keine Sessions gefunden</strong><p>Hier erscheinen alle abgeschlossenen Hermes-Gespräche und Aufgaben.</p></div>
        ) : (
          <ul className="hermes-history-list">
            {visible.map((session) => (
              <li key={session.id} className={`hermes-history-row is-${session.status}`}>
                <button type="button" className="hermes-history-main" onClick={() => onOpenSession(session.id)}>
                  <span className={`hermes-session-status is-${session.status}`} aria-hidden />
                  <span className="hermes-session-copy">
                    <strong>{session.title || "Hermes-Session"}</strong>
                    <small>{sourceLabels[session.source]} · {session.model ?? "Modell unbekannt"} · {session.status === "failed" ? "fehlgeschlagen" : session.status === "running" ? "läuft" : "abgeschlossen"}</small>
                  </span>
                  <time>{formatDate(session.updatedAt ?? session.createdAt)}</time>
                </button>
                {confirmDelete === session.id ? (
                  <span className="hermes-delete-confirm">
                    <button type="button" onClick={() => setConfirmDelete(null)}><CheckIcon className="h-3.5 w-3.5" /> Behalten</button>
                    <button type="button" onClick={() => void remove(session)}><CloseIcon className="h-3.5 w-3.5" /> Löschen</button>
                  </span>
                ) : (
                  <button type="button" className="hermes-row-delete" onClick={() => setConfirmDelete(session.id)} aria-label={`Session „${session.title}“ löschen`} title="Session löschen"><TrashIcon className="h-3.5 w-3.5" /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
