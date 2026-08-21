import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { TerminalKind, TerminalWorkspaceOperation, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { applyWorkspaceOperations, createTerminalOps, layoutRuntimeIds, openEntryOps, paneForRuntime, sanitizeWorkspaceDocument } from "../components/terminal/workspace/terminalWorkspaceModel";
import { generateId } from "../lib/id";

export const CLI_INSTANCE_LIMITS: Record<"codex" | "opencode" | "claude", number> = {
  codex: 12,
  opencode: 12,
  claude: 4,
};
export const TERMINAL_STORAGE_KEY = "wrapt.terminals.v1";

/** Kompatibilitäts-Sicht auf eine Terminalfläche (für Presence, Picker,
 *  Standalone-Aktionen): Der aktive Tab ist die fokussierte Runtime-ID. */
export interface TerminalAreaView {
  activeTabId: string | null;
  tabs: Array<{ id: string; projectId: string | null; kind: TerminalKind; initialCwd: string | null }>;
}

interface TerminalWorkspaceStore {
  document: TerminalWorkspaceV2 | null;
  revision: number;
  hydrated: boolean;
  dirty: boolean;
  saving: boolean;
  syncError: string | null;
  /** Noch nicht vom Server bestätigte Operationen (Offline-Puffer). */
  pendingOps: TerminalWorkspaceOperation[];
  runtimeCwds: Record<string, string>;
  initializeRemote(document: TerminalWorkspaceV2, revision: number, pendingOps: TerminalWorkspaceOperation[]): void;
  applyRemote(document: TerminalWorkspaceV2, revision: number): void;
  replaceRemote(document: TerminalWorkspaceV2, revision: number): void;
  rebaseRemote(document: TerminalWorkspaceV2, revision: number, pendingOps: TerminalWorkspaceOperation[]): void;
  reconcileSaved(document: TerminalWorkspaceV2, revision: number, savedOps: TerminalWorkspaceOperation[]): void;
  markSaved(revision: number): void;
  markSaving(saving: boolean): void;
  markSyncError(message: string | null): void;
  /** Wendet lokale Ops optimistisch an und stellt sie in die Warteschlange. */
  queueOps(ops: TerminalWorkspaceOperation[]): void;
  setRuntimeCwd(runtimeId: string, cwd: string): void;
  // Kompatibilitäts-API für AppShell, Dashboard, wraptActions
  addTab(areaId: string, projectId?: string | null, kind?: TerminalKind): string | null;
  activateProject(areaId: string, projectId: string, kind: TerminalKind): string | null;
}

function kindLabel(kind: TerminalKind): string {
  return kind === "codex" ? "Codex" : kind === "opencode" ? "OpenCode" : kind === "claude" ? "Claude Code" : "Terminal";
}

const EMPTY_TERMINAL_AREA_VIEW: TerminalAreaView = { activeTabId: null, tabs: [] };

/**
 * Sicht einer Fläche: aktive Runtime + alle Entries mit Runtime.
 *
 * Referenzstabil pro Dokument: Der Store ersetzt `document` bei jeder Änderung
 * durch ein neues Objekt, deshalb reicht eine WeakMap-Memoization. Ohne sie
 * würde jeder Selektor-Aufruf neue Objekte/Arrays erzeugen und Reacts
 * useSyncExternalStore in eine Endlos-Render-Schleife treiben (Fehler #185).
 */
const terminalAreaViewCache = new WeakMap<TerminalWorkspaceV2, Map<string, TerminalAreaView>>();

export function terminalAreaView(state: { document: TerminalWorkspaceV2 | null }, areaId: string): TerminalAreaView {
  const document = state.document;
  if (!document) return EMPTY_TERMINAL_AREA_VIEW;
  let documentCache = terminalAreaViewCache.get(document);
  if (!documentCache) {
    documentCache = new Map();
    terminalAreaViewCache.set(document, documentCache);
  }
  const cached = documentCache.get(areaId);
  if (cached) return cached;
  const layout = document.areaLayouts[areaId]?.paneLayout ?? null;
  const activePaneId = document.areaLayouts[areaId]?.focusedPaneId ?? null;
  const activeRuntimeId = layout && activePaneId
    ? layout.type === "pane" ? layout.runtimeId : layout.children.find((pane) => pane.id === activePaneId)?.runtimeId ?? layout.children[0]!.runtimeId
    : layout ? layoutRuntimeIds(layout)[0] ?? null : null;
  const view: TerminalAreaView = {
    activeTabId: activeRuntimeId,
    tabs: document.entries
      .filter((entry) => entry.runtimeId !== null)
      .map((entry) => ({ id: entry.runtimeId!, projectId: entry.projectId, kind: entry.kind, initialCwd: entry.initialCwd })),
  };
  documentCache.set(areaId, view);
  return view;
}

export const useTerminalWorkspaceStore = create<TerminalWorkspaceStore>()((set, get) => ({
  document: null,
  revision: 0,
  hydrated: false,
  dirty: false,
  saving: false,
  syncError: null,
  pendingOps: [],
  runtimeCwds: {},
  initializeRemote: (document, revision, pendingOps) => {
    const clean = sanitizeWorkspaceDocument(document);
    const rebased = pendingOps.length > 0 ? applyWorkspaceOperations(clean, pendingOps) : clean;
    set({
      document: rebased,
      revision,
      hydrated: true,
      dirty: pendingOps.length > 0,
      saving: false,
      pendingOps,
      syncError: pendingOps.length > 0 ? "Nicht gespeicherte Terminal-Änderungen wurden nach dem Reload wiederhergestellt." : null,
    });
  },
  applyRemote: (document, revision) => set((state) => state.dirty || !state.hydrated
    ? state
    : { document: sanitizeWorkspaceDocument(document), revision, syncError: null }),
  replaceRemote: (document, revision) => set({
    document: sanitizeWorkspaceDocument(document),
    revision,
    hydrated: true,
    dirty: false,
    saving: false,
    pendingOps: [],
    syncError: null,
  }),
  rebaseRemote: (document, revision, pendingOps) => set({
    document: applyWorkspaceOperations(sanitizeWorkspaceDocument(document), pendingOps),
    revision,
    hydrated: true,
    dirty: pendingOps.length > 0,
    saving: false,
    pendingOps,
    syncError: null,
  }),
  reconcileSaved: (document, revision, savedOps) => set((state) => {
    const prefix = state.pendingOps.slice(0, savedOps.length);
    const savedPrefixMatches = prefix.length === savedOps.length && JSON.stringify(prefix) === JSON.stringify(savedOps);
    const remainingOps = savedPrefixMatches ? state.pendingOps.slice(savedOps.length) : state.pendingOps;
    return {
      document: applyWorkspaceOperations(sanitizeWorkspaceDocument(document), remainingOps),
      revision,
      dirty: remainingOps.length > 0,
      saving: false,
      pendingOps: remainingOps,
      syncError: null,
    };
  }),
  markSaved: (revision) => set({ revision, dirty: false, saving: false, pendingOps: [], syncError: null }),
  markSaving: (saving) => set({ saving }),
  markSyncError: (syncError) => set({ syncError, saving: false }),
  queueOps: (ops) => set((state) => {
    if (!state.document || ops.length === 0) return state;
    return {
      document: applyWorkspaceOperations(state.document, ops),
      pendingOps: [...state.pendingOps, ...ops],
      dirty: true,
      syncError: null,
    };
  }),
  setRuntimeCwd: (runtimeId, cwd) => set((state) => state.runtimeCwds[runtimeId] === cwd
    ? state
    : { runtimeCwds: { ...state.runtimeCwds, [runtimeId]: cwd } }),
  addTab: (areaId, projectId = null, kind = "shell") => {
    const state = get();
    if (!state.document) return null;
    const count = state.document.entries.filter((entry) => entry.kind === kind).length + 1;
    const { ops, runtimeId } = createTerminalOps(state.document, areaId, {
      kind,
      projectId,
      name: `${kindLabel(kind)} ${count}`,
    });
    get().queueOps(ops);
    return runtimeId;
  },
  activateProject: (areaId, projectId, kind) => {
    const state = get();
    if (!state.document) return null;
    const entry = state.document.entries.find((candidate) => candidate.projectId === projectId && candidate.kind === kind && candidate.runtimeId !== null);
    if (!entry) return null;
    const current = state.document.areaLayouts[areaId];
    const alreadyFocused = current?.focusedPaneId !== null && current?.paneLayout
      && (current.paneLayout.type === "pane"
        ? current.paneLayout.runtimeId === entry.runtimeId
        : current.paneLayout.children.some((pane) => pane.runtimeId === entry.runtimeId && pane.id === current.focusedPaneId));
    if (alreadyFocused) return entry.runtimeId;
    get().queueOps(openEntryOps(state.document, areaId, entry.runtimeId!));
    return entry.runtimeId;
  },
}));

// ---------------------------------------------------------------------------
// Kompatibilitäts-Selectors für bestehende Konsumenten
// ---------------------------------------------------------------------------

export function useTerminalAreaView(areaId: string): TerminalAreaView {
  return useTerminalWorkspaceStore(useShallow((state) => terminalAreaView(state, areaId)));
}

/** Runtime-ID der fokussierten Entry einer Fläche (für Presence & Picker). */
export function useTerminalFocusedRuntime(areaId: string): string | null {
  return useTerminalWorkspaceStore((state) => {
    const layout = state.document?.areaLayouts[areaId]?.paneLayout ?? null;
    const focusedPaneId = state.document?.areaLayouts[areaId]?.focusedPaneId ?? null;
    if (!layout) return null;
    if (layout.type === "pane") return layout.runtimeId;
    const pane = layout.children.find((candidate) => candidate.id === focusedPaneId) ?? layout.children[0]!;
    return pane.runtimeId;
  });
}

/** Erzeugt eine neue Runtime-ID für ein noch nicht gestartetes Terminal. */
export function newRuntimeId(): string {
  return generateId();
}

export { paneForRuntime };