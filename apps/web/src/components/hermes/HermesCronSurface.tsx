import { useQuery } from "@tanstack/react-query";
import { ClockIcon } from "../icons";
import { workbenchQueries } from "../../lib/queryOptions";
import { formatHermesDateTime } from "../../lib/hermesPresentation";

function statusLabel(status: string): string {
  switch (status) {
    case "success": return "Erfolgreich";
    case "failed": return "Fehlgeschlagen";
    case "running": return "Läuft gerade";
    default: return "Unbekannt";
  }
}

/** Geplante Hermes-Aufgaben. Bearbeitung der Jobs läuft in der Verwaltung. */
export function HermesCronSurface({ onOpenAdmin }: { onOpenAdmin: (path: string) => void }) {
  const jobs = useQuery(workbenchQueries.hermesCron());

  return (
    <div className="hermes-surface-pane" role="region" aria-label="Hermes-Cron">
      <div className="hermes-cron-body">
        {jobs.isLoading ? <span className="hermes-sidebar-muted">Cron-Jobs werden geladen…</span> : null}
        {jobs.isError ? <span className="hermes-sidebar-muted">Die Cron-Jobs sind gerade nicht erreichbar.</span> : null}
        {jobs.data?.jobs.length === 0 ? (
          <div className="hermes-empty-chat"><ClockIcon className="hermes-empty-mark" /><strong>Keine Cron-Jobs</strong><p>Geplante Hermes-Aufgaben erscheinen hier, sobald welche eingerichtet sind.</p><button type="button" className="hermes-admin-open" onClick={() => onOpenAdmin("/cron")}>Jobs in der Verwaltung anlegen</button></div>
        ) : (
          <ul className="hermes-cron-list">
            {jobs.data?.jobs.map((job) => (
              <li key={job.id} className={`hermes-cron-row is-${job.lastStatus}`}>
                <button type="button" className="hermes-cron-main" onClick={() => onOpenAdmin(job.adminPath)} aria-label={`Job „${job.name}“ in der Verwaltung öffnen`}>
                  <span className={`hermes-session-status is-${job.enabled ? "running" : "idle"}`} aria-hidden />
                  <span className="hermes-session-copy">
                    <strong>{job.name}</strong>
                    <small><code>{job.schedule}</code> · {job.enabled ? "aktiv" : "pausiert"}</small>
                  </span>
                  <span className="hermes-cron-times">
                    <time>Nächste: {formatHermesDateTime(job.nextRunAt)}</time>
                    <time>Letzte: {formatHermesDateTime(job.lastRunAt)} ({statusLabel(job.lastStatus)})</time>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
