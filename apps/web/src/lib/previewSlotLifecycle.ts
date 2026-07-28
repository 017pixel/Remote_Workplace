import type { OrbitBoard } from "@workbench/contracts";
import { apiClient } from "./apiClient";
import { normalizePreviewTarget } from "./previewTargets";

export interface PreviewSlotRelease {
  slotId: number;
  expectedTargetPort?: number;
}

export function previewSlotsReleasedWithNode(board: OrbitBoard, nodeId: string): PreviewSlotRelease[] {
  const removedIds = new Set([
    nodeId,
    ...board.nodes.filter((node) => node.parentId === nodeId).map((node) => node.id),
  ]);
  const survivingSlotIds = new Set(
    board.nodes
      .filter((node) => !removedIds.has(node.id) && node.type === "previewSlot" && node.previewSlotId !== null)
      .map((node) => node.previewSlotId!),
  );
  const releases = new Map<number, PreviewSlotRelease>();
  for (const node of board.nodes) {
    if (!removedIds.has(node.id) || node.type !== "previewSlot" || node.previewSlotId === null || survivingSlotIds.has(node.previewSlotId)) continue;
    const target = normalizePreviewTarget(node.previewTarget ?? "");
    releases.set(node.previewSlotId, {
      slotId: node.previewSlotId,
      ...(target?.kind === "local" ? { expectedTargetPort: target.port } : {}),
    });
  }
  return [...releases.values()];
}

export function previewSlotReleasedOnTargetChange(board: OrbitBoard, nodeId: string): PreviewSlotRelease | null {
  const source = board.nodes.find((node) => node.id === nodeId && node.type === "previewSlot");
  if (!source || source.previewSlotId === null) return null;
  const parent = source.parentId ? board.nodes.find((node) => node.id === source.parentId && node.type === "previewGroup") : null;
  const canonicalGroupId = source.previewReferenceId ?? parent?.previewReferenceId ?? parent?.id ?? null;
  const users = board.nodes.filter((node) => node.type === "previewSlot" && node.previewSlotId === source.previewSlotId);
  const onlySynchronizedReferences = users.every((node) => {
    if (node.id === source.id) return true;
    const group = node.parentId ? board.nodes.find((candidate) => candidate.id === node.parentId && candidate.type === "previewGroup") : null;
    return canonicalGroupId !== null && (node.previewReferenceId === canonicalGroupId || group?.previewReferenceId === canonicalGroupId || group?.id === canonicalGroupId);
  });
  if (!onlySynchronizedReferences) return null;
  const target = normalizePreviewTarget(source.previewTarget ?? "");
  return {
    slotId: source.previewSlotId,
    ...(target?.kind === "local" ? { expectedTargetPort: target.port } : {}),
  };
}

export async function releasePreviewSlots(releases: PreviewSlotRelease[]): Promise<void> {
  await Promise.allSettled(releases.map((release) => apiClient.assignPreviewSlot({
    slotId: release.slotId,
    targetPort: null,
    isolate: true,
    ...(release.expectedTargetPort === undefined ? {} : { expectedTargetPort: release.expectedTargetPort }),
  })));
}
