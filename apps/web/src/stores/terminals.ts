import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TerminalKind, TerminalWorkspace } from "@workbench/contracts";
import { generateId } from "../lib/id";

export const MAX_TERMINAL_TABS = 5;
export const MAX_CLI_INSTANCES = 4;
export const TERMINAL_STORAGE_KEY = "remote-workplace.terminals.v1";

export interface TerminalTabState {
  id: string;
  projectId: string | null;
  kind: TerminalKind;
}

export interface TerminalAreaState {
  id: string;
  tabs: TerminalTabState[];
  activeTabId: string | null;
  splitTabId: string | null;
  splitSizes: [number, number];
}

interface TerminalStore {
  areas: Record<string, TerminalAreaState>;
  hydrated: boolean;
  revision: number;
  dirty: boolean;
  saving: boolean;
  syncError: string | null;
  initializeRemote(document: TerminalWorkspace, revision: number): void;
  applyRemote(document: TerminalWorkspace, revision: number): void;
  replaceRemote(document: TerminalWorkspace, revision: number): void;
  markSaved(revision: number, unchanged: boolean): void;
  markSaving(saving: boolean): void;
  markSyncError(message: string | null): void;
  ensureArea(areaId: string, projectId?: string | null, kind?: TerminalKind): void;
  addTab(areaId: string, projectId?: string | null, kind?: TerminalKind): string | null;
  addExistingTab(areaId: string, tab: TerminalTabState): string | null;
  activateTab(areaId: string, tabId: string): void;
  closeTab(areaId: string, tabId: string): void;
  splitTab(areaId: string, tabId: string, side: "left" | "right"): void;
  clearSplit(areaId: string): void;
  setSplitSizes(areaId: string, sizes: [number, number]): void;
}

function newTab(projectId: string | null = null, kind: TerminalKind = "shell"): TerminalTabState {
  return { id: generateId(), projectId, kind };
}

function newArea(id: string, projectId: string | null = null, kind: TerminalKind = "shell"): TerminalAreaState {
  const tab = newTab(projectId, kind);
  return { id, tabs: [tab], activeTabId: tab.id, splitTabId: null, splitSizes: [50, 50] };
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      areas: {},
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
      applyRemote: (document, revision) => set((state) => state.dirty
        ? state
        : { areas: document.areas as Record<string, TerminalAreaState>, revision, hydrated: true, syncError: null }),
      replaceRemote: (document, revision) => set({ areas: document.areas as Record<string, TerminalAreaState>, revision, hydrated: true, dirty: false, saving: false, syncError: null }),
      markSaved: (revision, unchanged) => set((state) => ({ revision, dirty: unchanged ? false : state.dirty, saving: false, syncError: null })),
      markSaving: (saving) => set({ saving }),
      markSyncError: (syncError) => set({ syncError, saving: false }),
      ensureArea: (areaId, projectId = null, kind = "shell") => {
        if (!get().hydrated) return;
        if (get().areas[areaId]) return;
        set((state) => ({ areas: { ...state.areas, [areaId]: newArea(areaId, projectId, kind) }, dirty: true }));
      },
      addTab: (areaId, projectId = null, kind = "shell") => {
        if (!get().hydrated) return null;
        const existing = get().areas[areaId];
        if (!existing) {
          const area = newArea(areaId, projectId, kind);
          set((state) => ({ areas: { ...state.areas, [areaId]: area }, dirty: true }));
          return area.activeTabId;
        }
        const current = existing;
        const areaLimit = kind === "shell" ? MAX_TERMINAL_TABS : MAX_CLI_INSTANCES;
        if (current.tabs.length >= areaLimit) return null;
        const tab = newTab(projectId, kind);
        set((state) => ({
          areas: {
            ...state.areas,
            [areaId]: { ...current, tabs: [...current.tabs, tab], activeTabId: tab.id },
          },
          dirty: true,
        }));
        return tab.id;
      },
      addExistingTab: (areaId, tab) => {
        if (!get().hydrated) return null;
        const existing = get().areas[areaId];
        if (!existing) {
          const area: TerminalAreaState = { id: areaId, tabs: [tab], activeTabId: tab.id, splitTabId: null, splitSizes: [50, 50] };
          set((state) => ({ areas: { ...state.areas, [areaId]: area }, dirty: true }));
          return tab.id;
        }
        const limit = tab.kind === "shell" ? MAX_TERMINAL_TABS : MAX_CLI_INSTANCES;
        if (existing.tabs.length >= limit || existing.tabs.some((candidate) => candidate.id === tab.id)) return null;
        set((state) => ({ areas: { ...state.areas, [areaId]: { ...existing, tabs: [...existing.tabs, tab], activeTabId: tab.id } }, dirty: true }));
        return tab.id;
      },
      activateTab: (areaId, tabId) => set((state) => {
        const area = state.areas[areaId];
        if (!area?.tabs.some((tab) => tab.id === tabId)) return state;
        return { areas: { ...state.areas, [areaId]: { ...area, activeTabId: tabId } }, dirty: true };
      }),
      closeTab: (areaId, tabId) => set((state) => {
        const area = state.areas[areaId];
        if (!area) return state;
        const index = area.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) return state;
        const tabs = area.tabs.filter((tab) => tab.id !== tabId);
        const fallback = tabs[Math.min(index, Math.max(0, tabs.length - 1))]?.id ?? null;
        return {
          areas: {
            ...state.areas,
            [areaId]: {
              ...area,
              tabs,
              activeTabId: area.activeTabId === tabId ? fallback : area.activeTabId,
              splitTabId: area.splitTabId === tabId ? null : area.splitTabId,
            },
          },
          dirty: true,
        };
      }),
      splitTab: (areaId, tabId, side) => set((state) => {
        const area = state.areas[areaId];
        if (!area?.tabs.some((tab) => tab.id === tabId)) return state;
        const previousActive = area.activeTabId;
        if (!previousActive || previousActive === tabId) {
          const alternative = area.tabs.find((tab) => tab.id !== tabId)?.id ?? null;
          if (!alternative) return state;
          return {
            areas: {
              ...state.areas,
              [areaId]: side === "left"
                ? { ...area, activeTabId: tabId, splitTabId: alternative }
                : { ...area, activeTabId: alternative, splitTabId: tabId },
            },
            dirty: true,
          };
        }
        return {
          areas: {
            ...state.areas,
            [areaId]: side === "left"
              ? { ...area, activeTabId: tabId, splitTabId: previousActive }
              : { ...area, splitTabId: tabId },
          },
          dirty: true,
        };
      }),
      clearSplit: (areaId) => set((state) => {
        const area = state.areas[areaId];
        return area ? { areas: { ...state.areas, [areaId]: { ...area, splitTabId: null } }, dirty: true } : state;
      }),
      setSplitSizes: (areaId, splitSizes) => set((state) => {
        const area = state.areas[areaId];
        if (!area || Math.abs(splitSizes[0] + splitSizes[1] - 100) > 0.5) return state;
        return { areas: { ...state.areas, [areaId]: { ...area, splitSizes } }, dirty: true };
      }),
    }),
    {
      name: TERMINAL_STORAGE_KEY,
      version: 2,
      partialize: ({ areas }) => ({ areas }),
      migrate: (persisted) => {
        if (!persisted || typeof persisted !== "object" || !("areas" in persisted)) return { areas: {} };
        const areas = (persisted as { areas?: Record<string, TerminalAreaState> }).areas ?? {};
        return {
          areas: Object.fromEntries(Object.entries(areas).map(([areaId, area]) => [areaId, {
            ...area,
            tabs: Array.isArray(area.tabs)
              ? area.tabs.map((tab) => ({ ...tab, kind: tab.kind ?? "shell" }))
              : [],
          }])),
        };
      },
    },
  ),
);
