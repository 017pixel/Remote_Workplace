import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  FolderGit2,
  LayoutDashboard,
  Columns2,
  Settings,
  TerminalSquare,
  ChartNoAxesCombined,
  PanelLeftClose,
  PanelLeftOpen,
  MonitorSmartphone,
  Bot,
  Braces,
  Eye,
  FileCode2,
  FilePlus2,
  Frame,
  Gauge,
  ListTodo,
  StickyNote,
  Globe2,
  Newspaper,
  type LucideIcon,
} from "lucide-react";
import { prefetchRoute } from "../lib/routeModules";
import { workbenchQueries } from "../lib/queryOptions";

export interface OrbitPalettePayload {
  type: "project" | "tool" | "note" | "todo" | "snippet" | "file" | "frame" | "usage";
  title: string;
  projectId?: string;
  toolType?: "t3-code" | "code-server" | "preview" | "browser" | "terminal" | "codex" | "opencode";
  provider?: "codex" | "opencode";
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

export interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  showOnMobile: boolean;
}

export const primaryNavItems: NavItem[] = [
  { to: "/", label: "Dashboard", description: "Server, Dienste und Projekte", icon: LayoutDashboard, showOnMobile: true },
  { to: "/workbench", label: "Workbench", description: "Werkzeuge und Previews öffnen", icon: Columns2, showOnMobile: true },
  { to: "/tech-tldrs", label: "Tech TLDRs", description: "Tech-News lesen und verstehen", icon: Newspaper, showOnMobile: true },
  { to: "/projects", label: "Projekte", description: "Konfigurierte Arbeitsbereiche", icon: FolderGit2, showOnMobile: true },
];

export const toolRouteItems: NavItem[] = [
  { to: "/t3-code", label: "T3 Code", description: "Codex-Arbeitsumgebung", icon: TerminalSquare, showOnMobile: false },
  { to: "/codex", label: "Codex", description: "Codex CLI mit bis zu vier Instanzen", icon: Bot, showOnMobile: true },
  { to: "/opencode", label: "OpenCode", description: "OpenCode CLI mit bis zu vier Instanzen", icon: Braces, showOnMobile: true },
  { to: "/code-editor", label: "Code-Server", description: "VS Code im Browser", icon: MonitorSmartphone, showOnMobile: true },
  { to: "/previews", label: "Previews", description: "Lokale Apps und laufende Ports", icon: Eye, showOnMobile: true },
  { to: "/browser", label: "Browser", description: "Chromium für Recherche und lokale Apps", icon: Globe2, showOnMobile: true },
  { to: "/terminal", label: "Terminal", description: "Interaktive Server-Shell", icon: TerminalSquare, showOnMobile: true },
];

export const footerNavItems: NavItem[] = [
  { to: "/usage", label: "Nutzung und Limits", description: "Codex und OpenCode Go", icon: ChartNoAxesCombined, showOnMobile: true },
  { to: "/settings", label: "Einstellungen", description: "Lokaler Workspace und Sicherheit", icon: Settings, showOnMobile: true },
];

export const navItems = [...primaryNavItems, ...toolRouteItems, ...footerNavItems];

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
          {!collapsed ? <div className="sidebar-kicker">Workspace</div> : null}
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
          {!collapsed ? <div className="sidebar-kicker">{orbitMode ? "Orbit-Projekte" : "Werkzeuge"}</div> : null}
          {orbitMode ? (projects.data?.projects.filter((project) => project.availability === "available").slice(0, 8).map((project) => (
            <button
              key={project.id}
              type="button"
              className="sidebar-item orbit-palette-item"
              draggable
              onDragStart={(event) => beginOrbitDrag(event, { type: "project", title: project.name, projectId: project.id })}
              onClick={() => requestOrbitNode({ type: "project", title: project.name, projectId: project.id })}
              title={collapsed ? project.name : "Klicken oder auf den Orbit ziehen"}
            >
              <FolderGit2 className="h-4 w-4 shrink-0" />
              {!collapsed ? <><span className="truncate">{project.name}</span><small>ziehen</small></> : null}
            </button>
          ))) : toolRouteItems.map((item) => (
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
          {orbitMode ? (
            <>
              {!collapsed ? <div className="sidebar-kicker">Werkzeuge</div> : null}
              {([
                ["terminal", "Terminal", TerminalSquare],
                ["t3-code", "T3 Code", TerminalSquare],
                ["preview", "Preview", Eye],
                ["browser", "Browser", Globe2],
                ["code-server", "Code-Server", MonitorSmartphone],
                ["codex", "Codex", Bot],
                ["opencode", "OpenCode", Braces],
              ] as const).map(([toolType, label, Icon]) => {
                const payload: OrbitPalettePayload = { type: "tool", title: label, toolType };
                return <button key={toolType} type="button" className="sidebar-item orbit-palette-item" draggable onDragStart={(event) => beginOrbitDrag(event, payload)} onClick={() => requestOrbitNode(payload)} title={collapsed ? label : "Klicken oder auf den Orbit ziehen"}><Icon className="h-4 w-4 shrink-0" />{!collapsed ? <><span>{label}</span><small>ziehen</small></> : null}</button>;
              })}
              {!collapsed ? <div className="sidebar-kicker">Blöcke</div> : null}
              {([
                [{ type: "note", title: "Neue Notiz" } satisfies OrbitPalettePayload, StickyNote],
                [{ type: "todo", title: "To-do-Liste" } satisfies OrbitPalettePayload, ListTodo],
                [{ type: "snippet", title: "Code-Snippet" } satisfies OrbitPalettePayload, FileCode2],
                [{ type: "file", title: "neue-datei.ts" } satisfies OrbitPalettePayload, FilePlus2],
                [{ type: "frame", title: "Neuer Bereich" } satisfies OrbitPalettePayload, Frame],
                [{ type: "usage", title: "Codex Nutzung", provider: "codex" } satisfies OrbitPalettePayload, Gauge],
                [{ type: "usage", title: "OpenCode Nutzung", provider: "opencode" } satisfies OrbitPalettePayload, Gauge],
              ] as const).map(([payload, Icon]) => <button key={`${payload.type}-${payload.title}`} type="button" className="sidebar-item orbit-palette-item" draggable onDragStart={(event) => beginOrbitDrag(event, payload)} onClick={() => requestOrbitNode(payload)} title={collapsed ? payload.title : "Klicken oder auf den Orbit ziehen"}><Icon className="h-4 w-4 shrink-0" />{!collapsed ? <><span>{payload.title}</span><small>ziehen</small></> : null}</button>)}
            </>
          ) : null}
          <div className="sidebar-footer">
            {!collapsed ? <div className="sidebar-kicker">Account und System</div> : null}
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
