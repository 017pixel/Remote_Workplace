import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { PreviewDevServerState } from "@workbench/contracts";
import { LocalPreviewRuntime } from "../components/preview/LocalPreviewRuntime";
import { CopyIcon, ExternalLinkIcon, PlayIcon, PowerIcon, RefreshIcon, ServerIcon, TerminalIcon, WarningIcon, WorkbenchIcon } from "../components/icons";
import { apiClient } from "../lib/apiClient";
import { writeClipboardText } from "../lib/clipboard";
import { openPreviewWindow } from "../lib/previewExternalOpen";
import { workbenchQueries } from "../lib/queryOptions";
import { useRouteActivity } from "../lib/routeActivity";
import { useResponsiveShell } from "../lib/useResponsiveShell";
import { useWorkspaceStore } from "../stores/workspace";

type LogFilter = "all" | "error" | "warning" | "network";
const stateLabels: Record<PreviewDevServerState, string> = { stopped: "Gestoppt", starting: "Startet", running: "Läuft", stopping: "Stoppt", failed: "Fehler", unknown: "Unbekannt" };

function filterLog(output: string, filter: LogFilter): string {
  if (filter === "all") return output;
  const pattern = filter === "error"
    ? /\b(error|failed|exception|fatal|err!|eaddrinuse)\b/i
    : filter === "warning"
      ? /\b(warn|warning|deprecated)\b/i
      : /\b(hmr|websocket|network|http|https|port|localhost|ready)\b/i;
  return output.split("\n").filter((line) => pattern.test(line)).join("\n");
}

export function PreviewHub() {
  const routeActive = useRouteActivity();
  // Mobile ist die Seite bewusst eine Verwaltungsseite: keine eingebettete
  // iframe-Vorschau, die Vorschau öffnet sich bei Bedarf in Workbench oder Tab.
  // `compact` deckt Portrait-Handys und Querformat-Handys ab (siehe Shell-Logik).
  const isMobile = useResponsiveShell().mode === "compact";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const selectProject = useWorkspaceStore((state) => state.selectProject);
  const openPanel = useWorkspaceStore((state) => state.openPanel);
  const projectsQuery = useQuery({ ...workbenchQueries.projects(), enabled: routeActive });
  const projects = (projectsQuery.data?.projects ?? []).filter((item) => item.availability === "available");
  const projectId = projects.some((item) => item.id === selectedProjectId) ? selectedProjectId : (projects[0]?.id ?? null);
  const project = projects.find((item) => item.id === projectId);
  const statusQuery = useQuery({ ...workbenchQueries.previewDevServer(projectId), enabled: routeActive && projectId !== null });
  const logsQuery = useQuery({ ...workbenchQueries.previewDevServerLogs(projectId), enabled: routeActive && projectId !== null });
  const portsQuery = useQuery({ ...workbenchQueries.localPorts(2_000), enabled: routeActive });
  const projectPorts = (portsQuery.data?.ports ?? []).filter((port) => port.projectId === projectId && port.localUrl !== null);
  const status = statusQuery.data;
  const mainPort = status?.mainPort ?? null;
  const mainPortOptions = new Map<number, string>();
  for (const preview of project?.previews ?? []) {
    if (preview.targetPort) mainPortOptions.set(preview.targetPort, `${preview.targetPort} · ${preview.name}`);
  }
  for (const port of projectPorts) mainPortOptions.set(port.port, `${port.port} · ${port.process ?? port.protocol}`);
  if (mainPort && !mainPortOptions.has(mainPort)) mainPortOptions.set(mainPort, `${mainPort} · Gespeichert`);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const output = filterLog(logsQuery.data?.output ?? "", filter);

  useEffect(() => { if (projectId && selectedProjectId !== projectId) selectProject(projectId); }, [projectId, selectProject, selectedProjectId]);
  useEffect(() => setPublicUrl(null), [mainPort, projectId]);
  useEffect(() => { const node = logRef.current; if (node && filter === "all") node.scrollTop = node.scrollHeight; }, [filter, output]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["preview-dev-server", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["local-ports"] }),
    ]);
  };
  const processMutation = useMutation({
    mutationFn: async (action: "start" | "stop" | "restart") => {
      if (!projectId) return;
      setActionError(null);
      if (action === "start") await apiClient.startPreviewDevServer(projectId);
      else if (action === "stop") await apiClient.stopPreviewDevServer(projectId);
      else await apiClient.restartPreviewDevServer(projectId);
    },
    onSuccess: () => void refresh(),
    onError: (error) => setActionError(error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen."),
  });
  const savePort = useMutation({
    mutationFn: async (port: number | null) => { if (projectId) await apiClient.savePreviewDevServerMainPort(projectId, port); },
    onSuccess: () => void refresh(),
    onError: (error) => setActionError(error instanceof Error ? error.message : "Der Hauptport konnte nicht gespeichert werden."),
  });
  const openInWorkbench = () => {
    if (!projectId || !mainPort) return;
    const configured = project?.previews.find((preview) => preview.targetPort === mainPort);
    const panelId = openPanel({ type: "preview", projectId, previewId: configured?.id ?? null });
    if (!panelId) { setActionError("Es ist kein weiterer Werkzeugplatz frei."); return; }
    if (!configured) try { window.sessionStorage.setItem(`workbench:preview-target:${panelId}`, String(mainPort)); } catch { /* Panel bleibt nutzbar. */ }
    navigate("/workbench");
  };
  const openExternalWindow = () => {
    if (!projectId || !publicUrl) return;
    const opened = openPreviewWindow(publicUrl, projectId);
    if (!opened) setActionError("Das Browserfenster wurde blockiert. Erlaube Popups oder wähle den Tab-Modus.");
  };
  const openPreviewLiveWindow = () => {
    if (!projectId || !mainPort) return;
    const base = window.location.pathname.split("/previews")[0] ?? "";
    const query = new URLSearchParams({ port: String(mainPort), project: projectId, title: project?.name ?? "Development Preview" });
    window.open(`${base}/previews/live?${query.toString()}`, "_blank", "noopener,noreferrer");
  };

  if (projectsQuery.isLoading) return <div className="route-skeleton" aria-label="Preview Hub wird geladen"><span /><span /><span /></div>;
  if (!project) return <main className="preview-hub-empty"><ServerIcon /><strong>Kein verfügbares Projekt</strong></main>;

  return (
    <main className="preview-hub">
      <section className="preview-hub-command">
        <div className="preview-hub-server-state"><span className={`preview-hub-state is-${status?.state ?? "unknown"}`}><i />{stateLabels[status?.state ?? "unknown"]}</span><strong>{project.name}</strong><code>npm run dev</code></div>
        <div className="preview-hub-process-actions">
          {status?.state === "running" ? <button type="button" className="preview-hub-secondary" disabled={processMutation.isPending} onClick={() => processMutation.mutate("restart")}><RefreshIcon />Neu starten</button> : null}
          <button type="button" className={status?.state === "running" ? "preview-hub-stop" : "preview-hub-primary"} disabled={processMutation.isPending} onClick={() => processMutation.mutate(status?.state === "running" ? "stop" : "start")}>{status?.state === "running" ? <PowerIcon style={{ color: "var(--color-bad)" }} /> : <PlayIcon />}{status?.state === "running" ? "Stoppen" : "Server starten"}</button>
        </div>
      </section>
      {actionError || status?.message ? <div className="preview-hub-alert"><WarningIcon /><span>{actionError ?? status?.message}</span></div> : null}
      <div className="preview-hub-grid">
        <section className="preview-hub-runtime">
          <header><div><span>Preview-Ziel</span><strong>Hauptport</strong></div><select value={mainPort ?? ""} onChange={(event) => savePort.mutate(event.target.value ? Number(event.target.value) : null)} aria-label="Hauptport auswählen"><option value="">Port auswählen</option>{[...mainPortOptions].map(([port, label]) => <option key={port} value={port}>{label}</option>)}</select></header>
          <div className="preview-hub-urlbar"><span className="preview-hub-url-status" data-ready={Boolean(publicUrl)} /><code>{publicUrl ?? (mainPort ? (isMobile ? "Vorschau im Tab oder in der Workbench öffnen" : `Warte auf Tailscale-Slot für Port ${mainPort}`) : "Dev-Server starten und Hauptport wählen")}</code><button type="button" disabled={!publicUrl} aria-label="Tailscale-URL kopieren" onClick={() => { if (publicUrl) void writeClipboardText(publicUrl).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1_500); }); }}><CopyIcon /><span>{copied ? "Kopiert" : "Kopieren"}</span></button></div>
          {isMobile ? null : <div className="preview-hub-stage">{mainPort ? <LocalPreviewRuntime targetPort={mainPort} projectId={projectId} sessionKey={`preview-hub:${projectId}:${mainPort}`} isolate={false} deviceId="responsive" title={project.name} onSlotAssigned={(_slotId, url) => setPublicUrl(url)} /> : <div className="preview-hub-stage-empty"><ServerIcon /><strong>Kein Hauptport gewählt</strong></div>}</div>}
          <footer className="preview-hub-launchbar">
            <button type="button" className="preview-hub-secondary" disabled={!mainPort} onClick={openInWorkbench}><WorkbenchIcon />In Workbench</button>
            {isMobile ? <button type="button" className="preview-hub-primary" disabled={!mainPort} onClick={openPreviewLiveWindow}><ExternalLinkIcon />Im neuen Tab</button> : <>
              <a className={`preview-hub-secondary${publicUrl ? "" : " is-disabled"}`} href={publicUrl ?? undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!publicUrl}><ExternalLinkIcon />Im neuen Tab</a>
              <button type="button" className="preview-hub-primary" disabled={!publicUrl} onClick={openExternalWindow}><ExternalLinkIcon />Im neuen Fenster</button>
            </>}
          </footer>
        </section>
        <section className="preview-hub-logs">
          <header><div><TerminalIcon /><strong>Dev-Server-Logs</strong></div>{logsQuery.data?.truncated ? <span>Gekürzt</span> : null}</header>
          <nav aria-label="Logs filtern">{(["all", "error", "warning", "network"] as const).map((value) => <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "Alle" : value === "error" ? "Fehler" : value === "warning" ? "Warnungen" : "Netzwerk"}</button>)}</nav>
          <pre ref={logRef}>{output || (status?.state === "running" ? "Warte auf Ausgabe…" : "Der Dev-Server ist nicht aktiv.")}</pre>
        </section>
      </div>
    </main>
  );
}
