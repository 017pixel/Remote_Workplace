import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import type {
  DashboardSection,
  CommandsResponse,
  HealthResponse,
  LocalPort,
  LocalPortsResponse,
  OperationalMetricsResponse,
  ProjectsResponse,
  ReadinessResponse,
  ServiceMode,
  ServicesResponse,
  ServerMetrics,
  ServerSummary,
  TerminalSession,
  TerminalSessionsResponse,
  UsageDashboardResponse,
  NewsListResponse,
} from "@workbench/contracts";
import {
  CheckIcon,
  CloseIcon,
  CommandIcon,
  CopyIcon,
  ExternalLinkIcon,
  InfoIcon,
  NetworkIcon,
  NutzungIcon,
  OpenCodeIcon,
  ServerIcon,
  ServicesIcon,
  ShieldIcon,
  T3CodeIcon,
  TechTldrsIcon,
  TerminalIcon,
  TrashIcon,
  WarningIcon,
  WorkbenchIcon,
} from "../components/icons";
import { Badge, StateDot } from "../components/primitives";
import { Meter, Sparkline, TrendChart, loadTone } from "../components/charts";
import { formatBytes, formatClockTime, formatRelativeTime, formatUptime } from "../lib/format";
import { groupDashboardRuntime, type DashboardRuntimeGroup } from "../lib/dashboardRuntime";
import { computeTrend, useMetricsHistory, type MetricsSample } from "../stores/metricsHistory";
import { workbenchQueries } from "../lib/queryOptions";
import { useDashboardPreferences, isDashboardSectionVisible } from "../stores/dashboardPreferences";
import { useTerminalStore } from "../stores/terminals";
import { useWorkspaceStore } from "../stores/workspace";
import { useRouteActivity } from "../lib/routeActivity";
import { writeClipboardText } from "../lib/clipboard";
import { ContentDialog, ConfirmDialog } from "../components/ModalDialog";
import { runWithViewTransition } from "../lib/viewTransition";
import { apiClient } from "../lib/apiClient";

const integer = new Intl.NumberFormat("de-DE");
const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const dashboardSections: DashboardSection[] = [
  "quickActions",
  "server",
  "metrics",
  "services",
  "runtime",
  "diagnostics",
  "usage",
  "news",
  "commands",
];

type Query<T> = UseQueryResult<T, Error>;

const terminalKindLabels: Record<TerminalSession["kind"], string> = {
  shell: "Shell",
  codex: "Codex",
  opencode: "OpenCode",
  claude: "Claude Code",
};

const terminalStatusLabels: Record<TerminalSession["status"], string> = {
  starting: "Startet",
  running: "Läuft",
  exited: "Beendet",
  interrupted: "Unterbrochen",
  closed: "Geschlossen",
};

const readinessCheckLabels: Record<string, string> = {
  database: "Datenbank",
  "data-directory": "Datenverzeichnis",
};

function serverModeLabel(mode: ServiceMode): string {
  return mode === "embedded" ? "eingebettet" : mode === "external" ? "extern" : "hybrid";
}

function statusTone(state: string): "default" | "ok" | "warn" | "bad" {
  if (state === "active" || state === "running" || state === "ready") return "ok";
  if (state === "checking" || state === "starting" || state === "degraded" || state === "interrupted") return "warn";
  if (state === "error" || state === "exited" || state === "closed" || state === "failed") return "bad";
  return "default";
}

function formatDateTime(value: string | null): string {
  if (!value) return "nicht verfügbar";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "nicht verfügbar";
}

function formatPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : path;
}

function terminalDotState(status: TerminalSession["status"]): string {
  if (status === "running") return "active";
  if (status === "starting") return "checking";
  if (status === "interrupted") return "unknown";
  if (status === "exited" || status === "closed") return "inactive";
  return "unknown";
}

function queryMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function percentOf(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

/**
 * Linux meldet auch Pseudo-Dateisysteme wie `/boot/efi/efivars` mit wenigen
 * Kilobyte. Die verfälschen jede „vollstes Laufwerk“-Aussage, deshalb bleiben
 * nur Laufwerke ab einem Gigabyte übrig.
 */
function realDisks(disks: ServerMetrics["disks"]): ServerMetrics["disks"] {
  const relevant = disks.filter((disk) => disk.totalBytes >= 1024 ** 3);
  return relevant.length ? relevant : disks;
}

/* ---------------------------------------------------------------- Bausteine */

function Panel({
  name,
  title,
  subtitle,
  icon,
  meta,
  children,
  className = "",
}: {
  /** Eindeutiger Name für die Übergangsanimation im Bento-Raster. */
  name: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`dash-panel ${className}`}
      style={{ viewTransitionName: `dash-panel-${name}` } as CSSProperties}
    >
      <header className="dash-panel-head">
        <div className="dash-panel-title">
          {icon ? <span className="dash-panel-icon">{icon}</span> : null}
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        {meta ? <div className="dash-panel-meta">{meta}</div> : null}
      </header>
      {children}
    </section>
  );
}

function PanelError({ message }: { message: string }) {
  return (
    <div className="dash-notice is-bad" role="alert">
      <WarningIcon className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function PanelSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="dash-skeleton" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="dash-skeleton-line" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Das Raster füllt die verfügbare Breite selbst auf. `min` ist die
 * Mindestbreite einer Spalte, nicht ihre Anzahl — dadurch passen sich die
 * Fakten an, wenn ein Bento-Panel schmaler wird.
 */
function Facts({ items, min = "132px" }: { items: { label: string; value: string; mono?: boolean }[]; min?: string }) {
  return (
    <dl className="dash-facts" style={{ "--dash-fact-min": min } as CSSProperties}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.mono === false ? "" : "font-mono"}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------- Kopf */

interface SystemState {
  tone: "ok" | "warn" | "bad";
  label: string;
  detail: string;
}

function deriveSystemState(
  summary: ServerSummary | undefined,
  readiness: ReadinessResponse | undefined,
  readinessFailed: boolean,
  metrics: ServerMetrics | undefined,
  diagnostics: OperationalMetricsResponse | undefined,
): SystemState {
  const problems: string[] = [];
  let tone: SystemState["tone"] = "ok";

  if (summary && summary.status !== "online") {
    tone = "bad";
    problems.push("Server meldet sich offline");
  }
  if (readinessFailed || readiness?.status === "degraded") {
    tone = tone === "bad" ? tone : "warn";
    const failed = readiness?.checks.filter((check) => check.status === "failed") ?? [];
    problems.push(failed.length ? `${failed.length} Bereitschaftsprüfung(en) fehlgeschlagen` : "Bereitschaftsprüfung nicht erreichbar");
  }
  if (diagnostics?.degradedReasons.length) {
    tone = tone === "bad" ? tone : "warn";
    problems.push(`${diagnostics.degradedReasons.length} Betriebshinweis(e)`);
  }
  if (metrics) {
    const memory = percentOf(metrics.memory.usedBytes, metrics.memory.totalBytes);
    // Dieselben Laufwerke wie in der Anzeige (realDisks) — sonst zieht eine
    // fast volle EFI-/Boot-Partition den Gesamtstatus auf „Datenträger nahezu
    // voll", während die Kachel einen anderen Wert zeigt (F02-07).
    const disk = Math.max(0, ...realDisks(metrics.disks).map((entry) => entry.usedPercent));
    if (metrics.cpuPercent >= 90) { tone = "bad"; problems.push("CPU dauerhaft am Limit"); }
    else if (metrics.cpuPercent >= 75) { tone = tone === "ok" ? "warn" : tone; problems.push("hohe CPU-Last"); }
    if (memory >= 92) { tone = "bad"; problems.push("Arbeitsspeicher nahezu voll"); }
    else if (memory >= 80) { tone = tone === "ok" ? "warn" : tone; problems.push("Arbeitsspeicher wird knapp"); }
    if (disk >= 92) { tone = "bad"; problems.push("Datenträger nahezu voll"); }
    else if (disk >= 82) { tone = tone === "ok" ? "warn" : tone; problems.push("Datenträger füllt sich"); }
  }

  const label = tone === "ok" ? "Alles betriebsbereit" : tone === "warn" ? "Eingeschränkt" : "Störung";
  return {
    tone,
    label,
    detail: problems.length ? problems.join(" · ") : "Keine Auffälligkeiten in Server und Workbench",
  };
}

function DashboardHeader({
  summary,
  health,
  readiness,
  metrics,
  diagnostics,
}: {
  summary: Query<ServerSummary>;
  health: Query<HealthResponse>;
  readiness: Query<ReadinessResponse>;
  metrics: Query<ServerMetrics>;
  diagnostics: Query<OperationalMetricsResponse>;
}) {
  const state = deriveSystemState(summary.data, readiness.data, readiness.isError, metrics.data, diagnostics.data);
  const host = summary.data;
  const facts = [
    host ? host.serverName : null,
    host ? `${host.operatingSystem.distro} ${host.operatingSystem.release}`.trim() : null,
    host ? `Server läuft seit ${formatUptime(host.uptimeSeconds)}` : null,
    diagnostics.data ? `Dienst seit ${formatUptime(diagnostics.data.uptimeSeconds)}` : null,
  ].filter(Boolean) as string[];

  return (
    <header className={`dash-head is-${state.tone}`}>
      <div className="dash-head-main">
        <p className="dash-eyebrow">Remote Workplace</p>
        <h1>{state.label}</h1>
        <p className="dash-head-detail">{state.detail}</p>
      </div>
      <div className="dash-head-side">
        <span className={`dash-pulse is-${state.tone}`}>
          <i aria-hidden />
          {metrics.data ? `Live · ${formatRelativeTime(metrics.data.lastUpdated)}` : "Verbindung wird geprüft"}
        </span>
        <div className="dash-head-badges">
          {health.data ? <Badge tone="default">v{health.data.version}</Badge> : null}
          <Badge tone={readiness.isError ? "warn" : statusTone(readiness.data?.status ?? "unknown")}>
            {readiness.isError ? "Bereitschaft unklar" : readiness.data?.status === "ready" ? "Bereit" : readiness.data?.status === "degraded" ? "Eingeschränkt" : "Prüfung läuft"}
          </Badge>
        </div>
        {facts.length ? <p className="dash-head-facts">{facts.join(" · ")}</p> : null}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------ Kennzahlen */

function Vital({
  label,
  value,
  unit,
  caption,
  trend,
  band,
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  caption: string;
  trend?: { direction: "up" | "down" | "stable"; delta: number; invert?: boolean } | undefined;
  band: ReactNode;
}) {
  const trendTone = !trend || trend.direction === "stable"
    ? "is-stable"
    : (trend.direction === "up") !== Boolean(trend.invert)
      ? "is-rising"
      : "is-falling";
  return (
    <article className="dash-vital">
      <header>
        <span>{label}</span>
        {trend && trend.direction !== "stable" ? (
          <span className={`dash-delta ${trendTone}`}>
            {trend.direction === "up" ? "↑" : "↓"} {decimal.format(Math.abs(trend.delta))}
          </span>
        ) : null}
      </header>
      <p className="dash-vital-value">
        {value}
        {unit ? <span>{unit}</span> : null}
      </p>
      <p className="dash-vital-caption">{caption}</p>
      <div className="dash-vital-band">{band}</div>
    </article>
  );
}

function VitalsBand({
  metrics,
  diagnostics,
  showMetrics,
  showDiagnostics,
}: {
  metrics: Query<ServerMetrics>;
  diagnostics: Query<OperationalMetricsResponse>;
  showMetrics: boolean;
  showDiagnostics: boolean;
}) {
  const samples = useMetricsHistory((state) => state.samples);
  const series = useMemo(() => ({
    cpu: samples.map((sample) => sample.cpuPercent),
    memory: samples.map((sample) => sample.memoryPercent),
    eventLoop: samples.map((sample) => sample.eventLoopP99),
    requests: samples.map((sample) => sample.activeRequests),
    serverErrors: samples.map((sample) => sample.serverErrorRatePercent),
    clientErrors: samples.map((sample) => sample.clientErrorRatePercent),
  }), [samples]);

  const tiles: ReactNode[] = [];

  if (showMetrics) {
    if (metrics.isPending) {
      tiles.push(<div className="dash-vital" key="metrics-loading"><PanelSkeleton label="Systemwerte laden" rows={3} /></div>);
    } else if (metrics.isError) {
      tiles.push(<div className="dash-vital is-error" key="metrics-error"><PanelError message={queryMessage(metrics.error, "Systemwerte nicht verfügbar")} /></div>);
    } else {
      const data = metrics.data;
      const memoryPercent = percentOf(data.memory.usedBytes, data.memory.totalBytes);
      const busiestDisk = [...realDisks(data.disks)].sort((left, right) => right.usedPercent - left.usedPercent)[0];
      tiles.push(
        <Vital
          key="cpu"
          label="CPU"
          value={decimal.format(data.cpuPercent)}
          unit="%"
          caption={`Last ${data.loadAverage.map((entry) => decimal.format(entry)).join(" · ")}${data.temperatureCelsius !== null ? ` · ${decimal.format(data.temperatureCelsius)} °C` : ""}`}
          trend={computeTrend(series.cpu, 2)}
          band={<Sparkline values={series.cpu} tone={loadTone(data.cpuPercent, 60, 85)} />}
        />,
        <Vital
          key="memory"
          label="Arbeitsspeicher"
          value={memoryPercent.toFixed(0)}
          unit="%"
          caption={`${formatBytes(data.memory.usedBytes)} von ${formatBytes(data.memory.totalBytes)} · ${formatBytes(data.memory.availableBytes)} frei`}
          trend={computeTrend(series.memory, 2)}
          band={<Sparkline values={series.memory} tone={loadTone(memoryPercent, 75, 90)} />}
        />,
        <Vital
          key="disk"
          label="Datenträger"
          value={busiestDisk ? busiestDisk.usedPercent.toFixed(0) : "—"}
          unit={busiestDisk ? "%" : undefined}
          caption={busiestDisk ? `${formatPath(busiestDisk.mount)} · ${formatBytes(busiestDisk.availableBytes)} frei` : "Keine Laufwerke erkannt"}
          band={<Meter value={busiestDisk?.usedPercent ?? 0} tone={loadTone(busiestDisk?.usedPercent ?? 0, 75, 90)} label="Belegung des vollsten Laufwerks" />}
        />,
      );
    }
  }

  if (showDiagnostics) {
    if (diagnostics.isPending) {
      tiles.push(<div className="dash-vital" key="diagnostics-loading"><PanelSkeleton label="Dienstwerte laden" rows={3} /></div>);
    } else if (diagnostics.isError) {
      tiles.push(<div className="dash-vital is-error" key="diagnostics-error"><PanelError message={queryMessage(diagnostics.error, "Dienstwerte nicht verfügbar")} /></div>);
    } else {
      const data = diagnostics.data;
      const serverErrorRate = percentOf(data.http.serverErrors, data.http.totalRequests);
      const clientErrorRate = percentOf(data.http.clientErrors, data.http.totalRequests);
      tiles.push(
        <Vital
          key="event-loop"
          label="Event-Loop"
          value={decimal.format(data.eventLoop.p99Milliseconds)}
          unit="ms"
          caption={`P99 · Ø ${decimal.format(data.eventLoop.meanMilliseconds)} · max ${decimal.format(data.eventLoop.maxMilliseconds)} ms`}
          trend={computeTrend(series.eventLoop, 1)}
          band={<Sparkline values={series.eventLoop} tone={loadTone(data.eventLoop.p99Milliseconds, 20, 60)} />}
        />,
        <Vital
          key="requests"
          label="Anfragen"
          value={integer.format(data.http.activeRequests)}
          unit="aktiv"
          caption={`${integer.format(data.http.totalRequests)} gesamt seit dem Start`}
          band={<Sparkline values={series.requests} tone="accent" />}
        />,
        <Vital
          key="server-errors"
          label="Serverfehlerquote"
          value={decimal.format(serverErrorRate)}
          unit="%"
          caption={`${integer.format(data.http.serverErrors)} Server · ${integer.format(data.http.totalRequests)} gesamt`}
          band={<Sparkline values={series.serverErrors} tone={serverErrorRate > 5 ? "bad" : serverErrorRate > 1 ? "warn" : "ok"} />}
        />,
        <Vital
          key="client-errors"
          label="4xx-Quote"
          value={decimal.format(clientErrorRate)}
          unit="%"
          caption={`${integer.format(data.http.clientErrors)} Client · ${integer.format(data.http.totalRequests)} gesamt`}
          band={<Sparkline values={series.clientErrors} tone={clientErrorRate > 5 ? "warn" : "ok"} />}
        />,
      );
    }
  }

  if (tiles.length === 0) return null;
  return <div className="dash-vitals">{tiles}</div>;
}

/* --------------------------------------------------------- Serverdiagnose */

function ServerDiagnosticsPanel({
  summary,
  health,
  metrics,
}: {
  summary: Query<ServerSummary>;
  health: Query<HealthResponse>;
  metrics: Query<ServerMetrics>;
}) {
  const samples = useMetricsHistory((state) => state.samples);
  const cpu = samples.map((sample) => sample.cpuPercent);
  const memory = samples.map((sample) => sample.memoryPercent);
  const host = summary.data;
  const disks = metrics.data ? realDisks(metrics.data.disks) : [];
  // Feste 0–100-Achse würde bei 2 % Auslastung nur eine Linie am Boden zeigen.
  // Die Skala wächst deshalb mit dem Spitzenwert, bleibt aber bei 0 verankert.
  const peak = Math.max(0, ...cpu, ...memory);
  const scaleMax = Math.min(100, Math.max(5, Math.ceil((peak * 1.35) / 5) * 5));
  // Die Achse folgt dem tatsächlichen Fenster (MAX_SAMPLES × Messintervall),
  // statt fest „vor 10 Min." zu behaupten (F02-06).
  const firstSample = samples[0]?.timestamp;
  const lastSample = samples[samples.length - 1]?.timestamp;
  const windowMinutes = firstSample && lastSample ? Math.max(1, Math.round((lastSample - firstSample) / 60_000)) : 5;
  const axisLabels = windowMinutes <= 1
    ? ["älter", "jetzt"]
    : [`vor ${windowMinutes} Min.`, `vor ${Math.max(1, Math.round(windowMinutes / 2))} Min.`, "jetzt"];

  return (
    <Panel
      title="Serverdiagnose"
      subtitle={host ? `${host.serverName} · ${host.operatingSystem.distro} ${host.operatingSystem.release}` : "Hostzustand des Entwicklungsservers"}
      icon={<ServerIcon className="h-4 w-4" />}
      name="server"
      className="is-span-8"
      meta={
        <>
          {host ? <Badge tone={host.status === "online" ? "ok" : "bad"}>{host.status === "online" ? "Online" : "Offline"}</Badge> : null}
          {metrics.data ? <span className="dash-meta-time">Messung {formatRelativeTime(metrics.data.lastUpdated)}</span> : null}
        </>
      }
    >
      {summary.isError || metrics.isError ? (
        <PanelError message={queryMessage(summary.error ?? metrics.error, "Serverdaten konnten nicht geladen werden.")} />
      ) : (
        <div className="dash-server-body">
          <div className="dash-server-chart">
            <TrendChart
              height={188}
              bounds={{ min: 0, max: scaleMax }}
              scaleHint={`Skala 0–${scaleMax} %`}
              axisLabels={axisLabels}
              emptyHint="Verlauf wird ab dem zweiten Messpunkt gezeichnet"
              series={[
                { id: "cpu", label: "CPU", values: cpu, tone: "accent", readout: metrics.data ? `${decimal.format(metrics.data.cpuPercent)} %` : "—" },
                {
                  id: "memory",
                  label: "Arbeitsspeicher",
                  values: memory,
                  tone: "ok",
                  readout: metrics.data ? `${percentOf(metrics.data.memory.usedBytes, metrics.data.memory.totalBytes).toFixed(0)} %` : "—",
                },
              ]}
            />
            <Facts
              min="150px"
              items={[
                { label: "Kernel", value: host?.operatingSystem.kernel ?? "—" },
                { label: "Plattform", value: host?.operatingSystem.platform ?? "—" },
                { label: "Laufzeit", value: host ? formatUptime(host.uptimeSeconds) : "—" },
                { label: "Temperatur", value: metrics.data?.temperatureCelsius != null ? `${decimal.format(metrics.data.temperatureCelsius)} °C` : "nicht gemessen" },
                { label: "Tailscale", value: host?.tailscale.hostname ?? "nicht verbunden" },
                { label: "DNS-Name", value: host?.tailscale.dnsName ?? "—" },
                { label: "Version", value: health.data ? `v${health.data.version}` : "—" },
                { label: "Boot-ID", value: health.data?.bootId ? health.data.bootId.slice(0, 8) : "—" },
              ]}
            />
          </div>

          <div className="dash-server-side">
            <p className="dash-subheading">Datenträger</p>
            {metrics.isPending ? (
              <PanelSkeleton label="Laufwerke laden" rows={2} />
            ) : disks.length ? (
              <ul className="dash-disk-list">
                {disks.map((disk) => (
                  <li key={disk.mount}>
                    <div>
                      <span className="font-mono">{formatPath(disk.mount)}</span>
                      <strong className="font-mono">{disk.usedPercent.toFixed(0)} %</strong>
                    </div>
                    <Meter value={disk.usedPercent} tone={loadTone(disk.usedPercent, 75, 90)} label={`Belegung ${disk.mount}`} />
                    <small>{formatBytes(disk.usedBytes)} von {formatBytes(disk.totalBytes)} · {formatBytes(disk.availableBytes)} frei</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-muted">Keine Laufwerke erkannt.</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------ Workbench-Diagnose */

function ReadinessList({ readiness }: { readiness: Query<ReadinessResponse> }) {
  if (readiness.isPending) return <PanelSkeleton label="Bereitschaft wird geprüft" rows={2} />;
  if (readiness.isError) {
    return <PanelError message={queryMessage(readiness.error, "Die Bereitschaftsprüfung antwortet nicht. Das Backend meldet sich als eingeschränkt.")} />;
  }
  return (
    <ul className="dash-check-list">
      {readiness.data.checks.map((check) => (
        <li key={check.name}>
          <StateDot state={check.status === "ok" ? "active" : "error"} />
          <span className="dash-check-name">{readinessCheckLabels[check.name] ?? check.name}</span>
          <strong className={check.status === "ok" ? "is-ok" : "is-bad"}>{check.status === "ok" ? "in Ordnung" : "fehlgeschlagen"}</strong>
        </li>
      ))}
      {readiness.data.checks.length === 0 ? <li className="dash-muted">Keine Prüfungen konfiguriert.</li> : null}
    </ul>
  );
}

function WorkbenchDiagnosticsPanel({
  diagnostics,
  readiness,
}: {
  diagnostics: Query<OperationalMetricsResponse>;
  readiness: Query<ReadinessResponse>;
}) {
  const data = diagnostics.data;
  const routes = data?.http.routes.slice(0, 6) ?? [];
  const slowestRoute = Math.max(1, ...routes.map((route) => route.p99Milliseconds));

  return (
    <Panel
      title="Workbench-Diagnose"
      subtitle={data ? `Prozess läuft seit ${formatUptime(data.uptimeSeconds)} · Stand ${formatDateTime(data.capturedAt)}` : "Zustand des Workbench-Dienstes"}
      icon={<ShieldIcon className="h-4 w-4" />}
      name="workbench"
      className="is-span-12"
      meta={
        data ? (
          <Badge tone={data.degradedReasons.length ? "warn" : "ok"}>
            {data.degradedReasons.length ? `${data.degradedReasons.length} Hinweise` : "Betrieb unauffällig"}
          </Badge>
        ) : null
      }
    >
      {diagnostics.isError ? (
        <PanelError message={queryMessage(diagnostics.error, "Diagnosedaten konnten nicht geladen werden.")} />
      ) : diagnostics.isPending ? (
        <PanelSkeleton label="Diagnose lädt" rows={4} />
      ) : (
        <div className="dash-diagnostics-body">
          <div>
            <p className="dash-subheading">Bereitschaft</p>
            <ReadinessList readiness={readiness} />

            <p className="dash-subheading">Betriebshinweise</p>
            {data!.degradedReasons.length ? (
              <ul className="dash-reason-list">
                {data!.degradedReasons.map((reason) => (
                  <li key={reason}>
                    <WarningIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-muted">Der Dienst meldet keine Einschränkungen.</p>
            )}

            <p className="dash-subheading">Hintergrund</p>
            <Facts
              min="100%"
              items={[
                { label: "Audit", value: data!.audit.valid ? `gültig · ${integer.format(data!.audit.entries)} Einträge` : "Prüfung erforderlich" },
                { label: "Letzter Audit-Eintrag", value: data!.audit.latestAt ? formatDateTime(data!.audit.latestAt) : "keiner" },
                { label: "Offene Orbit-Backups", value: integer.format(data!.orbit.pendingBackups) },
                { label: "Orbit-Fehler", value: data!.orbit.lastError ?? "keiner" },
              ]}
            />
          </div>

          <div>
            <p className="dash-subheading">Prozess und Anfragen</p>
            <Facts
              items={[
                { label: "Anfragen gesamt", value: integer.format(data!.http.totalRequests) },
                { label: "Gerade aktiv", value: integer.format(data!.http.activeRequests) },
                { label: "Clientfehler (4xx)", value: integer.format(data!.http.clientErrors) },
                { label: "Serverfehler (5xx)", value: integer.format(data!.http.serverErrors) },
                { label: "Event-Loop Ø", value: `${decimal.format(data!.eventLoop.meanMilliseconds)} ms` },
                { label: "Event-Loop max", value: `${decimal.format(data!.eventLoop.maxMilliseconds)} ms` },
                { label: "RSS", value: formatBytes(data!.processMemory.rssBytes) },
                { label: "Extern", value: formatBytes(data!.processMemory.externalBytes) },
              ]}
            />
            <div className="dash-gauge">
              <div>
                <span>Heap</span>
                <strong className="font-mono">
                  {formatBytes(data!.processMemory.heapUsedBytes)} / {formatBytes(data!.processMemory.heapTotalBytes)}
                </strong>
              </div>
              <Meter
                value={percentOf(data!.processMemory.heapUsedBytes, data!.processMemory.heapTotalBytes)}
                tone={loadTone(percentOf(data!.processMemory.heapUsedBytes, data!.processMemory.heapTotalBytes), 90, 97)}
                label="Heap-Auslastung"
              />
            </div>
            <div className="dash-gauge">
              <div>
                <span>Preview-Slots</span>
                <strong className="font-mono">{data!.preview.freeSlots} von {data!.preview.totalSlots} frei</strong>
              </div>
              <Meter
                value={percentOf(data!.preview.totalSlots - data!.preview.freeSlots, data!.preview.totalSlots)}
                tone={data!.preview.quarantinedSlots > 0 ? "warn" : "accent"}
                label="Belegte Preview-Slots"
              />
              <small>{data!.preview.resettingSlots} werden zurückgesetzt · {data!.preview.quarantinedSlots} in Quarantäne</small>
            </div>
          </div>

          <div>
            <p className="dash-subheading">Langsamste Routen</p>
            {routes.length ? (
              <ul className="dash-route-list">
                {routes.map((route) => (
                  <li key={`${route.method}-${route.route}`}>
                    <div className="dash-route-head">
                      <span className="font-mono">
                        <b>{route.method}</b> {route.route}
                      </span>
                      <strong className="font-mono">{decimal.format(route.p99Milliseconds)} ms</strong>
                    </div>
                    <Meter
                      value={(route.p99Milliseconds / slowestRoute) * 100}
                      tone={route.errorCount > 0 ? "bad" : loadTone(route.p99Milliseconds, 250, 800)}
                      label={`P99 von ${route.method} ${route.route}`}
                    />
                    <small className="font-mono">
                      {integer.format(route.count)} Aufrufe · P95 {decimal.format(route.p95Milliseconds)} ms · {integer.format(route.errorCount)} Fehler
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-muted">Seit dem Start wurden noch keine Routen gemessen.</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- Betrieb */

function ServicesPanel({ services }: { services: Query<ServicesResponse> }) {
  const data = services.data;
  const online = data?.services.filter((service) => service.state === "active").length ?? 0;
  return (
    <Panel
      title="Dienste"
      subtitle={data ? `${online} von ${data.services.length} erreichbar` : "Konfigurierte Dienste"}
      icon={<ServicesIcon className="h-4 w-4" />}
      name="services"
      className="is-span-4"
      meta={data && data.services.length ? <Badge tone={online === data.services.length ? "ok" : "warn"}>{online === data.services.length ? "vollständig" : "unvollständig"}</Badge> : null}
    >
      {services.isError ? (
        <PanelError message={queryMessage(services.error, "Dienste konnten nicht geladen werden.")} />
      ) : !data ? (
        <PanelSkeleton label="Dienste laden" rows={3} />
      ) : data.services.length === 0 ? (
        <p className="dash-muted">Keine Dienste konfiguriert.</p>
      ) : (
        <ul className="dash-service-list">
          {data.services.map((service) => (
            <li key={service.id}>
              <StateDot state={service.state} pulse={service.state === "checking"} />
              <div>
                <strong>{service.name}</strong>
                <small>{service.message ?? `${serverModeLabel(service.mode)} · geprüft ${formatRelativeTime(service.lastChecked)}`}</small>
              </div>
              {service.publicUrl ? (
                <a href={service.publicUrl} target="_blank" rel="noopener noreferrer" className="dash-link" aria-label={`${service.name} öffnen`}>
                  Öffnen <ExternalLinkIcon className="h-3 w-3" />
                </a>
              ) : (
                <Badge>{serverModeLabel(service.mode)}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Ein Bereich zeigt höchstens so viele Ports und Sessions, bevor er kürzt. */
const RUNTIME_ROW_LIMIT = 3;

function RuntimeGroup({
  group,
  onOpenPort,
  onCloseSession,
  onDismissSession,
}: {
  group: DashboardRuntimeGroup;
  onOpenPort: (port: LocalPort) => void;
  onCloseSession: (session: TerminalSession) => void;
  onDismissSession: (sessionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ports = expanded ? group.ports : group.ports.slice(0, RUNTIME_ROW_LIMIT);
  const sessions = expanded ? group.sessions : group.sessions.slice(0, RUNTIME_ROW_LIMIT);
  const hidden = group.ports.length - ports.length + (group.sessions.length - sessions.length);

  return (
    <li className="dash-runtime-group">
      <header>
        <strong>{group.projectName}</strong>
        <span className="font-mono">{group.ports.length} Ports · {group.sessions.length} Sessions</span>
      </header>
      <ul>
        {ports.map((port) => (
          <li key={`port-${port.port}`}>
            <button type="button" onClick={() => onOpenPort(port)}>
              <span className={`dash-port-dot is-${port.protocol}`} aria-hidden />
              <span className="dash-runtime-main">
                <strong className="font-mono">:{port.port}</strong>
                <small className="font-mono">{port.process ?? "Lokaler Dienst"} · PID {port.pid ?? "?"}</small>
              </span>
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {sessions.map((session) => (
          <li key={`session-${session.id}`} className="is-static">
            <StateDot state={terminalDotState(session.status)} />
            <span className="dash-runtime-main">
              <strong>{terminalKindLabels[session.kind]}</strong>
              <small className="font-mono">{formatPath(session.cwd)} · PID {session.pid || "?"} · {session.connectedClients} verbunden</small>
            </span>
            {session.status === "exited" || session.status === "closed" ? (
              <button
                type="button"
                className="dash-runtime-action dash-runtime-dismiss"
                title="Aus der Ansicht entfernen"
                aria-label={`${terminalKindLabels[session.kind]} aus der Ansicht entfernen`}
                onClick={() => onDismissSession(session.id)}
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                className="dash-runtime-action dash-runtime-delete"
                title="Terminal beenden und löschen"
                aria-label={`${terminalKindLabels[session.kind]} beenden und löschen`}
                onClick={() => onCloseSession(session)}
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            )}
            <Badge tone={statusTone(session.status)}>{terminalStatusLabels[session.status]}</Badge>
          </li>
        ))}
        {hidden > 0 || expanded ? (
          <li className="is-static dash-runtime-toggle">
            <button type="button" onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}>
              {expanded ? "Weniger anzeigen" : `${hidden} weitere Einträge`}
            </button>
          </li>
        ) : null}
      </ul>
    </li>
  );
}

function RuntimePanel({
  ports,
  sessions,
  projects,
  onOpenPort,
}: {
  ports: Query<LocalPortsResponse>;
  sessions: Query<TerminalSessionsResponse>;
  projects: Query<ProjectsResponse>;
  onOpenPort: (port: LocalPort) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedSessionIds, setDismissedSessionIds] = useState<Set<string>>(() => new Set());
  const [sessionToClose, setSessionToClose] = useState<TerminalSession | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pending = ports.isPending || sessions.isPending || projects.isPending;
  const error = ports.error ?? sessions.error ?? projects.error;
  const closeSession = useMutation({
    mutationFn: (session: TerminalSession) => apiClient.closeTerminalSession(session.id),
    onSuccess: () => {
      setActionError(null);
      void sessions.refetch();
    },
    onError: (mutationError: unknown) => {
      setActionError(queryMessage(mutationError, "Die Terminalsitzung konnte nicht gelöscht werden."));
    },
  });

  const dismissSession = (sessionId: string) => {
    setDismissedSessionIds((current) => {
      const next = new Set(current);
      next.add(sessionId);
      return next;
    });
  };

  const groups = useMemo(
    () => groupDashboardRuntime(
      ports.data?.ports ?? [],
      (sessions.data?.sessions ?? []).filter((session) => !dismissedSessionIds.has(session.id)),
      projects.data?.projects ?? [],
    ),
    [dismissedSessionIds, ports.data, sessions.data, projects.data],
  );
  const visibleGroups = expanded ? groups : groups.slice(0, 3);
  const portCount = groups.reduce((total, group) => total + group.ports.length, 0);
  const sessionCount = groups.reduce((total, group) => total + group.sessions.length, 0);

  return (
    <Panel
      title="Laufende Arbeit"
      subtitle={pending ? "Ports und Sessions werden gelesen" : `${portCount} offene Ports · ${sessionCount} Terminal-Sessions`}
      icon={<TerminalIcon className="h-4 w-4" />}
      name="runtime"
      className="is-span-7"
      meta={ports.data ? <span className="dash-meta-time">Portscan {formatClockTime(ports.data.scannedAt)}</span> : null}
    >
      {error ? (
        <PanelError message={queryMessage(error, "Laufzeitdaten konnten nicht geladen werden.")} />
      ) : pending ? (
        <PanelSkeleton label="Laufzeitdaten laden" rows={3} />
      ) : groups.length === 0 ? (
        <p className="dash-muted">Momentan läuft kein Projektprozess. Ports und Sessions erscheinen hier automatisch.</p>
      ) : (
        <>
          {actionError ? <PanelError message={actionError} /> : null}
          <ul className="dash-runtime-list">
            {visibleGroups.map((group) => (
              <RuntimeGroup
                key={group.key}
                group={group}
                onOpenPort={onOpenPort}
                onCloseSession={(session) => { setActionError(null); setSessionToClose(session); }}
                onDismissSession={dismissSession}
              />
            ))}
          </ul>
          {groups.length > 3 ? (
            <button type="button" className="dash-more" onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}>
              {expanded ? "Weniger anzeigen" : `${groups.length - 3} weitere Bereiche anzeigen`}
            </button>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={sessionToClose !== null}
        title="Terminal beenden und löschen?"
        description={`${sessionToClose ? terminalKindLabels[sessionToClose.kind] : "Diese Terminalsitzung"} wird beendet und aus der Session-Liste entfernt.`}
        confirmLabel={closeSession.isPending ? "Wird gelöscht …" : "Beenden und löschen"}
        danger
        onConfirm={() => { if (sessionToClose) closeSession.mutate(sessionToClose); }}
        onClose={() => setSessionToClose(null)}
      />
    </Panel>
  );
}

/* ------------------------------------------------------------- Nebenwerte */

function UsagePanel({ usage }: { usage: Query<UsageDashboardResponse> }) {
  const data = usage.data;
  const windows = data
    ? data.live.providers
        .flatMap((provider) => provider.accounts.flatMap((account) => account.windows.map((window) => ({ provider, account, window }))))
        .sort((left, right) => {
          const providerDifference = left.provider.providerName.localeCompare(right.provider.providerName, "de");
          if (providerDifference) return providerDifference;
          const leftAccount = left.account.email ?? left.account.label;
          const rightAccount = right.account.email ?? right.account.label;
          const accountDifference = leftAccount.localeCompare(rightAccount, "de");
          return accountDifference || left.window.id.localeCompare(right.window.id, "de");
        })
    : [];

  return (
    <Panel
      title="Nutzung und Limits"
      subtitle={data ? `Datenstand ${formatRelativeTime(data.live.lastSuccessfulFetchAt ?? data.live.fetchedAt)}` : "Limits der verbundenen Konten"}
      icon={<NutzungIcon className="h-4 w-4" />}
      name="usage"
      className="is-span-5"
      meta={<Link className="dash-link" to="/usage">Alle Limits</Link>}
    >
      {usage.isError ? (
        <PanelError message={queryMessage(usage.error, "Nutzungsdaten konnten nicht geladen werden.")} />
      ) : usage.isPending ? (
        <PanelSkeleton label="Nutzung lädt" rows={3} />
      ) : (
        <>
          <Facts
            min="120px"
            items={[
              { label: "Tokens heute", value: integer.format(data!.totals.todayTokens) },
              { label: "Tokens 30 Tage", value: integer.format(data!.totals.totalTokens) },
              { label: "Kosten 30 Tage", value: money.format(data!.totals.totalCost) },
            ]}
          />
          <div className="dash-limit-list">
            {windows.length ? (
              windows.map(({ provider, account, window }) => (
                <div key={`${provider.providerId}-${account.id}-${window.id}`}>
                  <div className="dash-limit-head">
                    <span>{provider.providerName} · {account.email ?? account.label}</span>
                    <strong className="font-mono">{window.remainingPercent} % frei</strong>
                  </div>
                  <Meter value={window.usedPercent} tone={loadTone(window.usedPercent, 65, 85)} label={`${window.label} verbraucht`} />
                  <small>{window.label} · Reset {formatDateTime(window.resetsAt)}</small>
                </div>
              ))
            ) : (
              <p className="dash-muted">Für die verbundenen Konten liegen keine Limitfenster vor.</p>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function NewsPanel({ news }: { news: Query<NewsListResponse> }) {
  const data = news.data;
  return (
    <Panel
      title="Tech-News"
      subtitle="Ungelesene Zusammenfassungen"
      icon={<TechTldrsIcon className="h-4 w-4" />}
      name="news"
      className="is-span-4"
      meta={<Link className="dash-link" to="/tech-tldrs">Öffnen</Link>}
    >
      {news.isError ? (
        <PanelError message={queryMessage(news.error, "News konnten nicht geladen werden.")} />
      ) : news.isPending ? (
        <PanelSkeleton label="News laden" rows={2} />
      ) : (
        <div className="dash-news">
          <p className="dash-news-count">
            {integer.format(data!.total)}
            <span>{data!.total === 1 ? "ungelesener Beitrag" : "ungelesene Beiträge"}</span>
          </p>
          <Badge tone={data!.sync.running ? "warn" : data!.sync.lastError ? "bad" : "ok"}>
            {data!.sync.running ? "Sync läuft" : data!.sync.lastError ? "Sync-Fehler" : "Aktuell"}
          </Badge>
          {data!.sync.lastError ? <p className="dash-muted">{data!.sync.lastError}</p> : null}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ Schnellzugriff */

function QuickBar({
  projectsLoading,
  projects,
}: {
  projectsLoading: boolean;
  projects: { id: string; availability: string }[];
}) {
  const navigate = useNavigate();
  const selectProject = useWorkspaceStore((state) => state.selectProject);
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const addTab = useTerminalStore((state) => state.addTab);
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId && project.availability === "available") ??
    projects.find((project) => project.availability === "available");

  const prepareProject = () => {
    if (selectedProject && selectedProject.id !== selectedProjectId) selectProject(selectedProject.id);
    return selectedProject?.id ?? selectedProjectId;
  };

  const actions = [
    { label: "T3 Code", icon: T3CodeIcon, onClick: () => { prepareProject(); navigate("/t3-code"); } },
    { label: "OpenCode", icon: OpenCodeIcon, onClick: () => navigate("/opencode") },
    { label: "Workbench", icon: WorkbenchIcon, onClick: () => { prepareProject(); navigate("/workbench"); } },
    { label: "Terminal", icon: TerminalIcon, onClick: () => { const projectId = prepareProject(); addTab("standalone", projectId, "shell"); navigate("/terminal"); } },
    { label: "Nutzung", icon: NutzungIcon, onClick: () => navigate("/usage") },
    { label: "News", icon: TechTldrsIcon, onClick: () => navigate("/tech-tldrs") },
  ];

  return (
    <section className="dash-quickbar" aria-label="Schnellzugriff">
      <p className="dash-quickbar-label">Schnellzugriff</p>
      <div className="dash-quickbar-actions">
        {actions.map(({ label, icon: Icon, onClick }) => (
          <button key={label} type="button" onClick={onClick}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      <span className="dash-quickbar-context font-mono">
        {projectsLoading ? "Projekt wird geladen" : selectedProject ? selectedProject.id : "kein Projekt gewählt"}
      </span>
    </section>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copy = async () => {
    try {
      await writeClipboardText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1_500);
    } catch {
      setCopyState("error");
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={copyState === "error" ? "Kopieren wurde vom Browser nicht erlaubt" : "Kopieren"}
      className="quiet-button shrink-0 text-[12px] max-md:text-[13px]"
    >
      {copyState === "copied" ? <CheckIcon className="h-3.5 w-3.5 text-ok" /> : <CopyIcon className={`h-3.5 w-3.5 ${copyState === "error" ? "text-bad" : ""}`} />}
      <span aria-live="polite">{copyState === "copied" ? "Kopiert" : copyState === "error" ? "Fehlgeschlagen" : "Kopieren"}</span>
    </button>
  );
}

function CommandsPanel({
  commands,
  onSelect,
}: {
  commands: Query<CommandsResponse>;
  onSelect: (command: { name: string; description: string; command: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const all = commands.data?.commands ?? [];
  const visible = expanded ? all : all.slice(0, 4);

  return (
    <Panel
      title="Befehle"
      subtitle="Nachschlagen und kopieren, keine Ausführung"
      icon={<CommandIcon className="h-4 w-4" />}
      name="commands"
      className="is-span-8"
    >
      {commands.isError ? (
        <PanelError message={queryMessage(commands.error, "Befehle konnten nicht geladen werden.")} />
      ) : commands.isPending ? (
        <PanelSkeleton label="Befehle laden" rows={2} />
      ) : (
        <>
          <ul className="dash-command-list">
            {visible.map((command) => (
              <li key={command.id}>
                <div>
                  <strong>{command.name}</strong>
                  <small>{command.description}</small>
                </div>
                <code className="font-mono">{command.command}</code>
                <button type="button" className="quiet-button dash-command-view" onClick={() => onSelect(command)}>
                  Anzeigen
                </button>
                <CopyButton value={command.command} />
              </li>
            ))}
          </ul>
          {all.length > 4 ? (
            <button type="button" className="dash-more" onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}>
              {expanded ? "Weniger anzeigen" : `${all.length - 4} weitere Befehle anzeigen`}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ Seite */

export function Dashboard() {
  const navigate = useNavigate();
  const routeActive = useRouteActivity();
  const configQuery = useQuery({ ...workbenchQueries.dashboardConfig(), enabled: routeActive });
  const config = configQuery.data;
  const hiddenSections = useDashboardPreferences((state) => state.hiddenSections);
  const selectProject = useWorkspaceStore((state) => state.selectProject);
  const visible = (section: DashboardSection) => isDashboardSectionVisible(config, hiddenSections, section);
  const refresh = config?.refresh;

  const serverVisible = visible("server");
  const metricsVisible = visible("metrics");
  const diagnosticsVisible = visible("diagnostics");
  const runtimeVisible = visible("runtime");
  const quickActionsVisible = visible("quickActions");

  // Der Kopf braucht Server- und Dienstzustand unabhängig davon, welche Blöcke
  // sichtbar sind — sonst könnte er keine Gesamtaussage treffen.
  const summary = useQuery({ ...workbenchQueries.serverSummary(refresh?.summaryMilliseconds), enabled: routeActive });
  const health = useQuery({ ...workbenchQueries.health(refresh?.healthMilliseconds), enabled: routeActive });
  const readiness = useQuery({ ...workbenchQueries.readiness(refresh?.summaryMilliseconds), retry: false, enabled: routeActive });
  const metrics = useQuery({ ...workbenchQueries.serverMetrics(refresh?.metricsMilliseconds), enabled: routeActive });
  const diagnostics = useQuery({ ...workbenchQueries.operationalMetrics(refresh?.operationalMetricsMilliseconds), enabled: routeActive });
  const services = useQuery({ ...workbenchQueries.services(refresh?.servicesMilliseconds), enabled: routeActive && visible("services") });
  const projects = useQuery({ ...workbenchQueries.projects(), enabled: routeActive && (runtimeVisible || quickActionsVisible) });
  const ports = useQuery({ ...workbenchQueries.localPorts(refresh?.localPortsMilliseconds), enabled: routeActive && runtimeVisible });
  const sessions = useQuery({ ...workbenchQueries.terminalSessions(refresh?.terminalSessionsMilliseconds), enabled: routeActive && runtimeVisible });
  const usage = useQuery({ ...workbenchQueries.usageDashboard("30d", refresh?.usageMilliseconds), enabled: routeActive && visible("usage") });
  const unreadNewsParams = useMemo(() => new URLSearchParams({ unread: "true", limit: "1" }), []);
  const news = useQuery({ ...workbenchQueries.news(unreadNewsParams, refresh?.newsMilliseconds), enabled: routeActive && visible("news") });
  const commands = useQuery({ ...workbenchQueries.commands(), enabled: routeActive && visible("commands") });
  const [selectedCommand, setSelectedCommand] = useState<{ name: string; description: string; command: string } | null>(null);

  // Ein einziger Sammler füttert den geteilten Verlaufsspeicher. Die
  // Abhängigkeiten sind die Query-Daten selbst, deren Referenz sich nur bei
  // echten Änderungen ändert.
  const pushSample = useMetricsHistory((state) => state.push);
  const metricsData = metrics.data;
  const diagnosticsData = diagnostics.data;
  useEffect(() => {
    if (!metricsData || !diagnosticsData) return;
    const sample: MetricsSample = {
      timestamp: Date.now(),
      cpuPercent: metricsData.cpuPercent,
      memoryPercent: percentOf(metricsData.memory.usedBytes, metricsData.memory.totalBytes),
      diskPercent: Math.max(0, ...metricsData.disks.map((disk) => disk.usedPercent)),
      rssBytes: diagnosticsData.processMemory.rssBytes,
      activeRequests: diagnosticsData.http.activeRequests,
      totalRequests: diagnosticsData.http.totalRequests,
      serverErrorRatePercent: percentOf(diagnosticsData.http.serverErrors, diagnosticsData.http.totalRequests),
      clientErrorRatePercent: percentOf(diagnosticsData.http.clientErrors, diagnosticsData.http.totalRequests),
      eventLoopP99: diagnosticsData.eventLoop.p99Milliseconds,
    };
    pushSample(sample);
  }, [metricsData, diagnosticsData, pushSample]);

  const openPort = (port: LocalPort) => {
    if (port.projectId) selectProject(port.projectId);
    navigate("/previews");
  };

  const visibleCount = dashboardSections.filter(visible).length;

  return (
    <div className="page-scroll">
      <div className="page-frame dash">
        <DashboardHeader summary={summary} health={health} readiness={readiness} metrics={metrics} diagnostics={diagnostics} />

        {configQuery.isError ? (
          <div className="dash-notice is-warn" role="status">
            <InfoIcon className="h-4 w-4 shrink-0" />
            <span>Die Dashboard-Konfiguration ist nicht erreichbar. Es gelten die Standardwerte.</span>
          </div>
        ) : null}

        <VitalsBand metrics={metrics} diagnostics={diagnostics} showMetrics={metricsVisible} showDiagnostics={diagnosticsVisible} />

        {/* Bento-Raster: unterschiedlich breite Kacheln in einem gemeinsamen
            12-Spalten-Raster. Klappt eine Kachel auf, ordnet sich der Rest neu
            an — die Bewegung dabei kommt aus `runWithViewTransition`. */}
        <div className="dash-bento">
          {serverVisible || metricsVisible ? (
            <ServerDiagnosticsPanel summary={summary} health={health} metrics={metrics} />
          ) : null}
          {visible("services") ? <ServicesPanel services={services} /> : null}
          {diagnosticsVisible ? <WorkbenchDiagnosticsPanel diagnostics={diagnostics} readiness={readiness} /> : null}
          {runtimeVisible ? <RuntimePanel ports={ports} sessions={sessions} projects={projects} onOpenPort={openPort} /> : null}
          {visible("usage") ? <UsagePanel usage={usage} /> : null}
          {visible("news") ? <NewsPanel news={news} /> : null}
          {visible("commands") ? <CommandsPanel commands={commands} onSelect={setSelectedCommand} /> : null}
        </div>

        {quickActionsVisible ? <QuickBar projectsLoading={projects.isLoading} projects={projects.data?.projects ?? []} /> : null}

        {visibleCount === 0 ? (
          <div className="dash-empty">
            <NetworkIcon className="h-5 w-5" />
            <strong>Alle Bereiche ausgeblendet</strong>
            <span>In den Einstellungen lassen sich die Dashboard-Bereiche wieder einschalten.</span>
            <button type="button" className="quiet-button" onClick={() => navigate("/settings")}>
              Einstellungen öffnen
            </button>
          </div>
        ) : null}

        <ContentDialog
          open={selectedCommand !== null}
          title={selectedCommand?.name ?? "Befehl"}
          description={selectedCommand?.description}
          onClose={() => setSelectedCommand(null)}
        >
          <code className="command-dialog-code">{selectedCommand?.command}</code>
          {selectedCommand ? <CopyButton value={selectedCommand.command} /> : null}
        </ContentDialog>
      </div>
    </div>
  );
}
