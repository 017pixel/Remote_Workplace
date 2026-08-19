import { create } from "zustand";
import { persist } from "zustand/middleware";
import { allPageRoutes, type PageRouteId } from "./sidebarPreferences";

/**
 * Welche Seite beim Öffnen der Workbench (Root-Pfad "/") geladen wird.
 * Das Dashboard bleibt der Default; alle registrierten Hauptseiten sind wählbar.
 */
const DEFAULT_PAGE: PageRouteId = "dashboard";

function isPageRouteId(value: unknown): value is PageRouteId {
  return (
    typeof value === "string" &&
    (allPageRoutes as readonly string[]).includes(value)
  );
}

interface AppPreferencesState {
  defaultPage: PageRouteId;
  setDefaultPage: (page: PageRouteId) => void;
}

const STORAGE_KEY = "wrapt.app-preferences.v1";
const PERSIST_VERSION = 1;

export const useAppPreferences = create<AppPreferencesState>()(
  persist(
    (set) => ({
      defaultPage: DEFAULT_PAGE,
      setDefaultPage: (page) => set({ defaultPage: page }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ defaultPage: state.defaultPage }),
      version: PERSIST_VERSION,
      merge: (persisted, current) => {
        const raw = persisted as Partial<{ defaultPage: unknown }> | undefined;
        return {
          ...current,
          defaultPage: isPageRouteId(raw?.defaultPage)
            ? raw.defaultPage
            : DEFAULT_PAGE,
        };
      },
    },
  ),
);
