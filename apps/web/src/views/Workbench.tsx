import { useRef } from "react";
import { Group, Panel as RPanel, Separator, type Layout } from "react-resizable-panels";
import { useQuery } from "@tanstack/react-query";
import {
  AppWindow,
  Bot,
  Braces,
  Columns2,
  Code2,
  Eye,
  Grid2X2,
  Globe2,
  LayoutPanelLeft,
  MonitorSmartphone,
  MoreHorizontal,
  PanelTop,
  Pencil,
  Plus,
  Rows2,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  WORKBENCH_LIMITS,
  type Panel,
  type PanelType,
  type Project,
  type ServiceMode,
  type WorkbenchGroup,
  type WorkbenchPage,
} from "@workbench/contracts";
import { useWorkspaceStore } from "../stores/workspace";
import { workbenchQueries } from "../lib/queryOptions";
import { useIsMobile } from "../lib/useMediaQuery";
import { ToolPanel } from "../components/ToolPanel";

const panelLabels: Record<PanelType, string> = {
  "t3-code": "T3 Code",
  "code-server": "Editor",
  preview: "Preview",
  browser: "Browser",
  terminal: "Terminal",
  codex: "Codex",
  opencode: "OpenCode",
};

const panelIcons = {
  "t3-code": Code2,
  "code-server": MonitorSmartphone,
  preview: Eye,
  browser: Globe2,
  terminal: SquareTerminal,
  codex: Bot,
  opencode: Braces,
} satisfies Record<PanelType, typeof Code2>;

function groupProject(panel: Panel, projects: Project[]): Project | undefined {
  return projects.find((project) => project.id === panel.projectId);
}

function GroupTabs({ group, panels, projects }: { group: WorkbenchGroup; panels: Panel[]; projects: Project[] }) {
  const focusPanel = useWorkspaceStore((state) => state.focusPanel);
  const closePanel = useWorkspaceStore((state) => state.closePanel);

  return (
    <div className="workbench-group-tabs" role="tablist" aria-label="Tabs dieser Gruppe">
      {group.panelIds.map((panelId) => {
        const panel = panels.find((candidate) => candidate.id === panelId);
        if (!panel) return null;
        const project = groupProject(panel, projects);
        const Icon = panelIcons[panel.type];
        const active = group.activePanelId === panel.id;
        return (
          <div key={panel.id} className={`workbench-group-tab ${active ? "is-active" : ""}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="workbench-group-tab-target"
              onClick={() => focusPanel(panel.id)}
              title={`${panelLabels[panel.type]}${project ? ` · ${project.name}` : ""}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{panelLabels[panel.type]}</span>
              {project ? <span className="workbench-tab-project truncate">{project.name}</span> : null}
            </button>
            <button
              type="button"
              className="workbench-tab-close"
              onClick={() => closePanel(panel.id)}
              aria-label={`${panelLabels[panel.type]} schließen`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {group.panelIds.length === 0 ? <span className="workbench-empty-tab">Leere Gruppe</span> : null}
    </div>
  );
}

function ToolGroup({
  group,
  panels,
  projects,
  codeServerMode,
  focused,
  canRemove,
}: {
  group: WorkbenchGroup;
  panels: Panel[];
  projects: Project[];
  codeServerMode: ServiceMode;
  focused: boolean;
  canRemove: boolean;
}) {
  const focusGroup = useWorkspaceStore((state) => state.focusGroup);
  const focusPanel = useWorkspaceStore((state) => state.focusPanel);
  const removeGroup = useWorkspaceStore((state) => state.removeGroup);
  const openPanel = useWorkspaceStore((state) => state.openPanel);

  return (
    <section
      className={`workbench-group ${focused ? "is-focused" : ""}`}
      onPointerDown={() => focusGroup(group.id)}
      data-group-id={group.id}
    >
      <header className="workbench-group-header">
        <GroupTabs group={group} panels={panels} projects={projects} />
        {canRemove ? (
          <button
            type="button"
            className="workbench-group-action"
            onClick={() => removeGroup(group.id)}
            title="Gruppe auflösen und Tabs übernehmen"
            aria-label="Gruppe schließen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </header>
      <div className="workbench-group-content">
        {group.panelIds.length === 0 ? (
          <div className="workbench-group-empty">
            <AppWindow className="h-6 w-6" aria-hidden />
            <strong>Werkzeug hinzufügen</strong>
            <span>Wähle oben Codex, OpenCode, Editor, Preview oder Terminal.</span>
            <button
              type="button"
              className="quiet-button"
              onClick={() => openPanel({ type: "terminal", groupId: group.id })}
            >
              <SquareTerminal className="h-3.5 w-3.5" /> Terminal öffnen
            </button>
          </div>
        ) : null}
        {group.panelIds.map((panelId) => {
          const panel = panels.find((candidate) => candidate.id === panelId);
          if (!panel) return null;
          const active = group.activePanelId === panel.id;
          return (
            <div
              key={panel.id}
              className={`workbench-tool-pane ${active ? "is-active" : "is-parked"}`}
              aria-hidden={!active}
              inert={!active}
            >
              <ToolPanel
                panel={panel}
                project={groupProject(panel, projects)}
                codeServerMode={codeServerMode}
                isFocused={focused && active}
                onFocus={() => focusPanel(panel.id)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ResizeHandle({ direction }: { direction: "horizontal" | "vertical" }) {
  return (
    <Separator className={`workbench-resize-handle is-${direction}`}>
      <span />
    </Separator>
  );
}

function BoardLayout({
  workspace,
  panels,
  projects,
  codeServerMode,
}: {
  workspace: WorkbenchPage;
  panels: Panel[];
  projects: Project[];
  codeServerMode: ServiceMode;
}) {
  const setLayoutSizes = useWorkspaceStore((state) => state.setLayoutSizes);
  const throttleRef = useRef<Record<string, number>>({});
  const groupView = (group: WorkbenchGroup) => (
    <ToolGroup
      key={group.id}
      group={group}
      panels={panels}
      projects={projects}
      codeServerMode={codeServerMode}
      focused={workspace.focusedGroupId === group.id}
      canRemove={workspace.groups.length > 1}
    />
  );
  const commit = (key: string, panelIds: [string, string], layout: Layout) => {
    const raw = panelIds.map((panelId) => layout[panelId] ?? 0) as [number, number];
    const total = raw[0] + raw[1];
    if (total <= 0) return;
    const now = performance.now();
    if (now - (throttleRef.current[key] ?? 0) < 100) return;
    throttleRef.current[key] = now;
    const first = Math.round((raw[0] / total) * 100);
    setLayoutSizes(workspace.id, key, [first, 100 - first]);
  };
  const sizes = (key: string, fallback: [number, number]): [number, number] => workspace.layoutSizes[key] ?? fallback;
  const groups = workspace.groups;

  if (groups.length === 1) return groupView(groups[0]!);

  if (groups.length === 2) {
    const direction = workspace.layout === "rows" ? "vertical" : "horizontal";
    const rootSizes = sizes("root", [50, 50]);
    return (
      <Group orientation={direction} defaultLayout={{ [groups[0]!.id]: rootSizes[0], [groups[1]!.id]: rootSizes[1] }} onLayoutChanged={(next) => commit("root", [groups[0]!.id, groups[1]!.id], next)}>
        <RPanel id={groups[0]!.id} minSize="20%">{groupView(groups[0]!)}</RPanel>
        <ResizeHandle direction={direction} />
        <RPanel id={groups[1]!.id} minSize="20%">{groupView(groups[1]!)}</RPanel>
      </Group>
    );
  }

  if (groups.length === 3) {
    const outer = sizes("root", [62, 38]);
    const right = sizes("right", [50, 50]);
    return (
      <Group orientation="horizontal" defaultLayout={{ [groups[0]!.id]: outer[0], "right-stack": outer[1] }} onLayoutChanged={(next) => commit("root", [groups[0]!.id, "right-stack"], next)}>
        <RPanel id={groups[0]!.id} minSize="25%">{groupView(groups[0]!)}</RPanel>
        <ResizeHandle direction="horizontal" />
        <RPanel id="right-stack" minSize="25%">
          <Group orientation="vertical" defaultLayout={{ [groups[1]!.id]: right[0], [groups[2]!.id]: right[1] }} onLayoutChanged={(next) => commit("right", [groups[1]!.id, groups[2]!.id], next)}>
            <RPanel id={groups[1]!.id} minSize="20%">{groupView(groups[1]!)}</RPanel>
            <ResizeHandle direction="vertical" />
            <RPanel id={groups[2]!.id} minSize="20%">{groupView(groups[2]!)}</RPanel>
          </Group>
        </RPanel>
      </Group>
    );
  }

  const outer = sizes("root", [50, 50]);
  const left = sizes("left", [50, 50]);
  const right = sizes("right", [50, 50]);
  return (
    <Group orientation="horizontal" defaultLayout={{ "left-stack": outer[0], "right-stack": outer[1] }} onLayoutChanged={(next) => commit("root", ["left-stack", "right-stack"], next)}>
      <RPanel id="left-stack" minSize="25%">
        <Group orientation="vertical" defaultLayout={{ [groups[0]!.id]: left[0], [groups[1]!.id]: left[1] }} onLayoutChanged={(next) => commit("left", [groups[0]!.id, groups[1]!.id], next)}>
          <RPanel id={groups[0]!.id} minSize="20%">{groupView(groups[0]!)}</RPanel>
          <ResizeHandle direction="vertical" />
          <RPanel id={groups[1]!.id} minSize="20%">{groupView(groups[1]!)}</RPanel>
        </Group>
      </RPanel>
      <ResizeHandle direction="horizontal" />
      <RPanel id="right-stack" minSize="25%">
        <Group orientation="vertical" defaultLayout={{ [groups[2]!.id]: right[0], [groups[3]!.id]: right[1] }} onLayoutChanged={(next) => commit("right", [groups[2]!.id, groups[3]!.id], next)}>
          <RPanel id={groups[2]!.id} minSize="20%">{groupView(groups[2]!)}</RPanel>
          <ResizeHandle direction="vertical" />
          <RPanel id={groups[3]!.id} minSize="20%">{groupView(groups[3]!)}</RPanel>
        </Group>
      </RPanel>
    </Group>
  );
}

function WorkspaceTabs({ workspaces, activeId }: { workspaces: WorkbenchPage[]; activeId: string }) {
  const activateWorkspace = useWorkspaceStore((state) => state.activateWorkspace);
  const addWorkspace = useWorkspaceStore((state) => state.addWorkspace);
  const removeWorkspace = useWorkspaceStore((state) => state.removeWorkspace);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);

  const rename = (workspace: WorkbenchPage) => {
    const name = window.prompt("Name der Arbeitsfläche", workspace.name);
    if (name) renameWorkspace(workspace.id, name);
  };

  return (
    <div className="workbench-workspace-tabs" role="tablist" aria-label="Arbeitsflächen">
      <details className="workbench-mobile-workspace-picker">
        <summary>
          <span>{workspaces.find((workspace) => workspace.id === activeId)?.name ?? "Arbeitsfläche"}</span>
          <MoreHorizontal className="h-4 w-4" />
        </summary>
        <div className="workbench-mobile-menu">
          {workspaces.map((workspace) => (
            <button key={workspace.id} type="button" className={workspace.id === activeId ? "is-active" : ""} onClick={() => activateWorkspace(workspace.id)}>
              <span>{workspace.name}</span><small>{workspace.groups.length} Gruppen</small>
            </button>
          ))}
        </div>
      </details>
      {workspaces.map((workspace) => (
        <div key={workspace.id} className={`workbench-workspace-tab ${workspace.id === activeId ? "is-active" : ""}`}>
          <button type="button" role="tab" aria-selected={workspace.id === activeId} onClick={() => activateWorkspace(workspace.id)}>
            <span className="truncate">{workspace.name}</span>
            <span className="workbench-workspace-count">{workspace.groups.length}</span>
          </button>
          {workspace.id === activeId ? (
            <button type="button" className="workbench-workspace-icon" onClick={() => rename(workspace)} aria-label="Arbeitsfläche umbenennen" title="Umbenennen">
              <Pencil className="h-3 w-3" />
            </button>
          ) : null}
          {workspaces.length > 1 ? (
            <button type="button" className="workbench-workspace-icon" onClick={() => removeWorkspace(workspace.id)} aria-label="Arbeitsfläche schließen" title="Arbeitsfläche schließen">
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="workbench-add-workspace"
        onClick={() => addWorkspace()}
        disabled={workspaces.length >= WORKBENCH_LIMITS.maxWorkspaces}
        aria-label="Arbeitsfläche hinzufügen"
        title="Neue Arbeitsfläche"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function WorkbenchToolbar({ project, workspace }: { project: Project | undefined; workspace: WorkbenchPage }) {
  const panels = useWorkspaceStore((state) => state.panels);
  const openPanel = useWorkspaceStore((state) => state.openPanel);
  const addGroup = useWorkspaceStore((state) => state.addGroup);
  const setLayout = useWorkspaceStore((state) => state.setLayout);
  const focusGroup = useWorkspaceStore((state) => state.focusGroup);
  const focusPanel = useWorkspaceStore((state) => state.focusPanel);
  const addWorkspace = useWorkspaceStore((state) => state.addWorkspace);
  const removeWorkspace = useWorkspaceStore((state) => state.removeWorkspace);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);
  const groupId = workspace.focusedGroupId;
  const focusedGroup = workspace.groups.find((group) => group.id === groupId);
  const atToolLimit = panels.length >= WORKBENCH_LIMITS.maxResidentTools;

  const add = (type: PanelType, previewId: string | null = null) => {
    openPanel({ type, projectId: project?.id ?? null, previewId, groupId });
  };

  const rename = () => {
    const name = window.prompt("Name der Arbeitsfläche", workspace.name);
    if (name) renameWorkspace(workspace.id, name);
  };

  return (
    <div className="workbench-toolbar" data-has-tools={Boolean(focusedGroup?.panelIds.length)}>
      <button type="button" className="workbench-tool-button workbench-add-tool" disabled={!project?.links.t3Code || atToolLimit} onClick={() => add("t3-code")}>
        <Code2 className="h-3.5 w-3.5" /><span>T3 Code</span>
      </button>
      <button type="button" className="workbench-tool-button workbench-add-tool" disabled={!project?.links.codeServer || atToolLimit} onClick={() => add("code-server")}>
        <MonitorSmartphone className="h-3.5 w-3.5" /><span>Editor</span>
      </button>
      <button type="button" className="workbench-tool-button workbench-add-tool" disabled={atToolLimit} onClick={() => add("terminal")}>
        <SquareTerminal className="h-3.5 w-3.5" /><span>Terminal</span>
      </button>
      <button type="button" className="workbench-tool-button workbench-add-tool" disabled={atToolLimit} onClick={() => add("codex")}>
        <Bot className="h-3.5 w-3.5" /><span>Codex</span>
      </button>
      <button type="button" className="workbench-tool-button workbench-add-tool" disabled={atToolLimit} onClick={() => add("opencode")}>
        <Braces className="h-3.5 w-3.5" /><span>OpenCode</span>
      </button>
      <button type="button" className="workbench-tool-button workbench-add-tool" disabled={atToolLimit} onClick={() => add("browser")}>
        <Globe2 className="h-3.5 w-3.5" /><span>Browser</span>
      </button>
      {project?.previews.map((preview) => (
        <button key={preview.id} type="button" className="workbench-tool-button workbench-add-tool" disabled={atToolLimit} onClick={() => add("preview", preview.id)}>
          <Eye className="h-3.5 w-3.5" /><span>{preview.name}</span>
        </button>
      ))}
      <span className="workbench-runtime-count">{panels.length}/{WORKBENCH_LIMITS.maxResidentTools} geladen</span>
      <div className="workbench-mobile-tool-tabs" role="tablist" aria-label="Werkzeug wählen">
        {workspace.groups.find((group) => group.id === workspace.focusedGroupId)?.panelIds.map((panelId) => {
          const panel = panels.find((candidate) => candidate.id === panelId);
          if (!panel) return null;
          const Icon = panelIcons[panel.type];
          const active = workspace.groups.find((group) => group.id === workspace.focusedGroupId)?.activePanelId === panel.id;
          return (
            <button key={panel.id} type="button" role="tab" aria-selected={active} className={active ? "is-active" : ""} onClick={() => focusPanel(panel.id)} title={panelLabels[panel.type]}>
              <Icon className="h-4 w-4" /><span className="sr-only">{panelLabels[panel.type]}</span>
            </button>
          );
        })}
      </div>
      <div className="workbench-toolbar-spacer" />
      <div className="workbench-desktop-layout-controls">
        <button type="button" className="workbench-tool-button" disabled={workspace.groups.length >= WORKBENCH_LIMITS.maxVisibleGroups} onClick={() => addGroup()}>
          <Plus className="h-3.5 w-3.5" /><span>Gruppe</span>
        </button>
        {workspace.groups.length === 2 ? (
          <div className="workbench-layout-switch" aria-label="Layout wählen">
            <button type="button" className={workspace.layout === "columns" ? "is-active" : ""} onClick={() => setLayout("columns")} title="Spalten"><Columns2 className="h-4 w-4" /></button>
            <button type="button" className={workspace.layout === "rows" ? "is-active" : ""} onClick={() => setLayout("rows")} title="Zeilen"><Rows2 className="h-4 w-4" /></button>
          </div>
        ) : workspace.groups.length === 3 ? (
          <span className="workbench-layout-label"><LayoutPanelLeft className="h-4 w-4" /> Fokuslayout</span>
        ) : workspace.groups.length === 4 ? (
          <span className="workbench-layout-label"><Grid2X2 className="h-4 w-4" /> Bento 2×2</span>
        ) : (
          <span className="workbench-layout-label"><PanelTop className="h-4 w-4" /> Einzelgruppe</span>
        )}
      </div>
      {workspace.groups.length > 1 ? <div className="workbench-mobile-group-switch" aria-label="Gruppe wählen">
        {workspace.groups.map((group, index) => (
          <button
            key={group.id}
            type="button"
            className={group.id === workspace.focusedGroupId ? "is-active" : ""}
            onClick={() => focusGroup(group.id)}
          >
            {index + 1}
          </button>
        ))}
      </div> : null}
      <details className="workbench-mobile-more">
        <summary aria-label="Weitere Workbench-Aktionen"><MoreHorizontal className="h-5 w-5" /></summary>
        <div className="workbench-mobile-menu is-actions">
          <button type="button" onClick={() => add("t3-code")} disabled={!project?.links.t3Code || atToolLimit}><Code2 className="h-4 w-4" /> T3 Code öffnen</button>
          <button type="button" onClick={() => add("code-server")} disabled={!project?.links.codeServer || atToolLimit}><MonitorSmartphone className="h-4 w-4" /> Editor öffnen</button>
          <button type="button" onClick={() => add("terminal")} disabled={atToolLimit}><SquareTerminal className="h-4 w-4" /> Terminal öffnen</button>
          <button type="button" onClick={() => add("codex")} disabled={atToolLimit}><Bot className="h-4 w-4" /> Codex öffnen</button>
          <button type="button" onClick={() => add("opencode")} disabled={atToolLimit}><Braces className="h-4 w-4" /> OpenCode öffnen</button>
          {project?.previews.map((preview) => <button key={preview.id} type="button" onClick={() => add("preview", preview.id)} disabled={atToolLimit}><Eye className="h-4 w-4" /> {preview.name}</button>)}
          <button type="button" onClick={() => addGroup()} disabled={workspace.groups.length >= WORKBENCH_LIMITS.maxVisibleGroups}><Plus className="h-4 w-4" /> Neue Gruppe</button>
          <button type="button" onClick={() => addWorkspace()}><AppWindow className="h-4 w-4" /> Neue Arbeitsfläche</button>
          <button type="button" onClick={rename}><Pencil className="h-4 w-4" /> Umbenennen</button>
          <button type="button" onClick={() => removeWorkspace(workspace.id)}><X className="h-4 w-4" /> Arbeitsfläche schließen</button>
        </div>
      </details>
    </div>
  );
}

export function Workbench() {
  const isMobile = useIsMobile();
  const panels = useWorkspaceStore((state) => state.panels);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const projects = useQuery(workbenchQueries.projects());
  const services = useQuery(workbenchQueries.services());
  const selectedProject = projects.data?.projects.find((project) => project.id === selectedProjectId);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0]!;
  const codeServerMode: ServiceMode = services.data?.services.find((service) => service.id === "code-server")?.mode ?? "external";

  return (
    <div className="workbench-page">
      <WorkbenchToolbar project={selectedProject} workspace={activeWorkspace} />
      <WorkspaceTabs workspaces={workspaces} activeId={activeWorkspace.id} />
      <div className="workbench-canvas">
        {workspaces.map((workspace) => {
          const active = workspace.id === activeWorkspace.id;
          return (
            <div key={workspace.id} className={`workbench-board-layer ${active ? "is-active" : "is-parked"}`} aria-hidden={!active} inert={!active}>
              {isMobile ? (
                <div className="h-full">
                  {workspace.groups.map((group) => (
                    <div
                      key={group.id}
                      className={`workbench-mobile-group ${group.id === workspace.focusedGroupId ? "is-active" : "is-parked"}`}
                      inert={group.id !== workspace.focusedGroupId}
                    >
                      <ToolGroup
                        group={group}
                        panels={panels}
                        projects={projects.data?.projects ?? []}
                        codeServerMode={codeServerMode}
                        focused={group.id === workspace.focusedGroupId}
                        canRemove={workspace.groups.length > 1}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <BoardLayout
                  workspace={workspace}
                  panels={panels}
                  projects={projects.data?.projects ?? []}
                  codeServerMode={codeServerMode}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
