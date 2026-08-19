import type { OrbitNode } from "@wrapt/contracts";

export interface OrbitEdgePoint { x: number; y: number }

const LABEL_HEIGHT = 24;
const LABEL_MIN_WIDTH = 58;
const LABEL_MAX_WIDTH = 240;
const COLLISION_PADDING = 12;
const SAMPLE_STEP = 32;

type OrbitLabelNode = Pick<OrbitNode, "type" | "position" | "size">;

function segmentLength(from: OrbitEdgePoint, to: OrbitEdgePoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function routeLength(points: OrbitEdgePoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += segmentLength(points[index - 1]!, points[index]!);
  return total;
}

function pointAt(points: OrbitEdgePoint[], wanted: number): OrbitEdgePoint {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const segment = segmentLength(from, to);
    if (segment === 0) continue;
    if (travelled + segment >= wanted) {
      const ratio = Math.max(0, Math.min(1, (wanted - travelled) / segment));
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    travelled += segment;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

function tangentAt(points: OrbitEdgePoint[], wanted: number): OrbitEdgePoint {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const length = segmentLength(from, to);
    if (length === 0) continue;
    if (travelled + length >= wanted) return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    travelled += length;
  }
  return { x: 1, y: 0 };
}

function labelSize(label: string): { width: number; height: number } {
  return {
    width: Math.min(LABEL_MAX_WIDTH, Math.max(LABEL_MIN_WIDTH, label.length * 6.2 + 18)),
    height: LABEL_HEIGHT,
  };
}

function collides(point: OrbitEdgePoint, label: string, nodes: OrbitLabelNode[]): boolean {
  const { width, height } = labelSize(label);
  const left = point.x - width / 2;
  const right = point.x + width / 2;
  const top = point.y - height / 2;
  const bottom = point.y + height / 2;
  return nodes.some((node) => node.type !== "frame"
    && left < node.position.x + node.size.width + COLLISION_PADDING
    && right > node.position.x - COLLISION_PADDING
    && top < node.position.y + node.size.height + COLLISION_PADDING
    && bottom > node.position.y - COLLISION_PADDING);
}

function routeCandidates(points: OrbitEdgePoint[], total: number): Array<{ point: OrbitEdgePoint; distance: number }> {
  const preferredDistances = [.5, .4, .6, .3, .7, .2, .8, .12, .88].map((fraction) => total * fraction);
  const sampledDistances = Array.from({ length: Math.ceil(total / SAMPLE_STEP) + 1 }, (_, index) => Math.min(total, index * SAMPLE_STEP));
  const distances = [...preferredDistances, ...sampledDistances];
  for (let index = 1; index < points.length; index += 1) {
    let distance = 0;
    for (let segmentIndex = 1; segmentIndex <= index; segmentIndex += 1) distance += segmentLength(points[segmentIndex - 1]!, points[segmentIndex]!);
    const segment = segmentLength(points[index - 1]!, points[index]!);
    if (segment > 0) distances.push(distance - segment / 2);
  }
  const seen = new Set<string>();
  return distances
    .filter((distance) => distance > 0 && distance < total)
    .map((distance) => ({ distance, point: pointAt(points, distance) }))
    .filter(({ point }) => {
      const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function freeOutsideNodeBounds(point: OrbitEdgePoint, label: string, nodes: OrbitLabelNode[]): OrbitEdgePoint {
  const { width } = labelSize(label);
  const realNodes = nodes.filter((node) => node.type !== "frame");
  if (realNodes.length === 0) return point;
  const left = Math.min(...realNodes.map((node) => node.position.x)) - COLLISION_PADDING - width / 2 - 1;
  const right = Math.max(...realNodes.map((node) => node.position.x + node.size.width)) + COLLISION_PADDING + width / 2 + 1;
  return Math.abs(point.x - left) <= Math.abs(point.x - right) ? { x: left, y: point.y } : { x: right, y: point.y };
}

export function collisionFreeEdgeLabelPoint(
  points: OrbitEdgePoint[],
  label: string,
  nodes: OrbitLabelNode[],
): OrbitEdgePoint {
  const total = routeLength(points);
  const origin = pointAt(points, total / 2);
  if (total === 0 || label.trim() === "") return origin;

  const candidates = routeCandidates(points, total);
  const freeOnRoute = candidates.find(({ point }) => !collides(point, label, nodes));
  if (freeOnRoute) return freeOnRoute.point;

  const offsets = [24, 48, 80, 128, 192, 288, 416, 576, 768];
  for (const candidate of candidates) {
    const tangent = tangentAt(points, candidate.distance);
    const normal = { x: -tangent.y, y: tangent.x };
    for (const offset of offsets) {
      for (const direction of [-1, 1]) {
        const point = {
          x: candidate.point.x + normal.x * offset * direction,
          y: candidate.point.y + normal.y * offset * direction,
        };
        if (!collides(point, label, nodes)) return point;
      }
    }
  }

  return freeOutsideNodeBounds(origin, label, nodes);
}
