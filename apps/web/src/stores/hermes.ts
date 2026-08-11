import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hermesSurfaces, hermesUiModes, normalizeHermesUiMode, type HermesSurface, type HermesUiMode } from "../lib/hermesPresentation";

const DEFAULT_HERMES_PATH = "/chat";

export type { HermesSurface } from "../lib/hermesPresentation";
export type { HermesUiMode } from "../lib/hermesPresentation";

/** Einheitliche Validierung für den Admin-Pfad: „.." darf nirgends im Pfad
 *  vorkommen, egal ob als Segment oder als Teil eines Namens (F04-12). */
function normalizeAdminPath(value: string): string {
  if (!value.startsWith("/") || value.includes("..")) return DEFAULT_HERMES_PATH;
  return value === "/" ? DEFAULT_HERMES_PATH : value;
}

interface HermesStore {
  sidebarCollapsed: boolean;
  drafts: Record<string, string>;
  activeSessions: Record<string, string | null>;
  adminPath: string;
  surface: HermesSurface;
  uiMode: HermesUiMode;
  setSidebarCollapsed(value: boolean): void;
  setDraft(instanceId: string, value: string): void;
  setActiveSession(instanceId: string, value: string | null): void;
  setAdminPath(value: string): void;
  setSurface(value: HermesSurface): void;
  setUiMode(value: HermesUiMode): void;
}

export const useHermesStore = create<HermesStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      drafts: {},
      activeSessions: {},
      adminPath: DEFAULT_HERMES_PATH,
      surface: "chat",
      uiMode: "native",
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setDraft: (instanceId, value) => set((state) => ({ drafts: { ...state.drafts, [instanceId]: value } })),
      setActiveSession: (instanceId, value) => set((state) => ({ activeSessions: { ...state.activeSessions, [instanceId]: value } })),
      setAdminPath: (value) => set({ adminPath: normalizeAdminPath(value) }),
      setSurface: (surface) => set({ surface }),
      setUiMode: (uiMode) => set({ uiMode }),
    }),
    {
      name: "remote-workplace.hermes.v1",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, drafts: state.drafts, activeSessions: state.activeSessions, adminPath: state.adminPath, surface: state.surface, uiMode: state.uiMode }),
      // Der alte, separate localStorage-Schlüssel ist überflüssig — der Pfad
      // lebt nur noch im Persist-Envelope (F04-12). Übriggebliebene Werte
      // werden beim Start entfernt.
      onRehydrateStorage: () => () => {
        try { window.localStorage.removeItem("workbench:hermes:admin-path"); } catch { /* Lokale Speicherung kann blockiert sein. */ }
      },
      merge: (persisted, current) => {
        const raw = persisted as Partial<HermesStore> | undefined;
        if (!raw) return current;
        return {
          ...current,
          ...(typeof raw.sidebarCollapsed === "boolean" ? { sidebarCollapsed: raw.sidebarCollapsed } : {}),
          ...(raw.drafts && typeof raw.drafts === "object" ? { drafts: raw.drafts } : {}),
          ...(raw.activeSessions && typeof raw.activeSessions === "object" ? { activeSessions: raw.activeSessions } : {}),
          ...(typeof raw.adminPath === "string" ? { adminPath: normalizeAdminPath(raw.adminPath) } : {}),
          ...(raw.surface && hermesSurfaces.includes(raw.surface) ? { surface: raw.surface } : {}),
          ...(raw.uiMode && hermesUiModes.includes(raw.uiMode) ? { uiMode: normalizeHermesUiMode(raw.uiMode) } : {}),
        };
      },
    },
  ),
);
