import { useState } from "react";
import { RefreshIcon, ServerIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";

export function HermesDisconnectedState({ reason, onRetry, onDiagnostics }: { reason: string; onRetry: () => void; onDiagnostics: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restart = async () => {
    setBusy(true);
    setError(null);
    try { await apiClient.hermesServiceAction("dashboard", "restart"); onRetry(); } catch { setError("Der Dienst konnte nicht neu gestartet werden. Öffne die Diagnose für Details."); } finally { setBusy(false); }
  };
  return <div className="hermes-recovery" role="alert"><ServerIcon className="h-7 w-7" /><h2>Hermes Dashboard ist nicht erreichbar</h2><p>{reason}</p>{error ? <p className="hermes-chat-error">{error}</p> : null}<div><button type="button" className="quiet-button-primary" onClick={() => void restart()} disabled={busy}>{busy ? "Wird gestartet…" : "Neu starten"}</button><button type="button" className="quiet-button" onClick={onDiagnostics}>Diagnose öffnen</button><button type="button" className="quiet-button" onClick={onRetry}><RefreshIcon className="h-4 w-4" /> Erneut prüfen</button></div></div>;
}
