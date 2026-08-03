import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FilesystemEntry, Project, ProjectsResponse } from "@workbench/contracts";
import { WORKBENCH_LIMITS } from "@workbench/contracts";
import {
  ArrowLeftIcon, BookmarkIcon, ChevronRightIcon, CloseIcon, ColumnsIcon, DownloadIcon,
  CodeFileIcon, EditIcon, FileIcon, FolderCodeIcon, FolderIcon, FolderOpenIcon, FolderSearchIcon, FolderTreeIcon,
  GridIcon, ListIcon, MoreIcon, PlusIcon, RefreshIcon, SearchIcon, TerminalIcon, TrashIcon, UploadIcon, WarningIcon,
} from "../icons";
import { apiClient } from "../../lib/apiClient";
import { requestOrbitNode } from "../../lib/orbitPalette";
import { breadcrumbsFor, formatBytes, formatDate, parentPath, previewKindOf, sortEntries } from "../../lib/fileManager";
import { useFileManagerStore } from "../../stores/fileManager";
import { useWorkspaceStore } from "../../stores/workspace";
import { useResponsiveShell } from "../../lib/useResponsiveShell";
import { usePaneWidth } from "../../lib/usePaneWidth";
import { ConfirmDialog, PromptDialog } from "../ModalDialog";
import { FmTree } from "./FmTree";
import { FilePreview, QuickLook } from "./QuickLook";
import { workbenchQueries } from "../../lib/queryOptions";
import { useRouteActivity } from "../../lib/routeActivity";

interface FmContextMenuState {
  x: number;
  y: number;
  entry: FilesystemEntry;
}

function projectForPath(projects: Project[] | undefined, path: string): Project | null {
  let best: Project | null = null;
  for (const project of projects ?? []) {
    if (project.availability !== "available") continue;
    if (path === project.path || path.startsWith(`${project.path}/`)) {
      if (!best || project.path.length > best.path.length) best = project;
    }
  }
  return best;
}

export function FileManagerPanel({ minimal = false, externalSync = false }: { minimal?: boolean; externalSync?: boolean }) {
  const responsive = useResponsiveShell();
  const routeActive = useRouteActivity();
  const queryClient = useQueryClient();
  const root = useFileManagerStore((state) => state.root);
  const currentPath = useFileManagerStore((state) => state.currentPath);
  const history = useFileManagerStore((state) => state.history);
  const favorites = useFileManagerStore((state) => state.favorites);
  const viewMode = useFileManagerStore((state) => state.viewMode);
  const sortKey = useFileManagerStore((state) => state.sortKey);
  const sortDirection = useFileManagerStore((state) => state.sortDirection);
  const syncError = useFileManagerStore((state) => state.syncError);
  const ui = useFileManagerStore((state) => state.ui);
  const navigateTo = useFileManagerStore((state) => state.navigateTo);
  const goBack = useFileManagerStore((state) => state.goBack);
  const replacePath = useFileManagerStore((state) => state.replacePath);
  const removePath = useFileManagerStore((state) => state.removePath);
  const select = useFileManagerStore((state) => state.select);
  const setPreview = useFileManagerStore((state) => state.setPreview);
  const setDetailOpen = useFileManagerStore((state) => state.setDetailOpen);
  const setTreeOpen = useFileManagerStore((state) => state.setTreeOpen);
  const setViewMode = useFileManagerStore((state) => state.setViewMode);
  const setSort = useFileManagerStore((state) => state.setSort);
  const toggleFavorite = useFileManagerStore((state) => state.toggleFavorite);
  const setExpanded = useFileManagerStore((state) => state.setExpanded);
  const openPanel = useWorkspaceStore((state) => state.openPanel);
  const projects = useQuery({ ...workbenchQueries.projects(), enabled: routeActive });

  const [contextMenu, setContextMenu] = useState<FmContextMenuState | null>(null);
  const tree = useQuery({
    queryKey: ["filesystem", "tree", currentPath],
    queryFn: ({ signal }) => apiClient.filesystemTreeAll(currentPath, signal),
    enabled: routeActive && Boolean(root && currentPath),
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
  const [renameTarget, setRenameTarget] = useState<FilesystemEntry | null>(null);
  const [moveTarget, setMoveTarget] = useState<FilesystemEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FilesystemEntry | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Auf dem Handy belegt die Suche keine dauerhafte Zeile, sondern fährt über
  // der Aktionsleiste ein. Auf größeren Flächen ist sie immer sichtbar.
  const [searchOpen, setSearchOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const longPressRef = useRef<{ timer: number | null; x: number; y: number; suppressClick: boolean }>({ timer: null, x: 0, y: 0, suppressClick: false });

  const isCompact = responsive.mode === "compact";
  const isTablet = responsive.mode === "tablet";
  const touch = responsive.inputMode === "touch";
  const treePane = usePaneWidth({ storageKey: "remote-workplace.files.tree-width.v1", initial: 240, min: 180, max: 420 });

  const entries = useMemo(() => sortEntries(tree.data?.entries ?? [], sortKey, sortDirection), [sortKey, sortDirection, tree.data?.entries]);
  const visibleEntries = useMemo(() => {
    const query = ui.searchQuery.trim().toLocaleLowerCase("de");
    if (!query) return entries;
    return entries.filter((entry) => entry.name.toLocaleLowerCase("de").includes(query));
  }, [entries, ui.searchQuery]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.path === ui.selectedPath) ?? null,
    [entries, ui.selectedPath],
  );
  const breadcrumbs = useMemo(() => (root ? breadcrumbsFor(root, currentPath) : []), [currentPath, root]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["filesystem", "tree"] });
  }, [queryClient]);

  // Standalone (Orbit-Node, Workbench-Panel): Wenn kein FileManagerSync
  // gemountet ist, wird der serverseitige Zustand beim ersten Rendern geladen.
  const hydrated = useFileManagerStore((state) => state.hydrated);
  const initializeRemote = useFileManagerStore((state) => state.initializeRemote);
  useEffect(() => {
    if (externalSync || hydrated) return;
    void apiClient.fileManagerState().then((response) => {
      useFileManagerStore.getState().initializeRemote(response.document, response.revision);
    }).catch(() => {
      useFileManagerStore.getState().markSyncError("Der Dateimanager-Zustand konnte nicht geladen werden.");
    });
  }, [externalSync, hydrated, initializeRemote]);

  // Beim ersten Rendern den aktuellen Pfad laden und den Root vom Server holen.
  useEffect(() => {
    if (!currentPath) return;
    if (!root) {
      void apiClient.filesystemTree(currentPath).then((response) => {
        useFileManagerStore.getState().setRoot(response.root);
      }).catch(() => {
        useFileManagerStore.getState().setEntries([], false, "Der Serverordner konnte nicht geladen werden.");
      });
      return;
    }
  }, [currentPath, root]);

  // Synchronisiert den Baum mit dem serverseitig geteilten Pfad (andere Geräte).
  useEffect(() => {
    if (root && currentPath.startsWith(`${root}/`) === false && currentPath !== root && currentPath !== "") {
      void apiClient.filesystemTree(currentPath).then((response) => {
        useFileManagerStore.getState().setRoot(response.root);
      }).catch(() => undefined);
    }
  }, [currentPath, root]);

  const goTo = useCallback((path: string, pushToHistory = true) => {
    navigateTo(path, pushToHistory);
    select(null);
    setPreview(false);
    setDetailOpen(false);
    if (isCompact || isTablet) setTreeOpen(false);
  }, [isCompact, isTablet, navigateTo, select, setDetailOpen, setPreview, setTreeOpen]);

  const openEntry = useCallback((entry: FilesystemEntry) => {
    if (entry.kind === "directory") {
      if (!entry.readable) return;
      goTo(entry.path);
      return;
    }
    select(entry.path);
    if (isCompact) setPreview(true, entry.path);
    else setDetailOpen(true);
  }, [goTo, isCompact, select, setDetailOpen, setPreview]);

  const quickLookFor = useCallback((entry: FilesystemEntry | null) => {
    if (!entry || entry.kind === "directory") return;
    select(entry.path);
    setPreview(true, entry.path);
  }, [select, setPreview]);

  const closeQuickLook = useCallback(() => setPreview(false), [setPreview]);

  const navigateQuickLook = useCallback((direction: 1 | -1) => {
    if (!ui.previewPath) return;
    const index = visibleEntries.findIndex((entry) => entry.path === ui.previewPath);
    if (index === -1) return;
    for (let next = index + direction; next >= 0 && next < visibleEntries.length; next += direction) {
      const candidate = visibleEntries[next];
      if (candidate?.kind === "file") {
        select(candidate.path);
        setPreview(true, candidate.path);
        return;
      }
    }
  }, [select, setPreview, ui.previewPath, visibleEntries]);

  const downloadEntry = useCallback((entry: FilesystemEntry) => {
    if (entry.kind !== "file") return;
    void apiClient.fileManagerDownload(entry.path).catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Download fehlgeschlagen.");
    });
  }, []);

  const openInEditor = useCallback((entry: FilesystemEntry) => {
    const project = projectForPath(projects.data?.projects, entry.path);
    if (!project || !project.links.codeServer) {
      setActionError("Kein Code-Server-Projekt für diesen Pfad. Registriere den Ordner zuerst als Projekt.");
      return;
    }
    const panelId = openPanel({ type: "code-server", projectId: project.id });
    if (panelId === null) {
      setActionError(`Es können höchstens ${WORKBENCH_LIMITS.maxResidentTools} Werkzeuge gleichzeitig geöffnet sein. Schließe zuerst ein Panel.`);
    }
  }, [openPanel, projects.data?.projects]);

  const openInTerminal = useCallback((entry: FilesystemEntry) => {
    const project = projectForPath(projects.data?.projects, entry.path);
    if (!project) {
      setActionError("Kein Projekt für diesen Pfad. Registriere den Ordner zuerst als Projekt, um ein Terminal zu öffnen.");
      return;
    }
    const panelId = openPanel({ type: "terminal", projectId: project.id });
    if (panelId === null) {
      setActionError(`Es können höchstens ${WORKBENCH_LIMITS.maxResidentTools} Werkzeuge gleichzeitig geöffnet sein. Schließe zuerst ein Panel.`);
    }
  }, [openPanel, projects.data?.projects]);

  const registerAsProject = useCallback((path: string) => {
    void apiClient.registerProject({ path }).then((result) => {
      if (!result) return;
      queryClient.setQueryData<ProjectsResponse>(["projects"], (current) => {
        if (!current) return { projects: [result.project], recentLimit: 8 };
        const exists = current.projects.some((project) => project.id === result.project.id);
        return { ...current, projects: exists ? current.projects.map((project) => project.id === result.project.id ? result.project : project) : [...current.projects, result.project] };
      });
      requestOrbitNode({ type: "project", title: result.project.name, projectId: result.project.id });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }).catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Das Projekt konnte nicht registriert werden.");
    });
  }, [queryClient]);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading("0");
    let completed = 0;
    let failed = 0;
    try {
      for (const file of list) {
        setUploading(`${completed + failed}`);
        try {
          await apiClient.fileManagerUpload(currentPath, file);
          completed += 1;
        } catch {
          failed += 1;
        }
      }
    } finally {
      setUploading(null);
      invalidate();
      setActionError(failed > 0 ? `${failed} von ${list.length} Dateien konnten nicht hochgeladen werden.` : null);
    }
  }, [currentPath, invalidate]);

  const handleContext = useCallback((event: { preventDefault: () => void; clientX?: number; clientY?: number }, entry: FilesystemEntry) => {
    event.preventDefault();
    const x = typeof event.clientX === "number" ? event.clientX : 0;
    const y = typeof event.clientY === "number" ? event.clientY : 0;
    select(entry.path);
    setContextMenu({ x, y, entry });
  }, [select]);

  const onRowPointerDown = useCallback((event: React.PointerEvent, entry: FilesystemEntry) => {
    if (event.pointerType !== "touch") return;
    const startX = event.clientX;
    const startY = event.clientY;
    longPressRef.current = { timer: null, x: startX, y: startY, suppressClick: false };
    const timer = window.setTimeout(() => {
      if (longPressRef.current.timer === null) return;
      longPressRef.current.timer = null;
      longPressRef.current.suppressClick = true;
      select(entry.path);
      setContextMenu({ x: startX, y: startY, entry });
    }, 500);
    longPressRef.current.timer = timer;
  }, [select]);

  const onRowPointerMove = useCallback((event: React.PointerEvent) => {
    const state = longPressRef.current;
    if (state.timer === null || state.x === 0) return;
    if (Math.abs(event.clientX - state.x) > 12 || Math.abs(event.clientY - state.y) > 12) {
      if (state.timer !== null) window.clearTimeout(state.timer);
      longPressRef.current.timer = null;
    }
  }, []);

  const onRowPointerUp = useCallback(() => {
    const state = longPressRef.current;
    if (state.timer !== null) window.clearTimeout(state.timer);
    longPressRef.current.timer = null;
  }, []);

  const consumeLongPressClick = useCallback(() => {
    if (!longPressRef.current.suppressClick) return false;
    longPressRef.current.suppressClick = false;
    return true;
  }, []);

  useEffect(() => () => {
    if (longPressRef.current.timer !== null) window.clearTimeout(longPressRef.current.timer);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [contextMenu]);

  const menuEntry = contextMenu?.entry ?? null;

  const contextActions = (entry: FilesystemEntry | null, close: () => void) => {
    if (!entry) return null;
    const isFavorite = favorites.includes(entry.path);
    const isDirectory = entry.kind === "directory";
    return <>
      {isDirectory && entry.readable ? <button type="button" onClick={() => { goTo(entry.path); close(); }}><FolderOpenIcon className="h-4 w-4" />Öffnen</button> : null}
      {!isDirectory ? <button type="button" onClick={() => { quickLookFor(entry); close(); }}><SearchIcon className="h-4 w-4" />Vorschau</button> : null}
      {!isDirectory ? <button type="button" onClick={() => { downloadEntry(entry); close(); }}><DownloadIcon className="h-4 w-4" />Herunterladen</button> : null}
      {!isDirectory ? <button type="button" onClick={() => { openInEditor(entry); close(); }}><FolderCodeIcon className="h-4 w-4" />Im Editor öffnen</button> : null}
      <button type="button" onClick={() => { openInTerminal(entry); close(); }}><TerminalIcon className="h-4 w-4" />Im Terminal öffnen</button>
      {isDirectory && entry.readable ? <button type="button" onClick={() => { registerAsProject(entry.path); close(); }}><FolderSearchIcon className="h-4 w-4" />Als Projekt registrieren</button> : null}
      <button type="button" onClick={() => { toggleFavorite(entry.path); close(); }}><BookmarkIcon className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />{isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}</button>
      {!isDirectory ? <button type="button" onClick={() => { setRenameTarget(entry); close(); }}><EditIcon className="h-4 w-4" />Umbenennen</button> : null}
      <button type="button" onClick={() => { setMoveTarget(entry); close(); }}><FolderOpenIcon className="h-4 w-4" />Verschieben</button>
      <button type="button" className="is-danger" onClick={() => { setDeleteTarget(entry); close(); }}><TrashIcon className="h-4 w-4" />Löschen</button>
    </>;
  };

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("input, textarea, select, button, a")) return;
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      quickLookFor(selectedEntry);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = visibleEntries.findIndex((entry) => entry.path === ui.selectedPath);
      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      const target = visibleEntries[next];
      if (target) select(target.path);
      return;
    }
    if (event.key === "Enter" && selectedEntry) {
      event.preventDefault();
      openEntry(selectedEntry);
      return;
    }
    if (event.key === "Backspace" && breadcrumbs.length > 1) {
      event.preventDefault();
      goTo(parentPath(currentPath));
      return;
    }
  }, [breadcrumbs.length, currentPath, goTo, openEntry, quickLookFor, select, selectedEntry, ui.selectedPath, visibleEntries]);

  const canGoBack = Boolean(root && currentPath !== root && history.length > 0);
  const historyBack = useCallback(() => {
    if (!canGoBack) return;
    goBack();
    select(null);
    setPreview(false);
    setDetailOpen(false);
  }, [canGoBack, goBack, select, setDetailOpen, setPreview]);

  // Auf Desktop sind Baum und Vorschau-Panel standardmäßig geöffnet; auf
  // Touch-Geräten bleiben sie geschlossen und öffnen als Drawer/Sheet.
  const mountRef = useRef(false);
  useEffect(() => {
    if (mountRef.current) return;
    mountRef.current = true;
    if (responsive.mode === "desktop") {
      setTreeOpen(true);
      setDetailOpen(true);
    }
  }, [responsive.mode, setDetailOpen, setTreeOpen]);

  const treeVisible = ui.treeOpen && Boolean(root);
  const detailVisible = ui.detailOpen && Boolean(selectedEntry) && selectedEntry?.kind !== "directory" && !isCompact;
  const drawerMode = isTablet || isCompact;

  const searchField = (
    <label className="file-manager-search" title="Im aktuellen Ordner suchen">
      <SearchIcon className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Im aktuellen Ordner suchen</span>
      <input
        ref={searchInputRef}
        value={ui.searchQuery}
        onChange={(event) => useFileManagerStore.getState().setSearchQuery(event.target.value)}
        placeholder="Suchen"
        spellCheck={false}
      />
      {ui.searchQuery ? <button type="button" className="file-manager-search-clear" onClick={() => useFileManagerStore.getState().setSearchQuery("")} aria-label="Suche leeren"><CloseIcon className="h-3 w-3" /></button> : null}
    </label>
  );

  const newFolderButton = (
    <button type="button" className="file-manager-icon-button" onClick={() => setMkdirOpen(true)} aria-label="Neuen Ordner anlegen" title="Neuer Ordner"><PlusIcon className="h-4 w-4" /></button>
  );
  const uploadButton = (
    <button type="button" className="file-manager-icon-button" onClick={() => uploadInputRef.current?.click()} disabled={uploading !== null} aria-label="Dateien hochladen" title="Dateien hochladen"><UploadIcon className="h-4 w-4" /></button>
  );
  const refreshButton = (
    <button type="button" className="file-manager-icon-button" onClick={invalidate} aria-label="Aktualisieren" title="Aktualisieren"><RefreshIcon className="h-4 w-4" /></button>
  );
  const viewModeButtons = (
    <>
      <button type="button" className={`file-manager-icon-button ${viewMode === "list" ? "is-active" : ""}`} onClick={() => setViewMode("list")} aria-label="Listenansicht" title="Listenansicht"><ListIcon className="h-4 w-4" /></button>
      <button type="button" className={`file-manager-icon-button ${viewMode === "grid" ? "is-active" : ""}`} onClick={() => setViewMode("grid")} aria-label="Rasteransicht" title="Rasteransicht"><GridIcon className="h-4 w-4" /></button>
    </>
  );

  return (
    <div className={`file-manager ${isCompact ? "is-compact" : isTablet ? "is-tablet" : "is-desktop"}`} data-view={viewMode} data-minimal={minimal ? "true" : undefined} onKeyDown={handleKeyDown}>
      {/* Toolbar mit Breadcrumbs und Aktionen */}
      <div className="file-manager-toolbar">
        <div className="file-manager-breadcrumbs" role="navigation" aria-label="Aktueller Serverpfad">
          <button type="button" className={`file-manager-icon-button ${ui.treeOpen ? "is-active" : ""}`} onClick={() => setTreeOpen(!ui.treeOpen)} aria-label="Dateibaum ein- oder ausblenden" title="Dateibaum"><FolderTreeIcon className="h-4 w-4" /></button>
          <button type="button" className="file-manager-icon-button" onClick={historyBack} disabled={!canGoBack} aria-label="Zurück" title="Zurück"><ArrowLeftIcon className="h-4 w-4" /></button>
          <div className="file-manager-breadcrumb-scroll">
            {breadcrumbs.map((item, index) => (
              <span key={item.path} className="file-manager-breadcrumb">
                {index > 0 ? <ChevronRightIcon className="file-manager-breadcrumb-sep" aria-hidden /> : null}
                <button type="button" className={index === breadcrumbs.length - 1 ? "is-current" : ""} onClick={() => goTo(item.path, index !== breadcrumbs.length - 1)}>{item.label}</button>
              </span>
            ))}
          </div>
          {isCompact ? null : <div className="file-manager-sync-status">
            {syncError ? <span className="file-manager-sync-error" title={syncError}><WarningIcon className="h-3 w-3" />Offline-Änderungen</span> : null}
          </div>}
        </div>
        {/* Auf dem Handy stehen die Aktionen unten in Daumenreichweite, hier
            bleibt nur der Pfad. Ab Tablet passen sie in die Werkzeugleiste. */}
        {!isCompact ? <div className="file-manager-actions">
          {searchField}
          {viewModeButtons}
          {newFolderButton}
          {uploadButton}
          <button type="button" className={`file-manager-icon-button ${ui.detailOpen ? "is-active" : ""}`} onClick={() => setDetailOpen(!ui.detailOpen)} aria-label="Vorschau-Panel ein- oder ausblenden" title="Vorschau-Panel"><ColumnsIcon className="h-4 w-4" /></button>
          {refreshButton}
        </div> : null}
      </div>
      <input ref={uploadInputRef} type="file" multiple hidden onChange={(event) => { if (event.target.files) void handleUpload(event.target.files); event.target.value = ""; }} />

      {/* Statusleiste */}
      <div className="file-manager-statusbar">
        <span>{visibleEntries.length} Einträge{ui.searchQuery ? ` · Suche: „${ui.searchQuery}“` : ""}</span>
        {uploading !== null ? <span className="file-manager-uploading"><UploadIcon className="h-3 w-3" />Wird hochgeladen…</span> : selectedEntry ? <span>{selectedEntry.name} · {formatBytes(selectedEntry.sizeBytes)} · {formatDate(selectedEntry.modifiedAt)}</span> : null}
        {!isCompact ? <span className="file-manager-keyhints"><span className="kbd">Leertaste</span> Vorschau <span className="kbd">↵</span> öffnen <span className="kbd">←</span> zurück</span> : null}
      </div>

      {actionError ? <div className="file-manager-alert" role="alert"><WarningIcon className="h-3.5 w-3.5" /><span>{actionError}</span><button type="button" onClick={() => setActionError(null)} aria-label="Meldung schließen"><CloseIcon className="h-3 w-3" /></button></div> : null}
      {syncError && isCompact ? <div className="file-manager-alert is-sync" role="status"><WarningIcon className="h-3.5 w-3.5" /><span>{syncError}</span></div> : null}

      {/* Hauptbereich: drei Panes */}
      <div
        className="file-manager-body"
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); }}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length > 0) void handleUpload(event.dataTransfer.files);
        }}
      >
        {dragging ? <div className="file-manager-dropzone"><UploadIcon className="h-8 w-8" /><strong>Dateien hier ablegen</strong><span>Sie landen im Ordner „{currentPath.split("/").at(-1) || "Home"}“</span></div> : null}

        {/* Pane 1: Baum (Desktop inline, Tablet/Mobile Drawer) */}
        {treeVisible && root ? <aside
          className={`file-manager-tree-pane ${drawerMode ? "is-drawer" : ""} ${ui.treeOpen ? "is-open" : ""}`}
          aria-label="Dateibaum"
          style={drawerMode ? undefined : { width: `${treePane.width}px` }}
        >
          <header className="file-manager-pane-head">
            <span className="file-manager-pane-title">Dateien</span>
            <button type="button" className="file-manager-icon-button" onClick={() => setTreeOpen(false)} aria-label="Dateibaum schließen"><CloseIcon className="h-4 w-4" /></button>
          </header>
          <FmTree root={root} currentPath={currentPath} />
          {!drawerMode ? <div
            className="pane-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Breite des Dateibaums anpassen"
            aria-valuenow={treePane.width}
            aria-valuemin={treePane.min}
            aria-valuemax={treePane.max}
            tabIndex={0}
            onPointerDown={treePane.startResize}
            onKeyDown={treePane.resizeWithKeyboard}
          /> : null}
        </aside> : null}

        {/* Pane 2: Inhalt (Liste/Raster) */}
        <section className="file-manager-content" aria-label={currentPath.split("/").at(-1) ?? "Home"}>
          {tree.isLoading && entries.length === 0 ? <div className="file-manager-skeleton"><span /><span /><span /><span /><span /><span /></div> : null}
          {tree.isError && entries.length === 0 ? <div className="file-manager-empty">
            <FolderSearchIcon className="h-8 w-8" />
            <strong>Ordner nicht erreichbar</strong>
            <p>Der Serverordner konnte nicht geladen werden.</p>
            <button type="button" className="quiet-button" onClick={invalidate}><RefreshIcon className="h-3.5 w-3.5" />Erneut versuchen</button>
          </div> : null}
          {!tree.isLoading && !tree.isError && visibleEntries.length === 0 ? <div className="file-manager-empty">
            <FolderIcon className="h-8 w-8" />
            <strong>{ui.searchQuery ? "Keine Treffer" : "Ordner ist leer"}</strong>
            <p>{ui.searchQuery ? `Nichts passt auf „${ui.searchQuery}“.` : "Lege einen neuen Ordner an oder lade Dateien hoch."}</p>
            {!ui.searchQuery ? <div className="file-manager-empty-actions">
              <button type="button" className="quiet-button" onClick={() => setMkdirOpen(true)}><PlusIcon className="h-3.5 w-3.5" />Ordner anlegen</button>
              <button type="button" className="quiet-button" onClick={() => uploadInputRef.current?.click()}><UploadIcon className="h-3.5 w-3.5" />Hochladen</button>
            </div> : null}
          </div> : null}
          {viewMode === "list" ? <div className="file-manager-list" role="listbox" aria-label="Dateien und Ordner" tabIndex={0}>
            <div className="file-manager-list-head" aria-hidden="true">
              <span className="file-manager-list-name"><button type="button" onClick={() => setSort("name", sortKey === "name" && sortDirection === "asc" ? "desc" : "asc")}>Name</button></span>
              <span className="file-manager-list-size"><button type="button" onClick={() => setSort("size", sortKey === "size" && sortDirection === "asc" ? "desc" : "asc")}>Größe</button></span>
              <span className="file-manager-list-modified"><button type="button" onClick={() => setSort("modified", sortKey === "modified" && sortDirection === "asc" ? "desc" : "asc")}>Geändert</button></span>
            </div>
            {visibleEntries.map((entry) => {
              const isSelected = entry.path === ui.selectedPath;
              const isDirectory = entry.kind === "directory";
              return <div
                key={entry.path}
                role="option"
                aria-selected={isSelected}
                data-fm-row
                data-path={entry.path}
                tabIndex={-1}
                className={`file-manager-row ${isSelected ? "is-selected" : ""} ${entry.readable ? "" : "is-unreadable"}`}
                onClick={(event) => { if (consumeLongPressClick()) return; event.currentTarget.focus(); openEntry(entry); }}
                onContextMenu={(event) => handleContext(event, entry)}
                onPointerDown={(event) => onRowPointerDown(event, entry)}
                onPointerMove={onRowPointerMove}
                onPointerUp={onRowPointerUp}
                onPointerLeave={onRowPointerUp}
              >
                <span className="file-manager-row-icon">
                  {isDirectory ? <FolderIcon className="h-4 w-4" aria-hidden /> : <FileIcon className="h-4 w-4" aria-hidden />}
                </span>
                <span className="file-manager-row-name" title={entry.name}>{entry.name}</span>
                {favorites.includes(entry.path) ? <span className="file-manager-row-fav" title="Favorit"><BookmarkIcon className="h-3 w-3 fill-current" /></span> : null}
                <span className="file-manager-row-size">{isDirectory ? (entry.readable ? "Ordner" : "Nicht lesbar") : formatBytes(entry.sizeBytes)}</span>
                <span className="file-manager-row-modified">{formatDate(entry.modifiedAt)}</span>
                <button type="button" className="file-manager-row-more" aria-label={`Aktionen für ${entry.name}`} onClick={(event) => { event.stopPropagation(); handleContext(event, entry); }}><MoreIcon className="h-4 w-4" /></button>
              </div>;
            })}
          </div> : <div className="file-manager-grid" role="listbox" aria-label="Dateien und Ordner" tabIndex={0}>
            {visibleEntries.map((entry) => {
              const isSelected = entry.path === ui.selectedPath;
              const isDirectory = entry.kind === "directory";
              const kind = previewKindOf(entry);
              return <div
                key={entry.path}
                role="option"
                aria-selected={isSelected}
                data-fm-row
                data-path={entry.path}
                tabIndex={-1}
                className={`file-manager-grid-item ${isSelected ? "is-selected" : ""}`}
                onClick={(event) => { if (consumeLongPressClick()) return; event.currentTarget.focus(); openEntry(entry); }}
                onContextMenu={(event) => handleContext(event, entry)}
                onPointerDown={(event) => onRowPointerDown(event, entry)}
                onPointerMove={onRowPointerMove}
                onPointerUp={onRowPointerUp}
                onPointerLeave={onRowPointerUp}
              >
                <span className={`file-manager-grid-thumb is-${kind}`}>
                  {isDirectory ? <FolderIcon className="h-7 w-7" aria-hidden /> : kind === "image" || kind === "video" ? <img src={apiClient.fileManagerMediaUrl(entry.path)} alt="" loading="lazy" /> : kind === "code" || kind === "markdown" || kind === "text" ? <CodeFileIcon className="h-7 w-7" aria-hidden /> : <FileIcon className="h-7 w-7" aria-hidden />}
                </span>
                <span className="file-manager-grid-name" title={entry.name}>{entry.name}</span>
                <span className="file-manager-grid-meta">{isDirectory ? "Ordner" : formatBytes(entry.sizeBytes)}</span>
              </div>;
            })}
          </div>}
        </section>

        {/* Pane 3: Vorschau-Panel (Desktop inline, Tablet Drawer) */}
        {detailVisible && selectedEntry ? <aside className={`file-manager-detail-pane ${drawerMode ? "is-drawer" : ""} ${ui.detailOpen ? "is-open" : ""}`} aria-label={`Vorschau von ${selectedEntry.name}`}>
          <header className="file-manager-pane-head">
            <div className="min-w-0 leading-tight">
              <strong className="file-manager-detail-name truncate">{selectedEntry.name}</strong>
              <span className="file-manager-detail-meta">{formatBytes(selectedEntry.sizeBytes)} · {formatDate(selectedEntry.modifiedAt)}</span>
            </div>
            <button type="button" className="file-manager-icon-button" onClick={() => setDetailOpen(false)} aria-label="Vorschau-Panel schließen"><CloseIcon className="h-4 w-4" /></button>
          </header>
          <div className="file-manager-detail-body">
            <FilePreview entry={selectedEntry} />
          </div>
          <footer className="file-manager-detail-actions">
            <button type="button" className="quiet-button" onClick={() => downloadEntry(selectedEntry)}><DownloadIcon className="h-3.5 w-3.5" />Download</button>
            <button type="button" className="quiet-button" onClick={() => openInEditor(selectedEntry)}><FolderCodeIcon className="h-3.5 w-3.5" />Editor</button>
            <button type="button" className="quiet-button" onClick={() => quickLookFor(selectedEntry)}><SearchIcon className="h-3.5 w-3.5" />Groß</button>
          </footer>
        </aside> : null}
      </div>

      {/* Aktionsleiste am unteren Rand — nur auf dem Handy. Die Suche fährt
          darüber ein, damit sie keine dauerhafte Zeile belegt. */}
      {isCompact ? (
        <div className="file-manager-mobile-bar">
          {searchOpen ? <div className="file-manager-search-row">
            {searchField}
            <button type="button" className="quiet-button" onClick={() => { useFileManagerStore.getState().setSearchQuery(""); setSearchOpen(false); }}>Fertig</button>
          </div> : null}
          <div className="file-manager-actionbar" aria-label="Dateiaktionen">
            <button
              type="button"
              className={`file-manager-icon-button ${searchOpen || ui.searchQuery ? "is-active" : ""}`}
              onClick={() => { setSearchOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 0); }}
              aria-label="Im aktuellen Ordner suchen"
              aria-expanded={searchOpen}
            >
              <SearchIcon className="h-4 w-4" />
            </button>
            {newFolderButton}
            {uploadButton}
            <button
              type="button"
              className="file-manager-icon-button"
              onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
              aria-label={viewMode === "list" ? "Zur Rasteransicht wechseln" : "Zur Listenansicht wechseln"}
            >
              {viewMode === "list" ? <GridIcon className="h-4 w-4" /> : <ListIcon className="h-4 w-4" />}
            </button>
            {refreshButton}
          </div>
        </div>
      ) : null}

      {/* Kontextmenü */}
      {contextMenu ? <div
        className={`file-manager-context-menu ${touch ? "is-sheet" : ""}`}
        style={touch ? undefined : { left: Math.min(contextMenu.x, window.innerWidth - 240), top: Math.min(contextMenu.y, window.innerHeight - 360) }}
        role="menu"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <strong className="file-manager-context-title truncate">{menuEntry?.name}</strong>
        {contextActions(menuEntry, () => setContextMenu(null))}
      </div> : null}

      {/* Dialoge */}
      <PromptDialog
        open={renameTarget !== null}
        title="Umbenennen"
        {...(renameTarget ? { description: `Neuer Name für „${renameTarget.name}“:` } : {})}
        label="Name"
        initialValue={renameTarget?.name ?? ""}
        confirmLabel="Umbenennen"
        onConfirm={async (name) => {
          if (!renameTarget) return;
          try {
            const response = await apiClient.fileManagerRename(renameTarget.path, name);
            if (!response) throw new Error("Die Umbenennung wurde vom Server nicht bestätigt.");
            replacePath(renameTarget.path, response.path);
            setRenameTarget(null);
            invalidate();
          } catch (error) {
            setActionError(error instanceof Error ? error.message : "Umbenennen fehlgeschlagen.");
          }
        }}
        onClose={() => setRenameTarget(null)}
      />
      <PromptDialog
        open={moveTarget !== null}
        title="Verschieben"
        {...(moveTarget ? { description: `Zielordner für „${moveTarget.name}“ (Serverpfad):` } : {})}
        label="Zielordner"
        initialValue={parentPath(moveTarget?.path ?? currentPath)}
        confirmLabel="Verschieben"
        onConfirm={async (targetDirectory) => {
          if (!moveTarget) return;
          try {
            const response = await apiClient.fileManagerMove(moveTarget.path, targetDirectory);
            if (!response) throw new Error("Das Verschieben wurde vom Server nicht bestätigt.");
            replacePath(moveTarget.path, response.path);
            setMoveTarget(null);
            invalidate();
          } catch (error) {
            setActionError(error instanceof Error ? error.message : "Verschieben fehlgeschlagen.");
          }
        }}
        onClose={() => setMoveTarget(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Löschen bestätigen"
        description={deleteTarget ? `„${deleteTarget.name}“ wird dauerhaft vom Server entfernt.${deleteTarget.kind === "directory" ? " Nur leere Ordner können gelöscht werden." : ""}` : ""}
        confirmLabel="Löschen"
        danger
        onConfirm={() => {
          if (!deleteTarget) return;
          void apiClient.fileManagerDelete(deleteTarget.path).then(() => {
            setDeleteTarget(null);
            removePath(deleteTarget.path);
            invalidate();
          }).catch((error: unknown) => {
            setActionError(error instanceof Error ? error.message : "Löschen fehlgeschlagen.");
          });
        }}
        onClose={() => setDeleteTarget(null)}
      />
      <PromptDialog
        open={mkdirOpen}
        title="Neuer Ordner"
        description={`Ordner in „${currentPath.split("/").at(-1) || "Home"}“ anlegen:`}
        label="Name"
        initialValue=""
        confirmLabel="Anlegen"
        onConfirm={async (name) => {
          try {
            await apiClient.fileManagerMkdir(currentPath, name);
            setMkdirOpen(false);
            setExpanded(currentPath, true);
            invalidate();
          } catch (error) {
            setActionError(error instanceof Error ? error.message : "Ordner konnte nicht angelegt werden.");
          }
        }}
        onClose={() => setMkdirOpen(false)}
      />

      {/* Quick Look: Modal (Desktop/Tablet) bzw. Bottom Sheet (Mobile) */}
      <QuickLook
        open={ui.previewOpen}
        entry={selectedEntry && selectedEntry.kind === "file" ? selectedEntry : visibleEntries.find((entry) => entry.path === ui.previewPath && entry.kind === "file") ?? null}
        isFavorite={Boolean((selectedEntry ?? visibleEntries.find((entry) => entry.path === ui.previewPath)) && favorites.includes(ui.previewPath ?? ""))}
        onClose={closeQuickLook}
        onNavigate={navigateQuickLook}
        onDownload={downloadEntry}
        onOpenInEditor={openInEditor}
        onToggleFavorite={toggleFavorite}
      />

      {/* Drawer-Overlay für Tablet/Mobile */}
      {drawerMode && (ui.treeOpen || ui.detailOpen) ? <div className="file-manager-drawer-backdrop" role="presentation" onClick={() => { setTreeOpen(false); setDetailOpen(false); }} /> : null}
    </div>
  );
}
