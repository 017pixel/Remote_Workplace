import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Thermometer,
  Network,
  Server as ServerIcon,
  Boxes,
  Command as CommandIcon,
  Check,
  Copy,
} from "lucide-react";
import type { ServiceMode } from "@workbench/contracts";
import { workbenchQueries } from "../lib/queryOptions";
import { formatBytes, formatRelativeTime, formatUptime } from "../lib/format";
import { QueryBoundary } from "../components/QueryBoundary";
import { Card, MetricBar } from "../components/Card";
import { Badge, StateDot } from "../components/primitives";
import { ProjectCard } from "../components/ProjectCard";
import { ContentDialog } from "../components/ModalDialog";
import { useResponsiveShell } from "../lib/useResponsiveShell";
import { writeClipboardText } from "../lib/clipboard";

function serverModeLabel(mode: ServiceMode): string {
  return mode === "embedded" ? "eingebettet" : mode === "external" ? "extern" : "hybrid";
}

export function Dashboard() {
  const responsive = useResponsiveShell();
  const [selectedCommand, setSelectedCommand] = useState<{ name: string; description: string; command: string } | null>(null);
  const summary = useQuery(workbenchQueries.serverSummary());
  const metrics = useQuery(workbenchQueries.serverMetrics());
  const services = useQuery(workbenchQueries.services());
  const projects = useQuery(workbenchQueries.projects());
  const commands = useQuery(workbenchQueries.commands());

  return (
    <div className="page-scroll">
      <div className="page-frame">
        <div className="page-heading">
          <h1>Übersicht</h1>
          <p>Systemstatus, aktive Dienste und deine konfigurierten Projekte.</p>
        </div>
        <QueryBoundary {...summary} loadingLabel="Server-Übersicht lädt…">
          {(data) => (
            <Card title="Server" subtitle={`${data.serverName} · ${data.operatingSystem.distro} ${data.operatingSystem.release}`}>
              <div className="dashboard-server-grid grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
                <div className="flex items-center gap-2.5">
                  <ServerIcon className="h-4 w-4 text-faint" />
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-faint">Status</div>
                    <div className="flex items-center gap-1.5 text-sm text-text">
                      <StateDot state={data.status === "online" ? "active" : "error"} />
                      {data.status === "online" ? "online" : "offline"}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-faint">Uptime</div>
                  <div className="text-sm text-text">{formatUptime(data.uptimeSeconds)}</div>
                </div>
                {responsive.mode === "compact" ? <details className="dashboard-server-details">
                  <summary>Technische Details</summary>
                  <div><span>Kernel</span><strong>{data.operatingSystem.kernel}</strong></div>
                  <div><span>Tailscale</span><strong>{data.tailscale.hostname ?? "Nicht verbunden"}</strong></div>
                </details> : <><div>
                  <div className="text-[11px] uppercase tracking-wider text-faint">Kernel</div>
                  <div className="text-sm text-text">{data.operatingSystem.kernel}</div>
                </div><div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-muted" />
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-faint">Tailscale</div>
                    <div className="flex items-center gap-1.5 text-sm text-text">
                      <StateDot
                        state={data.tailscale.state === "connected" ? "active" : data.tailscale.state === "disconnected" ? "inactive" : "unknown"}
                      />
                      {data.tailscale.hostname ?? "—"}
                    </div>
                  </div>
                </div></>}
              </div>
              <div className="mt-4 text-[11px] text-faint">Aktualisiert {formatRelativeTime(data.lastUpdated)}</div>
            </Card>
          )}
        </QueryBoundary>

        <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2">
          <QueryBoundary {...metrics} loadingLabel="Metriken laden…">
            {(m) => (
              <Card title="System-Metriken" subtitle="CPU, Speicher, Last">
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-1.5 text-muted">
                        <Cpu className="h-3.5 w-3.5" /> CPU
                      </span>
                      <span className="font-mono text-text">{m.cpuPercent.toFixed(1)}%</span>
                    </div>
                    <MetricBar value={m.cpuPercent} tone={m.cpuPercent > 85 ? "bad" : m.cpuPercent > 60 ? "warn" : "ok"} />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-1.5 text-muted">
                        <MemoryStick className="h-3.5 w-3.5" /> RAM
                      </span>
                      <span className="font-mono text-text">
                        {formatBytes(m.memory.usedBytes)} / {formatBytes(m.memory.totalBytes)}
                      </span>
                    </div>
                    <MetricBar
                      value={(m.memory.usedBytes / m.memory.totalBytes) * 100}
                      tone="accent"
                    />
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
                    <span className="flex items-center gap-1.5 text-muted">
                      <Activity className="h-3.5 w-3.5" /> Load {m.loadAverage.map((v) => v.toFixed(2)).join(" / ")}
                    </span>
                    {m.temperatureCelsius !== null ? (
                      <span className="flex items-center gap-1.5 text-muted">
                        <Thermometer className="h-3.5 w-3.5" /> {m.temperatureCelsius.toFixed(1)} °C
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-2 border-t border-line-soft pt-3">
                    {m.disks.map((disk) => (
                      <div key={disk.mount}>
                        <div className="mb-1 flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5 text-muted">
                            <HardDrive className="h-3.5 w-3.5" /> {disk.mount}
                          </span>
                          <span className="font-mono text-faint">
                            {formatBytes(disk.usedBytes)} / {formatBytes(disk.totalBytes)}
                          </span>
                        </div>
                        <MetricBar value={disk.usedPercent} tone={disk.usedPercent > 90 ? "bad" : disk.usedPercent > 75 ? "warn" : "ok"} />
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </QueryBoundary>

          <QueryBoundary {...services} loadingLabel="Dienste laden…">
            {(s) => (
              <Card title="Dienste" subtitle={`${s.services.length} Dienste`}>
                <ul>
                  {s.services.map((service) => (
                    <li key={service.id} className="data-row px-2">
                      <StateDot state={service.state} pulse={service.state === "checking"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-text">{service.name}</span>
                          <Badge tone="default">{serverModeLabel(service.mode)}</Badge>
                        </div>
                        {service.message ? (
                          <p className="mt-0.5 truncate text-[11px] text-faint">{service.message}</p>
                        ) : null}
                      </div>
                      {service.publicUrl ? (
                        <a
                          href={service.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-[11px] text-faint transition-colors hover:text-text max-md:flex max-md:min-h-[44px] max-md:items-center max-md:rounded-md max-md:px-2 max-md:-mr-2 max-md:text-[12px] max-md:hover:bg-ink-800"
                        >
                          öffnen
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </QueryBoundary>
        </div>

        <QueryBoundary {...projects} loadingLabel="Projekte laden…">
          {(p) => (
            <Card title="Projekte" subtitle={`${p.projects.length} Projekte`} action={<Boxes className="h-4 w-4 text-faint" />}>
              <div className="divide-y divide-line-soft">
                {p.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </Card>
          )}
        </QueryBoundary>

        <QueryBoundary {...commands} loadingLabel="Befehle laden…">
          {(c) => (
            <Card title="Command Reference" subtitle="Nur zum Kopieren – keine Ausführung" action={<CommandIcon className="h-4 w-4 text-faint" />}>
              <ul>
                {c.commands.map((command) => (
                  <li key={command.id} className="data-row">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-text">{command.name}</div>
                      <p className="text-[11px] text-faint">{command.description}</p>
                    </div>
                    <code className="hidden truncate rounded bg-ink-850 px-2 py-1 font-mono text-[12px] text-muted sm:block">
                      {command.command}
                    </code>
                    <button type="button" className="quiet-button command-view-button" onClick={() => setSelectedCommand(command)}>Anzeigen</button>
                    <CopyButton value={command.command} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </QueryBoundary>
        <ContentDialog open={selectedCommand !== null} title={selectedCommand?.name ?? "Befehl"} description={selectedCommand?.description} onClose={() => setSelectedCommand(null)}>
          <code className="command-dialog-code">{selectedCommand?.command}</code>
          {selectedCommand ? <CopyButton value={selectedCommand.command} /> : null}
        </ContentDialog>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copy = async () => {
    try {
      await writeClipboardText(value);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copyState === "error" ? "Kopieren wurde vom Browser nicht erlaubt" : "Kopieren"}
      className="quiet-button shrink-0 text-[12px] max-md:text-[13px]"
    >
      {copyState === "copied" ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className={`h-3.5 w-3.5 ${copyState === "error" ? "text-bad" : ""}`} />}
      <span aria-live="polite">{copyState === "copied" ? "Kopiert" : copyState === "error" ? "Fehlgeschlagen" : "Kopieren"}</span>
    </button>
  );
}
