import { NavLink, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import type { OrbitNode } from "@wrapt/contracts";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, FolderCodeIcon, FolderSearchIcon, WraptIcon } from "./icons";
import { prefetchRouteTarget } from "../lib/routePrefetch";
import { wraptQueries } from "../lib/queryOptions";
import { useNavigationRegistry } from "../extensions/useNavigationRegistry";
import type { OwnedNavigationItem } from "../extensions/navigationRegistry";
import { commandRegistry } from "../extensions/commandRegistry";
import { orbitPaletteRegistry } from "../extensions/orbitPaletteRegistry";
import { isOrbitItemVisibleIn, isPageVisibleIn, useSidebarPreferences, type SidebarSectionKey, type PageRouteId } from "../stores/sidebarPreferences";
import { useOrbitStore } from "../stores/orbit";
import { PromptDialog } from "./ModalDialog";
import { previewSessionKeysWithNode, previewSlotsReleasedWithNode, releasePreviewSessions, releasePreviewSlots } from "../lib/previewSlotLifecycle";
import { openPreviewGroupWindow } from "../lib/previewWindow";
import { requestOrbitNode, type OrbitPalettePayload } from "../lib/orbitPalette";

function isNavigationItemVisible(item: OwnedNavigationItem, hiddenPages: ReadonlySet<string>): boolean {
  const visibilityKey = item.value.runtime.legacyVisibilityKey;
  return visibilityKey === undefined
    ? item.value.contribution.visibleByDefault
    : isPageVisibleIn(hiddenPages, visibilityKey as PageRouteId);
}

export type { OrbitPalettePayload } from "../lib/orbitPalette";

function beginOrbitDrag(event: ReactDragEvent, payload: OrbitPalettePayload) {
  const value = JSON.stringify(payload);
  event.dataTransfer.setData("application/x-orbit-node", value);
  event.dataTransfer.setData("text/plain", value);
  event.dataTransfer.effectAllowed = "copy";
}

function requestOrbitProjectBrowser() {
  void commandRegistry.execute("wrapt.orbit.command.project-browser");
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
function SidebarNavLink({ item, collapsed, badge = 0 }: { item: OwnedNavigationItem; collapsed: boolean; badge?: number }) {
  const client = useQueryClient();
  const { label, icon: Icon } = { label: item.value.contribution.label, icon: item.value.runtime.icon };
  const to = item.value.route.path;
  const prefetch = () => prefetchRouteTarget(client, to);
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className="sidebar-item"
      onPointerEnter={prefetch}
      // Touch kennt kein Überfahren: `pointerdown` feuert vor dem Klick und
      // verschafft Bündel und Daten den entscheidenden Vorsprung.
      onPointerDown={prefetch}
      onFocus={prefetch}
      aria-label={label}
      title={label}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      {!collapsed ? label : null}
      {badge > 0 ? <span className="sidebar-notification-badge" aria-label={`${badge} ungelesen`}>{badge > 99 ? "99+" : badge}</span> : null}
    </NavLink>
  );
}
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
  const palette = useSyncExternalStore(orbitPaletteRegistry.subscribe, orbitPaletteRegistry.getSnapshot);
  const visible = palette.byGroup.tools.filter((item) => isOrbitItemVisibleIn(hiddenOrbitItems, item.value.runtime.legacyKey));
  return (
    <div className="sidebar-section">
      <SectionHeader label="Werkzeuge" sectionKey="tools" collapsed={collapsed} />
      {!isCollapsed ? visible.map((item) => (
        <OrbitPaletteButton key={item.contributionId} payload={item.value.runtime.createPayload()} Icon={item.value.runtime.icon} collapsed={collapsed} />
      )) : null}
    </div>
  );
}

function OrbitPreviewSection({ collapsed }: { collapsed: boolean }) {  const isCollapsed = useSectionCollapsed("previews");
  const hiddenOrbitItems = useSidebarPreferences((state) => state.hiddenOrbitItems);
  const palette = useSyncExternalStore(orbitPaletteRegistry.subscribe, orbitPaletteRegistry.getSnapshot);
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
        {palette.byGroup.previews.filter((item) => isOrbitItemVisibleIn(hiddenOrbitItems, item.value.runtime.legacyKey)).map((item) => (
          <OrbitPaletteButton key={item.contributionId} payload={item.value.runtime.createPayload()} Icon={item.value.runtime.icon} collapsed={collapsed} />
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
  const palette = useSyncExternalStore(orbitPaletteRegistry.subscribe, orbitPaletteRegistry.getSnapshot);
  const visible = palette.byGroup.blocks.filter((item) => isOrbitItemVisibleIn(hiddenOrbitItems, item.value.runtime.legacyKey));
  return (
    <div className="sidebar-section">
      <SectionHeader label="Blöcke" sectionKey="blocks" collapsed={collapsed} />
      {!isCollapsed ? visible.map((item) => (
        <OrbitPaletteButton key={item.contributionId} payload={item.value.runtime.createPayload()} Icon={item.value.runtime.icon} collapsed={collapsed} />
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
  const projects = useQuery(wraptQueries.projects());
  const notifications = useQuery(wraptQueries.notifications());
  const orbitMode = location.pathname === "/workbench";
  // Das Set abonnieren, nicht die (stabile) Methode: sonst rechnen die Memos unten
  // beim Umschalten der Seiten-Sichtbarkeit nie neu.
  const hiddenPages = useSidebarPreferences((s) => s.hiddenPages);
  const navigation = useNavigationRegistry();
  // Alle Sektions-Hooks bedingungslos und ganz oben: früher standen sie hinter `!collapsed &&`
  // im JSX, wodurch beim Ein-/Ausklappen die Hook-Anzahl sprang und React die Seite abbrach.
  const workspaceSectionCollapsed = useSectionCollapsed("workspace");
  const orbitProjectsSectionCollapsed = useSectionCollapsed("orbit-projects");
  const footerSectionCollapsed = useSectionCollapsed("footer");
  const visiblePrimaryNavItems = useMemo(() => navigation.byGroup.workspace.filter((item) => isNavigationItemVisible(item, hiddenPages)), [navigation, hiddenPages]);
  const visibleToolRouteItems = useMemo(() => navigation.byGroup.tools.filter((item) => isNavigationItemVisible(item, hiddenPages)), [navigation, hiddenPages]);
  const visibleFooterNavItems = useMemo(() => navigation.byGroup.account.filter((item) => isNavigationItemVisible(item, hiddenPages)), [navigation, hiddenPages]);
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
          <div className="sidebar-mark"><WraptIcon className="h-[18px] w-[18px]" /></div>
          {!collapsed ? <div className="sidebar-label">Wrapt</div> : null}
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
              <SidebarNavLink key={item.contributionId} item={item} collapsed={collapsed} badge={item.value.route.path === "/inbox" ? notifications.data?.unreadCount ?? 0 : 0} />
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
            <SidebarNavLink key={item.contributionId} item={item} collapsed={collapsed} />
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
              <SidebarNavLink key={item.contributionId} item={item} collapsed={collapsed} />
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
