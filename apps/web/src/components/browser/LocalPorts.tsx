import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { LocalPort, LocalPortsResponse } from "@wrapt/contracts";
import { ExternalLinkIcon, NetworkIcon, RefreshIcon } from "../icons";
import { wraptQueries } from "../../lib/queryOptions";
import { useRouteActivity } from "../../lib/routeActivity";

interface LocalPortsProps {
  onOpen: (port: LocalPort) => void;
  compact?: boolean;
  projectId?: string | null;
  projectName?: string;
  allowAllPorts?: boolean;
  /** Gemeinsame Daten aus einem bereits laufenden Poller, z. B. im Orbit. */
  dataOverride?: LocalPortsResponse | null;
  loadingOverride?: boolean;
  errorOverride?: boolean;
  refreshOverride?: () => void | Promise<unknown>;
}

export function LocalPorts({ onOpen, compact = false, projectId, projectName, allowAllPorts = false, dataOverride, loadingOverride, errorOverride, refreshOverride }: LocalPortsProps) {
  const sharedData = dataOverride !== undefined;
  const routeActive = useRouteActivity();
  const query = useQuery({ ...wraptQueries.localPorts(), enabled: routeActive && !sharedData });
  const [allPortsProjectId, setAllPortsProjectId] = useState<string | null>(null);
  const data = sharedData ? dataOverride : query.data;
  const isLoading = sharedData ? Boolean(loadingOverride) : query.isLoading;
  const isError = sharedData ? Boolean(errorOverride) : query.isError;
  const allPorts = [...(data?.ports ?? [])].sort((left, right) => {
    const leftRank = left.protocol === "unknown" ? 1 : 0;
    const rightRank = right.protocol === "unknown" ? 1 : 0;
    return leftRank - rightRank || left.port - right.port;
  });
  const canFilter = allowAllPorts && Boolean(projectId);
  const showAll = canFilter && allPortsProjectId === projectId;
  const ports = canFilter && !showAll ? allPorts.filter((port) => port.projectId === projectId) : allPorts;

  return (
    <section className={`local-port-start ${compact ? "is-compact" : ""}`}>
      <header>
        <div className="local-port-mark"><NetworkIcon className="h-4 w-4" /></div>
        <div><strong>Laufende Projekt-Dienste</strong><span>{canFilter && !showAll ? `HTTP-Devserver für ${projectName ?? "dieses Projekt"}` : "HTTP-Devserver auf dem Entwicklungsserver"}</span></div>
        <div className="local-port-actions">
          {canFilter ? <button type="button" className="local-port-filter" aria-pressed={showAll} onClick={() => setAllPortsProjectId(showAll ? null : projectId ?? null)}>{showAll ? "Nur dieses Projekt" : "Alle Ports"}</button> : null}
          <button type="button" className="local-port-refresh" onClick={() => void (refreshOverride ? refreshOverride() : query.refetch())} aria-label="Lokale Ports neu laden" title="Neu laden"><RefreshIcon className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></button>
        </div>
      </header>
      {isError ? <p className="local-port-message">Lokale Ports konnten nicht geladen werden.</p> : null}
      {isLoading ? <div className="local-port-skeleton"><span /><span /><span /></div> : null}
      {!isLoading && allPorts.length === 0 ? <p className="local-port-message">Momentan läuft kein lokaler Projekt-Devserver.</p> : null}
      {!isLoading && allPorts.length > 0 && ports.length === 0 ? <p className="local-port-message">Für {projectName ?? "dieses Projekt"} wurde kein laufender Devserver erkannt.</p> : null}
      <div className="local-port-grid">
        {ports.map((port) => {
          const canOpen = port.localUrl !== null;
          return <button type="button" key={port.port} disabled={!canOpen} onClick={() => onOpen(port)} title={canOpen ? `Port ${port.port} öffnen` : "Kein HTTP-Dienst erkannt"}>
            <span className={`local-port-state is-${port.protocol}`} />
            <span className="local-port-copy"><strong>localhost:{port.port}</strong><small>{port.process ?? "Lokaler Dienst"}</small></span>
            <span className="local-port-protocol">{port.protocol === "unknown" ? "TCP" : port.protocol.toUpperCase()}</span>
            {canOpen ? <ExternalLinkIcon className="h-3.5 w-3.5" /> : null}
          </button>;
        })}
      </div>
      {data ? <small className="local-port-scan-time">Erkannt {new Date(data.scannedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small> : null}
    </section>
  );
}
