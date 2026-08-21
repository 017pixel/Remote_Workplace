import type { TerminalEntry, TerminalFolder, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, FolderOpenIcon, PinIcon, TerminalIcon } from "../../icons";
import { childrenOfFolder, entryByRuntime, layoutRuntimeIds } from "../workspace/terminalWorkspaceModel";
import type { TerminalStatus } from "../terminal-types";
import type { DndDropTarget, RowHandlers } from "./useTerminalDnd";

export interface TerminalTreeCallbacks {
  onOpenEntry(runtimeId: string): void;
  onOpenInSplit(runtimeId: string): void;
  onTogglePin(entryId: string): void;
  onTogglePersistent(entryId: string): void;
  onDeleteEntry(entryId: string): void;
  onRenameEntry(entryId: string): void;
  onNewTerminal(folderId: string | null): void;
  onNewFolder(parentFolderId: string | null): void;
  onRenameFolder(folderId: string): void;
  onToggleCollapse(folderId: string): void;
  onDeleteFolder(folderId: string): void;
  onContextMenu(event: { clientX: number; clientY: number }, kind: "entry" | "folder", id: string): void;
  onMoveEntry(entryId: string, targetFolderId: string | null, targetIndex: number): void;
  onMoveFolder(folderId: string, targetParentId: string | null, targetIndex: number): void;
  onResync(runtimeId: string): void;
  onRestart(runtimeId: string): void;
  onHoverStart(entryId: string, anchor: HTMLElement): void;
  onHoverEnd(entryId: string): void;
}

interface TerminalTreeProps {
  document: TerminalWorkspaceV2;
  folderId: string | null;
  depth: number;
  areaId: string;
  meta: Record<string, TerminalStatus | undefined>;
  cwds: Record<string, string>;
  sessions: Array<{ runtimeId: string; status: string; cwd: string }>;
  editing: { kind: "entry" | "folder"; id: string } | null;
  editingValue: string;
  onEditingValueChange(value: string): void;
  onCommitEdit(): void;
  onCancelEdit(): void;
  dropTarget: DndDropTarget | null;
  filter?: string;
  createRowHandlers(kind: "entry" | "folder", id: string, label: string): RowHandlers;
  callbacks: TerminalTreeCallbacks;
}

function entryStatus(entry: TerminalEntry, meta: TerminalStatus | undefined, sessions: TerminalTreeProps["sessions"]): TerminalStatus {
  if (meta) return meta;
  const session = entry.runtimeId ? sessions.find((candidate) => candidate.runtimeId === entry.runtimeId) : undefined;
  if (!session) return "disconnected";
  return session.status === "running" ? "connected" : "exited";
}

export function TerminalTree({ document, folderId, depth, areaId, meta, cwds, sessions, editing, editingValue, onEditingValueChange, onCommitEdit, onCancelEdit, dropTarget, filter = "", createRowHandlers, callbacks }: TerminalTreeProps) {
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const folderHasMatch = (candidateId: string, ancestors: ReadonlySet<string> = new Set()): boolean => {
    if (ancestors.has(candidateId)) return false;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(candidateId);
    const children = childrenOfFolder(document, candidateId);
    return children.entries.some((entry) => entry.name.toLocaleLowerCase().includes(normalizedFilter))
      || children.folders.some((folder) => folder.name.toLocaleLowerCase().includes(normalizedFilter) || folderHasMatch(folder.id, nextAncestors));
  };
  const visibleChildren = (parentId: string | null) => {
    const children = childrenOfFolder(document, parentId);
    if (!normalizedFilter) return children;
    return {
      entries: children.entries.filter((entry) => entry.name.toLocaleLowerCase().includes(normalizedFilter)),
      folders: children.folders.filter((folder) => folder.name.toLocaleLowerCase().includes(normalizedFilter) || folderHasMatch(folder.id)),
    };
  };
  const { entries, folders } = visibleChildren(folderId);
  const visibleRuntimeIds = new Set(layoutRuntimeIds(document.areaLayouts[areaId]?.paneLayout ?? null));
  const focusedRuntimeId = (() => {
    const layout = document.areaLayouts[areaId]?.paneLayout ?? null;
    const focusedPaneId = document.areaLayouts[areaId]?.focusedPaneId ?? null;
    if (!layout) return null;
    if (layout.type === "pane") return layout.runtimeId;
    return layout.children.find((pane) => pane.id === focusedPaneId)?.runtimeId ?? layout.children[0]!.runtimeId;
  })();

  const renderEntry = (entry: TerminalEntry, level: number) => {
    const isEditing = editing?.kind === "entry" && editing.id === entry.id;
    const status = entryStatus(entry, entry.runtimeId ? meta[entry.runtimeId] : undefined, sessions);
    const isOpen = entry.runtimeId !== null && visibleRuntimeIds.has(entry.runtimeId);
    const isFocused = entry.runtimeId !== null && entry.runtimeId === focusedRuntimeId;
    const isDropBefore = dropTarget?.kind === "entry" && dropTarget.id === entry.id && dropTarget.position === "before";
    const isDropAfter = dropTarget?.kind === "entry" && dropTarget.id === entry.id && dropTarget.position === "after";
    const cwd = entry.runtimeId
      ? (cwds[entry.runtimeId] ?? sessions.find((session) => session.runtimeId === entry.runtimeId)?.cwd ?? entry.initialCwd)
      : entry.initialCwd;
    const rowHandlers = createRowHandlers("entry", entry.id, entry.name);
    return (
      <li key={entry.id} className="terminal-tree-entry">
        <div
          data-dnd={`entry:${entry.id}`}
          className={`terminal-tree-row is-entry ${isOpen ? "is-open" : ""} ${isFocused ? "is-focused" : ""} ${isDropBefore || isDropAfter ? "is-drop-sibling" : ""}`}
          style={{ paddingLeft: level * 14 + 22 }}
          {...rowHandlers}
          onContextMenu={(event) => { event.preventDefault(); callbacks.onContextMenu(event, "entry", entry.id); }}
          onMouseEnter={(event) => callbacks.onHoverStart(entry.id, event.currentTarget)}
          onMouseLeave={() => callbacks.onHoverEnd(entry.id)}
          onClick={() => { if (entry.runtimeId) callbacks.onOpenEntry(entry.runtimeId); }}
        >
          <span className={`terminal-tree-status is-${status}`} aria-hidden />
          <span className="terminal-tree-icon">{entry.kind === "shell" ? <TerminalIcon className="h-4 w-4" /> : <TerminalIcon className="h-4 w-4" />}</span>
          {isEditing ? (
            <input
              className="terminal-tree-input"
              value={editingValue}
              autoFocus
              onChange={(event) => onEditingValueChange(event.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") onCommitEdit();
                if (event.key === "Escape") onCancelEdit();
              }}
            />
          ) : (
            <span className="terminal-tree-label-wrap">
              <span className="terminal-tree-label">{entry.name}</span>
              {cwd && cwd.startsWith("/") ? <span className="terminal-tree-cwd" title={cwd}>{cwd}</span> : null}
            </span>
          )}
          {entry.pinned ? <PinIcon className="terminal-tree-pin h-3 w-3" aria-label="Gepinnt" /> : null}
          {entry.persistent ? <span className="terminal-tree-persistent" title="Persistent">24/7</span> : null}
        </div>
      </li>
    );
  };

  /** Rendert echte Kinder je Ordner. Die frühere Implementierung schloss über
   *  die Root-`folders` und rief diese Liste rekursiv erneut auf — schon ein
   *  einzelner Root-Ordner führte dadurch zum Stack Overflow. Der Pfad-Satz
   *  schützt zusätzlich gegen beschädigte zyklische Alt-Dokumente. */
  const renderFolder = (folder: TerminalFolder, level: number, ancestors: ReadonlySet<string> = new Set()) => {
    if (ancestors.has(folder.id)) return null;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(folder.id);
    const children = visibleChildren(folder.id);
    const isEditing = editing?.kind === "folder" && editing.id === folder.id;
    const isCollapsed = normalizedFilter ? false : folder.collapsed;
    const isDropInside = dropTarget?.kind === "folder" && dropTarget.id === folder.id && dropTarget.position === "inside";
    const isDropBefore = dropTarget?.kind === "folder" && dropTarget.id === folder.id && dropTarget.position === "before";
    const isDropAfter = dropTarget?.kind === "folder" && dropTarget.id === folder.id && dropTarget.position === "after";
    const rowHandlers = createRowHandlers("folder", folder.id, folder.name);
    return (
      <li key={folder.id} className="terminal-tree-folder">
        <div
          data-dnd={`folder:${folder.id}`}
          className={`terminal-tree-row is-folder ${isCollapsed ? "is-collapsed" : ""} ${isDropInside ? "is-drop-inside" : isDropBefore || isDropAfter ? "is-drop-sibling" : ""}`}
          style={{ paddingLeft: level * 14 }}
          {...rowHandlers}
          onContextMenu={(event) => { event.preventDefault(); callbacks.onContextMenu(event, "folder", folder.id); }}
        >
          <button
            type="button"
            className="terminal-tree-chevron"
            aria-label={isCollapsed ? "Ordner aufklappen" : "Ordner zuklappen"}
            onClick={() => callbacks.onToggleCollapse(folder.id)}
          >
            {isCollapsed ? <ChevronRightIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
          </button>
          <span className="terminal-tree-icon">{folder.collapsed ? <FolderIcon className="h-4 w-4" /> : <FolderOpenIcon className="h-4 w-4" />}</span>
          {isEditing ? (
            <input
              className="terminal-tree-input"
              value={editingValue}
              autoFocus
              onChange={(event) => onEditingValueChange(event.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") onCommitEdit();
                if (event.key === "Escape") onCancelEdit();
              }}
            />
          ) : (
            <button type="button" className="terminal-tree-label" onClick={() => callbacks.onToggleCollapse(folder.id)}>{folder.name}</button>
          )}
          <span className="terminal-tree-count">{children.entries.length + children.folders.length}</span>
        </div>
        {!isCollapsed ? <ul className="terminal-tree-children">
          {children.entries.map((entry) => renderEntry(entry, level + 1))}
          {children.folders.map((child) => renderFolder(child, level + 1, nextAncestors))}
        </ul> : null}
      </li>
    );
  };

  const renderEntries = () => entries.map((entry) => renderEntry(entry, depth + 1));
  const renderFolders = () => folders.map((folder) => renderFolder(folder, depth));

  if (folderId === null) {
    return <ul className="terminal-tree">{renderEntries()}{renderFolders()}</ul>;
  }
  return <>{renderEntries()}{renderFolders()}</>;
}

export { entryByRuntime };
