import { describe, expect, it } from "vitest";
import { collisionFreeEdgeLabelPoint } from "./orbitEdgeLabel";

describe("Orbit edge labels", () => {
  it("moves a midpoint label along the line when a window covers it", () => {
    const point = collisionFreeEdgeLabelPoint(
      [{ x: 0, y: 100 }, { x: 1_000, y: 100 }],
      "verbunden mit",
      [{ type: "note", position: { x: 430, y: 40 }, size: { width: 140, height: 120 } }],
    );
    expect(point).not.toEqual({ x: 500, y: 100 });
    expect(point.y).toBe(100);
    expect(point.x).toBeLessThan(430);
  });
});

