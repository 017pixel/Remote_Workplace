import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, MenuIcon, RestoreIcon } from "./icons";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { StatusBar } from "./StatusBar";
import { useSidebarLayout } from "../lib/useSidebarLayout";
import { PersistentOutlet } from "./PersistentOutlet";
import { useWorkspaceStore } from "../stores/workspace";
import { workbenchQueries } from "../lib/queryOptions";
import { ProjectPicker } from "./ProjectPicker";
import { useTerminalStore } from "../stores/terminals";
import { TerminalWorkspaceSync } from "./terminal/TerminalWorkspaceSync";
import { TerminalSessionsSync } from "./terminal/TerminalSessionsSync";
import { apiClient } from "../lib/apiClient";
import { useResponsiveShell, useVisualViewportVariables } from "../lib/useResponsiveShell";
import { useNavigationRegistry } from "../extensions/useNavigationRegistry";
import { pageRouteRegistry } from "../extensions/pageRouteRegistry";
import { addBreadcrumb } from "../lib/crashReport";
import type { ProjectsResponse, TerminalKind } from "@workbench/contracts";
import { ToolActionMenu } from "./ToolActionMenu";
import { NotificationCenter } from "./NotificationCenter";
import { WorkbenchNotice } from "./WorkbenchNotice";
import { useViewPresence } from "../lib/useViewPresence";

function ContextProjectPicker() {
  const location = useLocation();
  const [search] = useSearchParams();
  const selectProject = useWorkspaceStore((state) => state.selectProject);
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const addTerminalTab = useTerminalStore((state) => state.addTab);
  const activateProject = useTerminalStore((state) => state.activateProject);
  const { data } = useQuery(workbenchQueries.projects());
  const queryClient = useQueryClient();
  const context = location.pathname === "/code-editor" ? "editor"
    : location.pathname === "/previews" ? "preview"
    : location.pathname === "/terminal" ? "terminal"
    : location.pathname === "/codex" ? "codex"
    : location.pathname === "/opencode" ? "opencode"
    : location.pathname === "/claude" ? "claude"
    : null;
  const terminalKind: TerminalKind | null = context === "terminal"
    ? search.get("kind") === "claude" ? "claude" : "shell"
    : context === "codex" || context === "opencode" || context === "claude" ? context : null;
  const terminalAreaId = terminalKind === null ? null : terminalKind === "shell" ? "standalone" : `${terminalKind}-standalone`;
  const terminalArea = useTerminalStore((state) => terminalAreaId ? state.areas[terminalAreaId] : undefined);
  const activeTerminalTab = terminalArea?.tabs.find((tab) => tab.id === terminalArea.activeTabId);
  const activeRuntimeCwd = useTerminalStore((state) => activeTerminalTab ? state.runtimeCwds[activeTerminalTab.id] : undefined);
  const terminalSessions = useQuery({ ...workbenchQueries.terminalSessions(), enabled: terminalKind !== null });
  const baseProjects = (data?.projects ?? []).filter((project) =>
    context === "editor" ? project.links.codeServer !== null
      : project.availability === "available",
  );
  const activeTerminalSession = activeTerminalTab && terminalSessions.data?.sessions.find((session) => session.runtimeId === activeTerminalTab.id);
  const activeTerminalProject = activeRuntimeCwd
    ? data?.projects.find((candidate) => candidate.path === activeRuntimeCwd)
    : activeTerminalSession?.projectId
      ? data?.projects.find((candidate) => candidate.id === activeTerminalSession.projectId)
      : activeTerminalSession?.cwd
      ? data?.projects.find((candidate) => candidate.path === activeTerminalSession.cwd)
      : activeTerminalTab?.projectId
        ? data?.projects.find((candidate) => candidate.id === activeTerminalTab.projectId)
        : undefined;
  const terminalProjectId = activeTerminalProject?.id ?? activeTerminalTab?.projectId ?? null;
  const pickerProjects = activeTerminalProject && !baseProjects.some((candidate) => candidate.id === activeTerminalProject.id)
    ? [activeTerminalProject, ...baseProjects]
    : baseProjects;
  const contextProjectId = terminalKind !== null && activeTerminalTab ? terminalProjectId : selectedProjectId;
  const project = pickerProjects.find((candidate) => candidate.id === contextProjectId) ?? pickerProjects[0];

  useEffect(() => {
    if (!context || !project) return;
    if (terminalKind !== null && activeTerminalTab) {
      if (selectedProjectId !== terminalProjectId) selectProject(terminalProjectId);
      return;
    }
    if (selectedProjectId === null) selectProject(project.id);
  }, [activeTerminalTab, context, project, selectProject, selectedProjectId, terminalKind, terminalProjectId]);

  if (!context || !data) return null;

  const change = (projectId: string) => {
    selectProject(projectId);
    if (terminalKind) {
      const areaId = terminalKind === "shell" ? "standalone" : `${terminalKind}-standalone`;
      if (projectId === contextProjectId && activeTerminalTab) return;
      if (activateProject(areaId, projectId, terminalKind)) return;
      addTerminalTab(areaId, projectId, terminalKind);
    }
  };

  const openPath = async (path: string) => {
    const result = await apiClient.registerProject({ path });
    if (!result) throw new Error("Der Projektordner konnte nicht geöffnet werden.");
    queryClient.setQueryData<ProjectsResponse>(["projects"], (current) => {
      if (!current) return { projects: [result.project], projectsRoot: data.projectsRoot, recentLimit: data.recentLimit };
      const exists = current.projects.some((project) => project.id === result.project.id);
      return { ...current, projects: exists ? current.projects.map((project) => project.id === result.project.id ? result.project : project) : [...current.projects, result.project] };
    });
    change(result.project.id);
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  return (
    <ProjectPicker projects={pickerProjects} projectsRoot={data.projectsRoot} value={contextProjectId} onChange={change} onOpenPath={openPath} allowEmptyValue={terminalKind !== null} compact />
  );
}


/** Meldet die sichtbare Chat-Ansicht an den Server (siehe useViewPresence). */
function ViewPresenceReporter() {
  useViewPresence();
  return null;
}

function StandaloneRouteActions({ terminalFocus, onTerminalFocusChange }: { terminalFocus: boolean; onTerminalFocusChange: (focused: boolean) => void }) {
  const location = useLocation();
  const terminalKind: TerminalKind | null = location.pathname === "/terminal" ? "shell"
    : location.pathname === "/codex" ? "codex"
      : location.pathname === "/opencode" ? "opencode"
        : location.pathname === "/claude" ? "claude"
          : null;
  const areaId = terminalKind === null ? null : terminalKind === "shell" ? "standalone" : `${terminalKind}-standalone`;
  const area = useTerminalStore((state) => areaId ? state.areas[areaId] : undefined);
  const [nativeFullscreen, setNativeFullscreen] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));

  useEffect(() => {
    const update = () => setNativeFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleFullscreen = async () => {
    if (terminalKind !== null) {
      onTerminalFocusChange(!terminalFocus);
      return;
    }
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen?.();
  };

  const activeTabId = area?.activeTabId;
  const externalHref = terminalKind !== null && activeTabId
    ? new URL(`${import.meta.env.BASE_URL}terminal/fenster/${encodeURIComponent(activeTabId)}`, window.location.origin).toString()
    : window.location.href;

  return (
    <ToolActionMenu
      className="is-topbar"
      externalHref={externalHref}
      isFullscreen={terminalKind !== null ? terminalFocus : nativeFullscreen}
      onFullscreen={toggleFullscreen}
      onReload={() => window.location.reload()}
    />
  );
}

export function AppShell() {
  const location = useLocation();
  const navigation = useNavigationRegistry();
  const routeTitles = useMemo(
    () => Object.fromEntries(navigation.items.map((item) => [item.value.route.path, item.value.contribution.label])),
    [navigation],
  );
  const title = routeTitles[location.pathname] ?? "Remote Workplace";
  // Shell-Sonderfälle kommen aus der gematchten Route statt aus Pfadabfragen;
  // die Route-Contribution bleibt damit die einzige Quelle für die Darstellung.
  const activeRouteId = pageRouteRegistry.matchRoute(location.pathname)?.route.contributionId;
  const isProjectDetail = activeRouteId === "workbench.projects.route.detail";
  const isOrbit = activeRouteId === "workbench.orbit.route.main";
  const isNews = activeRouteId === "workbench.tech-tldrs.route.main";
  const isStandaloneT3 = activeRouteId === "workbench.t3-code.route.main";
  const isTerminalRoute = ["/terminal", "/codex", "/opencode", "/claude"].includes(location.pathname);
  const hasStandaloneToolMenu =
    pageRouteRegistry.matchRoute(location.pathname)?.route.value.contribution.standaloneActions === true;
  const [terminalFocus, setTerminalFocus] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const closeMobileNavigation = useCallback(() => setMobileNavigationOpen(false), []);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousPathRef = useRef(location.pathname);
  const navigationSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const sidebar = useSidebarLayout();
  const responsive = useResponsiveShell();
  const showNavigationTrigger = responsive.isTouchShell && !mobileNavigationOpen;
  useVisualViewportVariables();
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!selectedProjectId) return;
    void apiClient.touchProject(selectedProjectId).then((result) => {
      if (!result) return;
      queryClient.setQueryData<ProjectsResponse>(["projects"], (current) => current ? {
        ...current,
        projects: current.projects.map((project) => project.id === result.projectId ? {
          ...project,
          activity: {
            ...project.activity,
            lastWorkbenchUseAt: result.lastUsedAt,
            effectiveAt: result.lastUsedAt,
          },
        } : project),
      } : current);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }).catch(() => { /* Activity is supplemental and retries on the next selection. */ });
  }, [queryClient, selectedProjectId]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    if (previousPathRef.current === location.pathname) return;
    addBreadcrumb(`Seitenwechsel: ${previousPathRef.current} → ${location.pathname}`);
    previousPathRef.current = location.pathname;
    const timer = window.setTimeout(() => mainRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    if (!isTerminalRoute && terminalFocus) setTerminalFocus(false);
  }, [isTerminalRoute, terminalFocus]);

  useEffect(() => {
    if (!terminalFocus) return;
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTerminalFocus(false);
    };
    document.addEventListener("keydown", exitOnEscape);
    return () => document.removeEventListener("keydown", exitOnEscape);
  }, [terminalFocus]);

  return (
    <div
      className={`app-shell ${isOrbit ? "is-orbit" : ""}`}
      data-shell-mode={responsive.mode}
      data-input-mode={responsive.inputMode}
      data-orientation={responsive.orientation}
      data-short-height={responsive.shortHeight ? "true" : "false"}
      data-terminal-shell={isTerminalRoute ? "true" : undefined}
      data-terminal-focus={terminalFocus ? "true" : undefined}
      data-navigation-open={mobileNavigationOpen ? "true" : "false"}
      onPointerDown={(event) => {
        if (responsive.isTouchShell && event.clientX <= 24 && event.isPrimary) navigationSwipeStart.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = navigationSwipeStart.current;
        navigationSwipeStart.current = null;
        if (start && event.clientX - start.x >= 72 && Math.abs(event.clientY - start.y) <= 48) setMobileNavigationOpen(true);
      }}
      onPointerCancel={() => { navigationSwipeStart.current = null; }}
    >
      <a className="skip-link" href="#main-content">Zum Hauptinhalt springen</a>
      <span className="sr-only" aria-live="polite" aria-atomic="true">{title} geöffnet</span>
      <TerminalWorkspaceSync />
      <TerminalSessionsSync />
      <NotificationCenter />
      <ViewPresenceReporter />
      <WorkbenchNotice />
      {responsive.mode === "desktop" ? <Sidebar
        collapsed={sidebar.collapsed}
        width={sidebar.width}
        onToggle={sidebar.toggleCollapsed}
        onResize={sidebar.setWidth}
      /> : null}
      <div
        className={`content-column ${isOrbit ? "is-orbit" : ""}`}
        inert={mobileNavigationOpen ? true : undefined}
      >
        {!isOrbit && !isNews ? <header className="topbar">
          {showNavigationTrigger ? <button
            ref={navigationTriggerRef}
            type="button"
            className="mobile-nav-trigger"
            onClick={() => setMobileNavigationOpen(true)}
            aria-label="Navigation öffnen"
          >
            <MenuIcon className="h-[18px] w-[18px]" />
          </button> : null}
          <div className="page-crumb min-w-0">
            <Link to="/" className="page-crumb-root shell-desktop-only">Remote Workplace</Link>
            <ChevronRightIcon className="page-crumb-separator shell-desktop-only" aria-hidden />
            {isProjectDetail ? (
              <>
                <Link to="/projects" className="page-crumb-root shell-desktop-only">Projekte</Link>
                <ChevronRightIcon className="page-crumb-separator shell-desktop-only" aria-hidden />
              </>
            ) : null}
            <span className="breadcrumb truncate" aria-current="page">
              {isProjectDetail ? decodeURIComponent(location.pathname.split("/").at(-1) ?? "Projekt") : title}
            </span>
          </div>
          {!isStandaloneT3 ? <ContextProjectPicker /> : null}
          {(isStandaloneT3 || location.pathname === "/code-editor") ? <div id="topbar-tool-actions" className="topbar-tool-actions" aria-label={`${title} Aktionen`} /> : hasStandaloneToolMenu ? <StandaloneRouteActions terminalFocus={terminalFocus} onTerminalFocusChange={setTerminalFocus} /> : null}
        </header> : isOrbit ? (showNavigationTrigger ? <button ref={navigationTriggerRef} type="button" className="orbit-app-menu mobile-nav-trigger" onClick={() => setMobileNavigationOpen(true)} aria-label="Navigation öffnen"><MenuIcon className="h-[18px] w-[18px]" /></button> : null) : (showNavigationTrigger ? <button ref={navigationTriggerRef} type="button" className="news-app-menu mobile-nav-trigger" onClick={() => setMobileNavigationOpen(true)} aria-label="Navigation öffnen"><MenuIcon className="h-[18px] w-[18px]" /></button> : null)}
        {!online ? <div className="connection-banner" role="status"><span>Offline</span><strong>Live-Daten und Remote-Werkzeuge sind vorübergehend nicht verfügbar.</strong></div> : null}
        <main ref={mainRef} id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 overflow-hidden">
          <PersistentOutlet />
        </main>
        {responsive.mode === "desktop" ? <StatusBar /> : null}
      </div>
      {terminalFocus ? <button type="button" className="terminal-focus-exit" onClick={() => setTerminalFocus(false)} aria-label="Vollbild verlassen" title="Vollbild verlassen"><RestoreIcon className="h-4 w-4" /></button> : null}
      <MobileNav open={mobileNavigationOpen} onClose={closeMobileNavigation} triggerRef={navigationTriggerRef} />
    </div>
  );
}
