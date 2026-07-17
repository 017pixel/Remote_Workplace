import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/workbench": "Workbench",
  "/tech-tldrs": "Tech TLDRs",
  "/projects": "Projekte",
  "/settings": "Einstellungen",
  "/usage": "Nutzung und Limits",
  "/t3-code": "T3 Code",
  "/code-editor": "Editor",
  "/previews": "Previews",
  "/browser": "Browser",
  "/terminal": "Terminal",
  "/codex": "Codex",
  "/opencode": "OpenCode",
};

function ContextProjectPicker() {
  const location = useLocation();
  const selectProject = useWorkspaceStore((state) => state.selectProject);
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const addTerminalTab = useTerminalStore((state) => state.addTab);
  const { data } = useQuery(workbenchQueries.projects());
  const context = location.pathname === "/t3-code" ? "t3"
    : location.pathname === "/code-editor" ? "editor"
    : location.pathname === "/previews" ? "preview"
    : location.pathname === "/terminal" ? "terminal"
    : location.pathname === "/codex" ? "codex"
    : location.pathname === "/opencode" ? "opencode"
    : null;
  const projects = (data?.projects ?? []).filter((project) =>
    context === "editor" ? project.links.codeServer !== null
      : context === "t3" ? project.links.t3Code !== null
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
    if (context === "terminal") addTerminalTab("standalone", projectId);
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
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const closeMobileNavigation = useCallback(() => setMobileNavigationOpen(false), []);
  const sidebar = useSidebarLayout();

  return (
    <div className={`app-shell ${isOrbit ? "is-orbit" : ""}`}>
      <Sidebar
        collapsed={sidebar.collapsed}
        width={sidebar.width}
        onToggle={sidebar.toggleCollapsed}
        onResize={sidebar.setWidth}
      />
      <div className={`content-column ${isOrbit ? "is-orbit" : ""}`}>
        {!isOrbit && !isNews ? <header className="topbar">
          <button
            type="button"
            className="mobile-nav-trigger md:hidden"
            onClick={() => setMobileNavigationOpen(true)}
            aria-label="Navigation öffnen"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <div className="page-crumb min-w-0">
            <Link to="/" className="page-crumb-root hidden md:inline">Dev Workbench</Link>
            <ChevronRight className="page-crumb-separator hidden md:block" aria-hidden />
            {isProjectDetail ? (
              <>
                <Link to="/projects" className="page-crumb-root hidden md:inline">Projekte</Link>
                <ChevronRight className="page-crumb-separator hidden md:block" aria-hidden />
              </>
            ) : null}
            <span className="breadcrumb truncate" aria-current="page">
              {isProjectDetail ? decodeURIComponent(location.pathname.split("/").at(-1) ?? "Projekt") : title}
            </span>
          </div>
          <ContextProjectPicker />
        </header> : isOrbit ? <button type="button" className="orbit-app-menu mobile-nav-trigger md:hidden" onClick={() => setMobileNavigationOpen(true)} aria-label="Navigation öffnen"><Menu className="h-[18px] w-[18px]" /></button> : <button type="button" className="news-app-menu mobile-nav-trigger md:hidden" onClick={() => setMobileNavigationOpen(true)} aria-label="Navigation öffnen"><Menu className="h-[18px] w-[18px]" /></button>}
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <PersistentOutlet />
        </main>
        <StatusBar />
      </div>
      <MobileNav open={mobileNavigationOpen} onClose={closeMobileNavigation} />
    </div>
  );
}
