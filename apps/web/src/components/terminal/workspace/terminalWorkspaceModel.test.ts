import { describe, expect, it } from "vitest";
import type { TerminalPaneLayout, TerminalWorkspaceV2 } from "@wrapt/contracts";
import {
  applyWorkspaceOperations,
  appendRuntimeToLayout,
  childrenOfFolder,
  createFolderOps,
  createTerminalOps,
  layoutRuntimeIds,
  MAX_TERMINAL_PANES,
  moveEntryOps,
  moveFolderOps,
  openEntryOps,
  openRuntimeInLayout,
  removeRuntimeFromLayout,
  sanitizePaneLayout,
  sanitizeWorkspaceDocument,
} from "./terminalWorkspaceModel";

function document(): TerminalWorkspaceV2 {
  return {
    version: 2,
    entries: [],
    folders: [{ id: "default", parentFolderId: null, name: "Terminal", sortOrder: 0, collapsed: false }],
    areaLayouts: {},
  };
}

const RUNTIME_A = "00000000-0000-4000-8000-000000000001";
const RUNTIME_B = "00000000-0000-4000-8000-000000000002";
const RUNTIME_C = "00000000-0000-4000-8000-000000000003";
const RUNTIME_D = "00000000-0000-4000-8000-000000000004";
const RUNTIME_E = "00000000-0000-4000-8000-000000000005";

describe("applyWorkspaceOperations", () => {
  it("legt Terminals an und öffnet sie in einer Fläche", () => {
    const { ops, runtimeId } = createTerminalOps(document(), "standalone", { kind: "shell", name: "Terminal 1" });
    const next = applyWorkspaceOperations(document(), ops);
    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]).toMatchObject({ runtimeId, name: "Terminal 1", parentFolderId: "default" });
    expect(next.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId });
    expect(next.areaLayouts.standalone!.focusedPaneId).toBe(`pane-${runtimeId}`);
  });

  it("behandelt Wiederholungen tolerant (Rebase nach 409)", () => {
    const { ops } = createTerminalOps(document(), "standalone", { kind: "shell" });
    const once = applyWorkspaceOperations(document(), ops);
    const twice = applyWorkspaceOperations(once, ops);
    expect(twice.entries).toHaveLength(1);
    const withoutEntry = applyWorkspaceOperations(twice, [{ type: "deleteEntry", id: "entry-gibts-nicht" }]);
    expect(withoutEntry.entries).toHaveLength(1);
  });

  it("entfernt gelöschte Terminals aus allen Flächen-Layouts", () => {
    const withA = applyWorkspaceOperations(document(), [{ type: "createEntry", entry: { id: "entry-a", runtimeId: RUNTIME_A, name: "A", parentFolderId: "default", sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null } }]);
    const withLayout = applyWorkspaceOperations(withA, openEntryOps(withA, "standalone", RUNTIME_A));
    const result = applyWorkspaceOperations(withLayout, [{ type: "deleteEntry", id: "entry-a" }]);
    expect(result.areaLayouts.standalone!.paneLayout).toBeNull();
  });

  it("setzt den Fokus auf den ersten Pane, wenn der fokussierte verschwindet", () => {
    const base = applyWorkspaceOperations(document(), [
      { type: "createEntry", entry: { id: "entry-a", runtimeId: RUNTIME_A, name: "A", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null } },
      { type: "createEntry", entry: { id: "entry-b", runtimeId: RUNTIME_B, name: "B", parentFolderId: null, sortOrder: 1, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null } },
      { type: "setPaneLayout", areaId: "standalone", layout: { type: "split", id: "split-1", orientation: "horizontal", sizes: [50, 50], children: [{ type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A }, { type: "pane", id: `pane-${RUNTIME_B}`, runtimeId: RUNTIME_B }] } },
      { type: "setFocusedPane", areaId: "standalone", paneId: `pane-${RUNTIME_A}` },
    ]);
    expect(base.areaLayouts.standalone!.focusedPaneId).toBe(`pane-${RUNTIME_A}`);
    const result = applyWorkspaceOperations(base, [{ type: "deleteEntry", id: "entry-a" }]);
    expect(result.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId: RUNTIME_B });
    expect(result.areaLayouts.standalone!.focusedPaneId).toBe(`pane-${RUNTIME_B}`);
  });
});

describe("Terminal-Erstellung", () => {
  it("legt ein Root-Terminal auch ohne Standardordner an", () => {
    const empty: TerminalWorkspaceV2 = { version: 2, entries: [], folders: [], areaLayouts: {} };
    const { ops } = createTerminalOps(empty, "standalone", { kind: "shell" });
    const next = applyWorkspaceOperations(empty, ops);
    expect(next.entries[0]).toMatchObject({ parentFolderId: null });
    expect(next.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane" });
  });
});

describe("Layout-Helfer", () => {
  it("fügt per Split bis zu vier Terminals rechts an und begrenzt danach", () => {
    let layout = appendRuntimeToLayout(null, RUNTIME_A);
    layout = appendRuntimeToLayout(layout, RUNTIME_B);
    layout = appendRuntimeToLayout(layout, RUNTIME_C);
    layout = appendRuntimeToLayout(layout, RUNTIME_D);
    expect(layoutRuntimeIds(layout)).toEqual([RUNTIME_A, RUNTIME_B, RUNTIME_C, RUNTIME_D]);
    expect(layout.type === "split" ? layout.sizes.reduce((sum, size) => sum + size, 0) : 0).toBeCloseTo(100);
    expect(appendRuntimeToLayout(layout, RUNTIME_E)).toBe(layout);
    expect(MAX_TERMINAL_PANES).toBe(4);
  });

  it("öffnet ein anderes Sidebar-Terminal einzeln und behält Gruppenklicks gesplittet", () => {
    const split = appendRuntimeToLayout(appendRuntimeToLayout(null, RUNTIME_A), RUNTIME_B);
    const base = applyWorkspaceOperations(document(), [{ type: "setPaneLayout", areaId: "standalone", layout: split }]);
    const single = applyWorkspaceOperations(base, openEntryOps(base, "standalone", RUNTIME_C));
    expect(single.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId: RUNTIME_C });
    const grouped = applyWorkspaceOperations(base, openEntryOps(base, "standalone", RUNTIME_B));
    expect(grouped.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "split" });
    expect(grouped.areaLayouts.standalone!.focusedPaneId).toBe(`pane-${RUNTIME_B}`);
  });

  it("öffnet eine Runtime und ersetzt dabei das bestehende Layout", () => {
    const single = openRuntimeInLayout(null, RUNTIME_A);
    expect(single).toMatchObject({ type: "pane", runtimeId: RUNTIME_A });
    expect(layoutRuntimeIds(single)).toEqual([RUNTIME_A]);
    const replaced = openRuntimeInLayout(single, RUNTIME_B);
    expect(replaced).toMatchObject({ type: "pane", runtimeId: RUNTIME_B });
  });

  it("entfernt Runtimes und kollabiert Splits sauber", () => {
    const split = openRuntimeInLayout(openRuntimeInLayout(null, RUNTIME_A), RUNTIME_B);
    const collapsed = removeRuntimeFromLayout(split, RUNTIME_A);
    expect(collapsed).toMatchObject({ type: "pane", runtimeId: RUNTIME_B });
    expect(removeRuntimeFromLayout(collapsed, RUNTIME_B)).toBeNull();
  });

  it("normalisiert die Größen beim Entfernen aus einem Vierer-Split", () => {
    let split = appendRuntimeToLayout(null, RUNTIME_A);
    split = appendRuntimeToLayout(split, RUNTIME_B);
    split = appendRuntimeToLayout(split, RUNTIME_C);
    split = appendRuntimeToLayout(split, RUNTIME_D);
    const remaining = removeRuntimeFromLayout(split, RUNTIME_B);
    expect(layoutRuntimeIds(remaining)).toEqual([RUNTIME_A, RUNTIME_C, RUNTIME_D]);
    expect(remaining?.type === "split" ? remaining.sizes.reduce((sum, size) => sum + size, 0) : 0).toBeCloseTo(100);
  });

  it("erzeugt Split- und Verschiebe-Operationen inklusive Sortierung", () => {
    const base = applyWorkspaceOperations(document(), [
      { type: "createEntry", entry: { id: "entry-a", runtimeId: RUNTIME_A, name: "A", parentFolderId: "default", sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null } },
      { type: "createEntry", entry: { id: "entry-b", runtimeId: RUNTIME_B, name: "B", parentFolderId: "default", sortOrder: 1, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null } },
    ]);
    const moved = moveEntryOps(base, "entry-b", "default", 0);
    const result = applyWorkspaceOperations(base, moved);
    expect(childrenOfFolder(result, "default").entries.map((entry) => entry.id)).toEqual(["entry-b", "entry-a"]);
    expect(result.entries.find((entry) => entry.id === "entry-b")!.sortOrder).toBe(0);
    expect(result.entries.find((entry) => entry.id === "entry-a")!.sortOrder).toBe(1);
  });

  it("erzeugt Ordner und Unterordner mit Sortierung", () => {
    const withFolder = applyWorkspaceOperations(document(), createFolderOps(document(), null, "Projekte"));
    expect(withFolder.folders).toHaveLength(2);
    const withSub = applyWorkspaceOperations(withFolder, createFolderOps(withFolder, "folder-1", "Sub"));
    expect(childrenOfFolder(withSub, "folder-1").folders).toHaveLength(1);
  });

  it("verschiebt Ordner inklusive Reihenfolge", () => {
    const base = applyWorkspaceOperations(document(), [
      { type: "createFolder", folder: { id: "f1", parentFolderId: null, name: "Eins", sortOrder: 1, collapsed: false } },
      { type: "createFolder", folder: { id: "f2", parentFolderId: null, name: "Zwei", sortOrder: 2, collapsed: false } },
    ]);
    const result = applyWorkspaceOperations(base, moveFolderOps(base, "f2", null, 0));
    expect(childrenOfFolder(result, null).folders.map((folder) => folder.id)).toEqual(["f2", "default", "f1"]);
    expect(result.folders.find((folder) => folder.id === "f2")!.sortOrder).toBe(0);
  });

  it("verhindert beim optimistischen Verschieben einen Ordnerzyklus", () => {
    const base = applyWorkspaceOperations(document(), [
      { type: "createFolder", folder: { id: "parent", parentFolderId: "default", name: "Parent", sortOrder: 0, collapsed: false } },
      { type: "createFolder", folder: { id: "child", parentFolderId: "parent", name: "Child", sortOrder: 0, collapsed: false } },
    ]);
    expect(moveFolderOps(base, "parent", "child", 0)).toEqual([]);
  });
});

describe("Layout-Sanitizing (doppelte Pane-IDs)", () => {
  it("entfernt doppelte Pane-IDs aus Splits und kollabiert Einzel-Splits", () => {
    const split: TerminalPaneLayout = {
      type: "split", id: "split-1", orientation: "horizontal", sizes: [50, 50],
      children: [{ type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A }, { type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A }],
    };
    const single = sanitizePaneLayout(split);
    expect(single).toMatchObject({ type: "pane", runtimeId: RUNTIME_A });
    expect(sanitizePaneLayout(null)).toBeNull();
  });

  it("normalisiert Split-Größen nach dem Entfernen von Duplikaten", () => {
    const split: TerminalPaneLayout = {
      type: "split", id: "split-1", orientation: "horizontal", sizes: [50, 50, 50],
      children: [
        { type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A },
        { type: "pane", id: `pane-${RUNTIME_B}`, runtimeId: RUNTIME_B },
        { type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A },
      ],
    };
    const cleaned = sanitizePaneLayout(split);
    expect(cleaned).toMatchObject({ type: "split" });
    expect(layoutRuntimeIds(cleaned)).toEqual([RUNTIME_A, RUNTIME_B]);
    expect(cleaned!.type === "split" ? cleaned!.sizes : []).toEqual([50, 50]);
  });

  it("säubert korrupte Layouts beim Anwenden von setPaneLayout", () => {
    const dup: TerminalPaneLayout = { type: "split", id: "split-1", orientation: "horizontal", sizes: [50, 50], children: [
      { type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A },
      { type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A },
    ] };
    const result = applyWorkspaceOperations(document(), [{ type: "setPaneLayout", areaId: "standalone", layout: dup }]);
    expect(result.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId: RUNTIME_A });
  });

  it("öffnet eine bereits laufende Runtime nicht doppelt im Layout", () => {
    const base = applyWorkspaceOperations(document(), [
      { type: "createEntry", entry: { id: "entry-a", runtimeId: RUNTIME_A, name: "A", parentFolderId: "default", sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null } },
      { type: "createEntry", entry: { id: "entry-b", runtimeId: RUNTIME_B, name: "B", parentFolderId: "default", sortOrder: 1, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null } },
      { type: "setPaneLayout", areaId: "standalone", layout: { type: "split", id: "split-1", orientation: "horizontal", sizes: [50, 50], children: [{ type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A }, { type: "pane", id: `pane-${RUNTIME_B}`, runtimeId: RUNTIME_B }] } },
    ]);
    const ops = openEntryOps(base, "standalone", RUNTIME_A);
    const result = applyWorkspaceOperations(base, ops);
    expect(result.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "split" });
    expect(layoutRuntimeIds(result.areaLayouts.standalone!.paneLayout)).toEqual([RUNTIME_A, RUNTIME_B]);
    expect(result.areaLayouts.standalone!.focusedPaneId).toBe(`pane-${RUNTIME_A}`);
  });

  it("säubert persistierte Dokumente mit doppelten Pane-IDs", () => {
    const corrupted = document();
    corrupted.areaLayouts.standalone = {
      paneLayout: { type: "split", id: "split-1", orientation: "horizontal", sizes: [50, 50], children: [
        { type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A },
        { type: "pane", id: `pane-${RUNTIME_A}`, runtimeId: RUNTIME_A },
      ] },
      focusedPaneId: `pane-${RUNTIME_A}`,
    };
    const clean = sanitizeWorkspaceDocument(corrupted);
    expect(clean.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId: RUNTIME_A });
  });
});
