import { beforeEach, describe, expect, it } from "vitest";
import { orbitWorkspaceSchema, type Workspace } from "@workbench/contracts";
import { freshOrbitWorkspace, migrateWorkspaceToOrbit, useOrbitStore } from "./orbit";

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
  it("migrates project-bound v3 panels into hubs, tool nodes and edges", () => {
    const migrated = migrateWorkspaceToOrbit(legacy);
    expect(migrated.version).toBe(5);
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
    expect(node).toMatchObject({ type: "gallery", toolType: null, runtimeId: null, size: { width: 960, height: 680 } });
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
    useOrbitStore.getState().markSaved({
      document: secondSnapshot,
      revision: 2,
      updatedAt: "2026-07-15T16:00:01.000Z",
      initialized: true,
      syncIntervalMilliseconds: 5_000,
    }, secondSnapshot);
    expect(useOrbitStore.getState()).toMatchObject({ revision: 2, dirty: false, saving: false });
    expect(useOrbitStore.getState().document.boards).toHaveLength(2);
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
