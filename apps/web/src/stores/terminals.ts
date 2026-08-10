import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TerminalKind, TerminalWorkspace } from "@workbench/contracts";
import { generateId } from "../lib/id";

export const MAX_TERMINAL_TABS = 5;
// Grenzen je CLI-Werkzeug, abgestimmt auf die Server-Defaults
// (CODEX_MAX_SESSIONS=12, OPENCODE_MAX_SESSIONS=12, CLAUDE_MAX_SESSIONS=4).
// Das Server-Limit bleibt die harte Schranke; diese Werte passen die UI-Kapazität an.
export const CLI_INSTANCE_LIMITS: Record<"codex" | "opencode" | "claude", number> = {
  codex: 12,
  opencode: 12,
  claude: 4,
};
export const TERMINAL_STORAGE_KEY = "remote-workplace.terminals.v1";

export interface TerminalTabState {
  id: string;
  projectId: string | null;
  kind: TerminalKind;
  initialCwd: string | null;
}

export interface TerminalAreaState {
  id: string;
  tabs: TerminalTabState[];
  activeTabId: string | null;
  splitTabIds: [string, string] | null;
  splitSizes: [number, number];
}

interface TerminalStore {
  areas: Record<string, TerminalAreaState>;
  runtimeCwds: Record<string, string>;
  hydrated: boolean;
  revision: number;
  dirty: boolean;
  saving: boolean;
  syncError: string | null;
  initializeRemote(document: TerminalWorkspace, revision: number): void;
  restoreDraft(document: TerminalWorkspace, revision: number): void;
  applyRemote(document: TerminalWorkspace, revision: number): void;
  replaceRemote(document: TerminalWorkspace, revision: number): void;
  resolveConflict(revision: number): void;
  markSaved(revision: number, unchanged: boolean): void;
  markSaving(saving: boolean): void;
  markSyncError(message: string | null): void;
  ensureArea(areaId: string, projectId?: string | null, kind?: TerminalKind): void;
  addTab(areaId: string, projectId?: string | null, kind?: TerminalKind, initialCwd?: string | null): string | null;
  addExistingTab(areaId: string, tab: TerminalTabState): string | null;
  activateProject(areaId: string, projectId: string | null, kind?: TerminalKind): string | null;
  activateTab(areaId: string, tabId: string): void;
  closeTab(areaId: string, tabId: string): void;
  openSplit(areaId: string, projectId?: string | null, kind?: TerminalKind, initialCwd?: string | null): string | null;
  splitTab(areaId: string, tabId: string, side: "left" | "right"): void;
  clearSplit(areaId: string): void;
  setSplitSizes(areaId: string, sizes: [number, number]): void;
  setRuntimeCwd(runtimeId: string, cwd: string): void;
}

function newTab(projectId: string | null = null, kind: TerminalKind = "shell", initialCwd: string | null = null): TerminalTabState {
  return { id: generateId(), projectId, kind, initialCwd };
}

function newArea(id: string, projectId: string | null = null, kind: TerminalKind = "shell"): TerminalAreaState {
  const tab = newTab(projectId, kind);
  return { id, tabs: [tab], activeTabId: tab.id, splitTabIds: null, splitSizes: [50, 50] };
}

function activateInArea(area: TerminalAreaState, tabId: string): TerminalAreaState {
  if (!area.splitTabIds) return { ...area, activeTabId: tabId };
  if (area.splitTabIds.includes(tabId)) return { ...area, activeTabId: tabId };
  const focusedIndex = area.activeTabId === area.splitTabIds[1] ? 1 : 0;
  const splitTabIds: [string, string] = [...area.splitTabIds];
  splitTabIds[focusedIndex] = tabId;
  return { ...area, activeTabId: tabId, splitTabIds };
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      areas: {},
      runtimeCwds: {},
      hydrated: false,
      revision: 0,
      dirty: false,
      saving: false,
      syncError: null,
      initializeRemote: (document, revision) => set((state) => {
        const hasLocal = Object.keys(state.areas).length > 0;
        const useLocal = revision === 0 && hasLocal;
        return {
          areas: useLocal ? state.areas : document.areas as Record<string, TerminalAreaState>,
          hydrated: true,
          revision,
          dirty: useLocal,
          syncError: null,
        };
      }),
      restoreDraft: (document, revision) => set({
        areas: document.areas as Record<string, TerminalAreaState>,
        hydrated: true,
        revision,
        dirty: true,
        saving: false,
        syncError: "Ein nicht gespeicherter Terminal-Entwurf wurde nach dem Reload wiederhergestellt.",
      }),
      applyRemote: (document, revision) => set((state) => state.dirty
        ? state
        : { areas: document.areas as Record<string, TerminalAreaState>, revision, hydrated: true, syncError: null }),
      replaceRemote: (document, revision) => set({ areas: document.areas as Record<string, TerminalAreaState>, revision, hydrated: true, dirty: false, saving: false, syncError: null }),
      resolveConflict: (revision) => set({
        revision,
        hydrated: true,
        dirty: true,
        saving: false,
        syncError: "Das Terminal-Layout wurde parallel geändert. Dein lokaler Entwurf bleibt erhalten und wird nach der nächsten Änderung erneut gespeichert.",
      }),
      markSaved: (revision, unchanged) => set((state) => ({ revision, dirty: unchanged ? false : state.dirty, saving: false, syncError: null })),
      markSaving: (saving) => set({ saving }),
      markSyncError: (syncError) => set({ syncError, saving: false }),
      ensureArea: (areaId, projectId = null, kind = "shell") => {
        if (!get().hydrated) return;
        if (get().areas[areaId]) return;
        set((state) => ({ areas: { ...state.areas, [areaId]: newArea(areaId, projectId, kind) }, dirty: true }));
      },
      addTab: (areaId, projectId = null, kind = "shell", initialCwd = null) => {
        if (!get().hydrated) return null;
        const existing = get().areas[areaId];
        if (!existing) {
          const area = newArea(areaId, projectId, kind);
          set((state) => ({ areas: { ...state.areas, [areaId]: area }, dirty: true }));
          return area.activeTabId;
        }
        const current = existing;
        const areaLimit = kind === "shell" ? MAX_TERMINAL_TABS : CLI_INSTANCE_LIMITS[kind as "codex" | "opencode" | "claude"];
        if (current.tabs.length >= areaLimit) return null;
        const tab = newTab(projectId, kind, initialCwd);
        set((state) => ({
          areas: {
            ...state.areas,
            [areaId]: activateInArea({ ...current, tabs: [...current.tabs, tab] }, tab.id),
          },
          dirty: true,
        }));
        return tab.id;
      },
      addExistingTab: (areaId, tab) => {
        if (!get().hydrated) return null;
        const existing = get().areas[areaId];
        if (!existing) {
          const area: TerminalAreaState = { id: areaId, tabs: [tab], activeTabId: tab.id, splitTabIds: null, splitSizes: [50, 50] };
          set((state) => ({ areas: { ...state.areas, [areaId]: area }, dirty: true }));
          return tab.id;
        }
        const limit = tab.kind === "shell" ? MAX_TERMINAL_TABS : CLI_INSTANCE_LIMITS[tab.kind as "codex" | "opencode" | "claude"];
        if (existing.tabs.length >= limit || existing.tabs.some((candidate) => candidate.id === tab.id)) return null;
        set((state) => ({ areas: { ...state.areas, [areaId]: activateInArea({ ...existing, tabs: [...existing.tabs, tab] }, tab.id) }, dirty: true }));
        return tab.id;
      },
      activateProject: (areaId, projectId, kind) => {
        const area = get().areas[areaId];
        const tab = area?.tabs.find((candidate) => candidate.projectId === projectId && (kind === undefined || candidate.kind === kind));
        if (!area || !tab) return null;
        if (area.activeTabId === tab.id) return tab.id;
        set((state) => ({ areas: { ...state.areas, [areaId]: activateInArea(area, tab.id) }, dirty: true }));
        return tab.id;
      },
      activateTab: (areaId, tabId) => set((state) => {
        const area = state.areas[areaId];
        if (!area?.tabs.some((tab) => tab.id === tabId)) return state;
        if (area.activeTabId === tabId) return state;
        return { areas: { ...state.areas, [areaId]: activateInArea(area, tabId) }, dirty: true };
      }),
      closeTab: (areaId, tabId) => set((state) => {
        const area = state.areas[areaId];
        if (!area) return state;
        const index = area.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) return state;
        const tabs = area.tabs.filter((tab) => tab.id !== tabId);
        const fallback = tabs[Math.min(index, Math.max(0, tabs.length - 1))]?.id ?? null;
        const remainingSplitTabId = area.splitTabIds?.find((candidate) => candidate !== tabId && tabs.some((tab) => tab.id === candidate)) ?? null;
        const splitClosed = area.splitTabIds?.includes(tabId) ?? false;
        const activeTabId = area.activeTabId === tabId
          ? remainingSplitTabId ?? fallback
          : tabs.some((tab) => tab.id === area.activeTabId) ? area.activeTabId : fallback;
        return {
          areas: {
            ...state.areas,
            [areaId]: {
              ...area,
              tabs,
              activeTabId,
              splitTabIds: splitClosed ? null : area.splitTabIds,
            },
          },
          dirty: true,
        };
      }),
      openSplit: (areaId, projectId = null, kind = "shell", initialCwd = null) => {
        if (!get().hydrated) return null;
        const area = get().areas[areaId];
        const sourceTabId = area?.activeTabId;
        if (!area || !sourceTabId || area.splitTabIds) return null;
        const areaLimit = kind === "shell" ? MAX_TERMINAL_TABS : CLI_INSTANCE_LIMITS[kind as "codex" | "opencode" | "claude"];
        if (area.tabs.length >= areaLimit) return null;
        const tab = newTab(projectId, kind, initialCwd);
        set((state) => ({
          areas: {
            ...state.areas,
            [areaId]: {
              ...area,
              tabs: [...area.tabs, tab],
              activeTabId: tab.id,
              splitTabIds: [sourceTabId, tab.id],
            },
          },
          dirty: true,
        }));
        return tab.id;
      },
      splitTab: (areaId, tabId, side) => set((state) => {
        const area = state.areas[areaId];
        if (!area?.tabs.some((tab) => tab.id === tabId)) return state;
        const targetIndex = side === "left" ? 0 : 1;
        const otherIndex = targetIndex === 0 ? 1 : 0;
        if (area.splitTabIds) {
          const splitTabIds: [string, string] = [...area.splitTabIds];
          if (splitTabIds[targetIndex] === tabId) return { areas: { ...state.areas, [areaId]: { ...area, activeTabId: tabId } }, dirty: true };
          if (splitTabIds[otherIndex] === tabId) splitTabIds[otherIndex] = splitTabIds[targetIndex];
          splitTabIds[targetIndex] = tabId;
          return { areas: { ...state.areas, [areaId]: { ...area, activeTabId: tabId, splitTabIds } }, dirty: true };
        }
        const companion = area.activeTabId !== tabId
          ? area.activeTabId
          : area.tabs.find((tab) => tab.id !== tabId)?.id ?? null;
        if (!companion) return state;
        const splitTabIds: [string, string] = side === "left" ? [tabId, companion] : [companion, tabId];
        return {
          areas: {
            ...state.areas,
            [areaId]: { ...area, activeTabId: tabId, splitTabIds },
          },
          dirty: true,
        };
      }),
      clearSplit: (areaId) => set((state) => {
        const area = state.areas[areaId];
        return area ? { areas: { ...state.areas, [areaId]: { ...area, splitTabIds: null } }, dirty: true } : state;
      }),
      setSplitSizes: (areaId, splitSizes) => set((state) => {
        const area = state.areas[areaId];
        if (!area || Math.abs(splitSizes[0] + splitSizes[1] - 100) > 0.5) return state;
        if (Math.abs(area.splitSizes[0] - splitSizes[0]) < 0.05 && Math.abs(area.splitSizes[1] - splitSizes[1]) < 0.05) return state;
        return { areas: { ...state.areas, [areaId]: { ...area, splitSizes } }, dirty: true };
      }),
      setRuntimeCwd: (runtimeId, cwd) => set((state) => state.runtimeCwds[runtimeId] === cwd
        ? state
        : { runtimeCwds: { ...state.runtimeCwds, [runtimeId]: cwd } }),
    }),
    {
      name: TERMINAL_STORAGE_KEY,
      version: 3,
      partialize: ({ areas }) => ({ areas }),
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== "object" || !("areas" in persisted)) return { areas: {} };
        const areas = (persisted as { areas?: Record<string, TerminalAreaState & { splitTabId?: string | null }> }).areas ?? {};
        return {
          areas: Object.fromEntries(Object.entries(areas).map(([areaId, area]) => [areaId, {
            ...area,
            tabs: Array.isArray(area.tabs)
              ? area.tabs.map((tab) => ({ ...tab, kind: tab.kind ?? "shell", initialCwd: tab.initialCwd ?? null }))
              : [],
            splitTabIds: area.splitTabIds ?? (area.activeTabId && area.splitTabId && area.activeTabId !== area.splitTabId
              ? [area.activeTabId, area.splitTabId]
              : null),
          }])),
        };
      },
    },
  ),
);
