import type { OrbitBoard, OrbitNode } from "@wrapt/contracts";

/**
 * Wiederverwendbare Lookups für die interaktiven Orbit-Hotpaths. Der Cache ist
 * an das unveränderliche `nodes`-Array gebunden und wird deshalb automatisch
 * ungültig, sobald der Store ein neues Array erzeugt.
 */
export interface OrbitBoardIndex {
  nodesById: ReadonlyMap<string, OrbitNode>;
  previewSlotsByParent: ReadonlyMap<string, readonly OrbitNode[]>;
}

const indexCache = new WeakMap<readonly OrbitNode[], OrbitBoardIndex>();

export function createOrbitBoardIndex(board: OrbitBoard): OrbitBoardIndex {
  const cached = indexCache.get(board.nodes);
  if (cached) return cached;

  const nodesById = new Map<string, OrbitNode>();
  const previewSlotsByParent = new Map<string, OrbitNode[]>();
  for (const node of board.nodes) {
    nodesById.set(node.id, node);
    if (node.type !== "previewSlot" || !node.parentId) continue;
    const slots = previewSlotsByParent.get(node.parentId) ?? [];
    slots.push(node);
    previewSlotsByParent.set(node.parentId, slots);
  }
  for (const slots of previewSlotsByParent.values()) {
    slots.sort((left, right) => left.zIndex - right.zIndex);
  }

  const index: OrbitBoardIndex = { nodesById, previewSlotsByParent };
  indexCache.set(board.nodes, index);
  return index;
}
