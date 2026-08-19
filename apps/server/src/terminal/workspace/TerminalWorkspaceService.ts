import type {
  TerminalEntry,
  TerminalEntryPatch,
  TerminalFolder,
  TerminalFolderPatch,
  TerminalPaneLayout,
  TerminalWorkspaceOperation,
  TerminalWorkspaceV2,
} from "@wrapt/contracts";
import { AppError } from "../../utils/errors.js";

/** Wendet serverseitige Workspace-Operationen atomar auf ein V2-Dokument an.
 *  Jede Operation prüft ihre Invarianten; ein Fehler verwirft den gesamten
 *  Stapel, damit niemals ein halb konsistentes Dokument gespeichert wird. */
export class TerminalWorkspaceService {
  applyOperations(document: TerminalWorkspaceV2, operations: TerminalWorkspaceOperation[]): TerminalWorkspaceV2 {
    let next = document;
    for (const operation of operations) next = this.applyOperation(next, operation);
    return next;
  }

  private applyOperation(document: TerminalWorkspaceV2, operation: TerminalWorkspaceOperation): TerminalWorkspaceV2 {
    switch (operation.type) {
      case "createEntry": return this.createEntry(document, operation.entry);
      case "updateEntry": return this.updateEntry(document, operation.id, operation.patch);
      case "deleteEntry": return this.deleteEntry(document, operation.id);
      case "createFolder": return this.createFolder(document, operation.folder);
      case "updateFolder": return this.updateFolder(document, operation.id, operation.patch);
      case "deleteFolder": return this.deleteFolder(document, operation.id, operation.moveChildrenTo);
      case "setPaneLayout": return this.setPaneLayout(document, operation.areaId, operation.layout);
      case "setFocusedPane": return this.setFocusedPane(document, operation.areaId, operation.paneId);
    }
  }

  private conflict(message: string): never {
    throw new AppError(409, "TERMINAL_WORKSPACE_CONFLICT", message);
  }

  private folderExists(document: TerminalWorkspaceV2, folderId: string | null): boolean {
    return folderId === null || document.folders.some((folder) => folder.id === folderId);
  }

  private createEntry(document: TerminalWorkspaceV2, entry: TerminalEntry): TerminalWorkspaceV2 {
    if (document.entries.some((candidate) => candidate.id === entry.id)) this.conflict("Ein Terminal mit dieser ID existiert bereits.");
    if (!this.folderExists(document, entry.parentFolderId)) this.conflict("Der Zielordner existiert nicht.");
    return { ...document, entries: [...document.entries, entry] };
  }

  private updateEntry(document: TerminalWorkspaceV2, id: string, patch: TerminalEntryPatch): TerminalWorkspaceV2 {
    const index = document.entries.findIndex((entry) => entry.id === id);
    if (index < 0) this.conflict("Das Terminal wurde nicht gefunden.");
    if (patch.parentFolderId !== undefined && !this.folderExists(document, patch.parentFolderId)) this.conflict("Der Zielordner existiert nicht.");
    const entries = [...document.entries];
    entries[index] = { ...mergePatch(entries[index]!, patch), id };
    return { ...document, entries };
  }

  private deleteEntry(document: TerminalWorkspaceV2, id: string): TerminalWorkspaceV2 {
    const entry = document.entries.find((candidate) => candidate.id === id);
    if (!entry) this.conflict("Das Terminal wurde nicht gefunden.");
    const entries = document.entries.filter((candidate) => candidate.id !== id);
    const areaLayouts = Object.fromEntries(Object.entries(document.areaLayouts).map(([areaKey, areaLayout]) => {
      const paneLayout = removeEntryFromLayout(areaLayout.paneLayout, entry.runtimeId);
      const focusedPaneId = areaLayout.focusedPaneId !== null && paneLayout !== null && layoutContainsPane(paneLayout, areaLayout.focusedPaneId)
        ? areaLayout.focusedPaneId
        : paneLayout === null ? null : paneLayout.type === "pane" ? paneLayout.id : paneLayout.children[0]!.id;
      return [areaKey, { paneLayout, focusedPaneId }];
    }));
    return { ...document, entries, areaLayouts };
  }

  private createFolder(document: TerminalWorkspaceV2, folder: TerminalFolder): TerminalWorkspaceV2 {
    if (document.folders.some((candidate) => candidate.id === folder.id)) this.conflict("Ein Ordner mit dieser ID existiert bereits.");
    if (folder.parentFolderId !== null && !document.folders.some((candidate) => candidate.id === folder.parentFolderId)) this.conflict("Der übergeordnete Ordner existiert nicht.");
    return { ...document, folders: [...document.folders, folder] };
  }

  private updateFolder(document: TerminalWorkspaceV2, id: string, patch: TerminalFolderPatch): TerminalWorkspaceV2 {
    const index = document.folders.findIndex((folder) => folder.id === id);
    if (index < 0) this.conflict("Der Ordner wurde nicht gefunden.");
    if (patch.parentFolderId !== undefined && patch.parentFolderId !== id) {
      if (patch.parentFolderId !== null && !document.folders.some((folder) => folder.id === patch.parentFolderId)) this.conflict("Der übergeordnete Ordner existiert nicht.");
      if (patch.parentFolderId !== null && wouldCreateFolderCycle(document.folders, id, patch.parentFolderId)) this.conflict("Ein Ordner darf nicht in sich selbst verschachtelt werden.");
    }
    const folders = [...document.folders];
    folders[index] = { ...mergePatch(folders[index]!, patch), id };
    return { ...document, folders };
  }

  private deleteFolder(document: TerminalWorkspaceV2, id: string, moveChildrenTo: string | null): TerminalWorkspaceV2 {
    const folder = document.folders.find((candidate) => candidate.id === id);
    if (!folder) this.conflict("Der Ordner wurde nicht gefunden.");
    if (moveChildrenTo !== null && moveChildrenTo !== id && !document.folders.some((candidate) => candidate.id === moveChildrenTo)) {
      this.conflict("Der Zielordner existiert nicht.");
    }
    const folders = document.folders.filter((candidate) => candidate.id !== id);
    const entries = document.entries.map((entry) => entry.parentFolderId === id ? { ...entry, parentFolderId: moveChildrenTo } : entry);
    const movedFolders = folders.map((candidate) => candidate.parentFolderId === id ? { ...candidate, parentFolderId: moveChildrenTo } : candidate);
    return { ...document, folders: movedFolders, entries };
  }

  private setPaneLayout(document: TerminalWorkspaceV2, areaId: string, layout: TerminalPaneLayout | null): TerminalWorkspaceV2 {
    if (layout) validateLayoutEntries(document, layout);
    const current = document.areaLayouts[areaId] ?? { paneLayout: null, focusedPaneId: null };
    const focusedPaneId = layout === null ? null : layoutContainsPane(layout, current.focusedPaneId) ? current.focusedPaneId : layout.type === "pane" ? layout.id : layout.children[0]!.id;
    return { ...document, areaLayouts: { ...document.areaLayouts, [areaId]: { paneLayout: layout, focusedPaneId } } };
  }

  private setFocusedPane(document: TerminalWorkspaceV2, areaId: string, paneId: string | null): TerminalWorkspaceV2 {
    const current = document.areaLayouts[areaId] ?? { paneLayout: null, focusedPaneId: null };
    if (paneId !== null && (!current.paneLayout || !layoutContainsPane(current.paneLayout, paneId))) {
      this.conflict("Der fokussierte Pane liegt nicht im Layout.");
    }
    return { ...document, areaLayouts: { ...document.areaLayouts, [areaId]: { ...current, focusedPaneId: paneId } } };
  }
}

function removeEntryFromLayout(layout: TerminalPaneLayout | null, runtimeId: string | null): TerminalPaneLayout | null {
  if (layout === null || runtimeId === null) return layout;
  if (layout.type === "pane") return layout.runtimeId === runtimeId ? null : layout;
  const children = layout.children.filter((pane) => pane.runtimeId !== runtimeId);
  if (children.length >= 2) return { ...layout, sizes: layout.sizes.slice(0, children.length), children: children.slice(0, 4) };
  if (children.length === 1) return { type: "pane", id: `pane-${children[0]!.runtimeId}`, runtimeId: children[0]!.runtimeId };
  return null;
}

function validateLayoutEntries(document: TerminalWorkspaceV2, layout: TerminalPaneLayout): void {
  const runtimeIds = new Set(
    document.entries.map((entry) => entry.runtimeId).filter((id): id is string => id !== null),
  );
  const panes = layout.type === "pane" ? [layout] : layout.children;
  for (const pane of panes) {
    if (!runtimeIds.has(pane.runtimeId)) {
      throw new AppError(409, "TERMINAL_WORKSPACE_CONFLICT", "Ein Pane verweist auf ein unbekanntes Terminal.");
    }
  }
}

function layoutContainsPane(layout: TerminalPaneLayout, paneId: string | null): boolean {
  if (paneId === null) return false;
  if (layout.type === "pane") return layout.id === paneId;
  return layout.children.some((pane) => pane.id === paneId);
}

/** Mergt einen optionalen Patch verlustfrei (exactOptionalPropertyTypes). */
function mergePatch<T extends object>(base: T, patch: Record<string, unknown>): T {
  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as T;
}

function wouldCreateFolderCycle(folders: TerminalFolder[], folderId: string, newParentId: string): boolean {
  let cursor: string | null = newParentId;
  while (cursor !== null) {
    if (cursor === folderId) return true;
    cursor = folders.find((folder) => folder.id === cursor)?.parentFolderId ?? null;
  }
  return false;
}
