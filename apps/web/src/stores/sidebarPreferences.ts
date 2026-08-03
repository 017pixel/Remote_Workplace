import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OrbitToolType = "terminal" | "t3-code" | "preview" | "browser" | "code-server" | "codex" | "opencode" | "files" | "hermes";
export type OrbitBlockType = "note" | "todo" | "snippet" | "frame" | "usage-codex" | "usage-opencode" | "usage-claude";
export type OrbitPreviewType = "layout-1" | "layout-2" | "layout-3" | "layout-6";
export type OrbitPaletteItem =
  | `tool:${OrbitToolType}`
  | `preview:${OrbitPreviewType}`
  | `block:${OrbitBlockType}`;

export type SidebarSectionKey = "workspace" | "orbit-projects" | "tools" | "previews" | "blocks" | "footer";

export type PageRouteId =
  | "dashboard" | "inbox" | "workbench" | "tech-tldrs" | "projects"
  | "t3-code" | "hermes-agent" | "codex" | "opencode" | "claude" | "code-editor" | "previews" | "browser" | "terminal" | "files" | "ki-skills"
  | "usage" | "settings";

const allOrbitPaletteItems: OrbitPaletteItem[] = [
  "tool:terminal", "tool:t3-code", "tool:preview", "tool:browser", "tool:code-server", "tool:codex", "tool:opencode", "tool:files", "tool:hermes",
  "preview:layout-1", "preview:layout-2", "preview:layout-3", "preview:layout-6",
  "block:note", "block:todo", "block:snippet", "block:frame",
  "block:usage-codex", "block:usage-opencode", "block:usage-claude",
];

const allPageRoutes: PageRouteId[] = [
  "dashboard", "inbox", "workbench", "tech-tldrs", "projects",
  "t3-code", "hermes-agent", "codex", "opencode", "claude", "code-editor", "previews", "browser", "terminal", "files", "ki-skills",
  "usage", "settings",
];

interface SidebarPreferencesState {
  collapsedSections: Record<SidebarSectionKey, boolean>;
  hiddenOrbitItems: Set<string>;
  hiddenPages: Set<string>;
  explicitlyVisibleDefaultPages: Set<string>;
  toggleSection: (section: SidebarSectionKey) => void;
  toggleOrbitItem: (item: OrbitPaletteItem) => void;
  togglePage: (page: PageRouteId) => void;
  isOrbitItemVisible: (item: OrbitPaletteItem) => boolean;
  isPageVisible: (page: PageRouteId) => boolean;
}

const STORAGE_KEY = "remote-workplace.sidebar-preferences.v1";
const PERSIST_VERSION = 2;
const DEFAULT_COLLAPSED_SECTIONS: Record<SidebarSectionKey, boolean> = {
  workspace: false,
  "orbit-projects": false,
  tools: false,
  previews: false,
  blocks: false,
  footer: false,
};

// CLI-Flächen, die normalerweise über T3 Code geöffnet werden. Sie bleiben
// erreichbar und können in den Einstellungen jederzeit wieder eingeblendet werden.
const DEFAULT_HIDDEN_PAGES: ReadonlySet<PageRouteId> = new Set<PageRouteId>(["codex", "opencode", "claude"]);

// Ohne die Einstellungen käme man an die Sichtbarkeits-Schalter nicht mehr heran.
// Diese Seite bleibt deshalb immer erreichbar, egal was im Speicher steht.
const ALWAYS_VISIBLE_PAGES: ReadonlySet<PageRouteId> = new Set<PageRouteId>(["settings"]);

const persistedHiddenOrbitItems = (raw: string[] | undefined): Set<string> => new Set(raw ?? []);
// Ein alter Speicherstand könnte die Einstellungen ausgeblendet haben — hier wieder einsammeln.
const persistedHiddenPages = (raw: string[] | undefined): Set<string> =>
  new Set((raw ?? []).filter((page) => !ALWAYS_VISIBLE_PAGES.has(page as PageRouteId)));

const defaultHiddenPages = (): Set<string> => new Set(DEFAULT_HIDDEN_PAGES);

function mergedHiddenPages(raw: { hiddenPages?: string[]; explicitlyVisibleDefaultPages?: string[] } | undefined): Set<string> {
  const hidden = persistedHiddenPages(raw?.hiddenPages);
  const explicitlyVisible = new Set((raw?.explicitlyVisibleDefaultPages ?? []).filter((page) => DEFAULT_HIDDEN_PAGES.has(page as PageRouteId)));
  if (raw?.explicitlyVisibleDefaultPages === undefined) {
    for (const page of DEFAULT_HIDDEN_PAGES) hidden.add(page);
  } else {
    for (const page of explicitlyVisible) hidden.delete(page);
    for (const page of DEFAULT_HIDDEN_PAGES) {
      if (!explicitlyVisible.has(page)) hidden.add(page);
    }
  }
  return hidden;
}

export const useSidebarPreferences = create<SidebarPreferencesState>()(
  persist(
    (set, get) => ({
      collapsedSections: { ...DEFAULT_COLLAPSED_SECTIONS },
      hiddenOrbitItems: new Set<string>(),
      hiddenPages: defaultHiddenPages(),
      explicitlyVisibleDefaultPages: new Set<string>(),
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
        const explicitlyVisible = new Set(state.explicitlyVisibleDefaultPages);
        if (next.has(page)) {
          next.delete(page);
          if (DEFAULT_HIDDEN_PAGES.has(page)) explicitlyVisible.add(page);
        } else {
          next.add(page);
          explicitlyVisible.delete(page);
        }
        return { hiddenPages: next, explicitlyVisibleDefaultPages: explicitlyVisible };
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
        explicitlyVisibleDefaultPages: [...state.explicitlyVisibleDefaultPages],
      }),
      version: PERSIST_VERSION,
      migrate: (persisted) => {
        // Vor Version 2 gab es noch keine explizite Kennzeichnung, dass ein
        // standardmäßig ausgeblendeter Eintrag bewusst eingeblendet wurde.
        // Die alten Auswahlwerte bleiben erhalten, die neuen Defaults greifen
        // einmalig für bestehende Browserstände.
        const raw = persisted as Partial<{ collapsedSections: Record<SidebarSectionKey, boolean>; hiddenOrbitItems: string[]; hiddenPages: string[] }> | undefined;
        return {
          collapsedSections: { ...DEFAULT_COLLAPSED_SECTIONS, ...(raw?.collapsedSections ?? {}) },
          hiddenOrbitItems: raw?.hiddenOrbitItems ?? [],
          hiddenPages: raw?.hiddenPages ?? [],
          explicitlyVisibleDefaultPages: [],
        };
      },
      merge: (persisted, current) => {
        const raw = persisted as Partial<{ collapsedSections: Record<SidebarSectionKey, boolean>; hiddenOrbitItems: string[]; hiddenPages: string[]; explicitlyVisibleDefaultPages: string[] }> | undefined;
        return {
          ...current,
          collapsedSections: { ...current.collapsedSections, ...(raw?.collapsedSections ?? {}) },
          hiddenOrbitItems: persistedHiddenOrbitItems(raw?.hiddenOrbitItems),
          hiddenPages: mergedHiddenPages(raw),
          explicitlyVisibleDefaultPages: new Set(raw?.explicitlyVisibleDefaultPages ?? []),
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

export function isOrbitItemVisibleIn(hiddenOrbitItems: ReadonlySet<string>, item: OrbitPaletteItem): boolean {
  return !hiddenOrbitItems.has(item);
}

export { allOrbitPaletteItems, allPageRoutes };
