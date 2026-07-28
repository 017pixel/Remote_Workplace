import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OrbitToolType = "terminal" | "t3-code" | "preview" | "browser" | "code-server" | "codex" | "opencode";
export type OrbitBlockType = "note" | "todo" | "snippet" | "frame" | "usage-codex" | "usage-opencode" | "usage-claude";
export type OrbitGalleryType = "gallery-media" | "gallery-files";
export type OrbitPreviewType = "layout-1" | "layout-2" | "layout-3" | "layout-6";
export type OrbitPaletteItem =
  | `tool:${OrbitToolType}`
  | `preview:${OrbitPreviewType}`
  | `block:${OrbitBlockType}`
  | `gallery:${OrbitGalleryType}`;

export type SidebarSectionKey = "workspace" | "orbit-projects" | "tools" | "previews" | "gallery" | "blocks" | "footer";

export type PageRouteId =
  | "dashboard" | "workbench" | "tech-tldrs" | "projects"
  | "t3-code" | "codex" | "opencode" | "code-editor" | "previews" | "browser" | "terminal" | "gallery"
  | "usage" | "settings";

const allOrbitPaletteItems: OrbitPaletteItem[] = [
  "tool:terminal", "tool:t3-code", "tool:preview", "tool:browser", "tool:code-server", "tool:codex", "tool:opencode",
  "preview:layout-1", "preview:layout-2", "preview:layout-3", "preview:layout-6",
  "gallery:gallery-media", "gallery:gallery-files",
  "block:note", "block:todo", "block:snippet", "block:frame",
  "block:usage-codex", "block:usage-opencode", "block:usage-claude",
];

const allPageRoutes: PageRouteId[] = [
  "dashboard", "workbench", "tech-tldrs", "projects",
  "t3-code", "codex", "opencode", "code-editor", "previews", "browser", "terminal", "gallery",
  "usage", "settings",
];

interface SidebarPreferencesState {
  collapsedSections: Record<SidebarSectionKey, boolean>;
  hiddenOrbitItems: Set<string>;
  hiddenPages: Set<string>;
  toggleSection: (section: SidebarSectionKey) => void;
  toggleOrbitItem: (item: OrbitPaletteItem) => void;
  togglePage: (page: PageRouteId) => void;
  isOrbitItemVisible: (item: OrbitPaletteItem) => boolean;
  isPageVisible: (page: PageRouteId) => boolean;
}

const STORAGE_KEY = "remote-workplace.sidebar-preferences.v1";

// Ohne die Einstellungen käme man an die Sichtbarkeits-Schalter nicht mehr heran.
// Diese Seite bleibt deshalb immer erreichbar, egal was im Speicher steht.
const ALWAYS_VISIBLE_PAGES: ReadonlySet<PageRouteId> = new Set<PageRouteId>(["settings"]);

const persistedHiddenOrbitItems = (raw: string[] | undefined): Set<string> => new Set(raw ?? []);
// Ein alter Speicherstand könnte die Einstellungen ausgeblendet haben — hier wieder einsammeln.
const persistedHiddenPages = (raw: string[] | undefined): Set<string> =>
  new Set((raw ?? []).filter((page) => !ALWAYS_VISIBLE_PAGES.has(page as PageRouteId)));

export const useSidebarPreferences = create<SidebarPreferencesState>()(
  persist(
    (set, get) => ({
      collapsedSections: {
        workspace: false,
        "orbit-projects": false,
        tools: false,
        previews: false,
        gallery: false,
        blocks: false,
        footer: false,
      },
      hiddenOrbitItems: new Set<string>(),
      hiddenPages: new Set<string>(),
      toggleSection: (section) => set((state) => ({
        collapsedSections: { ...state.collapsedSections, [section]: !state.collapsedSections[section] },
      })),
      toggleOrbitItem: (item) => set((state) => {
        const next = new Set(state.hiddenOrbitItems);
        if (next.has(item)) next.delete(item); else next.add(item);
        return { hiddenOrbitItems: next };
      }),
      togglePage: (page) => set((state) => {
        if (ALWAYS_VISIBLE_PAGES.has(page)) return state;
        const next = new Set(state.hiddenPages);
        if (next.has(page)) next.delete(page); else next.add(page);
        return { hiddenPages: next };
      }),
      isOrbitItemVisible: (item) => !get().hiddenOrbitItems.has(item),
      isPageVisible: (page) => ALWAYS_VISIBLE_PAGES.has(page) || !get().hiddenPages.has(page),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        collapsedSections: state.collapsedSections,
        hiddenOrbitItems: [...state.hiddenOrbitItems],
        hiddenPages: [...state.hiddenPages],
      }),
      merge: (persisted, current) => {
        const raw = persisted as Partial<{ collapsedSections: Record<SidebarSectionKey, boolean>; hiddenOrbitItems: string[]; hiddenPages: string[] }> | undefined;
        return {
          ...current,
          collapsedSections: { ...current.collapsedSections, ...(raw?.collapsedSections ?? {}) },
          hiddenOrbitItems: persistedHiddenOrbitItems(raw?.hiddenOrbitItems),
          hiddenPages: persistedHiddenPages(raw?.hiddenPages),
        };
      },
    },
  ),
);

/**
 * Reine Variante von `isPageVisible`. Die Store-Methode ist über Renders hinweg
 * dieselbe Funktion — ein `useMemo` mit ihr als Abhängigkeit würde bei geänderter
 * Sichtbarkeit nie neu rechnen. Hier hängt das Ergebnis sichtbar am Set.
 */
export function isPageVisibleIn(hiddenPages: ReadonlySet<string>, page: PageRouteId): boolean {
  return ALWAYS_VISIBLE_PAGES.has(page) || !hiddenPages.has(page);
}

export { allOrbitPaletteItems, allPageRoutes };
