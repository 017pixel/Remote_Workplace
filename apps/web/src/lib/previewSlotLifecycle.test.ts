import { describe, expect, it } from "vitest";
import type { OrbitBoard, OrbitNode } from "@workbench/contracts";
import { previewSlotReleasedOnTargetChange, previewSlotsReleasedWithNode } from "./previewSlotLifecycle";

function slot(id: string, parentId: string | null, previewSlotId: number, target = "5173"): OrbitNode {
  return {
    id,
    type: "previewSlot",
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 240 },
    projectId: null,
    parentId,
    runtimeId: null,
    toolType: null,
    previewId: null,
    previewLayout: null,
    previewTarget: target,
    previewPath: "/",
    previewDeviceId: null,
    previewOrientation: "portrait",
    previewSlotId,
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
  };
}

function board(nodes: OrbitNode[]): OrbitBoard {
  return {
    id: "board",
    name: "Test",
    viewport: { x: 0, y: 0, zoom: 1 },
    worldBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    nodes,
    edges: [],
  };
}

describe("Preview-Slot-Lebenszyklus", () => {
  it("gibt nur Slots frei, die außerhalb des entfernten Knotens nicht weiterverwendet werden", () => {
    const group = { ...slot("group", null, 9), type: "previewGroup" as const, previewSlotId: null, previewLayout: "2" as const };
    const document = board([group, slot("one", "group", 1), slot("two", "group", 2), slot("reference", null, 2)]);
    expect(previewSlotsReleasedWithNode(document, "group")).toEqual([{ slotId: 1, expectedTargetPort: 5173 }]);
  });

  it("gibt beim Zielwechsel Referenzslots frei, aber keine bewusst geteilten Slots", () => {
    const sourceGroup = { ...slot("source-group", null, 9), type: "previewGroup" as const, previewSlotId: null, previewLayout: "1" as const };
    const referenceGroup = { ...slot("reference-group", null, 9), type: "previewGroup" as const, previewSlotId: null, previewLayout: "1" as const, previewReferenceId: "source-group" };
    const source = slot("source", "source-group", 1);
    const reference = { ...slot("reference", "reference-group", 1), previewReferenceId: "source-group" };
    expect(previewSlotReleasedOnTargetChange(board([sourceGroup, referenceGroup, source, reference]), "source")).toEqual({ slotId: 1, expectedTargetPort: 5173 });
    expect(previewSlotReleasedOnTargetChange(board([source, slot("shared", null, 1)]), "source")).toBeNull();
  });
});
