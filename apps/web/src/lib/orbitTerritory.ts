import type { OrbitBounds, OrbitNode } from "@workbench/contracts";

export const ORBIT_BASE_BOUNDS: OrbitBounds = { minX: -1_600, minY: -1_000, maxX: 1_600, maxY: 1_000 };
export const ORBIT_TERRITORY_GROWTH = 1_600;
export const ORBIT_TERRITORY_TRIGGER = 320;

interface NodeRectangle {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export function expandedOrbitBounds(bounds: OrbitBounds, node: NodeRectangle): OrbitBounds {
  const next = { ...bounds };
  if (node.position.x - next.minX < ORBIT_TERRITORY_TRIGGER) next.minX = Math.max(-100_000, next.minX - ORBIT_TERRITORY_GROWTH);
  if (node.position.y - next.minY < ORBIT_TERRITORY_TRIGGER) next.minY = Math.max(-100_000, next.minY - ORBIT_TERRITORY_GROWTH);
  if (next.maxX - (node.position.x + node.size.width) < ORBIT_TERRITORY_TRIGGER) next.maxX = Math.min(100_000, next.maxX + ORBIT_TERRITORY_GROWTH);
  if (next.maxY - (node.position.y + node.size.height) < ORBIT_TERRITORY_TRIGGER) next.maxY = Math.min(100_000, next.maxY + ORBIT_TERRITORY_GROWTH);
  return next;
}

export function compactedOrbitBounds(nodes: Pick<OrbitNode, "position" | "size">[]): OrbitBounds {
  if (nodes.length === 0) return { ...ORBIT_BASE_BOUNDS };
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.size.width));
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.size.height));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const width = Math.max(ORBIT_BASE_BOUNDS.maxX - ORBIT_BASE_BOUNDS.minX, maxX - minX + 1_200);
  const height = Math.max(ORBIT_BASE_BOUNDS.maxY - ORBIT_BASE_BOUNDS.minY, maxY - minY + 1_200);
  return {
    minX: Math.max(-100_000, centerX - width / 2),
    minY: Math.max(-100_000, centerY - height / 2),
    maxX: Math.min(100_000, centerX + width / 2),
    maxY: Math.min(100_000, centerY + height / 2),
  };
}

export function orbitBoundsEqual(left: OrbitBounds, right: OrbitBounds): boolean {
  return left.minX === right.minX && left.minY === right.minY && left.maxX === right.maxX && left.maxY === right.maxY;
}

