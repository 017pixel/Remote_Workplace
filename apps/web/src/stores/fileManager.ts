import { create } from "zustand";
import type { FileManagerState, FilesystemEntry } from "@workbench/contracts";

export const FILE_MANAGER_STORAGE_KEY = "workbench.file-manager.pending.v1";

export interface FileManagerUiState {
  expanded: ReadonlySet<string>;
  selectedPath: string | null;
  previewOpen: boolean;
  previewPath: string | null;
  treeOpen: boolean;
  detailOpen: boolean;
  searchQuery: string;
}

interface FileManagerStore extends FileManagerState {
  hydrated: boolean;
  revision: number;
  dirty: boolean;
  saving: boolean;
  syncError: string | null;
  root: string | null;
  entries: FilesystemEntry[];
  entriesLoading: boolean;
  entriesError: string | null;
  ui: FileManagerUiState;
  initializeRemote(document: FileManagerState, revision: number): void;
  restoreDraft(document: FileManagerState, revision: number): void;
  applyRemote(document: FileManagerState, revision: number): void;
  replaceRemote(document: FileManagerState, revision: number): void;
  resolveConflict(revision: number): void;
  markSaved(revision: number, unchanged: boolean): void;
  markSaving(saving: boolean): void;
  markSyncError(message: string | null): void;
  setRoot(root: string): void;
  setEntries(entries: FilesystemEntry[], loading: boolean, error: string | null): void;
  navigateTo(path: string, pushHistory: boolean): void;
  goBack(): void;
  toggleFavorite(path: string): void;
  replacePath(oldPath: string, nextPath: string): void;
  removePath(path: string): void;
  setViewMode(viewMode: FileManagerState["viewMode"]): void;
  setSort(sortKey: FileManagerState["sortKey"], sortDirection: FileManagerState["sortDirection"]): void;
  setExpanded(path: string, expanded: boolean): void;
  select(path: string | null): void;
  setPreview(open: boolean, path?: string | null): void;
  setTreeOpen(open: boolean): void;
  setDetailOpen(open: boolean): void;
  setSearchQuery(query: string): void;
}

function freshDocument(): FileManagerState {
  return { currentPath: "", history: [], favorites: [], viewMode: "list", sortKey: "name", sortDirection: "asc" };
}

function pushHistory(history: string[], path: string): string[] {
  if (!path) return history;
  const next = [path, ...history.filter((item) => item !== path)].slice(0, 30);
  return next;
}

function normalizeHistory(currentPath: string, history: string[]): string[] {
  // Bis Version 1.1 wurde der aktuelle Pfad selbst als MRU-Eintrag gespeichert.
  // Dieser Zustand ist nicht eindeutig rückwärts navigierbar. Einmalig mit einer
  // leeren Historie zu starten verhindert Sprünge in alte, fremde Pfade.
  if (history.includes(currentPath)) return [];
  return history.filter((path) => path !== currentPath);
}

function rewritePath(path: string, oldPath: string, nextPath: string): string {
  return path === oldPath || path.startsWith(`${oldPath}/`)
    ? `${nextPath}${path.slice(oldPath.length)}`
    : path;
}

function isSameOrChild(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}

export const useFileManagerStore = create<FileManagerStore>()((set) => ({
  ...freshDocument(),
  hydrated: false,
  revision: 0,
  dirty: false,
  saving: false,
  syncError: null,
  root: null,
  entries: [],
  entriesLoading: true,
  entriesError: null,
  ui: {
    expanded: new Set(),
    selectedPath: null,
    previewOpen: false,
    previewPath: null,
    treeOpen: false,
    detailOpen: false,
    searchQuery: "",
  },
  initializeRemote: (document, revision) => set((state) => {
    const hasLocal = state.revision !== 0 || state.currentPath !== "";
    const useLocal = revision === 0 && hasLocal;
    return {
      currentPath: useLocal ? state.currentPath : document.currentPath,
      history: useLocal ? state.history : normalizeHistory(document.currentPath, document.history),
      favorites: useLocal ? state.favorites : document.favorites,
      viewMode: useLocal ? state.viewMode : document.viewMode,
      sortKey: useLocal ? state.sortKey : document.sortKey,
      sortDirection: useLocal ? state.sortDirection : document.sortDirection,
      hydrated: true,
      revision,
      dirty: useLocal,
      syncError: null,
    };
  }),
  restoreDraft: (document, revision) => set({
    currentPath: document.currentPath,
    history: normalizeHistory(document.currentPath, document.history),
    favorites: document.favorites,
    viewMode: document.viewMode,
    sortKey: document.sortKey,
    sortDirection: document.sortDirection,
    hydrated: true,
    revision,
    dirty: true,
    saving: false,
    syncError: "Ein nicht gespeicherter Dateimanager-Zustand wurde nach dem Reload wiederhergestellt.",
  }),
  applyRemote: (document, revision) => set((state) => state.dirty
    ? state
    : {
        currentPath: document.currentPath,
        history: normalizeHistory(document.currentPath, document.history),
        favorites: document.favorites,
        viewMode: document.viewMode,
        sortKey: document.sortKey,
        sortDirection: document.sortDirection,
        revision,
        hydrated: true,
        syncError: null,
      }),
  replaceRemote: (document, revision) => set({
    currentPath: document.currentPath,
    history: normalizeHistory(document.currentPath, document.history),
    favorites: document.favorites,
    viewMode: document.viewMode,
    sortKey: document.sortKey,
    sortDirection: document.sortDirection,
    revision,
    hydrated: true,
    dirty: false,
    saving: false,
    syncError: null,
  }),
  resolveConflict: (revision) => set({
    revision,
    hydrated: true,
    dirty: true,
    saving: false,
    syncError: "Der Dateimanager-Zustand wurde parallel geändert. Dein lokaler Stand bleibt erhalten und wird nach der nächsten Änderung erneut gespeichert.",
  }),
  markSaved: (revision, unchanged) => set((state) => ({ revision, dirty: unchanged ? false : state.dirty, saving: false, syncError: null })),
  markSaving: (saving) => set({ saving }),
  markSyncError: (syncError) => set({ syncError, saving: false }),
  setRoot: (root) => set({ root }),
  setEntries: (entries, loading, error) => set({ entries, entriesLoading: loading, entriesError: error }),
  navigateTo: (path, pushHistoryEntry) => set((state) => ({
    currentPath: path,
    history: pushHistoryEntry && path !== state.currentPath ? pushHistory(state.history, state.currentPath) : state.history,
    dirty: true,
  })),
  goBack: () => set((state) => {
    const previous = state.history.find((path) => path !== state.currentPath);
    if (!previous) return state;
    const index = state.history.indexOf(previous);
    return {
      currentPath: previous,
      history: state.history.slice(index + 1),
      dirty: true,
    };
  }),
  toggleFavorite: (path) => set((state) => {
    const favorites = state.favorites.includes(path)
      ? state.favorites.filter((item) => item !== path)
      : [path, ...state.favorites].slice(0, 50);
    return { favorites, dirty: true };
  }),
  replacePath: (oldPath, nextPath) => set((state) => ({
    currentPath: rewritePath(state.currentPath, oldPath, nextPath),
    history: state.history.map((path) => rewritePath(path, oldPath, nextPath)),
    favorites: state.favorites.map((path) => rewritePath(path, oldPath, nextPath)),
    ui: {
      ...state.ui,
      selectedPath: state.ui.selectedPath ? rewritePath(state.ui.selectedPath, oldPath, nextPath) : null,
      previewPath: state.ui.previewPath ? rewritePath(state.ui.previewPath, oldPath, nextPath) : null,
    },
    dirty: true,
  })),
  removePath: (path) => set((state) => ({
    history: state.history.filter((item) => !isSameOrChild(item, path)),
    favorites: state.favorites.filter((item) => !isSameOrChild(item, path)),
    ui: {
      ...state.ui,
      selectedPath: state.ui.selectedPath && isSameOrChild(state.ui.selectedPath, path) ? null : state.ui.selectedPath,
      previewPath: state.ui.previewPath && isSameOrChild(state.ui.previewPath, path) ? null : state.ui.previewPath,
      previewOpen: state.ui.previewPath && isSameOrChild(state.ui.previewPath, path) ? false : state.ui.previewOpen,
      detailOpen: state.ui.selectedPath && isSameOrChild(state.ui.selectedPath, path) ? false : state.ui.detailOpen,
    },
    dirty: true,
  })),
  setViewMode: (viewMode) => set({ viewMode, dirty: true }),
  setSort: (sortKey, sortDirection) => set({ sortKey, sortDirection, dirty: true }),
  setExpanded: (path, expanded) => set((state) => {
    const next = new Set(state.ui.expanded);
    if (expanded) next.add(path);
    else next.delete(path);
    return { ui: { ...state.ui, expanded: next } };
  }),
  select: (selectedPath) => set((state) => ({ ui: { ...state.ui, selectedPath } })),
  setPreview: (previewOpen, previewPath = null) => set((state) => ({
    ui: { ...state.ui, previewOpen, previewPath: previewOpen ? (previewPath ?? state.ui.previewPath) : state.ui.previewPath },
  })),
  setTreeOpen: (treeOpen) => set((state) => ({ ui: { ...state.ui, treeOpen } })),
  setDetailOpen: (detailOpen) => set((state) => ({ ui: { ...state.ui, detailOpen } })),
  setSearchQuery: (searchQuery) => set((state) => ({ ui: { ...state.ui, searchQuery } })),
}));

export function documentFromStore(store: Pick<FileManagerStore, "currentPath" | "history" | "favorites" | "viewMode" | "sortKey" | "sortDirection">): FileManagerState {
  return {
    currentPath: store.currentPath,
    history: store.history,
    favorites: store.favorites,
    viewMode: store.viewMode,
    sortKey: store.sortKey,
    sortDirection: store.sortDirection,
  };
}

export function useFileManagerDocumentSnapshot(): FileManagerState {
  const state = useFileManagerStore.getState();
  return documentFromStore(state);
}
