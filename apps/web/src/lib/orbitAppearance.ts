import type { OrbitEdge, OrbitNode } from "@workbench/contracts";

export const PROJECT_EDGE_COLORS = ["#6f91b3", "#9a7eaa", "#b68167", "#729b82", "#b09a63", "#a3717c", "#668f97", "#8d8964"] as const;

export function projectColor(projectId: string): string {
  let hash = 0;
  for (const character of projectId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PROJECT_EDGE_COLORS[hash % PROJECT_EDGE_COLORS.length]!;
}

export function orbitEdgeColor(edge: OrbitEdge, nodesById: ReadonlyMap<string, OrbitNode>): string {
  if (edge.kind === "runtime") return "#6f9874";
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  const projectId = source?.projectId ?? target?.projectId;
  if (projectId) return projectColor(projectId);
  return edge.kind === "manual" ? "#8d857b" : "#6482a0";
}

export function nearestEdgeSides(source: OrbitNode | undefined, target: OrbitNode | undefined) {
  if (!source || !target) return { sourceSide: "right" as const, targetSide: "left" as const };
  const sourceCenter = source.position.x + source.size.width / 2;
  const targetCenter = target.position.x + target.size.width / 2;
  return sourceCenter <= targetCenter
    ? { sourceSide: "right" as const, targetSide: "left" as const }
    : { sourceSide: "left" as const, targetSide: "right" as const };
}
