import type { OrbitEdge, OrbitNode } from "@workbench/contracts";

// Kategoriale Palette im Stil von T3 Code Nightly: acht klar unterscheidbare Töne
// auf der fast schwarzen Basis (#0a0a0a). Bewusst die 500er-Stufe statt 400 — als
// Kantenfarbe über den ganzen Canvas wirkten die helleren Töne neon.
export const PROJECT_EDGE_COLORS = ["#2b7fff", "#ad46ff", "#ff6900", "#00bc7d", "#fe9a00", "#ff2056", "#00b8db", "#7ccf00"] as const;

export function projectColor(projectId: string): string {
  let hash = 0;
  for (const character of projectId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PROJECT_EDGE_COLORS[hash % PROJECT_EDGE_COLORS.length]!;
}

/** Farbe eines Knotens: selbst gewählt, sonst automatisch aus der Projekt-ID. */
export function orbitNodeColor(node: OrbitNode): string {
  return node.color ?? projectColor(node.projectId ?? node.id);
}

export function orbitEdgeColor(edge: OrbitEdge, nodesById: ReadonlyMap<string, OrbitNode>): string {
  // Etwas dunkler als die Knotenfarben: Die Kanten ziehen sich über die ganze
  // Fläche und würden in Emerald-400 den Canvas dominieren.
  if (edge.kind === "runtime") return "#007a55";
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  // Eine selbst gewählte Farbe gewinnt: Wer den Projektknoten einfärbt, erwartet,
  // dass seine Verbindungen mitziehen.
  const custom = source?.color ?? target?.color;
  if (custom) return custom;
  const projectId = source?.projectId ?? target?.projectId;
  if (projectId) return projectColor(projectId);
  return edge.kind === "manual" ? "#737373" : "#51a2ff";
}

export function nearestEdgeSides(source: OrbitNode | undefined, target: OrbitNode | undefined) {
  if (!source || !target) return { sourceSide: "right" as const, targetSide: "left" as const };
  const sourceCenter = source.position.x + source.size.width / 2;
  const targetCenter = target.position.x + target.size.width / 2;
  return sourceCenter <= targetCenter
    ? { sourceSide: "right" as const, targetSide: "left" as const }
    : { sourceSide: "left" as const, targetSide: "right" as const };
}
