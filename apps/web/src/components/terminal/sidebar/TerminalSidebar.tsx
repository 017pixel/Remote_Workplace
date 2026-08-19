import { useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { TerminalKind, TerminalSession } from "@wrapt/contracts";
import { useTerminalWorkspaceStore } from "../../../stores/terminalWorkspace";
import { ChevronLeftIcon, CloseIcon, ColumnsIcon, FolderTreeIcon, PinIcon, PlusIcon, SearchIcon, TerminalIcon } from "../../icons";
import type { TerminalMeta } from "../terminal-types";
import {
  childrenOfFolder,
  createFolderOps,
  moveEntryOps,
  moveFolderOps,
  pinnedEntries,
} from "../workspace/terminalWorkspaceModel";
import { TerminalContextMenu, openContextMenuAt, type ContextMenuState } from "./TerminalContextMenu";
import { TerminalToolbar } from "../terminal-toolbar";
import { TerminalTree, type TerminalTreeCallbacks } from "./TerminalTree";
import { useTerminalDnd, type DndDropTarget } from "./useTerminalDnd";

export interface TerminalSidebarProps {
  areaId: string;
  kind: TerminalKind;
  meta: Record<string, TerminalMeta>;
  sessions: TerminalSession[];
  cwds: Record<string, string>;
  isMobile: boolean;
  open: boolean;
  onClose(): void;
  onNewTerminal(): void;
  onNewTerminalInFolder(folderId: string | null): void;
  onOpenEntry(runtimeId: string): void;
  onOpenInSplit(runtimeId: string): void;
  onResync(runtimeId: string): void;
  onRestart(runtimeId: string): void;
  onToggleSidebar(): void;
  activeRuntimeId: string | null;
  hasSplit: boolean;
  hasActivePane: boolean;
  onCreateSplit(): void;
  onClearSplit(): void;
  onClear(): void;
  onClosePane(): void;
  sessionPicker: ReactNode;
  sidebarWidth?: number;
  onResizeStart?(event: React.PointerEvent<HTMLElement>): void;
  onResizeKeyboard?(event: React.KeyboardEvent<HTMLElement>): void;
  version?: string | null;
  onReload?(): void;
  onFullscreen?(): void;
}

export function TerminalSidebar({ areaId, kind, meta, sessions, cwds, isMobile, open, onClose, onNewTerminal, onNewTerminalInFolder, onOpenEntry, onOpenInSplit, onResync, onRestart, onToggleSidebar, activeRuntimeId, hasSplit, hasActivePane, onCreateSplit, onClearSplit, onClear, onClosePane, sessionPicker, sidebarWidth = 256, onResizeStart = () => undefined, onResizeKeyboard = () => undefined, version = null, onReload = () => undefined, onFullscreen = () => undefined }: TerminalSidebarProps) {
  const document = useTerminalWorkspaceStore((state) => state.document);
  const queueOps = useTerminalWorkspaceStore((state) => state.queueOps);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [editing, setEditing] = useState<{ kind: "entry" | "folder"; id: string } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "entry" | "folder"; id: string; name: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const pendingNewFolderRef = useRef<string | null>(null);

  const drop = useMemo(() => (drag: { kind: "entry" | "folder"; id: string }, target: DndDropTarget | null) => {
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return;
    if (drag.kind === "entry") {
      if (target?.kind === "pins") {
        state.queueOps([{ type: "updateEntry", id: drag.id, patch: { pinned: true } }]);
        return;
      }
      if (target?.kind === "folder" && target.position === "inside" && target.id) {
        const folder = state.document.folders.find((candidate) => candidate.id === target.id);
        if (folder) state.queueOps(moveEntryOps(state.document, drag.id, target.id, childrenOfFolder(state.document, target.id).entries.length));
        return;
      }
      if (target?.kind === "entry" && target.id && target.id !== drag.id) {
        const targetEntry = state.document.entries.find((candidate) => candidate.id === target.id);
        if (!targetEntry) return;
        const siblings = childrenOfFolder(state.document, targetEntry.parentFolderId).entries.filter((entry) => entry.id !== drag.id);
        const index = siblings.findIndex((entry) => entry.id === target.id) + (target.position === "after" ? 1 : 0);
        state.queueOps(moveEntryOps(state.document, drag.id, targetEntry.parentFolderId, index));
        return;
      }
      if (target?.kind === "folder" && target.id && target.position !== "inside") {
        const folder = state.document.folders.find((candidate) => candidate.id === target.id);
        if (!folder) return;
        const siblings = childrenOfFolder(state.document, folder.parentFolderId).entries.filter((entry) => entry.id !== drag.id);
        const index = siblings.findIndex((entry) => entry.id === target.id) + (target.position === "after" ? 1 : 0);
        // Vor/nach einer Ordnerzeile abgelegt → in dessen übergeordneten Ordner.
        state.queueOps(moveEntryOps(state.document, drag.id, folder.parentFolderId, index));
        return;
      }
      return;
    }
    // Ordner verschieben
    if (target?.kind === "folder" && target.id && target.id !== drag.id && target.position === "inside") {
      const siblings = childrenOfFolder(state.document, target.id).folders;
      state.queueOps(moveFolderOps(state.document, drag.id, target.id, siblings.length));
      return;
    }
    if (target?.kind === "folder" && target.id && target.id !== drag.id && target.position !== "inside") {
      const folder = state.document.folders.find((candidate) => candidate.id === target.id);
      if (!folder) return;
      const siblings = childrenOfFolder(state.document, folder.parentFolderId).folders.filter((candidate) => candidate.id !== drag.id);
      const index = siblings.findIndex((candidate) => candidate.id === target.id) + (target.position === "after" ? 1 : 0);
      state.queueOps(moveFolderOps(state.document, drag.id, folder.parentFolderId, index));
      return;
    }
    if (target?.kind === "entry" && target.id) {
      const entry = state.document.entries.find((candidate) => candidate.id === target.id);
      if (!entry) return;
      const siblings = childrenOfFolder(state.document, entry.parentFolderId).folders.filter((candidate) => candidate.id !== drag.id);
      const index = siblings.findIndex((candidate) => candidate.id === target.id) + (target.position === "after" ? 1 : 0);
      state.queueOps(moveFolderOps(state.document, drag.id, entry.parentFolderId, index));
      return;
    }
  }, []);

  const { drag, target, createRowHandlers, containerHandlers } = useTerminalDnd(drop);

  const callbacks: TerminalTreeCallbacks = {
    onOpenEntry,
    onOpenInSplit,
    onTogglePin: (entryId) => {
      const entry = document?.entries.find((candidate) => candidate.id === entryId);
      if (entry) queueOps([{ type: "updateEntry", id: entryId, patch: { pinned: !entry.pinned } }]);
    },
    onTogglePersistent: (entryId) => {
      const entry = document?.entries.find((candidate) => candidate.id === entryId);
      if (entry) queueOps([{ type: "updateEntry", id: entryId, patch: { persistent: !entry.persistent } }]);
    },
    onDeleteEntry: (entryId) => {
      const entry = document?.entries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      if (entry.persistent || entry.pinned) setConfirmDelete({ kind: "entry", id: entryId, name: entry.name });
      else queueOps([{ type: "deleteEntry", id: entryId }]);
    },
    onRenameEntry: (entryId) => {
      const entry = document?.entries.find((candidate) => candidate.id === entryId);
      if (!entry) return;
      setEditing({ kind: "entry", id: entryId });
      setEditingValue(entry.name);
    },
    onNewTerminal: (folderId) => onNewTerminalInFolder(folderId),
    onNewFolder: (parentFolderId) => {
      if (!document) return;
      queueOps(createFolderOps(document, parentFolderId, "Neuer Ordner"));
      pendingNewFolderRef.current = parentFolderId;
    },
    onRenameFolder: (folderId) => {
      const folder = document?.folders.find((candidate) => candidate.id === folderId);
      if (!folder) return;
      setEditing({ kind: "folder", id: folderId });
      setEditingValue(folder.name);
    },
    onToggleCollapse: (folderId) => {
      const folder = document?.folders.find((candidate) => candidate.id === folderId);
      if (folder) queueOps([{ type: "updateFolder", id: folderId, patch: { collapsed: !folder.collapsed } }]);
    },
    onDeleteFolder: (folderId) => {
      const folder = document?.folders.find((candidate) => candidate.id === folderId);
      if (!folder) return;
      setConfirmDelete({ kind: "folder", id: folderId, name: folder.name });
    },
    onContextMenu: (event, kind, id) => setMenu(openContextMenuAt(event, buildMenu(kind, id))),
    onMoveEntry: (entryId, folderId, index) => {
      if (document) queueOps(moveEntryOps(document, entryId, folderId, index));
    },
    onMoveFolder: (folderId, parentId, index) => {
      if (document) queueOps(moveFolderOps(document, folderId, parentId, index));
    },
    onResync,
    onRestart,
  };

  const createRootFolder = () => {
    if (!document) return;
    queueOps(createFolderOps(document, null, "Neuer Ordner"));
    pendingNewFolderRef.current = null;
  };

  const buildRootMenu = () => [
    { label: "Neues Terminal", icon: <PlusIcon className="h-4 w-4" />, onSelect: onNewTerminal },
    { label: "Neuer Ordner", icon: <FolderTreeIcon className="h-4 w-4" />, onSelect: createRootFolder },
  ];

  const buildMenu = (kind: "entry" | "folder", id: string) => {
    const entry = kind === "entry" ? document?.entries.find((candidate) => candidate.id === id) : undefined;
    const folder = kind === "folder" ? document?.folders.find((candidate) => candidate.id === id) : undefined;
    if (kind === "entry" && entry) {
      return [
        { label: "Öffnen", icon: <TerminalIcon className="h-4 w-4" />, disabled: !entry.runtimeId, onSelect: () => entry.runtimeId && onOpenEntry(entry.runtimeId) },
        { label: "In Split öffnen", icon: <ColumnsIcon className="h-4 w-4" />, disabled: !entry.runtimeId, onSelect: () => entry.runtimeId && onOpenInSplit(entry.runtimeId) },
        { label: "Umbenennen", icon: <FolderTreeIcon className="h-4 w-4" />, onSelect: () => callbacks.onRenameEntry(id) },
        { separator: true },
        { label: entry.pinned ? "Pin lösen" : "Pinnen", icon: <PinIcon className="h-4 w-4" />, onSelect: () => callbacks.onTogglePin(id) },
        { label: entry.persistent ? "Persistence entfernen" : "Persistent machen", onSelect: () => callbacks.onTogglePersistent(id) },
        { separator: true },
        { label: "Neu verbinden", disabled: !entry.runtimeId, onSelect: () => entry.runtimeId && onResync(entry.runtimeId) },
        { label: "Terminal neu starten", disabled: !entry.runtimeId, onSelect: () => entry.runtimeId && onRestart(entry.runtimeId) },
        { separator: true },
        { label: "Terminal beenden", icon: <PinIcon className="h-4 w-4" />, danger: true, onSelect: () => callbacks.onDeleteEntry(id) },
      ];
    }
    if (kind === "folder" && folder) {
      return [
        { label: "Neues Terminal hier", icon: <PlusIcon className="h-4 w-4" />, onSelect: () => onNewTerminalInFolder(id) },
        { label: "Neuer Unterordner", icon: <FolderTreeIcon className="h-4 w-4" />, onSelect: () => callbacks.onNewFolder(id) },
        { label: "Umbenennen", onSelect: () => callbacks.onRenameFolder(id) },
        { label: "Alle aufklappen", onSelect: () => setAllCollapsed(id, false) },
        { label: "Alle zuklappen", onSelect: () => setAllCollapsed(id, true) },
        { separator: true },
        { label: "Ordner löschen", danger: true, onSelect: () => callbacks.onDeleteFolder(id) },
      ];
    }
    return [];
  };

  const setAllCollapsed = (folderId: string | null, collapsed: boolean) => {
    const state = useTerminalWorkspaceStore.getState();
    const doc = state.document;
    if (!doc) return;
    const ops: Array<{ type: "updateFolder"; id: string; patch: { collapsed: boolean } }> = [];
    const visited = new Set<string>();
    const visit = (parentId: string) => {
      if (visited.has(parentId)) return;
      visited.add(parentId);
      for (const child of doc.folders.filter((candidate) => candidate.parentFolderId === parentId)) {
        if (visited.has(child.id)) continue;
        ops.push({ type: "updateFolder", id: child.id, patch: { collapsed } });
        visit(child.id);
      }
    };
    const roots = folderId === null ? doc.folders.filter((folder) => folder.parentFolderId === null) : [{ id: folderId }];
    for (const root of roots) visit(root.id);
    queueOps(ops);
  };

  const commitEdit = () => {
    if (!editing || !document) { setEditing(null); return; }
    const name = editingValue.trim();
    if (name && name.length > 0) {
      if (editing.kind === "entry") queueOps([{ type: "updateEntry", id: editing.id, patch: { name } }]);
      else queueOps([{ type: "updateFolder", id: editing.id, patch: { name } }]);
    }
    setEditing(null);
  };

  const confirmDeleteAction = () => {
    if (!confirmDelete || !document) return;
    if (confirmDelete.kind === "entry") queueOps([{ type: "deleteEntry", id: confirmDelete.id }]);
    else {
      const folder = document.folders.find((candidate) => candidate.id === confirmDelete.id);
      queueOps([{ type: "deleteFolder", id: confirmDelete.id, moveChildrenTo: folder?.parentFolderId ?? null }]);
    }
    setConfirmDelete(null);
  };

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const pins = document ? pinnedEntries(document).filter((entry) => entry.name.toLocaleLowerCase().includes(normalizedSearch)) : [];
  const statusOf = (runtimeId: string): TerminalMeta | undefined => meta[runtimeId];

  const renderPins = pins.length > 0 ? (
    <div className="terminal-sidebar-section" data-dnd="pins">
      <div className="terminal-sidebar-heading">Gepinnt</div>
      <ul className="terminal-tree">
        {pins.map((entry) => (
          <li key={entry.id} className="terminal-tree-entry">
            <div
              data-dnd={`entry:${entry.id}`}
              className="terminal-tree-row is-entry is-pinned-row"
              {...createRowHandlers({ kind: "entry", id: entry.id, label: entry.name })}
              onContextMenu={(event) => { event.preventDefault(); setMenu(openContextMenuAt(event, buildMenu("entry", entry.id))); }}
              onClick={() => entry.runtimeId && onOpenEntry(entry.runtimeId)}
            >
              <span className={`terminal-tree-status is-${entry.runtimeId ? (statusOf(entry.runtimeId)?.status ?? "disconnected") : "disconnected"}`} aria-hidden />
              <span className="terminal-tree-icon"><TerminalIcon className="h-4 w-4" /></span>
              <span className="terminal-tree-label-wrap"><span className="terminal-tree-label">{entry.name}</span></span>
              <PinIcon className="terminal-tree-pin h-3 w-3" aria-label="Gepinnt" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <>
      <aside
        className={`terminal-sidebar ${isMobile ? "is-drawer" : ""} ${open ? "is-open" : ""}`}
        style={{ "--terminal-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
        aria-label="Terminal-Sidebar"
        onContextMenu={(event) => {
          if ((event.target as Element).closest("[data-dnd]")) return;
          event.preventDefault();
          setMenu(openContextMenuAt(event, buildRootMenu()));
        }}
      >
        <div className="terminal-sidebar-header">
          <button type="button" className="terminal-sidebar-title-button" onClick={onToggleSidebar} aria-label="Terminal-Sidebar ausblenden" title="Terminal-Sidebar ausblenden">
            <TerminalIcon className="h-4 w-4" />
            <span className="terminal-sidebar-title">Terminals</span>
            <ChevronLeftIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <TerminalToolbar
          kind={kind}
          hasSplit={hasSplit}
          hasActivePane={hasActivePane}
          onCreate={onNewTerminal}
          onCreateSplit={onCreateSplit}
          onClearSplit={onClearSplit}
          onCreateFolder={createRootFolder}
          onExpandAll={() => setAllCollapsed(null, false)}
          onCollapseAll={() => setAllCollapsed(null, true)}
          onRestart={() => { if (activeRuntimeId) onRestart(activeRuntimeId); }}
          onReload={onReload}
          onFullscreen={onFullscreen}
          onClear={onClear}
          onClosePane={onClosePane}
          sessionPicker={sessionPicker}
        />
        <label className="terminal-sidebar-search">
          <SearchIcon className="h-4 w-4" aria-hidden />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Terminals durchsuchen…"
            aria-label="Terminals suchen"
          />
          {searchTerm ? <button type="button" onClick={() => setSearchTerm("")} aria-label="Terminal-Suche löschen"><CloseIcon className="h-3.5 w-3.5" /></button> : null}
        </label>
        <div className="terminal-sidebar-body" {...containerHandlers}>
          {renderPins}
          <div className="terminal-sidebar-section">
            <div className="terminal-sidebar-heading">Ordner</div>
            {document ? <TerminalTree
              document={document}
              folderId={null}
              depth={0}
              areaId={areaId}
              meta={Object.fromEntries(Object.entries(meta).map(([runtimeId, value]) => [runtimeId, value.status]))}
              cwds={cwds}
              sessions={sessions}
              editing={editing}
              editingValue={editingValue}
              onEditingValueChange={setEditingValue}
              onCommitEdit={commitEdit}
              onCancelEdit={() => setEditing(null)}
              dropTarget={target}
              createRowHandlers={(kind, id, label) => createRowHandlers({ kind, id, label })}
              filter={normalizedSearch}
              callbacks={callbacks}
            /> : <div className="terminal-sidebar-loading">Terminal-Workspace wird geladen…</div>}
            {document && normalizedSearch && pins.length === 0 && document.entries.every((entry) => !entry.name.toLocaleLowerCase().includes(normalizedSearch)) && document.folders.every((folder) => !folder.name.toLocaleLowerCase().includes(normalizedSearch)) ? <div className="terminal-sidebar-empty">Keine Treffer</div> : null}
          </div>
        </div>
        <footer className="terminal-sidebar-footer"><span>Version</span><strong>v{version ?? "—"}</strong></footer>
        <div className="terminal-sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label="Breite der Terminal-Sidebar ändern" aria-valuemin={220} aria-valuemax={420} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={onResizeStart} onKeyDown={onResizeKeyboard} />
        {drag ? <div className="terminal-dnd-overlay" style={{ left: drag.x, top: drag.y }}><TerminalIcon className="h-4 w-4" />{drag.label}</div> : null}
      </aside>
      {isMobile && open ? <button type="button" className="terminal-sidebar-backdrop" aria-label="Sidebar schließen" onClick={onClose} /> : null}
      {menu ? <TerminalContextMenu menu={menu} onClose={() => setMenu(null)} /> : null}
      {confirmDelete ? (
        <div className="terminal-confirm-backdrop" role="dialog" aria-modal="true" onClick={() => setConfirmDelete(null)}>
          <div className="terminal-confirm" onClick={(event) => event.stopPropagation()}>
            <strong>{confirmDelete.kind === "entry" ? "Terminal wirklich beenden?" : "Ordner wirklich löschen?"}</strong>
            <p>{confirmDelete.kind === "entry"
              ? `„${confirmDelete.name}“ wird beendet und entfernt. ${document?.entries.find((entry) => entry.id === confirmDelete.id)?.persistent ? "Das Terminal ist persistent — der Eintrag geht dabei verloren." : ""}`
              : `„${confirmDelete.name}“ wird gelöscht. Enthaltene Terminals und Unterordner wandern in den übergeordneten Ordner und laufen weiter.`}</p>
            <div className="terminal-confirm-actions">
              <button type="button" className="quiet-button" onClick={() => setConfirmDelete(null)}>Abbrechen</button>
              <button type="button" className="quiet-button-danger" onClick={confirmDeleteAction}>Löschen</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
