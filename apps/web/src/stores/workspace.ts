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

export const WORKSPACE_STORAGE_KEY = "remote-workplace.workspace.v2";
export const LEGACY_WORKSPACE_STORAGE_KEY = "remote-workplace.workspace.v1";
// Schlüssel aus der Zeit vor der Open-Source-Vorbereitung. Werden beim Start
// migriert, sofern der aktuelle Schlüssel noch nicht existiert (F04-01).
export const RENAMED_WORKSPACE_STORAGE_KEYS = [
  "benjamin-dev-workbench.workspace.v2",
  "benjamin-dev-workbench.workspace.v1",
];

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
  browserUrl?: string | null;
  // Tiefenlink für T3-Panels: Pfad hinter dem Proxy-Präfix `/t3`.
  t3Path?: string | null;
  // Zielordner für Code-Server-Panels aus eingebetteten Werkzeugen.
  codeServerFolder?: string | null;
  hermesAdminPath?: string;
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
  updateHermesPanel(panelId: string, patch: Partial<Pick<Panel, "hermesAdminPath">>): void;
  setPanelProject(panelId: string, projectId: string | null): void;
  navigateT3Panel(panelId: string, t3Path: string): void;
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
    ...(input.browserUrl ? { browserUrl: input.browserUrl } : {}),
    ...(input.t3Path ? { t3Path: input.t3Path } : {}),
    ...(input.codeServerFolder ? { codeServerFolder: input.codeServerFolder } : {}),
    ...(input.type === "hermes" ? {
      hermesAdminPath: input.hermesAdminPath && input.hermesAdminPath !== "/" ? input.hermesAdminPath : "/chat",
    } : {}),
  };
}

function isSamePanel(panel: Panel, input: OpenPanelInput): boolean {
  if (["terminal", "codex", "opencode", "hermes"].includes(input.type)) return false;
  // Code-Server-Panels aus dem T3-„Open"-Button gehören zum Zielordner:
  // Ein anderer Ordner öffnet einen eigenen Bereich statt den vorhandenen
  // Editor umzustellen.
  const sameFolder = (panel.codeServerFolder ?? null) === (input.codeServerFolder ?? null);
  return (
    sameFolder &&
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

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function migrateLegacyHermesPanel(panel: unknown, parsed: Panel): Panel {
  if (parsed.type !== "hermes") return parsed;
  const raw = recordOf(panel);
  const sessionId = typeof raw?.hermesSessionId === "string" ? raw.hermesSessionId : null;
  const surface = typeof raw?.hermesSurface === "string" ? raw.hermesSurface : null;
  if (!sessionId || surface === "admin") return parsed;

  const resumePath = `/chat?resume=${encodeURIComponent(sessionId)}`;
  return resumePath.length <= 512 ? { ...parsed, hermesAdminPath: resumePath } : parsed;
}

/**
 * Arbeitsflächen müssen auch nach einem Rückbau lesbar bleiben. Ein unbekannter
 * Paneltyp darf deshalb nicht die gesamte localStorage-Arbeitsfläche verwerfen.
 * Die Reparatur ist bewusst auf bekannte Panels und ihre Zuordnung begrenzt;
 * strukturell kaputte Dokumente laufen weiterhin durch den normalen Fallback.
 */
function stripUnknownPanels(value: unknown): unknown {
  const root = recordOf(value);
  if (!root || !Array.isArray(root.panels) || !Array.isArray(root.workspaces)) return value;

  const panels = root.panels.flatMap((panel) => {
    const parsed = panelSchema.safeParse(panel);
    return parsed.success ? [migrateLegacyHermesPanel(panel, parsed.data)] : [];
  });
  // Sind alle Panels unbekannt, bleiben die Arbeitsflächen-Struktur (Gruppen,
  // Layout, Namen) trotzdem erhalten — nur die Panels entfallen (F04-11).

  const panelIds = new Set(panels.map((panel) => panel.id));
  const assigned = new Set<string>();
  const workspaces = root.workspaces.map((workspaceValue) => {
    const workspace = recordOf(workspaceValue);
    if (!workspace || !Array.isArray(workspace.groups)) return workspaceValue;
    const groups = workspace.groups.map((groupValue) => {
      const group = recordOf(groupValue);
      if (!group || !Array.isArray(group.panelIds)) return groupValue;
      const nextPanelIds = group.panelIds.filter((panelId): panelId is string => (
        typeof panelId === "string" && panelIds.has(panelId) && !assigned.has(panelId)
      ));
      nextPanelIds.forEach((panelId) => assigned.add(panelId));
      const activePanelId = typeof group.activePanelId === "string" && nextPanelIds.includes(group.activePanelId)
        ? group.activePanelId
        : (nextPanelIds[0] ?? null);
      return { ...group, panelIds: nextPanelIds, activePanelId };
    });
    const focusedGroupId = typeof workspace.focusedGroupId === "string"
      && groups.some((group) => recordOf(group)?.id === workspace.focusedGroupId)
      ? workspace.focusedGroupId
      : (recordOf(groups[0])?.id ?? workspace.focusedGroupId);
    return { ...workspace, groups, focusedGroupId };
  });

  const unassigned = panels.map((panel) => panel.id).filter((panelId) => !assigned.has(panelId));
  if (unassigned.length > 0) {
    const workspaceIndex = workspaces.findIndex((workspaceValue) => {
      const workspace = recordOf(workspaceValue);
      return Boolean(workspace && Array.isArray(workspace.groups) && workspace.groups.length > 0);
    });
    if (workspaceIndex >= 0) {
      const workspace = recordOf(workspaces[workspaceIndex]);
      const groups = workspace && Array.isArray(workspace.groups) ? [...workspace.groups] : [];
      const firstGroup = recordOf(groups[0]);
      if (firstGroup && Array.isArray(firstGroup.panelIds)) {
        groups[0] = {
          ...firstGroup,
          panelIds: [...firstGroup.panelIds, ...unassigned].slice(0, WORKBENCH_LIMITS.maxResidentTools),
          activePanelId: firstGroup.activePanelId ?? unassigned[0] ?? null,
        };
        workspaces[workspaceIndex] = { ...workspace, groups };
      }
    }
  }

  const workspaceIds = new Set(workspaces.flatMap((workspaceValue) => {
    const workspace = recordOf(workspaceValue);
    return typeof workspace?.id === "string" ? [workspace.id] : [];
  }));
  const activeWorkspaceId = typeof root.activeWorkspaceId === "string" && workspaceIds.has(root.activeWorkspaceId)
    ? root.activeWorkspaceId
    : (workspaces.map(recordOf).find((workspace) => typeof workspace?.id === "string")?.id ?? root.activeWorkspaceId);

  return {
    ...root,
    version: 3,
    panels,
    workspaces,
    activeWorkspaceId,
    maximizedPanelId: typeof root.maximizedPanelId === "string" && panelIds.has(root.maximizedPanelId)
      ? root.maximizedPanelId
      : null,
    focusedPanelId: typeof root.focusedPanelId === "string" && panelIds.has(root.focusedPanelId)
      ? root.focusedPanelId
      : null,
  };
}

export function parseStoredWorkspaceOrNull(value: unknown): Workspace | null {
  const sanitized = stripUnknownPanels(value);
  const parsed = workspaceSchema.safeParse(sanitized);
  if (parsed.success) return normalizeStoredWorkspace(parsed.data);
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
  }).safeParse(sanitized);
  if (versionTwo.success) {
    const migrated = workspaceSchema.safeParse({ ...versionTwo.data, version: 3 });
    if (migrated.success) return normalizeStoredWorkspace(migrated.data);
  }
  return migrateLegacyWorkspace(value);
}

export function parseStoredWorkspace(value: unknown): Workspace {
  return parseStoredWorkspaceOrNull(value) ?? normalizeStoredWorkspace(freshWorkspace());
}

function normalizeStoredWorkspace(workspace: Workspace): Workspace {
  return {
    ...workspace,
    panels: workspace.panels.map((panel) => {
      if (panel.type === "t3-code") {
        // Ein Tiefenlink-Ziel aus einem früheren Lauf ist beim Neustart veraltet
        // und gehört nicht in den gespeicherten Zustand zurück.
        return { ...panel, t3Path: undefined };
      }
      if (panel.type !== "hermes" || panel.hermesAdminPath) return panel;
      return { ...panel, hermesAdminPath: "/chat" };
    }),
  };
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
          const hasBrowserUrl = input.type === "browser" && input.browserUrl !== undefined;
          const hasT3Path = input.type === "t3-code" && input.t3Path !== undefined;
          set({
            selectedProjectId: input.projectId ?? current.selectedProjectId,
            maximizedPanelId: null,
            ...(hasBrowserUrl || hasT3Path ? {
              panels: current.panels.map((panel) => panel.id !== existing.id
                ? panel
                : {
                    ...panel,
                    ...(hasBrowserUrl ? (input.browserUrl ? { browserUrl: input.browserUrl } : { browserUrl: undefined }) : {}),
                    ...(hasT3Path ? { t3Path: input.t3Path ?? undefined } : {}),
                    reloadKey: panel.reloadKey + 1,
                  }),
            } : {}),
          });
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
      updateHermesPanel: (panelId, patch) => set((current) => ({
        panels: current.panels.map((panel) => panel.id === panelId && panel.type === "hermes" ? { ...panel, ...patch } : panel),
      })),
      setPanelProject: (panelId, projectId) => set((current) => ({
        panels: current.panels.map((panel) => panel.id === panelId && panel.type === "hermes" ? { ...panel, projectId } : panel),
      })),
      navigateT3Panel: (panelId, t3Path) => set((current) => ({
        panels: current.panels.map((panel) => panel.id === panelId && panel.type === "t3-code"
          ? { ...panel, t3Path, reloadKey: panel.reloadKey + 1 }
          : panel),
      })),
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
      // Ohne migrate wirft zustand bei einem Versions-Mismatch den alten Stand
      // weg und merge erzeugt eine leere Arbeitsfläche (F04-02). Der Aufruf
      // wandelt v1/v2-Stände in die aktuelle Version um.
      migrate: (persisted) => parseStoredWorkspace(persisted),
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
        for (const oldKey of RENAMED_WORKSPACE_STORAGE_KEYS) {
          try {
            const raw = window.localStorage.getItem(oldKey);
            const hasCurrent = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
            if (!hasCurrent && raw) {
              const envelope = JSON.parse(raw) as { state?: unknown };
              const migrated = parseStoredWorkspaceOrNull(envelope.state ?? envelope);
              if (migrated) {
                useWorkspaceStore.setState(migrated);
                window.localStorage.removeItem(oldKey);
              }
            }
          } catch {
            // Ein blockierter oder defekter alter Speicher darf den Start nicht verhindern.
          }
        }
      },
    },
  ),
);
