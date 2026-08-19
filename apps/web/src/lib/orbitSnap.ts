import type { OrbitBoard, OrbitNode } from "@wrapt/contracts";
import { createOrbitBoardIndex, type OrbitBoardIndex } from "./orbitBoardIndex";
import { previewSlotGeometry } from "../stores/orbit";

export interface OrbitRectangle {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface OrbitSnapPreview {
  action: "attach" | "swap";
  sourceId: string;
  targetGroupId: string;
  targetSlotId: string | null;
}

function containsPoint(rectangle: OrbitRectangle, point: { x: number; y: number }): boolean {
  return point.x >= rectangle.position.x
    && point.x <= rectangle.position.x + rectangle.size.width
    && point.y >= rectangle.position.y
    && point.y <= rectangle.position.y + rectangle.size.height;
}

function previewSlotIndex(node: OrbitNode, index: OrbitBoardIndex): number {
  if (!node.parentId) return -1;
  return (index.previewSlotsByParent.get(node.parentId) ?? []).findIndex((candidate) => candidate.id === node.id);
}

/** Liefert die sichtbare Welt-Geometrie eines Knotens, auch für verschachtelte Slots. */
export function orbitNodeWorldRectangle(board: OrbitBoard, node: OrbitNode, index = createOrbitBoardIndex(board)): OrbitRectangle {
  if (!node.parentId) return { position: node.position, size: node.size };
  const parent = index.nodesById.get(node.parentId);
  const slotIndex = previewSlotIndex(node, index);
  if (!parent || slotIndex < 0) return { position: node.position, size: node.size };
  const geometry = previewSlotGeometry(parent, slotIndex);
  return {
    position: {
      x: parent.position.x + geometry.position.x,
      y: parent.position.y + geometry.position.y,
    },
    size: geometry.size,
  };
}

/**
 * Ermittelt ein semantisches Snap-Ziel in Weltkoordinaten. Grid-Snapping bleibt
 * davon unabhängig und wird weiterhin von React Flow durchgeführt.
 */
export function orbitSnapPreview(board: OrbitBoard, sourceId: string, point: { x: number; y: number }, index = createOrbitBoardIndex(board)): OrbitSnapPreview | null {
  const source = index.nodesById.get(sourceId);
  if (!source || source.type !== "previewSlot") return null;

  const targetSlot = [...index.previewSlotsByParent.values()]
    .flat()
    .filter((node) => node.id !== sourceId)
    .find((node) => containsPoint(orbitNodeWorldRectangle(board, node, index), point));
  const targetGroup = targetSlot
    ? index.nodesById.get(targetSlot.parentId!)?.type === "previewGroup" ? index.nodesById.get(targetSlot.parentId!) : undefined
    : board.nodes
      .filter((node) => node.type === "previewGroup" && node.id !== sourceId)
      .sort((left, right) => left.zIndex - right.zIndex)
      .find((node) => containsPoint(orbitNodeWorldRectangle(board, node, index), point));

  if (!targetGroup) return null;
  if (targetGroup.id === source.parentId) {
    return targetSlot && targetSlot.id !== sourceId
      ? { action: "swap", sourceId, targetGroupId: targetGroup.id, targetSlotId: targetSlot.id }
      : null;
  }

  const occupied = index.previewSlotsByParent.get(targetGroup.id)?.length ?? 0;
  if (occupied >= 6) return null;
  return { action: "attach", sourceId, targetGroupId: targetGroup.id, targetSlotId: targetSlot?.id ?? null };
}
