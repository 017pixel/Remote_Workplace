import { describe, expect, it } from "vitest";
import type { OrbitNode } from "@workbench/contracts";
import { nearestEdgeSides, projectColor } from "./orbitAppearance";

function node(id: string, x: number): OrbitNode {
  return { id, type: "note", title: id, position: { x, y: 0 }, size: { width: 200, height: 100 }, projectId: null, parentId: null, runtimeId: null, toolType: null, previewId: null, assetId: null, assetMimeType: null, assetBytes: null, provider: null, content: "", language: null, color: null, locked: false, zIndex: 1 };
}

describe("Orbit appearance", () => {
  it("uses the geometrically closest sides in both directions", () => {
    expect(nearestEdgeSides(node("left", 0), node("right", 600))).toEqual({ sourceSide: "right", targetSide: "left" });
    expect(nearestEdgeSides(node("right", 600), node("left", 0))).toEqual({ sourceSide: "left", targetSide: "right" });
  });

  it("returns a stable project color", () => {
    expect(projectColor("remote-workplace")).toBe(projectColor("remote-workplace"));
    expect(projectColor("remote-workplace")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
