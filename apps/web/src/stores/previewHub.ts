import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PreviewHubState {
  openProjectIds: string[];
  activeProjectId: string | null;
  openProject: (projectId: string) => void;
  activateProject: (projectId: string) => void;
  closeProject: (projectId: string) => void;
  reconcileProjects: (availableProjectIds: string[], fallbackProjectId: string | null) => void;
}

export const PREVIEW_HUB_STORAGE_KEY = "remote-workplace.preview-hub.v1";

function validIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export const usePreviewHubStore = create<PreviewHubState>()(
  persist(
    (set) => ({
      openProjectIds: [],
      activeProjectId: null,
      openProject: (projectId) => set((state) => {
        const alreadyOpen = state.openProjectIds.includes(projectId);
        if (alreadyOpen && state.activeProjectId === projectId) return state;
        return {
          openProjectIds: alreadyOpen ? state.openProjectIds : [...state.openProjectIds, projectId],
          activeProjectId: projectId,
        };
      }),
      activateProject: (projectId) => set((state) => {
        if (!state.openProjectIds.includes(projectId) || state.activeProjectId === projectId) return state;
        return { activeProjectId: projectId };
      }),
      closeProject: (projectId) => set((state) => {
        const index = state.openProjectIds.indexOf(projectId);
        if (index < 0) return state;
        const openProjectIds = state.openProjectIds.filter((id) => id !== projectId);
        if (state.activeProjectId !== projectId) return { openProjectIds };
        return { openProjectIds, activeProjectId: openProjectIds[Math.min(index, openProjectIds.length - 1)] ?? null };
      }),
      reconcileProjects: (availableProjectIds, fallbackProjectId) => set((state) => {
        const available = new Set(availableProjectIds);
        const openProjectIds = state.openProjectIds.filter((id) => available.has(id));
        const fallback = fallbackProjectId && available.has(fallbackProjectId) ? fallbackProjectId : null;
        if (openProjectIds.length === 0 && fallback) openProjectIds.push(fallback);
        const activeProjectId = state.activeProjectId && openProjectIds.includes(state.activeProjectId)
          ? state.activeProjectId
          : (openProjectIds[0] ?? null);
        if (sameIds(openProjectIds, state.openProjectIds) && activeProjectId === state.activeProjectId) return state;
        return { openProjectIds, activeProjectId };
      }),
    }),
    {
      name: PREVIEW_HUB_STORAGE_KEY,
      partialize: (state) => ({ openProjectIds: state.openProjectIds, activeProjectId: state.activeProjectId }),
      merge: (persisted, current) => {
        const raw = persisted as { openProjectIds?: unknown; activeProjectId?: unknown } | undefined;
        const openProjectIds = validIds(raw?.openProjectIds);
        const activeProjectId = typeof raw?.activeProjectId === "string" && openProjectIds.includes(raw.activeProjectId) ? raw.activeProjectId : (openProjectIds[0] ?? null);
        return { ...current, openProjectIds, activeProjectId };
      },
    },
  ),
);
