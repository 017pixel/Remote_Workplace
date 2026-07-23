import { useQuery } from "@tanstack/react-query";
import { Download, Info, GitBranch, ShieldCheck, Trash2 } from "lucide-react";
import { workbenchQueries } from "../lib/queryOptions";
import { usePwaInstall } from "../lib/usePwaInstall";
import { useWorkspaceStore, WORKSPACE_STORAGE_KEY } from "../stores/workspace";
import { Card } from "../components/Card";
import { Badge } from "../components/primitives";
import { WORKBENCH_LIMITS } from "@workbench/contracts";
import { useState } from "react";
import { ConfirmDialog } from "../components/ModalDialog";

export function Settings() {
  const health = useQuery(workbenchQueries.health());
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);
  const panelCount = useWorkspaceStore((s) => s.panels.length);
  const workspaceCount = useWorkspaceStore((s) => s.workspaces.length);
  const pwa = usePwaInstall();
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div className="page-scroll">
      <div className="page-frame max-w-4xl">
        <div className="page-heading">
          <h1>Einstellungen</h1>
          <p>Lokaler Workspace-Zustand und Informationen zur Workbench.</p>
        </div>
        <Card title="Version" subtitle="Wird aus der Health-Antwort gelesen" action={<GitBranch className="h-4 w-4 text-faint" />}>
          <div className="flex items-center gap-3">
            <span className="text-xl font-medium tracking-tight text-text">
              {health.data?.version ?? "—"}
            </span>
            <Badge tone="accent">Workbench 3</Badge>
          </div>
          {health.data ? (
            <p className="mt-2 text-[12px] text-faint">Backend-Status: {health.data.status}</p>
          ) : null}
        </Card>

        <Card title="Workspace" subtitle="Lokaler, persistenter Zustand">
          <div className="space-y-3 text-[13px]">
            <div className="data-row px-0">
              <span className="text-muted">Geöffnete Panels</span>
              <span className="font-mono text-text">{panelCount} / {WORKBENCH_LIMITS.maxResidentTools}</span>
            </div>
            <div className="data-row px-0">
              <span className="text-muted">Arbeitsflächen</span>
              <span className="font-mono text-text">{workspaceCount} / {WORKBENCH_LIMITS.maxWorkspaces}</span>
            </div>
            <div className="data-row px-0">
              <span className="text-muted">Speicherort</span>
              <span className="font-mono text-[12px] text-faint">{WORKSPACE_STORAGE_KEY}</span>
            </div>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="quiet-button border-bad/30 bg-bad-soft/40 text-bad hover:bg-bad-soft"
            >
              <Trash2 className="h-3.5 w-3.5" /> Workspace zurücksetzen
            </button>
          </div>
        </Card>

        <Card title="App installieren" subtitle="Für einen schnellen Zugriff vom Homescreen oder Desktop">
          {pwa.updateAvailable ? <div className="settings-update-row" role="status"><div><strong>Update verfügbar</strong><span>Eine neue Workbench-Version ist bereit.</span></div><button type="button" className="quiet-button-primary" onClick={() => void pwa.applyUpdate()}><Download className="h-3.5 w-3.5" /> Aktualisieren</button></div> : null}
          {pwa.isInstalled ? (
            <p className="text-[13px] text-muted">Die Workbench ist bereits als App installiert.</p>
          ) : pwa.canInstall ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void pwa.install()} className="quiet-button-primary">
                <Download className="h-3.5 w-3.5" /> App installieren
              </button>
              <span className="text-[12px] text-faint">Öffnet den Installationsdialog des Browsers.</span>
            </div>
          ) : pwa.isAppleMobile ? (
            <p className="text-[13px] text-muted">
              In Safari auf <span className="text-text">Teilen</span> tippen und <span className="text-text">Zum Home-Bildschirm</span> wählen.
            </p>
          ) : (
            <p className="text-[13px] text-muted">
              Öffne die Workbench in Chrome oder Edge und wähle im Browsermenü <span className="text-text">App installieren</span>.
            </p>
          )}
        </Card>

        <Card title="Sicherheit" subtitle="Keine eigene Anmeldung" action={<ShieldCheck className="h-4 w-4 text-faint" />}>
          <ul className="space-y-2 text-[13px] text-muted">
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              Der Zugriff wird über Tailscale/ACLs begrenzt. T3 Code und code-server behalten ihre eigene Authentifizierung.
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              Es werden keine Tokens, Cookies oder Credentials im Zustand gespeichert.
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              Terminals starten ausschließlich serverseitig freigegebene Shell-, Agent- und Anmeldeprozesse.
            </li>
          </ul>
        </Card>
        <footer className="settings-system-footer"><span>{health.data?.appName ?? "Remote Workplace"}</span><strong>Version {health.data?.version ?? "–"}</strong><span>Lokale Remote-Entwicklungsumgebung</span></footer>
        <ConfirmDialog open={resetOpen} title="Workspace zurücksetzen?" description="Alle geöffneten Panels, Arbeitsflächen und Auswahlen werden lokal gelöscht. Diese Aktion kann nicht rückgängig gemacht werden." confirmLabel="Workspace zurücksetzen" danger onConfirm={resetWorkspace} onClose={() => setResetOpen(false)} />
      </div>
    </div>
  );
}
