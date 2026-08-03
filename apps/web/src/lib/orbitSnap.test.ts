import { describe, expect, it } from "vitest";
import type { OrbitBoard, OrbitNode } from "@workbench/contracts";
import { previewGroupSize } from "../stores/orbit";
import { orbitNodeWorldRectangle, orbitSnapPreview } from "./orbitSnap";

function node(overrides: Partial<OrbitNode>): OrbitNode {
  return {
    id: "node",
    type: "previewSlot",
    title: "Slot",
    position: { x: 0, y: 0 },
    size: { width: 500, height: 825 },
    projectId: null,
    parentId: null,
    runtimeId: null,
    toolType: null,
    previewId: null,
    previewLayout: null,
    previewTarget: null,
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
    hermesSourceFilter: "all",
    hermesStatusFilter: "all",
    locked: false,
    zIndex: 1,
    ...overrides,
  };
}

function board(nodes: OrbitNode[]): OrbitBoard {
  return {
    id: "board",
    name: "Test",
    viewport: { x: 0, y: 0, zoom: 1 },
    worldBounds: { minX: -1_600, minY: -1_000, maxX: 1_600, maxY: 1_000 },
    nodes,
    edges: [],
  };
}

describe("Orbit-Snapping", () => {
  const group = node({ id: "group", type: "previewGroup", title: "Preview-Gruppe", position: { x: 100, y: 100 }, size: previewGroupSize("2"), previewLayout: "2", zIndex: 0 });
  const first = node({ id: "first", title: "Erster Slot", parentId: group.id, zIndex: 1 });
  const second = node({ id: "second", title: "Zweiter Slot", parentId: group.id, zIndex: 2 });

  it("berechnet verschachtelte Slots in Weltkoordinaten", () => {
    const rectangle = orbitNodeWorldRectangle(board([group, first]), first);
    expect(rectangle.position).toEqual({ x: 108, y: 152 });
    expect(rectangle.size).toEqual({ width: 500, height: 825 });
  });

  it("zeigt ein Einordnungsziel für einen freien Slot", () => {
    const result = orbitSnapPreview(board([group, first, second, node({ id: "free" })]), "free", { x: 120, y: 120 });
    expect(result).toEqual({ action: "attach", sourceId: "free", targetGroupId: group.id, targetSlotId: null });
  });

  it("erkennt das Tauschen innerhalb derselben Gruppe", () => {
    const result = orbitSnapPreview(board([group, first, second]), first.id, { x: 866, y: 564 });
    expect(result).toEqual({ action: "swap", sourceId: first.id, targetGroupId: group.id, targetSlotId: second.id });
  });
});
