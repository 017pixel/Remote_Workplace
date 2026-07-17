import {
  WORKBENCH_LIMITS,
  panelSchema,
  workspaceSchema,
  type Panel,
  type PanelType,
  type WorkbenchGroup,
  type WorkbenchLayout,
  type WorkbenchPage,
  type Workspace,
} from "@workbench/contracts";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { generateId } from "../lib/id";

export const WORKSPACE_STORAGE_KEY = "benjamin-dev-workbench.workspace.v2";
export const LEGACY_WORKSPACE_STORAGE_KEY = "benjamin-dev-workbench.workspace.v1";

const DEFAULT_WORKSPACE_ID = "workspace-default";
const DEFAULT_GROUP_ID = "group-default";

function freshWorkspace(): Workspace {
  return {
    version: 3,
    selectedProjectId: null,
    panels: [],
    workspaces: [
      {
        id: DEFAULT_WORKSPACE_ID,
        name: "Arbeitsfläche 1",
        groups: [{ id: DEFAULT_GROUP_ID, panelIds: [], activePanelId: null }],
        focusedGroupId: DEFAULT_GROUP_ID,
        layout: "single",
        layoutSizes: {},
      },
    ],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    maximizedPanelId: null,
    focusedPanelId: null,
  };
}

export const emptyWorkspace: Workspace = freshWorkspace();

export interface OpenPanelInput {
  type: PanelType;
  projectId?: string | null;
  previewId?: string | null;
  groupId?: string;
  workspaceId?: string;
}

interface WorkspaceActions {
  selectProject(projectId: string | null): void;
  openPanel(input: OpenPanelInput): string | null;
  closePanel(panelId: string): void;
  reloadPanel(panelId: string): void;
  setLayout(layout: WorkbenchLayout): void;
  setLayoutSizes(workspaceId: string, key: string, sizes: [number, number]): void;
  maximizePanel(panelId: string): void;
  restorePanels(): void;
  focusPanel(panelId: string): void;
  focusGroup(groupId: string): void;
  addGroup(): string | null;
  removeGroup(groupId: string): void;
  addWorkspace(name?: string): string | null;
  removeWorkspace(workspaceId: string): void;
  renameWorkspace(workspaceId: string, name: string): void;
  activateWorkspace(workspaceId: string): void;
  resetWorkspace(): void;
}

export type WorkspaceStore = Workspace & WorkspaceActions;

function makePanel(input: OpenPanelInput): Panel {
  return {
    id: generateId(),
    type: input.type,
    projectId: input.projectId ?? null,
    previewId: input.previewId ?? null,
    reloadKey: 0,
  };
}

function isSamePanel(panel: Panel, input: OpenPanelInput): boolean {
  return (
    !["terminal", "codex", "opencode"].includes(input.type) &&
    panel.type === input.type &&
    panel.projectId === (input.projectId ?? null) &&
    panel.previewId === (input.previewId ?? null)
  );
}

function normalizedLayout(groupCount: number, preferred: WorkbenchLayout): WorkbenchLayout {
  if (groupCount <= 1) return "single";
  if (groupCount === 2) return preferred === "rows" ? "rows" : "columns";
  if (groupCount === 3) return "main-left";
  return "grid";
}

function placementOf(workspaces: WorkbenchPage[], panelId: string) {
  for (const workspace of workspaces) {
    const group = workspace.groups.find((candidate) => candidate.panelIds.includes(panelId));
    if (group) return { workspace, group };
  }
  return null;
}

const legacyWorkspaceSchema = z.object({
  version: z.literal(1),
  selectedProjectId: z.string().nullable(),
  panels: z.array(panelSchema).max(2),
  layout: z.enum(["horizontal", "vertical"]),
  panelSizes: z.tuple([z.number().min(10).max(90), z.number().min(10).max(90)]),
  maximizedPanelId: z.string().nullable(),
  focusedPanelId: z.string().nullable(),
});

export function migrateLegacyWorkspace(value: unknown): Workspace | null {
  const parsed = legacyWorkspaceSchema.safeParse(value);
  if (!parsed.success) return null;
  const legacy = parsed.data;
  const groups: WorkbenchGroup[] = legacy.panels.length <= 1
    ? [{
        id: DEFAULT_GROUP_ID,
        panelIds: legacy.panels.map((panel) => panel.id),
        activePanelId: legacy.panels[0]?.id ?? null,
      }]
    : legacy.panels.map((panel, index) => ({
        id: `group-migrated-${index + 1}`,
        panelIds: [panel.id],
        activePanelId: panel.id,
      }));
  const focusedPlacement = groups.find((group) => group.panelIds.includes(legacy.focusedPanelId ?? ""));
  const migrated: Workspace = {
    version: 3,
    selectedProjectId: legacy.selectedProjectId,
    panels: legacy.panels,
    workspaces: [{
      id: DEFAULT_WORKSPACE_ID,
      name: "Arbeitsfläche 1",
      groups,
      focusedGroupId: focusedPlacement?.id ?? groups[0]!.id,
      layout: legacy.panels.length === 2
        ? (legacy.layout === "vertical" ? "rows" : "columns")
        : "single",
      layoutSizes: legacy.panels.length === 2 ? { root: legacy.panelSizes } : {},
    }],
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    maximizedPanelId: legacy.maximizedPanelId,
    focusedPanelId: legacy.focusedPanelId,
  };
  return workspaceSchema.safeParse(migrated).success ? migrated : null;
}

export function parseStoredWorkspace(value: unknown): Workspace {
  const parsed = workspaceSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const versionTwo = z.object({
    version: z.literal(2),
    selectedProjectId: z.string().nullable(),
    panels: z.array(panelSchema).max(WORKBENCH_LIMITS.maxResidentTools),
    workspaces: z.array(z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(48),
      groups: z.array(z.object({
        id: z.string().min(1),
        panelIds: z.array(z.string().min(1)).max(WORKBENCH_LIMITS.maxResidentTools),
        activePanelId: z.string().nullable(),
      })).min(1).max(WORKBENCH_LIMITS.maxVisibleGroups),
      focusedGroupId: z.string().min(1),
      layout: z.enum(["single", "columns", "rows", "main-left", "grid"]),
      layoutSizes: z.record(z.string(), z.tuple([z.number(), z.number()])),
    })).min(1).max(WORKBENCH_LIMITS.maxWorkspaces),
    activeWorkspaceId: z.string().min(1),
    maximizedPanelId: z.string().nullable(),
    focusedPanelId: z.string().nullable(),
  }).safeParse(value);
  if (versionTwo.success) {
    const migrated = workspaceSchema.safeParse({ ...versionTwo.data, version: 3 });
    if (migrated.success) return migrated.data;
  }
  return migrateLegacyWorkspace(value) ?? freshWorkspace();
}

export function visiblePanels(workspace: Workspace, isMobile: boolean): Panel[] {
  if (workspace.maximizedPanelId !== null) {
    return workspace.panels.filter((panel) => panel.id === workspace.maximizedPanelId);
  }
  const page = workspace.workspaces.find((candidate) => candidate.id === workspace.activeWorkspaceId);
  if (!page) return [];
  if (isMobile) {
    const group = page.groups.find((candidate) => candidate.id === page.focusedGroupId) ?? page.groups[0];
    return workspace.panels.filter((panel) => panel.id === group?.activePanelId).slice(0, 1);
  }
  const visibleIds = new Set(page.groups.map((group) => group.activePanelId).filter((id): id is string => id !== null));
  return workspace.panels.filter((panel) => visibleIds.has(panel.id));
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      ...freshWorkspace(),
      selectProject: (selectedProjectId) => set({ selectedProjectId }),
      openPanel: (input) => {
        const current = get();
        const existing = current.panels.find((panel) => isSamePanel(panel, input));
        if (existing) {
          get().focusPanel(existing.id);
          set({ selectedProjectId: input.projectId ?? current.selectedProjectId, maximizedPanelId: null });
          return existing.id;
        }
        if (current.panels.length >= WORKBENCH_LIMITS.maxResidentTools) return null;

        const requestedWorkspace = input.workspaceId
          ? current.workspaces.find((workspace) => workspace.id === input.workspaceId)
          : undefined;
        const requestedGroupPlacement = input.groupId
          ? current.workspaces.flatMap((workspace) => workspace.groups.map((group) => ({ workspace, group })))
              .find(({ group }) => group.id === input.groupId)
          : undefined;
        const targetWorkspace = requestedGroupPlacement?.workspace
          ?? requestedWorkspace
          ?? current.workspaces.find((workspace) => workspace.id === current.activeWorkspaceId)
          ?? current.workspaces[0]!;
        const targetGroup = requestedGroupPlacement?.group
          ?? targetWorkspace.groups.find((group) => group.id === targetWorkspace.focusedGroupId)
          ?? targetWorkspace.groups[0]!;
        const panel = makePanel(input);
        set({
          panels: [...current.panels, panel],
          selectedProjectId: input.projectId ?? current.selectedProjectId,
          activeWorkspaceId: targetWorkspace.id,
          focusedPanelId: panel.id,
          maximizedPanelId: null,
          workspaces: current.workspaces.map((workspace) => workspace.id !== targetWorkspace.id
            ? workspace
            : {
                ...workspace,
                focusedGroupId: targetGroup.id,
                groups: workspace.groups.map((group) => group.id !== targetGroup.id
                  ? group
                  : { ...group, panelIds: [...group.panelIds, panel.id], activePanelId: panel.id }),
              }),
        });
        return panel.id;
      },
      closePanel: (panelId) => set((current) => {
        const panels = current.panels.filter((panel) => panel.id !== panelId);
        const workspaces = current.workspaces.map((workspace) => ({
          ...workspace,
          groups: workspace.groups.map((group) => {
            if (!group.panelIds.includes(panelId)) return group;
            const panelIds = group.panelIds.filter((id) => id !== panelId);
            return {
              ...group,
              panelIds,
              activePanelId: group.activePanelId === panelId ? (panelIds.at(-1) ?? null) : group.activePanelId,
            };
          }),
        }));
        const focusedPanelId = current.focusedPanelId === panelId
          ? (visiblePanels({ ...current, panels, workspaces, focusedPanelId: null, maximizedPanelId: null }, false).at(-1)?.id ?? null)
          : current.focusedPanelId;
        return {
          panels,
          workspaces,
          maximizedPanelId: current.maximizedPanelId === panelId ? null : current.maximizedPanelId,
          focusedPanelId,
        };
      }),
      reloadPanel: (panelId) => set((current) => ({
        panels: current.panels.map((panel) => panel.id === panelId
          ? { ...panel, reloadKey: panel.reloadKey + 1 }
          : panel),
      })),
      setLayout: (layout) => set((current) => ({
        workspaces: current.workspaces.map((workspace) => workspace.id === current.activeWorkspaceId
          ? { ...workspace, layout: normalizedLayout(workspace.groups.length, layout) }
          : workspace),
      })),
      setLayoutSizes: (workspaceId, key, sizes) => {
        if (Math.abs(sizes[0] + sizes[1] - 100) > 0.5) return;
        set((current) => ({
          workspaces: current.workspaces.map((workspace) => workspace.id === workspaceId
            ? { ...workspace, layoutSizes: { ...workspace.layoutSizes, [key]: sizes } }
            : workspace),
        }));
      },
      maximizePanel: (panelId) => {
        if (get().panels.some((panel) => panel.id === panelId)) {
          get().focusPanel(panelId);
          set({ maximizedPanelId: panelId });
        }
      },
      restorePanels: () => set({ maximizedPanelId: null }),
      focusPanel: (panelId) => set((current) => {
        const placement = placementOf(current.workspaces, panelId);
        if (!placement) return current;
        return {
          activeWorkspaceId: placement.workspace.id,
          focusedPanelId: panelId,
          workspaces: current.workspaces.map((workspace) => workspace.id !== placement.workspace.id
            ? workspace
            : {
                ...workspace,
                focusedGroupId: placement.group.id,
                groups: workspace.groups.map((group) => group.id === placement.group.id
                  ? { ...group, activePanelId: panelId }
                  : group),
              }),
        };
      }),
      focusGroup: (groupId) => set((current) => ({
        workspaces: current.workspaces.map((workspace) => workspace.id === current.activeWorkspaceId && workspace.groups.some((group) => group.id === groupId)
          ? { ...workspace, focusedGroupId: groupId }
          : workspace),
      })),
      addGroup: () => {
        const current = get();
        const workspace = current.workspaces.find((candidate) => candidate.id === current.activeWorkspaceId);
        if (!workspace || workspace.groups.length >= WORKBENCH_LIMITS.maxVisibleGroups) return null;
        const group: WorkbenchGroup = { id: generateId(), panelIds: [], activePanelId: null };
        set({
          workspaces: current.workspaces.map((candidate) => candidate.id !== workspace.id
            ? candidate
            : {
                ...candidate,
                groups: [...candidate.groups, group],
                focusedGroupId: group.id,
                layout: normalizedLayout(candidate.groups.length + 1, candidate.layout),
              }),
        });
        return group.id;
      },
      removeGroup: (groupId) => set((current) => ({
        workspaces: current.workspaces.map((workspace) => {
          if (workspace.id !== current.activeWorkspaceId || workspace.groups.length <= 1) return workspace;
          const removed = workspace.groups.find((group) => group.id === groupId);
          if (!removed) return workspace;
          const groups = workspace.groups.filter((group) => group.id !== groupId);
          const target = groups[0]!;
          const mergedGroups = groups.map((group) => group.id !== target.id ? group : {
            ...group,
            panelIds: [...group.panelIds, ...removed.panelIds],
            activePanelId: removed.activePanelId ?? group.activePanelId,
          });
          return {
            ...workspace,
            groups: mergedGroups,
            focusedGroupId: workspace.focusedGroupId === groupId ? target.id : workspace.focusedGroupId,
            layout: normalizedLayout(mergedGroups.length, workspace.layout),
          };
        }),
      })),
      addWorkspace: (name) => {
        const current = get();
        if (current.workspaces.length >= WORKBENCH_LIMITS.maxWorkspaces) return null;
        const id = generateId();
        const groupId = generateId();
        const workspace: WorkbenchPage = {
          id,
          name: name?.trim().slice(0, 48) || `Arbeitsfläche ${current.workspaces.length + 1}`,
          groups: [{ id: groupId, panelIds: [], activePanelId: null }],
          focusedGroupId: groupId,
          layout: "single",
          layoutSizes: {},
        };
        set({ workspaces: [...current.workspaces, workspace], activeWorkspaceId: id, focusedPanelId: null, maximizedPanelId: null });
        return id;
      },
      removeWorkspace: (workspaceId) => set((current) => {
        if (current.workspaces.length <= 1) return current;
        const removed = current.workspaces.find((workspace) => workspace.id === workspaceId);
        if (!removed) return current;
        const removedPanelIds = new Set(removed.groups.flatMap((group) => group.panelIds));
        const workspaces = current.workspaces.filter((workspace) => workspace.id !== workspaceId);
        const activeWorkspaceId = current.activeWorkspaceId === workspaceId ? workspaces[0]!.id : current.activeWorkspaceId;
        return {
          panels: current.panels.filter((panel) => !removedPanelIds.has(panel.id)),
          workspaces,
          activeWorkspaceId,
          focusedPanelId: removedPanelIds.has(current.focusedPanelId ?? "") ? null : current.focusedPanelId,
          maximizedPanelId: removedPanelIds.has(current.maximizedPanelId ?? "") ? null : current.maximizedPanelId,
        };
      }),
      renameWorkspace: (workspaceId, name) => {
        const nextName = name.trim().slice(0, 48);
        if (!nextName) return;
        set((current) => ({
          workspaces: current.workspaces.map((workspace) => workspace.id === workspaceId ? { ...workspace, name: nextName } : workspace),
        }));
      },
      activateWorkspace: (workspaceId) => set((current) => current.workspaces.some((workspace) => workspace.id === workspaceId)
        ? { activeWorkspaceId: workspaceId, focusedPanelId: null, maximizedPanelId: null }
        : current),
      resetWorkspace: () => set(freshWorkspace()),
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      version: 3,
      partialize: ({
        version,
        selectedProjectId,
        panels,
        workspaces,
        activeWorkspaceId,
        maximizedPanelId,
        focusedPanelId,
      }) => ({ version, selectedProjectId, panels, workspaces, activeWorkspaceId, maximizedPanelId, focusedPanelId }),
      merge: (persisted, current) => ({ ...current, ...parseStoredWorkspace(persisted) }),
      onRehydrateStorage: () => () => {
        try {
          const legacyRaw = window.localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
          const hasCurrent = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
          if (!hasCurrent && legacyRaw) {
            const legacyEnvelope = JSON.parse(legacyRaw) as { state?: unknown };
            const migrated = migrateLegacyWorkspace(legacyEnvelope.state ?? legacyEnvelope);
            if (migrated) useWorkspaceStore.setState(migrated);
          }
        } catch {
          // A blocked or malformed legacy store must not prevent startup.
        }
      },
    },
  ),
);
