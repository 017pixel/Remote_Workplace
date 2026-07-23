import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  FolderGit2,
  TerminalSquare,
  PanelLeftClose,
  PanelLeftOpen,
  MonitorSmartphone,
  Bot,
  Braces,
  Code2,
  Eye,
  FileCode2,
  Frame,
  Gauge,
  ListTodo,
  StickyNote,
  Globe2,
  FolderSearch2,
  FolderUp,
  Images,
} from "lucide-react";
import { prefetchRoute } from "../lib/routeModules";
import { workbenchQueries } from "../lib/queryOptions";
import { footerNavItems, primaryNavItems, toolRouteItems } from "../routes/navigation";

export interface OrbitPalettePayload {
  type: "project" | "tool" | "note" | "todo" | "snippet" | "file" | "frame" | "usage" | "gallery" | "fileGallery";
  title: string;
  projectId?: string;
  toolType?: "t3-code" | "code-server" | "preview" | "browser" | "terminal" | "codex" | "opencode";
  provider?: "codex" | "opencode" | "claude";
  previewId?: string;
}

function beginOrbitDrag(event: ReactDragEvent, payload: OrbitPalettePayload) {
  const value = JSON.stringify(payload);
  event.dataTransfer.setData("application/x-orbit-node", value);
  event.dataTransfer.setData("text/plain", value);
  event.dataTransfer.effectAllowed = "copy";
}

function requestOrbitNode(payload: OrbitPalettePayload) {
  window.dispatchEvent(new CustomEvent<OrbitPalettePayload>("orbit:add", { detail: payload }));
}

function requestOrbitProjectBrowser() {
  window.dispatchEvent(new Event("orbit:project-browser"));
}

interface SidebarProps {
  collapsed: boolean;
  width: number;
  onToggle: () => void;
  onResize: (width: number) => void;
}

export function Sidebar({ collapsed, width, onToggle, onResize }: SidebarProps) {
  const location = useLocation();
  const projects = useQuery(workbenchQueries.projects());
  const orbitMode = location.pathname === "/workbench";
  const availableProjects = useMemo(
    () => (projects.data?.projects ?? []).filter((project) => project.availability === "available"),
    [projects.data?.projects],
  );
  const recentProjects = useMemo(() => [...availableProjects]
    .sort((left, right) => {
      const lastUse = (right.activity.lastWorkbenchUseAt ?? "").localeCompare(left.activity.lastWorkbenchUseAt ?? "");
      if (lastUse) return lastUse;
      const effective = (right.activity.effectiveAt ?? "").localeCompare(left.activity.effectiveAt ?? "");
      return effective || left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "de");
    })
    .slice(0, projects.data?.recentLimit ?? 8), [availableProjects, projects.data?.recentLimit]);
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const handleMove = (moveEvent: globalThis.PointerEvent) => onResize(startWidth + moveEvent.clientX - startX);
    const handleEnd = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd, { once: true });
  };

  return (
    <div
      className={`sidebar-shell hidden md:flex ${collapsed ? "is-collapsed" : ""}`}
      style={{ "--sidebar-width": `${collapsed ? 56 : width}px` } as CSSProperties}
    >
      <aside className="workspace-sidebar flex-col">
        <div className="sidebar-brand">
          <div className="sidebar-mark"><TerminalSquare className="h-[18px] w-[18px]" /></div>
          {!collapsed ? <div className="sidebar-label">Dev Workbench</div> : null}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={onToggle}
            aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
            title={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pt-3">
          <div className="sidebar-section">
            {!collapsed ? <div className="sidebar-kicker">Workspace</div> : <span className="sidebar-section-divider" aria-hidden />}
            {primaryNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className="sidebar-item"
              onPointerEnter={() => prefetchRoute(item.to)}
              onFocus={() => prefetchRoute(item.to)}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed ? item.label : null}
            </NavLink>
            ))}
          </div>
          <div className="sidebar-section">
          {!collapsed ? <div className="sidebar-kicker">{orbitMode ? "Orbit-Projekte" : "Werkzeuge"}</div> : <span className="sidebar-section-divider" aria-hidden />}
          {orbitMode ? (<>{recentProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="sidebar-item orbit-palette-item"
              draggable
              onDragStart={(event) => beginOrbitDrag(event, { type: "project", title: project.name, projectId: project.id })}
              onClick={() => requestOrbitNode({ type: "project", title: project.name, projectId: project.id })}
              aria-label={collapsed ? project.name : `${project.name} ziehen`}
              title={collapsed ? project.name : "Klicken oder auf den Orbit ziehen"}
            >
              <FolderGit2 className="h-4 w-4 shrink-0" />
              {!collapsed ? <><span className="truncate">{project.name}</span><small>ziehen</small></> : null}
            </button>
          ))}
            <button type="button" className="sidebar-item orbit-palette-item" onClick={requestOrbitProjectBrowser} aria-label="Alle Projekte auswählen" title={collapsed ? "Alle Projekte" : "Serverordner durchsuchen"}>
              <FolderSearch2 className="h-4 w-4 shrink-0" />
              {!collapsed ? <><span className="truncate">Alle Projekte</span><small>{availableProjects.length}</small></> : null}
            </button>
          </>) : toolRouteItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="sidebar-item"
              onPointerEnter={() => prefetchRoute(item.to)}
              onFocus={() => prefetchRoute(item.to)}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed ? item.label : null}
            </NavLink>
          ))}
          </div>
          {orbitMode ? (
            <>
              <div className="sidebar-section">
              {!collapsed ? <div className="sidebar-kicker">Werkzeuge</div> : <span className="sidebar-section-divider" aria-hidden />}
              {([
                ["terminal", "Terminal", TerminalSquare],
                ["t3-code", "T3 Code", Code2],
                ["preview", "Preview", Eye],
                ["browser", "Browser", Globe2],
                ["code-server", "Code-Server", MonitorSmartphone],
                ["codex", "Codex", Bot],
                ["opencode", "OpenCode", Braces],
              ] as const).map(([toolType, label, Icon]) => {
                const payload: OrbitPalettePayload = { type: "tool", title: label, toolType };
                return <button key={toolType} type="button" className="sidebar-item orbit-palette-item" draggable onDragStart={(event) => beginOrbitDrag(event, payload)} onClick={() => requestOrbitNode(payload)} title={collapsed ? label : "Klicken oder auf den Orbit ziehen"}><Icon className="h-4 w-4 shrink-0" />{!collapsed ? <><span>{label}</span><small>ziehen</small></> : null}</button>;
              })}
              </div>
              <div className="sidebar-section">
              {!collapsed ? <div className="sidebar-kicker">Galerie</div> : <span className="sidebar-section-divider" aria-hidden />}
              {([
                [{ type: "gallery", title: "Mediengalerie" } satisfies OrbitPalettePayload, Images],
                [{ type: "fileGallery", title: "Dateigalerie" } satisfies OrbitPalettePayload, FolderUp],
              ] as const).map(([payload, Icon]) => <button key={payload.type} type="button" className="sidebar-item orbit-palette-item" draggable onDragStart={(event) => beginOrbitDrag(event, payload)} onClick={() => requestOrbitNode(payload)} title={collapsed ? payload.title : "Klicken oder auf den Orbit ziehen"}><Icon className="h-4 w-4 shrink-0" />{!collapsed ? <><span>{payload.title}</span><small>ziehen</small></> : null}</button>)}
              </div>
              <div className="sidebar-section">
              {!collapsed ? <div className="sidebar-kicker">Blöcke</div> : <span className="sidebar-section-divider" aria-hidden />}
              {([
                [{ type: "note", title: "Neue Notiz" } satisfies OrbitPalettePayload, StickyNote],
                [{ type: "todo", title: "To-do-Liste" } satisfies OrbitPalettePayload, ListTodo],
                [{ type: "snippet", title: "Code-Snippet" } satisfies OrbitPalettePayload, FileCode2],
                [{ type: "frame", title: "Neuer Bereich" } satisfies OrbitPalettePayload, Frame],
                [{ type: "usage", title: "Codex Nutzung", provider: "codex" } satisfies OrbitPalettePayload, Gauge],
                [{ type: "usage", title: "OpenCode Nutzung", provider: "opencode" } satisfies OrbitPalettePayload, Gauge],
                [{ type: "usage", title: "Claude Code Nutzung", provider: "claude" } satisfies OrbitPalettePayload, Gauge],
              ] as const).map(([payload, Icon]) => <button key={`${payload.type}-${payload.title}`} type="button" className="sidebar-item orbit-palette-item" draggable onDragStart={(event) => beginOrbitDrag(event, payload)} onClick={() => requestOrbitNode(payload)} title={collapsed ? payload.title : "Klicken oder auf den Orbit ziehen"}><Icon className="h-4 w-4 shrink-0" />{!collapsed ? <><span>{payload.title}</span><small>ziehen</small></> : null}</button>)}
              </div>
            </>
          ) : null}
          <div className="sidebar-footer sidebar-section">
            {!collapsed ? <div className="sidebar-kicker">Account und System</div> : <span className="sidebar-section-divider" aria-hidden />}
            {footerNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="sidebar-item"
                onPointerEnter={() => prefetchRoute(item.to)}
                onFocus={() => prefetchRoute(item.to)}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed ? item.label : null}
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>
      {!collapsed ? (
        <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
      ) : null}
    </div>
  );
}
