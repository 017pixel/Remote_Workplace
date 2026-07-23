import { describe, expect, it } from "vitest";
import { collisionFreeEdgeLabelPoint } from "./orbitEdgeLabel";

describe("Orbit edge labels", () => {
  const overlaps = (point: { x: number; y: number }, label: string, node: { position: { x: number; y: number }; size: { width: number; height: number } }) => {
    const width = Math.min(240, Math.max(58, label.length * 6.2 + 18));
    return point.x - width / 2 < node.position.x + node.size.width + 12
      && point.x + width / 2 > node.position.x - 12
      && point.y - 12 < node.position.y + node.size.height + 12
      && point.y + 12 > node.position.y - 12;
  };

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

  it("chooses a later free segment when several preferred positions are blocked", () => {
    const point = collisionFreeEdgeLabelPoint(
      [{ x: 0, y: 100 }, { x: 1_000, y: 100 }],
      "gehört zu",
      [
        { type: "note", position: { x: 80, y: 40 }, size: { width: 180, height: 120 } },
        { type: "note", position: { x: 300, y: 40 }, size: { width: 180, height: 120 } },
        { type: "note", position: { x: 520, y: 40 }, size: { width: 180, height: 120 } },
      ],
    );
    expect(overlaps(point, "gehört zu", { position: { x: 80, y: 40 }, size: { width: 180, height: 120 } })).toBe(false);
    expect(overlaps(point, "gehört zu", { position: { x: 300, y: 40 }, size: { width: 180, height: 120 } })).toBe(false);
    expect(overlaps(point, "gehört zu", { position: { x: 520, y: 40 }, size: { width: 180, height: 120 } })).toBe(false);
    expect(point.x).toBeGreaterThan(700);
  });

  it("finds a narrow free route segment that coarse fractions would miss", () => {
    const point = collisionFreeEdgeLabelPoint(
      [{ x: 0, y: 0 }, { x: 1_000, y: 0 }, { x: 1_000, y: 600 }],
      "gehört zu",
      [
        { type: "note", position: { x: 120, y: -40 }, size: { width: 420, height: 80 } },
        { type: "note", position: { x: 600, y: -40 }, size: { width: 340, height: 80 } },
        { type: "note", position: { x: 940, y: 120 }, size: { width: 120, height: 220 } },
      ],
    );
    expect(overlaps(point, "gehört zu", { position: { x: 120, y: -40 }, size: { width: 420, height: 80 } })).toBe(false);
    expect(overlaps(point, "gehört zu", { position: { x: 600, y: -40 }, size: { width: 340, height: 80 } })).toBe(false);
    expect(overlaps(point, "gehört zu", { position: { x: 940, y: 120 }, size: { width: 120, height: 220 } })).toBe(false);
  });

  it("uses a perpendicular fallback when the complete route is covered", () => {
    const point = collisionFreeEdgeLabelPoint(
      [{ x: 0, y: 100 }, { x: 300, y: 100 }],
      "gehört zu",
      [{ type: "note", position: { x: -40, y: -40 }, size: { width: 380, height: 280 } }],
    );
    expect(overlaps(point, "gehört zu", { position: { x: -40, y: -40 }, size: { width: 380, height: 280 } })).toBe(false);
    expect(point.y).not.toBe(100);
  });

  it("ignores frames and still accounts for long labels", () => {
    const label = "eine deutlich längere Verbindungsbezeichnung";
    const point = collisionFreeEdgeLabelPoint(
      [{ x: 0, y: 100 }, { x: 800, y: 100 }],
      label,
      [
        { type: "frame", position: { x: 250, y: 0 }, size: { width: 300, height: 200 } },
        { type: "note", position: { x: 360, y: 40 }, size: { width: 80, height: 120 } },
      ],
    );
    expect(overlaps(point, label, { position: { x: 360, y: 40 }, size: { width: 80, height: 120 } })).toBe(false);
  });
});
