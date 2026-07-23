import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Menu } from "lucide-react";
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
import { apiClient } from "../lib/apiClient";
import { useResponsiveShell, useVisualViewportVariables } from "../lib/useResponsiveShell";
import { navItems } from "../routes/navigation";
import type { ProjectsResponse } from "@workbench/contracts";

const routeTitles = Object.fromEntries(navItems.map((item) => [item.to, item.label]));

function ContextProjectPicker() {
  const location = useLocation();
  const selectProject = useWorkspaceStore((state) => state.selectProject);
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const addTerminalTab = useTerminalStore((state) => state.addTab);
  const { data } = useQuery(workbenchQueries.projects());
  const context = location.pathname === "/code-editor" ? "editor"
    : location.pathname === "/previews" ? "preview"
    : location.pathname === "/terminal" ? "terminal"
    : location.pathname === "/codex" ? "codex"
    : location.pathname === "/opencode" ? "opencode"
    : null;
  const projects = (data?.projects ?? []).filter((project) =>
    context === "editor" ? project.links.codeServer !== null
      : project.availability === "available",
  );
  const availableProjects = projects;
  const project = projects.find((candidate) => candidate.id === selectedProjectId) ?? availableProjects[0];

  useEffect(() => {
    if (context && selectedProjectId === null && project) selectProject(project.id);
  }, [context, project, selectProject, selectedProjectId]);

  if (!context || availableProjects.length === 0) return null;

  const change = (projectId: string) => {
    selectProject(projectId);
    const terminalKind = context === "terminal"
      ? "shell"
      : context === "codex" || context === "opencode"
        ? context
        : null;
    if (terminalKind) {
      const areaId = terminalKind === "shell" ? "standalone" : `${terminalKind}-standalone`;
      addTerminalTab(areaId, projectId, terminalKind);
    }
  };

  return (
    <ProjectPicker projects={availableProjects} value={project?.id ?? null} onChange={change} compact />
  );
}

export function AppShell() {
  const location = useLocation();
  const title = routeTitles[location.pathname] ?? "Dev Workbench";
  const isProjectDetail = location.pathname.startsWith("/projects/");
  const isOrbit = location.pathname === "/workbench";
  const isNews = location.pathname === "/tech-tldrs";
  const isStandaloneT3 = location.pathname === "/t3-code";
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
    previousPathRef.current = location.pathname;
    const timer = window.setTimeout(() => mainRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div
      className={`app-shell ${isOrbit ? "is-orbit" : ""}`}
      data-shell-mode={responsive.mode}
      data-input-mode={responsive.inputMode}
      data-orientation={responsive.orientation}
      data-short-height={responsive.shortHeight ? "true" : "false"}
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
            <Menu className="h-[18px] w-[18px]" />
          </button> : null}
          <div className="page-crumb min-w-0">
            <Link to="/" className="page-crumb-root shell-desktop-only">Dev Workbench</Link>
            <ChevronRight className="page-crumb-separator shell-desktop-only" aria-hidden />
            {isProjectDetail ? (
              <>
                <Link to="/projects" className="page-crumb-root shell-desktop-only">Projekte</Link>
                <ChevronRight className="page-crumb-separator shell-desktop-only" aria-hidden />
              </>
            ) : null}
            <span className="breadcrumb truncate" aria-current="page">
              {isProjectDetail ? decodeURIComponent(location.pathname.split("/").at(-1) ?? "Projekt") : title}
            </span>
          </div>
          {isStandaloneT3 ? <div id="topbar-tool-actions" className="topbar-tool-actions" aria-label="T3 Code Aktionen" /> : <ContextProjectPicker />}
        </header> : isOrbit ? (showNavigationTrigger ? <button ref={navigationTriggerRef} type="button" className="orbit-app-menu mobile-nav-trigger" onClick={() => setMobileNavigationOpen(true)} aria-label="Navigation öffnen"><Menu className="h-[18px] w-[18px]" /></button> : null) : (showNavigationTrigger ? <button ref={navigationTriggerRef} type="button" className="news-app-menu mobile-nav-trigger" onClick={() => setMobileNavigationOpen(true)} aria-label="Navigation öffnen"><Menu className="h-[18px] w-[18px]" /></button> : null)}
        {!online ? <div className="connection-banner" role="status"><span>Offline</span><strong>Live-Daten und Remote-Werkzeuge sind vorübergehend nicht verfügbar.</strong></div> : null}
        <main ref={mainRef} id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 overflow-hidden">
          <PersistentOutlet />
        </main>
        {responsive.mode === "desktop" ? <StatusBar /> : null}
      </div>
      <MobileNav open={mobileNavigationOpen} onClose={closeMobileNavigation} triggerRef={navigationTriggerRef} />
    </div>
  );
}
