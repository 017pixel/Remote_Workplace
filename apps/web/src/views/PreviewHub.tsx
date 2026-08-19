import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import type { PreviewDevServerState, PreviewDevServerStatus, PreviewRuntimeLogLevel, PreviewRuntimeServiceRole, Project } from "@wrapt/contracts";
import {
  ActivityIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  FolderCodeIcon,
  MoreIcon,
  PlayIcon,
  PlusIcon,
  PowerIcon,
  RefreshIcon,
  ServerIcon,
  ServicesIcon,
  TerminalIcon,
  WarningIcon,
  WorkbenchIcon,
} from "../components/icons";
import { apiClient } from "../lib/apiClient";
import { writeClipboardText } from "../lib/clipboard";
import { openPreviewLiveWindow } from "../lib/previewExternalOpen";
import { wraptQueries } from "../lib/queryOptions";
import { useRouteActivity } from "../lib/routeActivity";
import { withPreviewSlotRecovery, type PreviewSlotRecoveryPhase } from "../lib/previewSlotRecovery";
import { usePreviewHubStore } from "../stores/previewHub";
import { useWorkspaceStore } from "../stores/workspace";

type LogFilter = "all" | PreviewRuntimeLogLevel;
type DirectOpenMode = "tab" | "window";

const stateLabels: Record<PreviewDevServerState, string> = {
  stopped: "Gestoppt",
  starting: "Startet",
  running: "Läuft",
  stopping: "Stoppt",
  failed: "Fehler",
  unknown: "Unbekannt",
};

const roleLabels: Record<PreviewRuntimeServiceRole, string> = {
  frontend: "Frontend",
  backend: "Backend",
  api: "API",
  database: "Datenbank",
  socket: "WebSocket",
  worker: "Worker",
  other: "Dienst",
};

const logFilterLabels: Record<LogFilter, string> = {
  all: "Alle",
  error: "Fehler",
  warning: "Warnungen",
  success: "Erfolg",
  info: "Info",
};

const launchPhaseLabels: Record<PreviewSlotRecoveryPhase, string> = {
  launching: "Projektlaufzeit und Preview werden vorbereitet.",
  "resetting-slot": "Eine alte Preview-Origin wird im Browser sicher zurückgesetzt.",
  retrying: "Der freie Preview-Slot wird jetzt mit dem Projekt verbunden.",
};

function serviceIcon(role: PreviewRuntimeServiceRole) {
  if (role === "database") return <DatabaseIcon />;
  if (role === "worker" || role === "socket") return <ActivityIcon />;
  if (role === "frontend") return <ServerIcon />;
  return <ServicesIcon />;
}

function statusState(status: PreviewDevServerStatus | undefined, failed: boolean): PreviewDevServerState {
  if (failed) return "failed";
  return status?.state ?? "unknown";
}

export function PreviewHub() {
  const routeActive = useRouteActivity();
  const queryClient = useQueryClient();
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const selectProject = useWorkspaceStore((state) => state.selectProject);
  const openProjectIds = usePreviewHubStore((state) => state.openProjectIds);
  const activeProjectId = usePreviewHubStore((state) => state.activeProjectId);
  const openProject = usePreviewHubStore((state) => state.openProject);
  const activateProject = usePreviewHubStore((state) => state.activateProject);
  const closeProject = usePreviewHubStore((state) => state.closeProject);
  const reconcileProjects = usePreviewHubStore((state) => state.reconcileProjects);
  const [searchParams, setSearchParams] = useSearchParams();
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const initialized = useRef(false);
  const synchronizedProjectId = useRef<string | null>(selectedProjectId);
  const projectsQuery = useQuery({ ...wraptQueries.projects(), enabled: routeActive });
  const runtimesQuery = useQuery({ ...wraptQueries.previewDevServers(), enabled: routeActive });
  const projects = useMemo(() => (projectsQuery.data?.projects ?? []).filter((item) => item.availability === "available"), [projectsQuery.data?.projects]);
  const openProjects = useMemo(() => openProjectIds.flatMap((id) => {
    const project = projects.find((candidate) => candidate.id === id);
    return project ? [project] : [];
  }), [openProjectIds, projects]);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const tabStatusQueries = useQueries({
    queries: openProjects.map((project) => ({
      ...wraptQueries.previewDevServer(project.id, project.id === activeProjectId ? 2_000 : 5_000),
      enabled: routeActive,
    })),
  });
  const statusByProjectId = useMemo(() => {
    const statuses = new Map<string, PreviewDevServerStatus>();
    runtimesQuery.data?.runtimes.forEach((status) => statuses.set(status.projectId, status));
    openProjects.forEach((project, index) => {
      const status = tabStatusQueries[index]?.data;
      if (status) statuses.set(project.id, status);
    });
    return statuses;
  }, [openProjects, runtimesQuery.data?.runtimes, tabStatusQueries]);

  const setProjectParam = useCallback((projectId: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (projectId) next.set("project", projectId);
      else next.delete("project");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const chooseProject = (projectId: string) => {
    synchronizedProjectId.current = projectId;
    openProject(projectId);
    activateProject(projectId);
    if (selectedProjectId !== projectId) selectProject(projectId);
    setProjectParam(projectId);
    setProjectManagerOpen(false);
    setProjectSearch("");
  };

  const closeProjectTab = (projectId: string) => {
    const wasActive = usePreviewHubStore.getState().activeProjectId === projectId;
    closeProject(projectId);
    if (!wasActive) return;
    const nextProjectId = usePreviewHubStore.getState().activeProjectId;
    synchronizedProjectId.current = nextProjectId ?? selectedProjectId;
    if (nextProjectId) selectProject(nextProjectId);
    setProjectParam(nextProjectId);
  };

  useEffect(() => {
    if (!routeActive || !projectsQuery.isSuccess) return;
    const availableIds = projects.map((project) => project.id);
    const requested = searchParams.get("project");
    const fallback = requested && availableIds.includes(requested)
      ? requested
      : selectedProjectId && availableIds.includes(selectedProjectId)
        ? selectedProjectId
        : (availableIds[0] ?? null);
    reconcileProjects(availableIds, initialized.current ? null : fallback);
    if (!initialized.current) {
      initialized.current = true;
      const nextProjectId = requested && availableIds.includes(requested)
        ? requested
        : (usePreviewHubStore.getState().activeProjectId ?? fallback);
      if (nextProjectId) {
        synchronizedProjectId.current = nextProjectId;
        openProject(nextProjectId);
        if (selectedProjectId !== nextProjectId) selectProject(nextProjectId);
        setProjectParam(nextProjectId);
      }
    }
  }, [openProject, projects, projectsQuery.isSuccess, reconcileProjects, routeActive, searchParams, selectProject, selectedProjectId, setProjectParam]);

  useEffect(() => {
    if (!routeActive || !initialized.current || selectedProjectId === synchronizedProjectId.current) return;
    synchronizedProjectId.current = selectedProjectId;
    if (!selectedProjectId || selectedProjectId === activeProjectId) return;
    if (!projects.some((project) => project.id === selectedProjectId)) return;
    openProject(selectedProjectId);
    setProjectParam(selectedProjectId);
  }, [activeProjectId, openProject, projects, routeActive, selectedProjectId, setProjectParam]);

  useEffect(() => {
    if (!routeActive || !initialized.current) return;
    const requested = searchParams.get("project");
    if (!requested || requested === activeProjectId || !projects.some((project) => project.id === requested)) return;
    synchronizedProjectId.current = requested;
    openProject(requested);
    if (selectedProjectId !== requested) selectProject(requested);
  }, [activeProjectId, openProject, projects, routeActive, searchParams, selectProject, selectedProjectId]);

  useEffect(() => {
    if (!projectManagerOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setProjectManagerOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [projectManagerOpen]);

  const bulkMutation = useMutation({
    mutationFn: async (action: "start" | "stop") => {
      const candidates = openProjects.filter((project) => {
        const state = statusByProjectId.get(project.id)?.state;
        return action === "start" ? state !== "running" : state === "running" || state === "failed";
      });
      const succeeded: string[] = [];
      const failed: Array<{ name: string; message: string }> = [];
      for (const project of candidates) {
        try {
          const status = action === "start" ? await apiClient.startPreviewDevServer(project.id) : await apiClient.stopPreviewDevServer(project.id);
          if (status) queryClient.setQueryData(["preview-dev-server", project.id], status);
          succeeded.push(project.name);
        } catch (error) {
          failed.push({ name: project.name, message: error instanceof Error ? error.message : "Aktion fehlgeschlagen" });
        }
      }
      return { action, succeeded, failed };
    },
    onSuccess: async ({ action, succeeded, failed }) => {
      const verb = action === "start" ? "gestartet" : "gestoppt";
      setBulkMessage(failed.length
        ? `${succeeded.length} ${verb}, ${failed.length} fehlgeschlagen: ${failed.map((item) => `${item.name}: ${item.message}`).join(" · ")}`
        : `${succeeded.length} ${succeeded.length === 1 ? "Projekt" : "Projekte"} ${verb}.`);
      setConfirmStopAll(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["preview-dev-server"] }),
        queryClient.invalidateQueries({ queryKey: ["preview-dev-servers"] }),
        queryClient.invalidateQueries({ queryKey: ["local-ports"] }),
      ]);
    },
  });

  const runningCount = openProjects.filter((project) => statusByProjectId.get(project.id)?.state === "running").length;
  const startableCount = openProjects.length - runningCount;
  const filteredProjects = projects.filter((project) => `${project.name} ${project.path}`.toLocaleLowerCase("de-DE").includes(projectSearch.trim().toLocaleLowerCase("de-DE")));

  if (projectsQuery.isLoading) return <div className="route-skeleton" aria-label="Previews werden geladen"><span /><span /><span /></div>;
  if (!projects.length) return <main className="preview-hub-empty"><ServerIcon /><strong>Kein verfügbares Projekt</strong></main>;

  return (
    <main className="preview-hub">
      <section className="preview-hub-tabs" aria-label="Geöffnete Preview-Projekte">
        <div className="preview-hub-tablist" role="tablist" aria-label="Preview-Projekte">
          {openProjects.map((project, index) => {
            const query = tabStatusQueries[index];
            const status = statusByProjectId.get(project.id);
            const state = statusState(status, Boolean(query?.isError));
            return <div className={`preview-hub-tab ${project.id === activeProjectId ? "is-active" : ""}`} key={project.id} data-state={state}>
              <button type="button" role="tab" aria-selected={project.id === activeProjectId} onClick={() => chooseProject(project.id)}>
                <span className="preview-hub-tab-state" />
                <span>{project.name}</span>
                {status?.services.filter((service) => service.state === "failed").length ? <small>{status.services.filter((service) => service.state === "failed").length}</small> : null}
              </button>
              <button type="button" className="preview-hub-tab-close" aria-label={`${project.name} schließen, Laufzeit bleibt aktiv`} title="Tab schließen, Laufzeit bleibt aktiv" onClick={() => closeProjectTab(project.id)}><CloseIcon /></button>
            </div>;
          })}
          <button type="button" className="preview-hub-add-tab" aria-label="Preview-Projekt hinzufügen" onClick={() => setProjectManagerOpen(true)}><PlusIcon /><span>Projekt</span></button>
        </div>

        <button type="button" className="preview-hub-mobile-project" onClick={() => setProjectManagerOpen(true)}>
          <span className={`preview-hub-state is-${statusByProjectId.get(activeProjectId ?? "")?.state ?? "unknown"}`}><i /></span>
          <span><strong>{activeProject?.name ?? "Projekt auswählen"}</strong><small>{runningCount} von {openProjects.length} laufen</small></span>
          <ChevronDownIcon />
        </button>

        <div className="preview-hub-tabs-summary">
          <span>{runningCount} von {openProjects.length} laufen</span>
          <button type="button" className="preview-hub-secondary" disabled={!startableCount || bulkMutation.isPending} onClick={() => bulkMutation.mutate("start")}><PlayIcon />{bulkMutation.isPending && bulkMutation.variables === "start" ? "Startet" : "Alle starten"}</button>
          <details className="preview-hub-more">
            <summary aria-label="Projekt-Sammelaktionen"><MoreIcon /></summary>
            <div>
              <button type="button" disabled={!runningCount || bulkMutation.isPending} onClick={() => {
                if (!confirmStopAll) { setConfirmStopAll(true); return; }
                bulkMutation.mutate("stop");
              }}><PowerIcon /><span><strong>{confirmStopAll ? "Wirklich alle stoppen" : "Alle stoppen"}</strong><small>{confirmStopAll ? "Erneut anklicken, um zu bestätigen" : "Nur geöffnete Projektlaufzeiten"}</small></span></button>
              <button type="button" onClick={() => setProjectManagerOpen(true)}><FolderCodeIcon /><span><strong>Projekte verwalten</strong><small>Tabs öffnen oder wieder aktivieren</small></span></button>
            </div>
          </details>
        </div>
      </section>

      {bulkMessage ? <div className={`preview-hub-alert ${bulkMessage.includes("fehlgeschlagen") ? "is-error" : "is-progress"}`} role="status"><ActivityIcon /><span>{bulkMessage}</span><button type="button" aria-label="Meldung schließen" onClick={() => setBulkMessage(null)}><CloseIcon /></button></div> : null}

      {activeProject ? <PreviewProjectView key={activeProject.id} project={activeProject} routeActive={routeActive} /> : <section className="preview-hub-stage-empty"><FolderCodeIcon /><strong>Kein Preview-Projekt geöffnet</strong><button type="button" className="preview-hub-primary" onClick={() => setProjectManagerOpen(true)}><PlusIcon />Projekt öffnen</button></section>}

      {projectManagerOpen ? createPortal(
        <div className="preview-project-dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setProjectManagerOpen(false); }}>
          <section className="preview-project-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-project-dialog-title">
            <header><div><strong id="preview-project-dialog-title">Preview-Projekte</strong><span>Projekt öffnen oder zu einer laufenden Laufzeit wechseln</span></div><button type="button" aria-label="Projektauswahl schließen" onClick={() => setProjectManagerOpen(false)}><CloseIcon /></button></header>
            <label className="preview-project-search"><FolderCodeIcon /><input autoFocus value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Projekt oder Pfad suchen" aria-label="Preview-Projekte suchen" /></label>
            <div className="preview-project-list">
              {filteredProjects.map((project) => {
                const status = statusByProjectId.get(project.id);
                const isOpen = openProjectIds.includes(project.id);
                const state = status?.state ?? "stopped";
                return <button type="button" key={project.id} className={project.id === activeProjectId ? "is-active" : ""} onClick={() => chooseProject(project.id)}>
                  <span className={`preview-hub-state is-${state}`}><i /></span>
                  <span><strong>{project.name}</strong><small>{project.path}</small></span>
                  <span className="preview-project-list-meta">{isOpen ? "Geöffnet" : status?.state === "running" ? "Läuft" : stateLabels[state]}</span>
                </button>;
              })}
              {!filteredProjects.length ? <div className="preview-project-list-empty">Kein passendes Projekt gefunden.</div> : null}
            </div>
          </section>
        </div>, document.body,
      ) : null}
    </main>
  );
}

function openPlaceholder(mode: DirectOpenMode, projectId: string): Window | null {
  if (mode === "tab") {
    const opened = window.open("about:blank", "_blank");
    if (opened) opened.opener = null;
    return opened;
  }
  const width = Math.max(640, Math.round(window.screen.availWidth || 1_280));
  const height = Math.max(480, Math.round(window.screen.availHeight || 800));
  const opened = window.open("about:blank", `preview-${projectId}-${Date.now()}`, `popup=yes,width=${width},height=${height},left=0,top=0`);
  if (opened) opened.opener = null;
  return opened;
}

interface PreviewProjectViewProps {
  project: Project;
  routeActive: boolean;
}

function PreviewProjectView({ project, routeActive }: PreviewProjectViewProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openPanel = useWorkspaceStore((state) => state.openPanel);
  const projectId = project.id;
  const statusQuery = useQuery({ ...wraptQueries.previewDevServer(projectId), enabled: routeActive && projectId !== null });
  const logsQuery = useQuery({ ...wraptQueries.previewDevServerLogs(projectId), enabled: routeActive && projectId !== null });
  const status = statusQuery.data;
  const mainPort = status?.mainPort ?? null;
  const [filter, setFilter] = useState<LogFilter>("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [launchPhase, setLaunchPhase] = useState<PreviewSlotRecoveryPhase | null>(null);
  const configuredPreviewApplied = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const selectedLogs = useMemo(() => {
    const services = logsQuery.data?.services ?? [];
    const chosen = serviceFilter === "all" ? services : services.filter((service) => service.serviceId === serviceFilter);
    return chosen.flatMap((service) => service.lines.map((line) => ({ ...line, serviceName: service.name })))
      .filter((line) => filter === "all" || line.level === filter);
  }, [filter, logsQuery.data?.services, serviceFilter]);

  useEffect(() => {
    if (!routeActive || !status || !project || configuredPreviewApplied.current === project.id) return;
    configuredPreviewApplied.current = project.id;
    const previewId = searchParams.get("preview");
    const targetPort = project.previews.find((preview) => preview.id === previewId)?.targetPort;
    if (targetPort && status.services.some((service) => service.port === targetPort) && targetPort !== status.mainPort) {
      void apiClient.savePreviewDevServerMainPort(project.id, targetPort).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["preview-dev-server", project.id] });
      });
    }
  }, [project, queryClient, routeActive, searchParams, status]);

  useEffect(() => {
    const node = logRef.current;
    if (node && filter === "all") node.scrollTop = node.scrollHeight;
  }, [filter, selectedLogs]);

  useEffect(() => {
    if (serviceFilter !== "all" && !logsQuery.data?.services.some((service) => service.serviceId === serviceFilter)) setServiceFilter("all");
  }, [logsQuery.data?.services, serviceFilter]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["preview-dev-server", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["preview-dev-server", projectId, "logs"] }),
      queryClient.invalidateQueries({ queryKey: ["local-ports"] }),
    ]);
  };

  const processMutation = useMutation({
    mutationFn: async (action: "start" | "stop" | "restart") => {
      if (!projectId) throw new Error("Es ist kein Projekt ausgewählt.");
      setActionError(null);
      if (action === "start") return apiClient.startPreviewDevServer(projectId);
      if (action === "stop") return apiClient.stopPreviewDevServer(projectId);
      return apiClient.restartPreviewDevServer(projectId);
    },
    onSuccess: async (nextStatus) => {
      queryClient.setQueryData(["preview-dev-server", projectId], nextStatus);
      await refresh();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen."),
  });

  const savePort = useMutation({
    mutationFn: async (port: number) => {
      if (projectId) await apiClient.savePreviewDevServerMainPort(projectId, port);
    },
    onSuccess: () => void refresh(),
    onError: (error) => setActionError(error instanceof Error ? error.message : "Der Hauptport konnte nicht gespeichert werden."),
  });

  const openDirect = async (mode: DirectOpenMode) => {
    if (!projectId) return;
    setActionError(null);
    const opened = openPlaceholder(mode, projectId);
    if (!opened) {
      setActionError(mode === "tab" ? "Der neue Tab wurde blockiert. Erlaube Popups für Wrapt." : "Das Browserfenster wurde blockiert. Erlaube Popups für Wrapt.");
      return;
    }
    try {
      const existingUrl = status?.publicUrl;
      const launch = existingUrl ? null : await withPreviewSlotRecovery(() => apiClient.launchPreviewRuntime(projectId), setLaunchPhase);
      const url = existingUrl ?? launch?.url;
      if (!url) throw new Error("Die Preview-URL wurde nicht bereitgestellt.");
      opened.location.replace(url);
      await refresh();
    } catch (error) {
      opened.close();
      setActionError(error instanceof Error ? error.message : "Die Preview konnte nicht geöffnet werden.");
    } finally {
      setLaunchPhase(null);
    }
  };

  const copyDirectUrl = async () => {
    if (!projectId) return;
    setActionError(null);
    try {
      const launch = status?.publicUrl ? null : await withPreviewSlotRecovery(() => apiClient.launchPreviewRuntime(projectId), setLaunchPhase);
      const url = status?.publicUrl ?? launch?.url;
      if (!url) throw new Error("Die Preview-URL wurde nicht bereitgestellt.");
      await writeClipboardText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Die Preview-URL konnte nicht kopiert werden.");
    } finally {
      setLaunchPhase(null);
    }
  };

  const openInWorkbench = () => {
    if (!projectId || !mainPort) return;
    const configured = project?.previews.find((preview) => preview.targetPort === mainPort);
    const panelId = openPanel({ type: "preview", projectId, previewId: configured?.id ?? null });
    if (!panelId) {
      setActionError("Es ist kein weiterer Werkzeugplatz frei.");
      return;
    }
    if (!configured) {
      try { window.sessionStorage.setItem(`wrapt:preview-target:${panelId}`, String(mainPort)); } catch { /* Panel bleibt nutzbar. */ }
    }
    navigate("/workbench");
  };

  const openPreviewTools = (mode: DirectOpenMode) => {
    if (!projectId || !mainPort) return;
    const opened = openPreviewLiveWindow({ projectId, port: mainPort, title: project?.name ?? "Development Preview", mode });
    if (!opened) setActionError(mode === "tab" ? "Der neue Tab wurde blockiert." : "Das Browserfenster wurde blockiert.");
  };

  const errorMessage = actionError
    ?? (statusQuery.error instanceof Error ? statusQuery.error.message : null)
    ?? status?.message;
  const servicePorts = status?.services.filter((service) => service.port !== null) ?? [];
  const runningServices = status?.services.filter((service) => service.state === "running").length ?? 0;
  const sourceLabel = status?.profileSource === "configured" ? "preview.config.json" : "Automatisch erkannt";
  const processAction = processMutation.isPending ? processMutation.variables : null;
  const visibleState: PreviewDevServerState = processAction === "stop" ? "stopping" : processAction ? "starting" : (status?.state ?? "unknown");
  const runtimeSummary = visibleState === "starting"
    ? `${status?.services.length ?? 0} ${status?.services.length === 1 ? "Dienst wird" : "Dienste werden"} gestartet`
    : visibleState === "stopping"
      ? "Projektlaufzeit wird beendet"
      : status?.state === "running"
        ? `${runningServices} von ${status.services.length} Diensten aktiv${status.startedAt ? ` · seit ${new Date(status.startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : ""}`
        : `${sourceLabel} · ${status?.services.length ?? 0} Dienste`;
  const logsLive = status?.state === "running" && !logsQuery.isError;

  return (
    <>
      <header className="preview-hub-command">
        <div className="preview-hub-server-state">
          <span className={`preview-hub-state is-${visibleState}`}><i />{stateLabels[visibleState]}</span>
          <div><strong>{project.name}</strong><span>{runtimeSummary}</span></div>
        </div>
        <div className="preview-hub-process-actions">
          {status?.state === "running" ? <button type="button" className="preview-hub-secondary" disabled={processMutation.isPending || Boolean(launchPhase)} onClick={() => processMutation.mutate("restart")}><RefreshIcon />Neu starten</button> : null}
          <button type="button" className={status?.state === "running" ? "preview-hub-stop" : "preview-hub-primary"} data-pending={processMutation.isPending} disabled={processMutation.isPending || Boolean(launchPhase) || statusQuery.isLoading || !status?.services.length} onClick={() => processMutation.mutate(status?.state === "running" ? "stop" : "start")}>
            {processMutation.isPending ? <ActivityIcon /> : status?.state === "running" ? <PowerIcon /> : <PlayIcon />}{processAction === "stop" ? "Wird gestoppt" : processAction ? "Wird gestartet" : status?.state === "running" ? "Alles stoppen" : "Alles starten"}
          </button>
        </div>
      </header>

      {errorMessage ? <div className="preview-hub-alert is-error"><WarningIcon /><span>{errorMessage}</span></div> : null}
      {launchPhase ? <div className="preview-hub-alert is-progress" role="status"><ActivityIcon /><span>{launchPhaseLabels[launchPhase]}</span></div> : null}
      {status?.warnings.map((warning) => <div className="preview-hub-alert is-warning" key={warning}><WarningIcon /><span>{warning}</span></div>)}

      <div className="preview-hub-grid">
        <div className="preview-hub-overview">
          <section className="preview-hub-runtime">
            <header>
              <div><ServicesIcon /><div><strong>Projektlaufzeit</strong><span>{runtimeSummary}</span></div></div>
              <span className="preview-hub-source">{sourceLabel}</span>
            </header>
            <div className="preview-hub-services">
              {status?.services.map((service) => (
                <article className="preview-hub-service" key={service.id} data-state={service.state}>
                  <div className="preview-hub-service-icon">{serviceIcon(service.role)}</div>
                  <div className="preview-hub-service-main">
                    <div><strong>{service.name}</strong>{service.name.toLocaleLowerCase("de-DE") !== roleLabels[service.role].toLocaleLowerCase("de-DE") ? <span>{roleLabels[service.role]}</span> : null}</div>
                    <code title={service.command}>{service.command}</code>
                    {service.frameworkHints.length ? <small>{service.frameworkHints.join(" · ")}</small> : null}
                  </div>
                  <div className="preview-hub-service-status">
                    <span className={`preview-hub-state is-${service.state}`}><i />{stateLabels[service.state]}</span>
                    {service.port ? <code>:{service.port}</code> : <span>Kein Port</span>}
                  </div>
                </article>
              ))}
              {!statusQuery.isLoading && !status?.services.length ? <div className="preview-hub-services-empty"><WarningIcon /><strong>Keine startbare Projektlaufzeit erkannt</strong><span>Lege bei Bedarf eine preview.config.json im Projekt an.</span></div> : null}
            </div>
          </section>

          <section className="preview-hub-target">
            <header><div><ExternalLinkIcon /><div><strong>Preview öffnen</strong><span>Direkte Projekt-URL ohne Workbench-Oberfläche</span></div></div></header>
            <div className="preview-hub-target-body">
              <label className="preview-hub-port-field">
                <span>Hauptziel</span>
                <div className="preview-hub-port-select">
                  <select value={mainPort ?? ""} disabled={!servicePorts.length || savePort.isPending} onChange={(event) => savePort.mutate(Number(event.target.value))} aria-label="Hauptport auswählen">
                    {!servicePorts.length ? <option value="">Kein Browser-Ziel erkannt</option> : null}
                    {servicePorts.map((service) => <option key={service.id} value={service.port ?? undefined}>{service.port} · {service.name} ({roleLabels[service.role]})</option>)}
                  </select>
                  <ChevronDownIcon aria-hidden="true" />
                </div>
              </label>
              <div className="preview-hub-urlbar">
                <span className="preview-hub-url-status" data-ready={Boolean(status?.publicUrl)} data-active={Boolean(launchPhase)} />
                <code title={status?.publicUrl ?? undefined}>{status?.publicUrl ?? (launchPhase ? launchPhaseLabels[launchPhase] : mainPort ? `Port ${mainPort} wird beim Öffnen über einen sicheren Slot veröffentlicht` : "Kein Browser-Ziel verfügbar")}</code>
                <button type="button" disabled={!mainPort || Boolean(launchPhase)} aria-label="Preview-URL kopieren" onClick={() => void copyDirectUrl()}><CopyIcon /><span>{copied ? "Kopiert" : "URL kopieren"}</span></button>
              </div>
              <div className="preview-hub-launchbar">
                <button type="button" className="preview-hub-primary" disabled={!mainPort || Boolean(launchPhase) || processMutation.isPending} onClick={() => void openDirect("tab")}><ExternalLinkIcon />{launchPhase ? "Preview wird vorbereitet" : "Im neuen Tab öffnen"}</button>
                <details className="preview-hub-more">
                  <summary aria-label="Weitere Optionen"><MoreIcon /></summary>
                  <div>
                    <button type="button" disabled={!mainPort || Boolean(launchPhase)} onClick={() => void openDirect("window")}><ExternalLinkIcon /><span><strong>Im neuen Fenster</strong><small>Nur das laufende Projekt</small></span></button>
                    <button type="button" disabled={!mainPort} onClick={openInWorkbench}><WorkbenchIcon /><span><strong>In der Workbench</strong><small>Als Werkzeugfläche öffnen</small></span></button>
                    <button type="button" disabled={!mainPort} onClick={() => openPreviewTools("tab")}><ServerIcon /><span><strong>Preview-Werkzeuge im Tab</strong><small>Mit Geräte- und Größenwahl</small></span></button>
                    <button type="button" disabled={!mainPort} onClick={() => openPreviewTools("window")}><ServerIcon /><span><strong>Preview-Werkzeuge im Fenster</strong><small>Mit Geräte- und Größenwahl</small></span></button>
                  </div>
                </details>
              </div>
            </div>
          </section>
        </div>

        <section className="preview-hub-logs">
          <header>
            <div><TerminalIcon /><div><strong>Dev-Server-Logs</strong><span>{logsQuery.data?.capturedAt ? `Aktualisiert ${new Date(logsQuery.data.capturedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Noch keine Ausgabe"}</span></div></div>
            <div className="preview-hub-log-counts">
              {logsLive ? <span className="is-live"><i />Live</span> : null}
              {logsQuery.data?.errorCount ? <span className="is-error">{logsQuery.data.errorCount} Fehler</span> : null}
              {logsQuery.data?.warningCount ? <span className="is-warning">{logsQuery.data.warningCount} {logsQuery.data.warningCount === 1 ? "Warnung" : "Warnungen"}</span> : null}
              {logsQuery.data?.truncated ? <span>Gekürzt</span> : null}
            </div>
          </header>
          <div className="preview-hub-log-services" role="tablist" aria-label="Dienst auswählen">
            <button type="button" className={serviceFilter === "all" ? "is-active" : ""} onClick={() => setServiceFilter("all")}>Alle Dienste</button>
            {logsQuery.data?.services.map((service) => <button type="button" key={service.serviceId} className={serviceFilter === service.serviceId ? "is-active" : ""} onClick={() => setServiceFilter(service.serviceId)}>{service.name}<span>{service.port ? `:${service.port}` : "ohne Port"}</span></button>)}
          </div>
          <div className="preview-hub-log-toolbar">
            <nav aria-label="Log-Level filtern">{(["all", "error", "warning", "success", "info"] as const).map((value) => <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{logFilterLabels[value]}</button>)}</nav>
            <button type="button" className="preview-hub-copy-logs" disabled={!selectedLogs.length} onClick={() => void writeClipboardText(selectedLogs.map((line) => `[${line.serviceName}] ${line.text}`).join("\n"))}><CopyIcon />Logs kopieren</button>
          </div>
          <div className="preview-hub-log-output" ref={logRef} role="log" aria-live="polite">
            {selectedLogs.map((line, index) => <div className="preview-hub-log-line" data-level={line.level} key={`${line.serviceId}-${index}-${line.text}`}><span>{line.serviceName}</span><code>{line.text}</code></div>)}
            {!selectedLogs.length ? <div className="preview-hub-log-empty">{visibleState === "starting" ? <><ActivityIcon /><strong>Dev-Server werden gestartet</strong><span>Die erste Ausgabe erscheint automatisch, sobald der Prozess antwortet.</span></> : status?.state === "running" ? <><ActivityIcon /><strong>Dev-Server läuft</strong><span>Der gewählte Dienst oder Filter hat momentan keine passenden Einträge.</span></> : <><TerminalIcon /><strong>Die Projektlaufzeit ist nicht aktiv</strong><span>Nach dem Start erscheinen die Ausgaben hier getrennt nach Dienst und Log-Level.</span></>}</div> : null}
          </div>
          <footer><CheckIcon /><span>Kontrollzeichen und ANSI-Farbcodes werden automatisch entfernt.</span></footer>
        </section>
      </div>
    </>
  );
}
