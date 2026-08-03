import { beforeEach, describe, expect, it } from "vitest";
import { orbitWorkspaceSchema, type Workspace } from "@workbench/contracts";
import { freshOrbitWorkspace, migrateOrbitDocument, migrateWorkspaceToOrbit, previewSlotGeometry, useOrbitStore } from "./orbit";

const legacy: Workspace = {
  version: 3,
  selectedProjectId: "remote-workplace",
  panels: [{ id: "terminal-one", type: "terminal", projectId: "remote-workplace", previewId: null, reloadKey: 0 }],
  workspaces: [{ id: "legacy", name: "Arbeitsfläche", groups: [{ id: "group", panelIds: ["terminal-one"], activePanelId: "terminal-one" }], focusedGroupId: "group", layout: "single", layoutSizes: {} }],
  activeWorkspaceId: "legacy",
  maximizedPanelId: null,
  focusedPanelId: "terminal-one",
};

beforeEach(() => {
  useOrbitStore.setState({ document: freshOrbitWorkspace(), revision: 0, updatedAt: null, hydrated: true, dirty: false, saving: false, syncError: null, syncNotice: null });
});

describe("Orbit store", () => {
  it("hebt Dokumente von v6 auf v8 und erhält den sichtbaren Gerätezustand", () => {
    const legacyDocument = orbitWorkspaceSchema.parse({
      ...freshOrbitWorkspace(),
      version: 6,
      boards: [{
        ...freshOrbitWorkspace().boards[0]!,
        nodes: [{
          id: "slot-1",
          type: "previewSlot",
          title: "Slot",
          position: { x: 0, y: 0 },
          size: { width: 400, height: 720 },
          projectId: null,
          parentId: null,
          runtimeId: null,
          toolType: null,
          previewId: null,
          previewLayout: null,
          previewTarget: "5173",
          previewPath: "/",
          previewDeviceId: null,
          previewOrientation: "portrait",
          previewSlotId: null,
          previewStorageProfileId: null,
          previewIsolation: true,
          previewRuntime: "iframe",
          previewReferenceId: null,
          previewLastUsedAt: null,
          assetId: null,
          assetMimeType: null,
          assetBytes: null,
          provider: null,
          content: "",
          language: null,
          color: null,
          locked: false,
          zIndex: 1,
        }],
      }],
    });
    const migrated = migrateOrbitDocument(legacyDocument);
    expect(migrated.version).toBe(8);
    const slot = migrated.boards[0]!.nodes[0]!;
    // Bisher sichtbares Responsive bleibt erhalten, statt still auf iPhone 13 zu springen.
    expect(slot.previewDeviceId).toBe("responsive");
    expect(slot.previewStorageProfileId).toMatch(/^[0-9a-f-]{36}$/);
    // Ein bereits migriertes Dokument bleibt unverändert.
    expect(migrateOrbitDocument(migrated)).toBe(migrated);
  });


  it("migrates project-bound v3 panels into hubs, tool nodes and edges", () => {
    const migrated = migrateWorkspaceToOrbit(legacy);
    expect(migrated.version).toBe(8);
    expect(migrated.boards[0]!.nodes.map((node) => node.type)).toEqual(["project", "tool"]);
    expect(migrated.boards[0]!.edges).toHaveLength(1);
    expect(migrated.boards[0]!.nodes[1]).toMatchObject({ runtimeId: "terminal-one", projectId: "remote-workplace" });
  });

  it("creates editable nodes and maintains project bindings", () => {
    const hubId = useOrbitStore.getState().addNode({ type: "project", title: "Remote", projectId: "remote", position: { x: 0, y: 0 } });
    const noteId = useOrbitStore.getState().addNode({ type: "note", title: "Notiz", projectId: "remote", position: { x: 300, y: 100 }, content: "Start" });
    expect(hubId).toBeTruthy();
    expect(noteId).toBeTruthy();
    expect(useOrbitStore.getState().document.boards[0]!.edges).toHaveLength(1);
    useOrbitStore.getState().updateNode(noteId!, { content: "Gespeichert" });
    expect(useOrbitStore.getState().document.boards[0]!.nodes.find((node) => node.id === noteId)?.content).toBe("Gespeichert");
    useOrbitStore.getState().assignProject(noteId!, null);
    expect(useOrbitStore.getState().document.boards[0]!.edges).toHaveLength(0);
  });

  it("creates a standalone gallery node with its large default size", () => {
    const id = useOrbitStore.getState().addNode({ type: "gallery", title: "Mediengalerie", position: { x: 0, y: 0 } });
    const node = useOrbitStore.getState().document.boards[0]!.nodes.find((candidate) => candidate.id === id);
    expect(node).toMatchObject({ type: "gallery", toolType: null, runtimeId: null, size: { width: 1200, height: 850 } });
  });

  it("creates, grows, duplicates and removes complete preview groups", () => {
    const groupId = useOrbitStore.getState().addPreviewGroup({
      layout: "2",
      title: "Rollen-Test",
      position: { x: 120, y: 80 },
      targetPort: 1234,
    });
    expect(groupId).toBeTruthy();
    let board = useOrbitStore.getState().document.boards[0]!;
    expect(board.nodes.find((node) => node.id === groupId)).toMatchObject({
      type: "previewGroup",
      previewLayout: "2",
      size: { width: 1024, height: 885 },
    });
    expect(board.nodes.filter((node) => node.parentId === groupId)).toHaveLength(2);
    expect(board.nodes.filter((node) => node.parentId === groupId).every((node) => node.previewTarget === "1234")).toBe(true);
    // Neue Slots erben die Benutzerpräferenz; ein expliziter Wert entsteht erst bei Auswahl.
    expect(board.nodes.filter((node) => node.parentId === groupId).every((node) => node.previewDeviceId === null)).toBe(true);
    expect(board.nodes.filter((node) => node.parentId === groupId).every((node) => typeof node.previewStorageProfileId === "string")).toBe(true);

    // Die Gruppe wächst um die zusätzlichen Slots, statt die vorhandenen zu stauchen.
    const slotBefore = previewSlotGeometry(board.nodes.find((node) => node.id === groupId)!, 0).size;
    useOrbitStore.getState().setPreviewGroupLayout(groupId!, "6");
    board = useOrbitStore.getState().document.boards[0]!;
    const grown = board.nodes.find((node) => node.id === groupId)!;
    expect(grown).toMatchObject({
      previewLayout: "6",
      size: { width: 1532, height: 1718 },
    });
    expect(previewSlotGeometry(grown, 0).size).toEqual(slotBefore);
    expect(board.nodes.filter((node) => node.parentId === groupId)).toHaveLength(6);

    const duplicateId = useOrbitStore.getState().duplicateNode(groupId!);
    expect(duplicateId).toBeTruthy();
    board = useOrbitStore.getState().document.boards[0]!;
    expect(board.nodes.find((node) => node.id === duplicateId)?.previewReferenceId).toBeNull();
    expect(board.nodes.filter((node) => node.parentId === duplicateId)).toHaveLength(6);

    useOrbitStore.getState().updateNode(duplicateId!, { previewReferenceId: groupId });
    board = useOrbitStore.getState().document.boards[0]!;
    const originalSlots = board.nodes.filter((node) => node.parentId === groupId).sort((left, right) => left.zIndex - right.zIndex);
    const referenceSlots = board.nodes.filter((node) => node.parentId === duplicateId).sort((left, right) => left.zIndex - right.zIndex);
    referenceSlots.forEach((slot) => useOrbitStore.getState().updateNode(slot.id, { previewReferenceId: groupId }));
    useOrbitStore.getState().updateNode(originalSlots[0]!.id, { title: "Admin", previewTarget: "4173" });
    useOrbitStore.getState().setPreviewGroupLayout(duplicateId!, "3");
    board = useOrbitStore.getState().document.boards[0]!;
    expect(board.nodes.find((node) => node.id === referenceSlots[0]!.id)).toMatchObject({ title: "Admin", previewTarget: "4173" });
    expect(board.nodes.filter((node) => node.id === groupId || node.id === duplicateId).every((node) => node.previewLayout === "3")).toBe(true);

    useOrbitStore.getState().removeNode(groupId!);
    board = useOrbitStore.getState().document.boards[0]!;
    expect(board.nodes.some((node) => node.id === groupId || node.parentId === groupId)).toBe(false);
  });

  it("does not overwrite edits created while an older autosave is in flight", () => {
    const firstSnapshot = useOrbitStore.getState().document;
    useOrbitStore.getState().markSaving(true);
    useOrbitStore.getState().addBoard("Während Autosave erstellt");
    useOrbitStore.getState().markSaved({
      document: firstSnapshot,
      revision: 1,
      updatedAt: "2026-07-15T16:00:00.000Z",
      initialized: true,
      syncIntervalMilliseconds: 5_000,
    }, firstSnapshot);
    expect(useOrbitStore.getState()).toMatchObject({ revision: 1, dirty: true, saving: false });
    expect(useOrbitStore.getState().document.boards).toHaveLength(2);

    const secondSnapshot = useOrbitStore.getState().document;
    useOrbitStore.getState().markSaving(true);
    const serverResponseDocument = structuredClone(secondSnapshot);
    useOrbitStore.getState().markSaved({
      document: serverResponseDocument,
      revision: 2,
      updatedAt: "2026-07-15T16:00:01.000Z",
      initialized: true,
      syncIntervalMilliseconds: 5_000,
    }, secondSnapshot);
    expect(useOrbitStore.getState()).toMatchObject({ revision: 2, dirty: false, saving: false });
    expect(useOrbitStore.getState().document.boards).toHaveLength(2);
    expect(useOrbitStore.getState().document).toBe(secondSnapshot);
  });

  it("creates and renames workspaces without scene state", () => {
    const boardId = useOrbitStore.getState().addBoard();
    expect(boardId).toBeTruthy();
    expect(useOrbitStore.getState().document.boards.find((board) => board.id === boardId)?.name).toBe("Arbeitsfläche 2");
    useOrbitStore.getState().renameBoard(boardId!, "Backend Fokus");
    expect(useOrbitStore.getState().document.boards.find((board) => board.id === boardId)?.name).toBe("Backend Fokus");
    expect("addScene" in useOrbitStore.getState()).toBe(false);
    expect("removeScene" in useOrbitStore.getState()).toBe(false);
  });

  it("loads old documents while removing their retired scene data", () => {
    const current = freshOrbitWorkspace();
    const migrated = orbitWorkspaceSchema.parse({
      ...current,
      boards: current.boards.map((board) => ({
        ...board,
        scenes: [{ id: "legacy-scene", name: "Alt", viewport: board.viewport }],
      })),
    });
    expect("scenes" in migrated.boards[0]!).toBe(false);
  });

  it("persists labels, connection sides and manually routed waypoints", () => {
    const first = useOrbitStore.getState().addNode({ type: "note", title: "A", position: { x: 0, y: 0 } });
    const second = useOrbitStore.getState().addNode({ type: "note", title: "B", position: { x: 500, y: 200 } });
    const edge = useOrbitStore.getState().addEdge({ source: first!, target: second!, kind: "manual", label: "gehört zu" });
    useOrbitStore.getState().updateEdge(edge!, { label: "dokumentiert", sourceSide: "right", targetSide: "left", waypoints: [{ x: 240, y: 80 }, { x: 360, y: 160 }] });
    expect(useOrbitStore.getState().document.boards[0]!.edges[0]).toMatchObject({
      label: "dokumentiert",
      sourceSide: "right",
      targetSide: "left",
      waypoints: [{ x: 240, y: 80 }, { x: 360, y: 160 }],
    });
  });
});
