import { describe, expect, it } from "vitest";
import { ORBIT_BASE_BOUNDS, compactedOrbitBounds, expandedOrbitBounds } from "./orbitTerritory";

describe("adaptive Orbit territory", () => {
  it("grows before a dragged window reaches every boundary", () => {
    expect(expandedOrbitBounds(ORBIT_BASE_BOUNDS, { position: { x: 1_300, y: 760 }, size: { width: 340, height: 220 } })).toEqual({
      minX: -1_600,
      minY: -1_000,
      maxX: 3_200,
      maxY: 2_600,
    });
  });

  it("shrinks unused chunks while retaining a generous node margin", () => {
    const compact = compactedOrbitBounds([{ position: { x: 4_000, y: -2_000 }, size: { width: 400, height: 300 } }]);
    expect(compact.maxX - compact.minX).toBe(3_200);
    expect(compact.maxY - compact.minY).toBe(2_000);
    expect(compact.minX).toBeLessThan(4_000);
    expect(compact.maxX).toBeGreaterThan(4_400);
  });
});

