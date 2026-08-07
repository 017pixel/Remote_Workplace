import { NavLink, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import type { OrbitNode } from "@workbench/contracts";
import { BrowserIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CodeFileIcon, CodeServerIcon, CodexIcon, EyeIcon, FinderIcon, FolderCodeIcon, FolderSearchIcon, FrameIcon, HermesIcon, NoteIcon, NutzungIcon, OpenCodeIcon, RemoteWorkbenchIcon, T3CodeIcon, TerminalIcon, TodoIcon } from "./icons";
import { prefetchRouteTarget } from "../lib/routePrefetch";
import { workbenchQueries } from "../lib/queryOptions";
import { footerNavItems, primaryNavItems, toolRouteItems, type NavItem } from "../routes/navigation";
import { isOrbitItemVisibleIn, isPageVisibleIn, useSidebarPreferences, type OrbitPaletteItem, type SidebarSectionKey, type PageRouteId } from "../stores/sidebarPreferences";
import { useOrbitStore } from "../stores/orbit";
import { PromptDialog } from "./ModalDialog";
import { previewSessionKeysWithNode, previewSlotsReleasedWithNode, releasePreviewSessions, releasePreviewSlots } from "../lib/previewSlotLifecycle";
import { openPreviewGroupWindow } from "../lib/previewWindow";
import { requestOrbitNode, type OrbitPalettePayload } from "../lib/orbitPalette";

const pathToRouteId = (path: string): PageRouteId | null => {
  const map: Record<string, PageRouteId> = {
    "/": "dashboard", "/inbox": "inbox", "/workbench": "workbench", "/tech-tldrs": "tech-tldrs", "/projects": "projects",
    "/t3-code": "t3-code", "/hermes-agent": "hermes-agent", "/codex": "codex", "/opencode": "opencode", "/claude": "claude", "/code-editor": "code-editor",
    "/previews": "previews", "/browser": "browser", "/terminal": "terminal", "/files": "files", "/ki-skills": "ki-skills",
    "/usage": "usage", "/settings": "settings",
  };
  return map[path] ?? null;
};

export type { OrbitPalettePayload } from "../lib/orbitPalette";

function beginOrbitDrag(event: ReactDragEvent, payload: OrbitPalettePayload) {
  const value = JSON.stringify(payload);
  event.dataTransfer.setData("application/x-orbit-node", value);
  event.dataTransfer.setData("text/plain", value);
  event.dataTransfer.effectAllowed = "copy";
}

function requestOrbitProjectBrowser() {
  window.dispatchEvent(new Event("orbit:project-browser"));
}


function SectionHeader({ label, sectionKey, collapsed }: { label: string; sectionKey: SidebarSectionKey; collapsed: boolean }) {
  const toggle = useSidebarPreferences((s) => s.toggleSection);
  const isCollapsed = useSidebarPreferences((s) => s.collapsedSections[sectionKey]);
  if (collapsed) return <span className="sidebar-section-divider" aria-hidden />;
  return (
    <button type="button" className="sidebar-section-header" onClick={() => toggle(sectionKey)} aria-expanded={!isCollapsed} aria-label={`${label} ${isCollapsed ? "ausklappen" : "einklappen"}`}>
      <span>{label}</span>
      <ChevronDownIcon className={`sidebar-section-chevron ${isCollapsed ? "is-collapsed" : ""}`} />
    </button>
  );
}

function useSectionCollapsed(sectionKey: SidebarSectionKey) {
  return useSidebarPreferences((s) => s.collapsedSections[sectionKey]);
}

// Ein Eintrag für beide Sidebar-Breiten. Eingeklappt bleibt nur das Icon stehen,
// der Text steckt weiterhin in aria-label/title — deshalb genau eine Variante statt zwei Zweigen.
function SidebarNavLink({ item, collapsed, badge = 0 }: { item: NavItem; collapsed: boolean; badge?: number }) {
  const client = useQueryClient();
  const prefetch = () => prefetchRouteTarget(client, item.to);
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className="sidebar-item"
      onPointerEnter={prefetch}
      // Touch kennt kein Überfahren: `pointerdown` feuert vor dem Klick und
      // verschafft Bündel und Daten den entscheidenden Vorsprung.
      onPointerDown={prefetch}
      onFocus={prefetch}
      aria-label={item.label}
      title={item.label}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed ? item.label : null}
      {badge > 0 ? <span className="sidebar-notification-badge" aria-label={`${badge} ungelesen`}>{badge > 99 ? "99+" : badge}</span> : null}
    </NavLink>
  );
}

const orbitTools: ReadonlyArray<[OrbitPaletteItem, string, React.ComponentType<{ className?: string }>]> = [
  ["tool:t3-code", "T3 Code", T3CodeIcon],
  ["tool:hermes", "Hermes Agent", HermesIcon],
  ["tool:code-server", "Code-Server", CodeServerIcon],
  ["tool:terminal", "Terminal", TerminalIcon],
  ["tool:opencode", "OpenCode", OpenCodeIcon],
  ["tool:codex", "Codex", CodexIcon],
  ["tool:files", "Files", FinderIcon],
  ["tool:browser", "Browser", BrowserIcon],
];
const orbitBlocks: ReadonlyArray<[OrbitPaletteItem, OrbitPalettePayload, typeof NoteIcon]> = [
  ["block:note", { type: "note", title: "Neue Notiz" } satisfies OrbitPalettePayload, NoteIcon],
  ["block:todo", { type: "todo", title: "To-do-Liste" } satisfies OrbitPalettePayload, TodoIcon],
  ["block:snippet", { type: "snippet", title: "Code-Snippet" } satisfies OrbitPalettePayload, CodeFileIcon],
  ["block:frame", { type: "frame", title: "Neuer Bereich" } satisfies OrbitPalettePayload, FrameIcon],
  ["block:usage-codex", { type: "usage", title: "Codex Nutzung", provider: "codex" } satisfies OrbitPalettePayload, NutzungIcon],
  ["block:usage-opencode", { type: "usage", title: "OpenCode Nutzung", provider: "opencode" } satisfies OrbitPalettePayload, NutzungIcon],
  ["block:usage-claude", { type: "usage", title: "Claude Code Nutzung", provider: "claude" } satisfies OrbitPalettePayload, NutzungIcon],
];

function OrbitPaletteButton({ payload, Icon, collapsed }: { payload: OrbitPalettePayload; Icon: React.ComponentType<{ className?: string }>; collapsed: boolean }) {
  return (
    <button type="button" className="sidebar-item orbit-palette-item" draggable onDragStart={(event) => beginOrbitDrag(event, payload)} onClick={() => requestOrbitNode(payload)} aria-label={payload.title} title={collapsed ? payload.title : "Klicken oder auf den Orbit ziehen"}>
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <><span>{payload.title}</span><small>ziehen</small></> : null}
    </button>
  );
}

function OrbitToolSection({ collapsed }: { collapsed: boolean }) {
  const hiddenOrbitItems = useSidebarPreferences((s) => s.hiddenOrbitItems);
  const isCollapsed = useSectionCollapsed("tools");
  const visible = orbitTools.filter(([key]) => isOrbitItemVisibleIn(hiddenOrbitItems, key));
  return (
    <div className="sidebar-section">
      <SectionHeader label="Werkzeuge" sectionKey="tools" collapsed={collapsed} />
      {!isCollapsed ? visible.map(([key, label, Icon]) => {
        const toolType = key.split(":")[1] as NonNullable<OrbitPalettePayload["toolType"]>;
        return <OrbitPaletteButton key={key} payload={{ type: "tool", title: label, toolType }} Icon={Icon} collapsed={collapsed} />;
      }) : null}
    </div>
  );
}

const previewTemplates: ReadonlyArray<[OrbitPaletteItem, "1" | "2" | "3" | "6", string]> = [
  ["preview:layout-1", "1", "Einzel-Preview"],
  ["preview:layout-2", "2", "2er-Gruppe"],
  ["preview:layout-3", "3", "3er-Gruppe"],
  ["preview:layout-6", "6", "6er-Gruppe (2×3)"],
];

function OrbitPreviewSection({ collapsed }: { collapsed: boolean }) {
  const isCollapsed = useSectionCollapsed("previews");
  const hiddenOrbitItems = useSidebarPreferences((state) => state.hiddenOrbitItems);
  const document = useOrbitStore((state) => state.document);
  const duplicateNode = useOrbitStore((state) => state.duplicateNode);
  const removeNode = useOrbitStore((state) => state.removeNode);
  const updateNode = useOrbitStore((state) => state.updateNode);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameGroup, setRenameGroup] = useState<OrbitNode | null>(null);
  const board = document.boards.find((candidate) => candidate.id === document.activeBoardId);
  const savedGroups = [...(board?.nodes.filter((node) => node.type === "previewGroup" && node.previewReferenceId === null) ?? [])]
    .sort((left, right) => (right.previewLastUsedAt ?? "").localeCompare(left.previewLastUsedAt ?? ""));
  useEffect(() => {
    if (!menuId) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest(".sidebar-preview-saved")) setMenuId(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuId(null); };
    globalThis.document.addEventListener("mousedown", close);
    globalThis.document.addEventListener("keydown", escape);
    return () => {
      globalThis.document.removeEventListener("mousedown", close);
      globalThis.document.removeEventListener("keydown", escape);
    };
  }, [menuId]);
  const deleteGroup = (group: OrbitNode) => {
    if (board) {
      void releasePreviewSlots(previewSlotsReleasedWithNode(board, group.id));
      void releasePreviewSessions(previewSessionKeysWithNode(board, group.id));
    }
    removeNode(group.id);
    setMenuId(null);
  };
  return (
    <div className="sidebar-section orbit-preview-section">
      <SectionHeader label="Previews" sectionKey="previews" collapsed={collapsed} />
      {!isCollapsed ? <>
        {previewTemplates.filter(([key]) => isOrbitItemVisibleIn(hiddenOrbitItems, key)).map(([key, layout, label]) => (
          <OrbitPaletteButton key={key} payload={{ type: "previewGroup", title: label, layout }} Icon={EyeIcon} collapsed={collapsed} />
        ))}
        {savedGroups.length ? <span className="sidebar-preview-divider" /> : null}
        {savedGroups.map((group) => {
          const count = Number(group.previewLayout ?? "1");
          return <div className="sidebar-preview-saved" key={group.id} onContextMenu={(event) => { event.preventDefault(); setMenuId(group.id); }}>
            <button type="button" className="sidebar-item orbit-palette-item" draggable onDragStart={(event) => beginOrbitDrag(event, { type: "previewGroup", title: group.title, layout: group.previewLayout ?? "1", referenceId: group.id })} onClick={() => requestOrbitNode({ type: "previewGroup", title: group.title, layout: group.previewLayout ?? "1", referenceId: group.id })} title={collapsed ? `${group.title} · ${count} Slots` : "Gespeicherte Gruppe einsetzen"}>
              <EyeIcon className="h-4 w-4 shrink-0" />
              {!collapsed ? <><span>{group.title}</span><small>{count} Slots</small></> : null}
            </button>
            {menuId === group.id ? <div className="sidebar-preview-menu">
              <button type="button" onClick={() => { setRenameGroup(group); setMenuId(null); }}>Umbenennen</button>
              <button type="button" onClick={() => { duplicateNode(group.id); setMenuId(null); }}>Duplizieren</button>
              <button type="button" onClick={() => { openPreviewGroupWindow(group.id); setMenuId(null); }}>In eigenem Fenster öffnen</button>
              <button type="button" className="is-danger" onClick={() => deleteGroup(group)}>Löschen</button>
            </div> : null}
          </div>;
        })}
      </> : null}
      <PromptDialog
        open={renameGroup !== null}
        title="Preview-Gruppe umbenennen"
        description="Der Name wird im Orbit und in der Preview-Übersicht synchronisiert."
        label="Gruppenname"
        initialValue={renameGroup?.title ?? ""}
        onConfirm={(name) => { if (renameGroup) updateNode(renameGroup.id, { title: name, previewLastUsedAt: new Date().toISOString() }); }}
        onClose={() => setRenameGroup(null)}
      />
    </div>
  );
}

function OrbitBlockSection({ collapsed }: { collapsed: boolean }) {
  const hiddenOrbitItems = useSidebarPreferences((s) => s.hiddenOrbitItems);
  const isCollapsed = useSectionCollapsed("blocks");
  const visible = orbitBlocks.filter(([key]) => isOrbitItemVisibleIn(hiddenOrbitItems, key));
  return (
    <div className="sidebar-section">
      <SectionHeader label="Blöcke" sectionKey="blocks" collapsed={collapsed} />
      {!isCollapsed ? visible.map(([key, payload, Icon]) => (
        <OrbitPaletteButton key={key} payload={payload} Icon={Icon} collapsed={collapsed} />
      )) : null}
    </div>
  );
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
  const notifications = useQuery(workbenchQueries.notifications());
  const orbitMode = location.pathname === "/workbench";
  // Das Set abonnieren, nicht die (stabile) Methode: sonst rechnen die Memos unten
  // beim Umschalten der Seiten-Sichtbarkeit nie neu.
  const hiddenPages = useSidebarPreferences((s) => s.hiddenPages);
  // Alle Sektions-Hooks bedingungslos und ganz oben: früher standen sie hinter `!collapsed &&`
  // im JSX, wodurch beim Ein-/Ausklappen die Hook-Anzahl sprang und React die Seite abbrach.
  const workspaceSectionCollapsed = useSectionCollapsed("workspace");
  const orbitProjectsSectionCollapsed = useSectionCollapsed("orbit-projects");
  const footerSectionCollapsed = useSectionCollapsed("footer");
  const visiblePrimaryNavItems = useMemo(() => primaryNavItems.filter((item) => { const routeId = pathToRouteId(item.to); return routeId ? isPageVisibleIn(hiddenPages, routeId) : true; }), [hiddenPages]);
  const visibleToolRouteItems = useMemo(() => toolRouteItems.filter((item) => { const routeId = pathToRouteId(item.to); return routeId ? isPageVisibleIn(hiddenPages, routeId) : true; }), [hiddenPages]);
  const visibleFooterNavItems = useMemo(() => footerNavItems.filter((item) => { const routeId = pathToRouteId(item.to); return routeId ? isPageVisibleIn(hiddenPages, routeId) : true; }), [hiddenPages]);
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
      window.removeEventListener("pointercancel", handleEnd);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd, { once: true });
    // pointercancel (Touch-Unterbrechung, Alt-Tab) muss genauso aufräumen,
    // sonst bleiben cursor/userSelect dauerhaft gesetzt (F04-07).
    window.addEventListener("pointercancel", handleEnd, { once: true });
  };

  return (
    <div
      className={`sidebar-shell hidden md:flex ${collapsed ? "is-collapsed" : ""}`}
      style={{ "--sidebar-width": `${collapsed ? 56 : width}px` } as CSSProperties}
    >
      <aside className="workspace-sidebar flex-col">
        <div className="sidebar-brand">
          <div className="sidebar-mark"><RemoteWorkbenchIcon className="h-[18px] w-[18px]" /></div>
          {!collapsed ? <div className="sidebar-label">Remote Workplace</div> : null}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={onToggle}
            aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
            title={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
          >
            {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
          </button>
        </div>
        <nav className="sidebar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pt-3">
          <div className="sidebar-section">
            <SectionHeader label="Workspace" sectionKey="workspace" collapsed={collapsed} />
            {!workspaceSectionCollapsed ? visiblePrimaryNavItems.map((item) => (
              <SidebarNavLink key={item.to} item={item} collapsed={collapsed} badge={item.to === "/inbox" ? notifications.data?.unreadCount ?? 0 : 0} />
            )) : null}
          </div>
          <div className="sidebar-section">
            <SectionHeader label={orbitMode ? "Orbit-Projekte" : "Werkzeuge"} sectionKey="orbit-projects" collapsed={collapsed} />
            {!orbitProjectsSectionCollapsed ? (orbitMode ? (<>{recentProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="sidebar-item orbit-palette-item"
              draggable
              onDragStart={(event) => beginOrbitDrag(event, { type: "project", title: project.name, projectId: project.id })}
              onClick={() => requestOrbitNode({ type: "project", title: project.name, projectId: project.id })}
              aria-label={`${project.name} ziehen`}
              title={collapsed ? project.name : "Klicken oder auf den Orbit ziehen"}
            >
              <FolderCodeIcon className="h-4 w-4 shrink-0" />
              {!collapsed ? <><span className="truncate">{project.name}</span><small>ziehen</small></> : null}
            </button>
          ))}
            <button type="button" className="sidebar-item orbit-palette-item" onClick={requestOrbitProjectBrowser} aria-label="Alle Projekte auswählen" title="Serverordner durchsuchen">
              <FolderSearchIcon className="h-4 w-4 shrink-0" />
              {!collapsed ? <><span className="truncate">Alle Projekte</span><small>{availableProjects.length}</small></> : null}
            </button>
          </>) : visibleToolRouteItems.map((item) => (
            <SidebarNavLink key={item.to} item={item} collapsed={collapsed} />
          ))) : null}
          </div>
          {orbitMode ? (
            <>
              <OrbitToolSection collapsed={collapsed} />
              <OrbitPreviewSection collapsed={collapsed} />
              <OrbitBlockSection collapsed={collapsed} />
            </>
          ) : null}
          <div className="sidebar-footer sidebar-section">
            <SectionHeader label="Account und System" sectionKey="footer" collapsed={collapsed} />
            {!footerSectionCollapsed ? visibleFooterNavItems.map((item) => (
              <SidebarNavLink key={item.to} item={item} collapsed={collapsed} />
            )) : null}
          </div>
        </nav>
      </aside>
      {!collapsed ? (
        <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" onPointerDown={startResize} />
      ) : null}
    </div>
  );
}
