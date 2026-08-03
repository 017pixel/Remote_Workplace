import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CloseIcon, HermesIcon, MoreIcon, RefreshIcon, ServerIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";
import type { HermesStatus } from "@workbench/contracts";

type ChipTone = "ok" | "warn" | "bad" | "idle";

function StatusChip({ tone, label, value, title }: { tone: ChipTone; label: string; value: string; title?: string | undefined }) {
  return (
    <span className={`hermes-chip is-${tone}`} title={title ?? `${label}: ${value}`}>
      <span className="hermes-chip-dot" aria-hidden />
      <span className="hermes-chip-label">{label}</span>
      <span className="hermes-chip-value">{value}</span>
    </span>
  );
}

function gatewayChip(status: HermesStatus | undefined): { tone: ChipTone; value: string } {
  if (!status) return { tone: "idle", value: "…" };
  if (status.gateway.state !== "active") return { tone: "bad", value: "gestoppt" };
  if (status.gateway.telegramConnected === false) return { tone: "warn", value: "ohne Telegram" };
  return { tone: "ok", value: status.gateway.telegramConnected ? "Telegram" : "aktiv" };
}

/**
 * Kopfzeile des Hermes-Bereichs.
 *
 * Zeigt dauerhaft, was im Betrieb zählt: Verbindung des nativen Chats, Zustand
 * von Dashboard und Gateway, Modell und Version. Die Flächenwahl steckt
 * bewusst nicht mehr im Menü, sondern in `HermesSurfaceNav` — dort ist die
 * offizielle Hermes-Oberfläche sichtbar statt hinter drei Punkten versteckt.
 */
export function HermesHeader({
  status,
  connected,
  running,
  sessionTitle,
  hasSession,
  projectId,
  onProjectChange,
  onNewSession,
  onModelChange,
  onCancel,
  onDiagnostics,
  onRetry,
}: {
  status: HermesStatus | undefined;
  connected: boolean;
  running: boolean;
  sessionTitle: string | null;
  hasSession: boolean;
  projectId: string | null;
  onProjectChange: (projectId: string | null) => void;
  onNewSession: () => void;
  onModelChange: (model: string) => void;
  onCancel: () => boolean;
  onDiagnostics: () => void;
  onRetry: () => void;
}) {
  const models = useQuery(workbenchQueries.hermesModels());
  const projects = useQuery(workbenchQueries.projects());
  const update = useQuery(workbenchQueries.hermesUpdateStatus());
  const client = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const runAction = async (action: () => Promise<unknown>, after?: () => void) => {
    setActionError(null);
    try {
      await action();
      after?.();
    } catch {
      setActionError("Die Hermes-Aktion konnte nicht ausgeführt werden. Öffne die Diagnose für Details.");
    }
  };
  const chooseModel = async (model: string) => {
    await runAction(async () => {
      await apiClient.selectHermesModel(model);
      if (hasSession) onModelChange(model);
      await client.invalidateQueries({ queryKey: ["hermes", "models"] });
    });
  };
  const runUpdate = async () => {
    if (!window.confirm("Hermes jetzt aktualisieren? Laufende Aufgaben werden angezeigt und können den Lauf verschieben.")) return;
    await runAction(async () => {
      await apiClient.hermesUpdateRun();
      await client.invalidateQueries({ queryKey: ["hermes", "update"] });
    });
  };

  const gateway = gatewayChip(status);
  const dashboardTone: ChipTone = !status ? "idle" : status.reachable ? "ok" : status.dashboard.state === "activating" ? "warn" : "bad";
  const dashboardValue = !status ? "…" : status.reachable ? "aktiv" : status.dashboard.state === "activating" ? "startet" : "offline";
  // `available` kennt nur der Statusdienst; die Zustandsdatei des Update-Laufs
  // meldet lediglich, ob ein erkanntes Update verschoben wurde.
  const updateAvailable = Boolean(status?.update.available || status?.update.pending || update.data?.pending);

  return (
    <header className="hermes-header">
      <div className="hermes-brand">
        <HermesIcon className="hermes-brand-mark" />
        <div className="hermes-brand-copy">
          <strong>Hermes Agent</strong>
          <span>{sessionTitle ?? (status?.provider ? `${status.provider} · ungebundener Chat` : "Ungebundener Chat")}</span>
        </div>
      </div>

      <div className="hermes-status-strip">
        <StatusChip tone={connected ? "ok" : "warn"} label="Chat" value={connected ? "verbunden" : "verbindet"} />
        <StatusChip tone={dashboardTone} label="Dashboard" value={dashboardValue} />
        <StatusChip tone={gateway.tone} label="Gateway" value={gateway.value} title={status?.gateway.lastError ?? undefined} />
        {status?.model ? <StatusChip tone="idle" label="Modell" value={status.model} /> : null}
        {status?.version ? <StatusChip tone={updateAvailable ? "warn" : "idle"} label="Version" value={updateAvailable ? `${status.version} · Update` : status.version} /> : null}
      </div>

      <div className="hermes-header-actions">
        {running ? (
          <button type="button" className="hermes-stop-header" onClick={onCancel} aria-label="Hermes-Aufgabe stoppen">
            <CloseIcon className="h-4 w-4" /> Stoppen
          </button>
        ) : null}
        <div className={`hermes-header-menu ${menuOpen ? "is-open" : ""}`}>
          <button type="button" className="hermes-icon-button" aria-label="Hermes-Menü" aria-expanded={menuOpen} aria-haspopup="menu" title="Hermes-Menü" onClick={() => setMenuOpen((open) => !open)}>
            <MoreIcon className="h-5 w-5" />
          </button>
          {menuOpen ? (
            <>
              <div className="hermes-menu-scrim" role="presentation" onClick={() => setMenuOpen(false)} />
              <div className="hermes-menu-panel" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onNewSession(); }}>
                  <RefreshIcon className="h-4 w-4" /> Neuer Chat
                </button>
                <label className="hermes-menu-field">
                  <span>Modell</span>
                  <select
                    value={models.data?.current?.id ?? ""}
                    onChange={(event) => { if (event.target.value) void chooseModel(event.target.value); }}
                    disabled={models.isLoading}
                  >
                    <option value="">Modell wählen</option>
                    {models.data?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                  </select>
                </label>
                <label className="hermes-menu-field">
                  <span>Projektbindung</span>
                  <select value={projectId ?? ""} onChange={(event) => onProjectChange(event.target.value || null)}>
                    <option value="">Ungebunden</option>
                    {projects.data?.projects.filter((project) => project.availability === "available").map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
                <div className="hermes-menu-separator" />
                <button type="button" role="menuitem" onClick={() => void runAction(() => apiClient.hermesServiceAction("gateway", "restart"))}>
                  <RefreshIcon className="h-4 w-4" /> Gateway neu starten
                </button>
                <button type="button" role="menuitem" onClick={() => void runAction(() => apiClient.hermesServiceAction("dashboard", "restart"), onRetry)}>
                  <RefreshIcon className="h-4 w-4" /> Dashboard neu starten
                </button>
                <button type="button" role="menuitem" onClick={() => void runAction(() => apiClient.hermesUpdateCheck(), onRetry)}>
                  <CheckIcon className="h-4 w-4" /> Nach Updates suchen
                </button>
                {update.data?.pending ? (
                  <button type="button" role="menuitem" onClick={() => void runUpdate()}>
                    <RefreshIcon className="h-4 w-4" /> Update ausführen
                  </button>
                ) : null}
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDiagnostics(); }}>
                  <ServerIcon className="h-4 w-4" /> Diagnose öffnen
                </button>
                {actionError ? <span className="hermes-menu-error" role="alert">{actionError}</span> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
