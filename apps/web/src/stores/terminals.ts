import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TerminalKind } from "@workbench/contracts";
import { generateId } from "../lib/id";

export const MAX_TERMINAL_TABS = 5;
export const MAX_CLI_INSTANCES = 4;
export const TERMINAL_STORAGE_KEY = "benjamin-dev-workbench.terminals.v1";

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
  ensureArea(areaId: string, projectId?: string | null, kind?: TerminalKind): void;
  addTab(areaId: string, projectId?: string | null, kind?: TerminalKind): string | null;
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
      ensureArea: (areaId, projectId = null, kind = "shell") => {
        if (get().areas[areaId]) return;
        set((state) => ({ areas: { ...state.areas, [areaId]: newArea(areaId, projectId, kind) } }));
      },
      addTab: (areaId, projectId = null, kind = "shell") => {
        const existing = get().areas[areaId];
        if (!existing) {
          const area = newArea(areaId, projectId, kind);
          set((state) => ({ areas: { ...state.areas, [areaId]: area } }));
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
        }));
        return tab.id;
      },
      activateTab: (areaId, tabId) => set((state) => {
        const area = state.areas[areaId];
        if (!area?.tabs.some((tab) => tab.id === tabId)) return state;
        return { areas: { ...state.areas, [areaId]: { ...area, activeTabId: tabId } } };
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
          };
        }
        return {
          areas: {
            ...state.areas,
            [areaId]: side === "left"
              ? { ...area, activeTabId: tabId, splitTabId: previousActive }
              : { ...area, splitTabId: tabId },
          },
        };
      }),
      clearSplit: (areaId) => set((state) => {
        const area = state.areas[areaId];
        return area ? { areas: { ...state.areas, [areaId]: { ...area, splitTabId: null } } } : state;
      }),
      setSplitSizes: (areaId, splitSizes) => set((state) => {
        const area = state.areas[areaId];
        if (!area || Math.abs(splitSizes[0] + splitSizes[1] - 100) > 0.5) return state;
        return { areas: { ...state.areas, [areaId]: { ...area, splitSizes } } };
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
