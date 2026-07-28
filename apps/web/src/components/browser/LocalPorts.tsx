import { useQuery } from "@tanstack/react-query";
import type { LocalPort } from "@workbench/contracts";
import { ExternalLink, Network, RefreshCw } from "lucide-react";
import { workbenchQueries } from "../../lib/queryOptions";

export function LocalPorts({ onOpen, compact = false }: { onOpen: (port: LocalPort) => void; compact?: boolean }) {
  const query = useQuery(workbenchQueries.localPorts());
  const ports = [...(query.data?.ports ?? [])].sort((left, right) => {
    const leftRank = left.protocol === "unknown" ? 1 : 0;
    const rightRank = right.protocol === "unknown" ? 1 : 0;
    return leftRank - rightRank || left.port - right.port;
  });
  return (
    <section className={`local-port-start ${compact ? "is-compact" : ""}`}>
      <header>
        <div className="local-port-mark"><Network className="h-4 w-4" /></div>
        <div><strong>Laufende Projekt-Dienste</strong><span>HTTP-Devserver auf dem Entwicklungsserver</span></div>
        <button type="button" onClick={() => void query.refetch()} aria-label="Lokale Ports neu laden" title="Neu laden"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></button>
      </header>
      {query.isError ? <p className="local-port-message">Lokale Ports konnten nicht geladen werden.</p> : null}
      {query.isLoading ? <div className="local-port-skeleton"><span /><span /><span /></div> : null}
      {!query.isLoading && ports.length === 0 ? <p className="local-port-message">Momentan läuft kein lokaler Projekt-Devserver.</p> : null}
      <div className="local-port-grid">
        {ports.map((port) => {
          const canOpen = port.localUrl !== null;
          return <button type="button" key={port.port} disabled={!canOpen} onClick={() => onOpen(port)} title={canOpen ? `Port ${port.port} öffnen` : "Kein HTTP-Dienst erkannt"}>
            <span className={`local-port-state is-${port.protocol}`} />
            <span className="local-port-copy"><strong>localhost:{port.port}</strong><small>{port.process ?? "Lokaler Dienst"}</small></span>
            <span className="local-port-protocol">{port.protocol === "unknown" ? "TCP" : port.protocol.toUpperCase()}</span>
            {canOpen ? <ExternalLink className="h-3.5 w-3.5" /> : null}
          </button>;
        })}
      </div>
      {query.data ? <small className="local-port-scan-time">Erkannt {new Date(query.data.scannedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small> : null}
    </section>
  );
}
