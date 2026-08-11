import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshIcon } from "../icons";
import { ModalFrame } from "../ModalDialog";
import { apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";

const statusLabels: Record<string, string> = { ok: "OK", warn: "Warnung", fail: "Fehler", skipped: "Übersprungen" };

/** Kompakter Diagnose-Dialog für den Hermes-Bereich. */
export function HermesDiagnosticsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const diagnostics = useQuery({ ...workbenchQueries.hermesDiagnostics(), enabled: open });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await apiClient.runHermesDiagnostics();
      await diagnostics.refetch();
    } catch {
      setRefreshError("Die Diagnose konnte nicht neu gestartet werden.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ModalFrame open={open} title="Hermes-Diagnose" className="hermes-diagnostics-dialog" backdropClassName="hermes-dialog-backdrop" onClose={onClose}>
      {(requestClose) => <>
        <div className="hermes-diagnostics-content">
          {diagnostics.isLoading ? <span className="hermes-sidebar-muted">Prüfungen werden ausgeführt…</span> : null}
          {diagnostics.isError ? <span className="hermes-sidebar-muted">Die Diagnose ist nicht erreichbar.</span> : null}
          {refreshError ? <span className="hermes-sidebar-muted is-error" role="alert">{refreshError}</span> : null}
          {diagnostics.data?.items.map((item) => (
            <div key={item.id} className={`hermes-diagnostic-row is-${item.status}`}>
              <span>{statusLabels[item.status] ?? item.status}</span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
                {item.status !== "ok" && item.status !== "skipped" ? <small>{item.hint}</small> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-actions hermes-diagnostics-actions">
          <button type="button" className="quiet-button" onClick={() => void refresh()} disabled={refreshing}><RefreshIcon className="h-4 w-4" /> {refreshing ? "Prüft erneut…" : "Neu prüfen"}</button>
          <button type="button" className="quiet-button-primary" onClick={requestClose}>Schließen</button>
        </div>
      </>}
    </ModalFrame>
  );
}
