import type {
  TerminalAreaLayout,
  TerminalEntry,
  TerminalEntryPatch,
  TerminalFolder,
  TerminalPaneLayout,
  TerminalWorkspaceOperation,
  TerminalWorkspaceV2,
} from "@wrapt/contracts";
import { generateId } from "../../../lib/id";

export const DEFAULT_FOLDER_ID = "default";

/** Wendet Operationen optimistisch auf ein V2-Dokument an. Anders als der
 *  Server ist der Client tolerant: bereits ausgeführte oder gelöschte Ziele
 *  werden als No-Op behandelt, damit ein Rebase nach einem 409 nie hängen
 *  bleibt. Der Server bleibt die strikte, autoritative Instanz. */
export function applyWorkspaceOperations(document: TerminalWorkspaceV2, operations: TerminalWorkspaceOperation[]): TerminalWorkspaceV2 {
  let next = document;
  for (const operation of operations) next = applyOperation(next, operation);
  return next;
}

function applyOperation(document: TerminalWorkspaceV2, operation: TerminalWorkspaceOperation): TerminalWorkspaceV2 {
  switch (operation.type) {
    case "createEntry":
      return document.entries.some((entry) => entry.id === operation.entry.id) ? document : { ...document, entries: [...document.entries, operation.entry] };
    case "updateEntry": {
      const index = document.entries.findIndex((entry) => entry.id === operation.id);
      if (index < 0) return document;
      const entries = [...document.entries];
      entries[index] = { ...mergePatch(entries[index]!, operation.patch), id: operation.id };
      return { ...document, entries };
    }
    case "deleteEntry": {
      const entry = document.entries.find((candidate) => candidate.id === operation.id);
      if (!entry) return document;
      return { ...document, entries: document.entries.filter((candidate) => candidate.id !== operation.id), areaLayouts: removeRuntimeFromAllLayouts(document.areaLayouts, entry.runtimeId) };
    }
    case "createFolder":
      return document.folders.some((folder) => folder.id === operation.folder.id) ? document : { ...document, folders: [...document.folders, operation.folder] };
    case "updateFolder": {
      const index = document.folders.findIndex((folder) => folder.id === operation.id);
      if (index < 0) return document;
      const folders = [...document.folders];
      folders[index] = { ...mergePatch(folders[index]!, operation.patch), id: operation.id };
      return { ...document, folders };
    }
    case "deleteFolder": {
      if (!document.folders.some((folder) => folder.id === operation.id)) return document;
      const folders = document.folders.filter((candidate) => candidate.id !== operation.id);
      const entries = document.entries.map((entry) => entry.parentFolderId === operation.id ? { ...entry, parentFolderId: operation.moveChildrenTo } : entry);
      const movedFolders = folders.map((candidate) => candidate.parentFolderId === operation.id ? { ...candidate, parentFolderId: operation.moveChildrenTo } : candidate);
      return { ...document, folders: movedFolders, entries };
    }
    case "setPaneLayout": {
      const current = document.areaLayouts[operation.areaId] ?? { paneLayout: null, focusedPaneId: null };
      const focusedPaneId = operation.layout === null ? null
        : layoutContainsPane(operation.layout, current.focusedPaneId) ? current.focusedPaneId
        : operation.layout.type === "pane" ? operation.layout.id : operation.layout.children[0]!.id;
      return { ...document, areaLayouts: { ...document.areaLayouts, [operation.areaId]: { paneLayout: operation.layout, focusedPaneId } } };
    }
    case "setFocusedPane": {
      const current = document.areaLayouts[operation.areaId];
      if (operation.paneId !== null && (!current?.paneLayout || !layoutContainsPane(current.paneLayout, operation.paneId))) return document;
      const nextLayout: TerminalAreaLayout = current
        ? { ...current, focusedPaneId: operation.paneId }
        : { paneLayout: null, focusedPaneId: operation.paneId };
      return { ...document, areaLayouts: { ...document.areaLayouts, [operation.areaId]: nextLayout } };
    }
  }
}

function removeRuntimeFromAllLayouts(areaLayouts: Record<string, TerminalAreaLayout>, runtimeId: string | null): Record<string, TerminalAreaLayout> {
  if (runtimeId === null) return areaLayouts;
  const next: Record<string, TerminalAreaLayout> = {};
  for (const [areaKey, areaLayout] of Object.entries(areaLayouts)) {
    const paneLayout = removeRuntimeFromLayout(areaLayout.paneLayout, runtimeId);
    const focusedPaneId = areaLayout.focusedPaneId !== null && paneLayout !== null && layoutContainsPane(paneLayout, areaLayout.focusedPaneId)
      ? areaLayout.focusedPaneId
      : paneLayout === null ? null : paneLayout.type === "pane" ? paneLayout.id : paneLayout.children[0]!.id;
    next[areaKey] = { paneLayout, focusedPaneId };
  }
  return next;
}

function mergePatch<T extends object>(base: T, patch: Record<string, unknown>): T {
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as T;
}

// ---------------------------------------------------------------------------
// Helfer für Sidebar und Pane-Layout
// ---------------------------------------------------------------------------

export function createEntry(partial: Partial<TerminalEntry> & { kind: TerminalEntry["kind"] }): TerminalEntry {
  return {
    id: `entry-${generateId()}`,
    name: "Terminal",
    parentFolderId: DEFAULT_FOLDER_ID,
    sortOrder: 0,
    pinned: false,
    persistent: false,
    projectId: null,
    initialCwd: null,
    runtimeId: null,
    ...partial,
  };
}

export function createFolder(partial: Partial<TerminalFolder>): TerminalFolder {
  return {
    id: `folder-${generateId()}`,
    parentFolderId: null,
    name: "Neuer Ordner",
    sortOrder: 0,
    collapsed: false,
    ...partial,
  };
}

export function nextSortOrder(items: Array<{ sortOrder: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);
}

/** Erzeugt einen Pane-Knoten für eine Runtime-ID. */
export function paneForRuntime(runtimeId: string): Extract<TerminalPaneLayout, { type: "pane" }> {
  return { type: "pane", id: `pane-${runtimeId}`, runtimeId };
}

export function layoutContainsRuntime(layout: TerminalPaneLayout | null, runtimeId: string): boolean {
  if (layout === null) return false;
  if (layout.type === "pane") return layout.runtimeId === runtimeId;
  return layout.children.some((pane) => pane.runtimeId === runtimeId);
}

export function layoutContainsPane(layout: TerminalPaneLayout | null, paneId: string | null): boolean {
  if (layout === null || paneId === null) return false;
  if (layout.type === "pane") return layout.id === paneId;
  return layout.children.some((pane) => pane.id === paneId);
}

/** Alle Runtime-IDs, die in einem Layout sichtbar sind. */
export function layoutRuntimeIds(layout: TerminalPaneLayout | null): string[] {
  if (layout === null) return [];
  if (layout.type === "pane") return [layout.runtimeId];
  return layout.children.map((pane) => pane.runtimeId);
}

/** Entfernt eine Runtime aus einem Layout und kollabiert Splits sauber. */
export function removeRuntimeFromLayout(layout: TerminalPaneLayout | null, runtimeId: string): TerminalPaneLayout | null {
  if (layout === null) return null;
  if (layout.type === "pane") return layout.runtimeId === runtimeId ? null : layout;
  const children = layout.children.filter((pane) => pane.runtimeId !== runtimeId);
  if (children.length >= 2) return { ...layout, sizes: layout.sizes.slice(0, children.length), children: children.slice(0, 4) };
  if (children.length === 1) return paneForRuntime(children[0]!.runtimeId);
  return null;
}

/** Öffnet eine Runtime in einem Layout: ersetzt den fokussierten Pane bei
 *  einem Split, sonst wird das Layout zu einem einzelnen Pane. */
export function openRuntimeInLayout(layout: TerminalPaneLayout | null, runtimeId: string): TerminalPaneLayout {
  const pane = paneForRuntime(runtimeId);
  if (layout === null || layout.type === "pane") return pane;
  const children = layout.children.map((child) => paneForRuntime(child.runtimeId));
  children[0] = pane;
  return { ...layout, children };
}

/** Ersetzt den fokussierten Pane eines Layouts durch eine andere Runtime. */
export function replaceFocusedPane(layout: TerminalPaneLayout | null, focusedPaneId: string | null, runtimeId: string): TerminalPaneLayout {
  const pane = paneForRuntime(runtimeId);
  if (layout === null || layout.type === "pane") return pane;
  const index = layout.children.findIndex((child) => child.id === focusedPaneId);
  const children = layout.children.map((child, childIndex) => childIndex === (index >= 0 ? index : 0) ? pane : child);
  return { ...layout, children };
}

/** Sortierte Kinder eines Ordners (Entries und Unterordner getrennt);
 *  `null` steht für die Root-Ebene. */
export function childrenOfFolder(document: TerminalWorkspaceV2, folderId: string | null): { entries: TerminalEntry[]; folders: TerminalFolder[] } {
  const entries = document.entries
    .filter((entry) => entry.parentFolderId === folderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const folders = document.folders
    .filter((folder) => folder.parentFolderId === folderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { entries, folders };
}

/** Pins (global, über Ordner hinweg) in stabiler Reihenfolge. */
export function pinnedEntries(document: TerminalWorkspaceV2): TerminalEntry[] {
  return document.entries
    .filter((entry) => entry.pinned)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Root-Ordner (ohne Parent) in Sortierreihenfolge. */
export function rootFolders(document: TerminalWorkspaceV2): TerminalFolder[] {
  return document.folders
    .filter((folder) => folder.parentFolderId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function entryByRuntime(document: TerminalWorkspaceV2, runtimeId: string | null): TerminalEntry | undefined {
  if (runtimeId === null) return undefined;
  return document.entries.find((entry) => entry.runtimeId === runtimeId);
}

/** Setzt im Dokument die aktive Entry und liefert die dafür nötigen Ops. */
export function openEntryOps(document: TerminalWorkspaceV2, areaId: string, runtimeId: string): TerminalWorkspaceOperation[] {
  const current = document.areaLayouts[areaId] ?? { paneLayout: null, focusedPaneId: null };
  const layout = openRuntimeInLayout(current.paneLayout, runtimeId);
  return [
    { type: "setPaneLayout", areaId, layout },
    { type: "setFocusedPane", areaId, paneId: paneForRuntime(runtimeId).id },
  ];
}

/** Erstellt die Ops für einen neuen Ordner inklusive sortierter Einordnung. */
export function createFolderOps(document: TerminalWorkspaceV2, parentFolderId: string | null, name: string): TerminalWorkspaceOperation[] {
  const siblings = document.folders.filter((folder) => folder.parentFolderId === parentFolderId);
  const folder = createFolder({ parentFolderId, name, sortOrder: nextSortOrder(siblings) });
  return [{ type: "createFolder", folder }];
}

/** Erstellt die Ops für ein neues Terminal (Entry + in der Fläche öffnen). */
export function createTerminalOps(document: TerminalWorkspaceV2, areaId: string, partial: Partial<TerminalEntry> & { kind: TerminalEntry["kind"] }): { ops: TerminalWorkspaceOperation[]; runtimeId: string } {
  const runtimeId = generateId();
  // Alte beziehungsweise manuell angelegte V2-Dokumente können ohne den
  // Standardordner existieren. In diesem Fall muss ein Root-Terminal auch
  // wirklich auf Root angelegt werden, sonst weist der Server die Operation
  // wegen eines nicht vorhandenen Zielordners mit 409 zurück.
  const parentFolderId = partial.parentFolderId !== undefined
    ? partial.parentFolderId
    : document.folders.some((folder) => folder.id === DEFAULT_FOLDER_ID) ? DEFAULT_FOLDER_ID : null;
  const siblings = document.entries.filter((entry) => entry.parentFolderId === parentFolderId);
  const entry = createEntry({ ...partial, parentFolderId, runtimeId, sortOrder: nextSortOrder(siblings) });
  const layout = openRuntimeInLayout(document.areaLayouts[areaId]?.paneLayout ?? null, runtimeId);
  return {
    ops: [
      { type: "createEntry", entry },
      { type: "setPaneLayout", areaId, layout },
      { type: "setFocusedPane", areaId, paneId: paneForRuntime(runtimeId).id },
    ],
    runtimeId,
  };
}

/** Verschiebt eine Entry in einen Ordner mit neuer Sortierposition. */
export function moveEntryOps(document: TerminalWorkspaceV2, entryId: string, targetFolderId: string | null, targetIndex: number): TerminalWorkspaceOperation[] {
  const entry = document.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return [];
  const siblings = document.entries.filter((candidate) => candidate.parentFolderId === targetFolderId && candidate.id !== entryId);
  const reordered = [...siblings.slice(0, targetIndex), entry, ...siblings.slice(targetIndex)];
  const patch: TerminalEntryPatch = { parentFolderId: targetFolderId };
  const ops: TerminalWorkspaceOperation[] = [{ type: "updateEntry", id: entryId, patch }];
  reordered.forEach((candidate, index) => {
    if (candidate.sortOrder !== index) ops.push({ type: "updateEntry", id: candidate.id, patch: { sortOrder: index } });
  });
  return ops;
}

/** Verschiebt einen Ordner mit neuer Sortierposition (ohne Zyklenprüfung im Client). */
export function moveFolderOps(document: TerminalWorkspaceV2, folderId: string, targetParentId: string | null, targetIndex: number): TerminalWorkspaceOperation[] {
  const folder = document.folders.find((candidate) => candidate.id === folderId);
  if (!folder || createsFolderCycle(document, folderId, targetParentId)) return [];
  const siblings = document.folders.filter((candidate) => candidate.parentFolderId === targetParentId && candidate.id !== folderId);
  const reordered = [...siblings.slice(0, targetIndex), folder, ...siblings.slice(targetIndex)];
  const ops: TerminalWorkspaceOperation[] = [{ type: "updateFolder", id: folderId, patch: { parentFolderId: targetParentId } }];
  reordered.forEach((candidate, index) => {
    if (candidate.sortOrder !== index) ops.push({ type: "updateFolder", id: candidate.id, patch: { sortOrder: index } });
  });
  return ops;
}

/** Verhindert, dass eine optimistische DnD-Operation einen Ordnerzyklus
 *  erzeugt, bevor der Server die strikte Operation ablehnen kann. */
function createsFolderCycle(document: TerminalWorkspaceV2, folderId: string, targetParentId: string | null): boolean {
  const visited = new Set<string>();
  let current = targetParentId;
  while (current !== null && !visited.has(current)) {
    if (current === folderId) return true;
    visited.add(current);
    current = document.folders.find((folder) => folder.id === current)?.parentFolderId ?? null;
  }
  return false;
}
