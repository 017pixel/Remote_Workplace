import type { OrbitNode } from "@workbench/contracts";

export interface OrbitEdgePoint { x: number; y: number }

function routeLength(points: OrbitEdgePoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  return total;
}

function pointAt(points: OrbitEdgePoint[], wanted: number): OrbitEdgePoint {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (travelled + segment >= wanted) {
      const ratio = segment === 0 ? 0 : (wanted - travelled) / segment;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    travelled += segment;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

function collides(point: OrbitEdgePoint, label: string, nodes: Pick<OrbitNode, "type" | "position" | "size">[]): boolean {
  const width = Math.min(240, Math.max(58, label.length * 6.2 + 18));
  const height = 24;
  const left = point.x - width / 2;
  const right = point.x + width / 2;
  const top = point.y - height / 2;
  const bottom = point.y + height / 2;
  return nodes.some((node) => node.type !== "frame"
    && left < node.position.x + node.size.width + 12
    && right > node.position.x - 12
    && top < node.position.y + node.size.height + 12
    && bottom > node.position.y - 12);
}

export function collisionFreeEdgeLabelPoint(
  points: OrbitEdgePoint[],
  label: string,
  nodes: Pick<OrbitNode, "type" | "position" | "size">[],
): OrbitEdgePoint {
  const total = routeLength(points);
  if (total === 0) return points[0] ?? { x: 0, y: 0 };
  const fractions = [.5, .4, .6, .3, .7, .2, .8, .12, .88];
  const segmentCenters = points.slice(1).map((point, index) => ({
    x: (points[index]!.x + point.x) / 2,
    y: (points[index]!.y + point.y) / 2,
  }));
  const candidates = [...fractions.map((fraction) => pointAt(points, total * fraction)), ...segmentCenters];
  return candidates.find((point) => !collides(point, label, nodes)) ?? candidates[0]!;
}

