import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloseIcon, RefreshIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";

const statusLabels: Record<string, string> = { ok: "OK", warn: "Warnung", fail: "Fehler", skipped: "Übersprungen" };

/** Kompakter Diagnose-Dialog für den Hermes-Bereich. */
export function HermesDiagnosticsDialog({ onClose }: { onClose: () => void }) {
  const diagnostics = useQuery(workbenchQueries.hermesDiagnostics());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await apiClient.runHermesDiagnostics();
      await diagnostics.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="hermes-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="hermes-diagnostics-dialog" role="dialog" aria-modal="true" aria-label="Hermes-Diagnose">
        <header>
          <h2>Diagnose</h2>
          <button type="button" className="hermes-icon-button" onClick={onClose} aria-label="Diagnose schließen"><CloseIcon className="h-4 w-4" /></button>
        </header>
        <div>
          {diagnostics.isLoading ? <span className="hermes-sidebar-muted">Prüfungen werden ausgeführt…</span> : null}
          {diagnostics.isError ? <span className="hermes-sidebar-muted">Die Diagnose ist nicht erreichbar.</span> : null}
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
        <footer>
          <button type="button" className="quiet-button" onClick={() => void refresh()} disabled={refreshing}><RefreshIcon className="h-4 w-4" /> {refreshing ? "Prüft erneut…" : "Neu prüfen"}</button>
          <button type="button" className="quiet-button-primary" onClick={onClose}>Schließen</button>
        </footer>
      </div>
    </div>
  );
}
