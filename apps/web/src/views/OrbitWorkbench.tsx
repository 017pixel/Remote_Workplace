import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge as FlowEdge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodeDrag,
  type OnMoveEnd,
  type OnMoveStart,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CommandIcon, CopyIcon, EditIcon, ExternalLinkIcon, FinderIcon, FolderSearchIcon, FrameIcon, FullscreenIcon, HandIcon, LocateIcon, LockIcon, MinusIcon, NoteIcon, PlusIcon, PointerIcon, PreviewsIcon, RedoIcon, RefreshIcon, SaveIcon, SearchIcon, SelectBoxIcon, TodoIcon, TrashIcon, UndoIcon } from "../components/icons";
import type { OrbitBoard, OrbitNode, Project } from "@wrapt/contracts";
import { OrbitNodeRuntimeProvider, OrbitNodeView } from "../components/orbit/OrbitNodeView";
import { OrbitEdgeView } from "../components/orbit/OrbitEdgeView";
import { OrbitSync } from "../components/orbit/OrbitSync";
import { OrbitProjectBrowserDialog } from "../components/orbit/OrbitProjectBrowserDialog";
import { consumeOrbitPayloads, dequeueOrbitPayload, type OrbitPalettePayload } from "../lib/orbitPalette";
import { wraptQueries } from "../lib/queryOptions";
import { apiClient } from "../lib/apiClient";
import { useResponsiveShell } from "../lib/useResponsiveShell";
import { previewSlotsReleasedWithNode, releasePreviewSlots } from "../lib/previewSlotLifecycle";
import { consumeOrbitIntents } from "../lib/wraptActions";
import { resolveOrbitProjectId } from "../lib/orbitProjectBinding";
import { nearestEdgeSides, orbitEdgeColor } from "../lib/orbitAppearance";
import { OrbitColorPicker } from "../components/orbit/OrbitColorPicker";
import { compactedOrbitBounds, expandedOrbitBounds, orbitBoundsEqual } from "../lib/orbitTerritory";
import { orbitNodeWorldRectangle, orbitSnapPreview, type OrbitSnapPreview } from "../lib/orbitSnap";
import { useMenuFocus } from "../lib/useMenuFocus";
import { useRouteActivity } from "../lib/routeActivity";
import { serializeOrbitTodo } from "../lib/orbitTodo";
import { elementContainsEventTarget } from "../lib/domEvents";
import { getActiveOrbitBoard, orbitDefaultNodeSize, previewGroupSize, previewSlotGeometry, useOrbitStore } from "../stores/orbit";
import { useWorkspaceStore } from "../stores/workspace";
import { createOrbitBoardIndex, type OrbitBoardIndex } from "../lib/orbitBoardIndex";
import { openPreviewGroupWindow } from "../lib/previewWindow";

const nodeTypes = { orbit: OrbitNodeView };
const edgeTypes = { orbit: OrbitEdgeView };
const PLACEMENT_PADDING = 48;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DELETE_ZONE_HEIGHT = 128;

const typeLabels: Record<OrbitNode["type"], string> = {
  project: "Projekt-Hub",
  tool: "Live-Werkzeug",
  previewGroup: "Preview-Gruppe",
  previewSlot: "Preview-Slot",
  note: "Notiz",
  todo: "To-do-Liste",
  snippet: "Code-Snippet",
  file: "Projektdatei",
  frame: "Bereich",
  usage: "Nutzung und Limits",
  asset: "Archivdatei",
  gallery: "Mediengalerie",
  fileGallery: "Dateigalerie",
  hermesStatus: "Hermes Status",
  hermesTasks: "Hermes Aufgaben",
  hermesCron: "Hermes Automatisierungen",
  hermesResults: "Hermes Ergebnisse",
  extension: "Extension",
};

type MobileCanvasMode = "navigate" | "interact";
type CanvasInteraction = "node" | "pane";

function PreviewContextIsland({ board, focusedNodeId, onOpenHub }: { board: OrbitBoard; focusedNodeId: string | null; onOpenHub: () => void }) {
  const focused = board.nodes.find((node) => node.id === focusedNodeId);
  const group = focused?.type === "previewGroup"
    ? focused
    : focused?.type === "previewSlot" && focused.parentId
      ? board.nodes.find((node) => node.id === focused.parentId && node.type === "previewGroup")
      : null;
  if (!group) return null;
  const slots = board.nodes.filter((node) => node.parentId === group.id && node.type === "previewSlot").sort((left, right) => left.zIndex - right.zIndex);
  const activeCount = slots.filter((slot) => slot.previewTarget).length;
  const visibleCount = Math.max(1, activeCount);
  const layouts = visibleCount <= 1 ? ["1", "2"] as const : visibleCount === 2 ? ["2", "3"] as const : visibleCount === 3 ? ["3", "6"] as const : ["6"] as const;
  return (
    <div className="orbit-preview-context-island" role="toolbar" aria-label="Kontextaktionen für Previews">
      <div><PreviewsIcon /><span>{activeCount || slots.length} {activeCount === 1 ? "Preview" : "Previews"}</span></div>
      <span className="orbit-island-divider" />
      <div className="orbit-preview-context-layouts" aria-label="Passende Layouts">{layouts.map((layout) => <button type="button" key={layout} className={group.previewLayout === layout ? "is-active" : ""} onClick={() => useOrbitStore.getState().setPreviewGroupLayout(group.id, layout)}>{layout === "6" ? "2×3" : layout}</button>)}</div>
      <button type="button" aria-label="Alle Previews neu laden" title="Alle neu laden" onClick={() => slots.forEach((slot) => useOrbitStore.getState().updateNode(slot.id, { content: String(Number(slot.content || "0") + 1) }))}><RefreshIcon /></button>
      <button type="button" aria-label="Preview-Gruppe extern öffnen" title="Externes Fenster" onClick={() => openPreviewGroupWindow(group.id, useOrbitStore.getState().document)}><ExternalLinkIcon /></button>
      <button type="button" className="orbit-preview-context-hub" onClick={onOpenHub}><span>Preview Hub</span></button>
    </div>
  );
}

const MINIMAP_WIDTH = 144;
const MINIMAP_HEIGHT = 94;

type FlowGeometry = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

function viewportsEqual(left: OrbitBoard["viewport"], right: OrbitBoard["viewport"]) {
  return Math.abs(left.x - right.x) <= .01
    && Math.abs(left.y - right.y) <= .01
    && Math.abs(left.zoom - right.zoom) <= .001;
}

function flowNode(
  node: OrbitNode,
  focusedNodeId: string | null,
  interactive = true,
  board?: OrbitBoard,
  geometryOverrides?: ReadonlyMap<string, FlowGeometry>,
  index?: OrbitBoardIndex,
): FlowNode {
  const ownGeometry = geometryOverrides?.get(node.id);
  const boardIndex = board ? index ?? createOrbitBoardIndex(board) : undefined;
  const parent = node.parentId ? boardIndex?.nodesById.get(node.parentId) : undefined;
  const parentGeometry = parent ? geometryOverrides?.get(parent.id) : undefined;
  const layoutParent = parent && parentGeometry ? { ...parent, position: parentGeometry.position, size: parentGeometry.size } : parent;
  const siblings = parent ? (boardIndex?.previewSlotsByParent.get(parent.id) ?? []) : [];
  const childIndex = parent ? siblings.findIndex((candidate) => candidate.id === node.id) : -1;
  const geometry = ownGeometry ?? (layoutParent && childIndex >= 0 ? previewSlotGeometry(layoutParent, childIndex) : { position: node.position, size: node.size });
  const activeSlots = parent ? Number(parent.previewLayout ?? "1") : 0;
  return {
    id: node.id,
    type: "orbit",
    position: geometry.position,
    data: {},
    width: geometry.size.width,
    height: geometry.size.height,
    style: { width: geometry.size.width, height: geometry.size.height, zIndex: node.type === "frame" || node.type === "previewGroup" ? 0 : Math.max(1, node.zIndex) },
    ...(node.parentId ? { parentId: node.parentId } : {}),
    hidden: childIndex >= activeSlots && childIndex >= 0,
    dragHandle: ".orbit-node-drag-handle",
    draggable: !node.locked && interactive,
    selectable: interactive,
    selected: node.id === focusedNodeId,
  };
}

function geometryFromFlowNode(node: FlowNode): FlowGeometry | null {
  const width = node.width ?? node.measured?.width;
  const height = node.height ?? node.measured?.height;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { position: node.position, size: { width: width!, height: height! } };
}

function flowEdge(edge: OrbitBoard["edges"][number], nodesById: ReadonlyMap<string, OrbitNode>): FlowEdge {
  const color = orbitEdgeColor(edge, nodesById);
  const automaticSides = nearestEdgeSides(nodesById.get(edge.source), nodesById.get(edge.target));
  const sourceSide = edge.sourceSide ?? automaticSides.sourceSide;
  const targetSide = edge.targetSide ?? automaticSides.targetSide;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: sourceSide,
    targetHandle: targetSide,
    type: "orbit",
    data: { orbit: { ...edge, sourceSide, targetSide }, color },
    ...(edge.kind === "manual" ? { markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color } } : {}),
    style: {
      stroke: color,
      strokeWidth: edge.kind === "project" ? 1.8 : 1.4,
      ...(edge.kind === "manual" ? { strokeDasharray: "6 6" } : {}),
    },
  };
}

function nearestProject(board: OrbitBoard, position: { x: number; y: number }) {
  return board.nodes
    .filter((node) => node.type === "project" && node.projectId !== null)
    .map((node) => ({ node, distance: Math.hypot(node.position.x + node.size.width / 2 - position.x, node.position.y + node.size.height / 2 - position.y) }))
    .sort((left, right) => left.distance - right.distance)[0];
}

function overlapsNode(
  position: { x: number; y: number },
  size: { width: number; height: number },
  node: OrbitNode,
) {
  if (node.type === "frame") return false;
  return position.x < node.position.x + node.size.width + PLACEMENT_PADDING
    && position.x + size.width + PLACEMENT_PADDING > node.position.x
    && position.y < node.position.y + node.size.height + PLACEMENT_PADDING
    && position.y + size.height + PLACEMENT_PADDING > node.position.y;
}

function freePosition(
  board: OrbitBoard,
  desiredCenter: { x: number; y: number },
  size: { width: number; height: number },
) {
  const clamp = (center: { x: number; y: number }) => ({
    x: Math.round(Math.min(board.worldBounds.maxX - size.width, Math.max(board.worldBounds.minX, center.x - size.width / 2)) / 16) * 16,
    y: Math.round(Math.min(board.worldBounds.maxY - size.height, Math.max(board.worldBounds.minY, center.y - size.height / 2)) / 16) * 16,
  });
  for (let index = 0; index < 96; index += 1) {
    const radius = index === 0 ? 0 : 104 * Math.sqrt(index);
    const center = index === 0 ? desiredCenter : {
      x: desiredCenter.x + Math.cos(index * GOLDEN_ANGLE) * radius,
      y: desiredCenter.y + Math.sin(index * GOLDEN_ANGLE) * radius * .72,
    };
    const candidate = clamp(center);
    if (!board.nodes.some((node) => overlapsNode(candidate, size, node))) return candidate;
  }
  return clamp(desiredCenter);
}

function projectOrbitCenter(board: OrbitBoard, projectId: string | null, fallback: { x: number; y: number }, size: { width: number; height: number }) {
  if (!projectId) return fallback;
  const hub = board.nodes.find((node) => node.type === "project" && node.projectId === projectId);
  if (!hub) return fallback;
  const relatedCount = board.nodes.filter((node) => node.type !== "project" && node.projectId === projectId).length;
  const angle = relatedCount * GOLDEN_ANGLE - Math.PI / 2;
  const radiusX = Math.max(460, hub.size.width / 2 + size.width / 2 + 112);
  const radiusY = Math.max(330, hub.size.height / 2 + size.height / 2 + 88);
  return {
    x: hub.position.x + hub.size.width / 2 + Math.cos(angle) * radiusX,
    y: hub.position.y + hub.size.height / 2 + Math.sin(angle) * radiusY,
  };
}

function dragPoint(event: MouseEvent | TouchEvent) {
  if ("touches" in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

function orbitNodeIdAtPoint(point: { x: number; y: number }, excludedId: string) {
  return [...globalThis.document.querySelectorAll<HTMLElement>(".react-flow__node-orbit")]
    .filter((element) => element.dataset.id !== excludedId)
    .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
    .filter(({ bounds }) => point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom)
    .sort((left, right) => left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height)
    .map(({ element }) => element.dataset.id)
    .find((id): id is string => Boolean(id)) ?? null;
}

function containsOrbitPoint(rectangle: { position: { x: number; y: number }; size: { width: number; height: number } }, point: { x: number; y: number }) {
  return point.x >= rectangle.position.x
    && point.x <= rectangle.position.x + rectangle.size.width
    && point.y >= rectangle.position.y
    && point.y <= rectangle.position.y + rectangle.size.height;
}

function commandPayloads(projects: Project[]): Array<{ keywords: string; payload: OrbitPalettePayload }> {
  const base: Array<{ keywords: string; payload: OrbitPalettePayload }> = [
    { keywords: "terminal shell konsole", payload: { type: "tool", title: "Terminal", toolType: "terminal" } },
    { keywords: "t3 code agent", payload: { type: "tool", title: "T3 Code", toolType: "t3-code" } },
    { keywords: "hermes agent chat assistent", payload: { type: "tool", title: "Hermes Agent", toolType: "hermes" } },
    { keywords: "hermes status health dienst gateway", payload: { type: "hermesStatus", title: "Hermes Status" } },
    { keywords: "hermes aufgaben tasks laufend", payload: { type: "hermesTasks", title: "Hermes Aufgaben" } },
    { keywords: "hermes cron automatisierungen jobs", payload: { type: "hermesCron", title: "Hermes Automatisierungen" } },
    { keywords: "hermes ergebnisse results telegram cron", payload: { type: "hermesResults", title: "Hermes Ergebnisse" } },
    { keywords: "preview browser web", payload: { type: "tool", title: "Preview", toolType: "preview" } },
    { keywords: "preview gruppe einzeln 1er split", payload: { type: "previewGroup", title: "Einzel-Preview", layout: "1" } },
    { keywords: "preview gruppe 2er split", payload: { type: "previewGroup", title: "2er-Preview-Gruppe", layout: "2" } },
    { keywords: "preview gruppe 3er split", payload: { type: "previewGroup", title: "3er-Preview-Gruppe", layout: "3" } },
    { keywords: "preview gruppe 6er 2x3 split", payload: { type: "previewGroup", title: "6er-Preview-Gruppe", layout: "6" } },
    { keywords: "browser chromium google web", payload: { type: "tool", title: "Browser", toolType: "browser" } },
    { keywords: "editor code server vscode", payload: { type: "tool", title: "Code-Server", toolType: "code-server" } },
    { keywords: "codex agent", payload: { type: "tool", title: "Codex", toolType: "codex" } },
    { keywords: "opencode agent", payload: { type: "tool", title: "OpenCode", toolType: "opencode" } },
    { keywords: "note notiz text markdown", payload: { type: "note", title: "Neue Notiz" } },
    { keywords: "todo aufgabe liste checkliste", payload: { type: "todo", title: "To-do-Liste" } },
    { keywords: "snippet code block", payload: { type: "snippet", title: "Code-Snippet" } },
    { keywords: "frame bereich gruppe umrandung", payload: { type: "frame", title: "Neuer Bereich" } },
    { keywords: "dateien files dateimanager finder explorer ordner server upload download", payload: { type: "tool", title: "Dateimanager", toolType: "files" } },
    { keywords: "usage codex limits nutzung", payload: { type: "usage", title: "Codex Nutzung", provider: "codex" } },
    { keywords: "usage opencode limits nutzung", payload: { type: "usage", title: "OpenCode Nutzung", provider: "opencode" } },
    { keywords: "usage claude code limits nutzung", payload: { type: "usage", title: "Claude Code Nutzung", provider: "claude" } },
  ];
  return [...base, ...projects.map((project) => ({ keywords: `projekt project ${project.name}`, payload: { type: "project" as const, title: project.name, projectId: project.id } }))];
}

const minimapTokens: Record<string, string> = {};
function minimapToken(name: string, fallback: string): string {
  if (!minimapTokens[name]) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    minimapTokens[name] = value || fallback;
  }
  return minimapTokens[name];
}

function minimapNodeColor(type: OrbitNode["type"]): string {
  if (type === "project") return minimapToken("--orbit-minimap-project", "#6686a5");
  if (type === "usage") return minimapToken("--orbit-minimap-usage", "#719b77");
  if (type === "hermesStatus" || type === "hermesTasks" || type === "hermesCron" || type === "hermesResults") return minimapToken("--orbit-minimap-usage", "#719b77");
  if (type === "frame") return minimapToken("--orbit-minimap-frame", "#4c4c4c");
  return minimapToken("--orbit-minimap-tool", "#8a8a84");
}

function OrbitMiniMap({ board, wrapper }: { board: OrbitBoard; wrapper: React.RefObject<HTMLDivElement | null> }) {
  const viewport = useViewport();
  const reactFlow = useReactFlow();
  const [canvasSize, setCanvasSize] = useState({ width: 1_280, height: 720 });

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const update = () => setCanvasSize({ width: element.clientWidth || 1_280, height: element.clientHeight || 720 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [wrapper]);

  const zoom = Math.max(.1, viewport.zoom);
  const visible = {
    x: -viewport.x / zoom,
    y: -viewport.y / zoom,
    width: canvasSize.width / zoom,
    height: canvasSize.height / zoom,
  };
  const center = { x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 };
  const radarAspect = MINIMAP_WIDTH / MINIMAP_HEIGHT;
  let radarWidth = Math.max(1_800, visible.width * 2.55);
  let radarHeight = radarWidth / radarAspect;
  if (radarHeight < visible.height * 2.55) {
    radarHeight = visible.height * 2.55;
    radarWidth = radarHeight * radarAspect;
  }
  const radar = { x: center.x - radarWidth / 2, y: center.y - radarHeight / 2, width: radarWidth, height: radarHeight };

  const panFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = radar.x + ((event.clientX - bounds.left) / bounds.width) * radar.width;
    const y = radar.y + ((event.clientY - bounds.top) / bounds.height) * radar.height;
    void reactFlow.setCenter(x, y, { zoom: viewport.zoom, duration: event.type === "pointerdown" ? 120 : 0 });
  };

  return (
    <div
      className="orbit-minimap nodrag nowheel"
      role="application"
      tabIndex={0}
      aria-label="Zentrierte Minimap. Ziehen zum Navigieren, Mausrad zum Zoomen."
      onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); panFromPointer(event); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) panFromPointer(event); }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      onWheel={(event) => { event.preventDefault(); if (event.deltaY < 0) void reactFlow.zoomIn({ duration: 120 }); else void reactFlow.zoomOut({ duration: 120 }); }}
      onKeyDown={(event) => {
        const distance = 80 / zoom;
        if (event.key === "+" || event.key === "=") { event.preventDefault(); void reactFlow.zoomIn({ duration: 120 }); }
        if (event.key === "-") { event.preventDefault(); void reactFlow.zoomOut({ duration: 120 }); }
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          const x = center.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0);
          const y = center.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0);
          void reactFlow.setCenter(x, y, { zoom: viewport.zoom, duration: 120 });
        }
      }}
    >
      <svg viewBox={`${radar.x} ${radar.y} ${radar.width} ${radar.height}`} aria-hidden="true" preserveAspectRatio="none">
        <rect className="orbit-minimap-surface" x={radar.x} y={radar.y} width={radar.width} height={radar.height} />
        {board.nodes.map((node) => <rect key={node.id} className="orbit-minimap-node" x={node.position.x} y={node.position.y} width={node.size.width} height={node.size.height} rx={Math.min(24, node.size.width * .05)} fill={minimapNodeColor(node.type)} />)}
        <rect data-testid="orbit-minimap-viewport" className="orbit-minimap-viewport" x={visible.x} y={visible.y} width={visible.width} height={visible.height} />
        <line className="orbit-minimap-center" x1={center.x - radar.width * .025} x2={center.x + radar.width * .025} y1={center.y} y2={center.y} />
        <line className="orbit-minimap-center" x1={center.x} x2={center.x} y1={center.y - radar.height * .038} y2={center.y + radar.height * .038} />
      </svg>
    </div>
  );
}

function OrbitInspector({ projects, expanded, onExpand, onCollapse }: { projects: Project[]; expanded: boolean; onExpand: () => void; onCollapse: () => void }) {
  const document = useOrbitStore((state) => state.document);
  const updateNode = useOrbitStore((state) => state.updateNode);
  const assignProject = useOrbitStore((state) => state.assignProject);
  const addEdgeToStore = useOrbitStore((state) => state.addEdge);
  const updateEdge = useOrbitStore((state) => state.updateEdge);
  const removeEdge = useOrbitStore((state) => state.removeEdge);
  const board = document.boards.find((candidate) => candidate.id === document.activeBoardId)!;
  const node = board.nodes.find((candidate) => candidate.id === document.focusedNodeId);
  const [targetId, setTargetId] = useState("");
  if (!node) return null;
  if (!expanded) return <button type="button" className="orbit-inspector-trigger nodrag nowheel" onClick={onExpand} aria-label="Eigenschaften öffnen" aria-expanded="false"><ChevronLeftIcon className="h-4 w-4" /><span>Eigenschaften öffnen</span></button>;
  const relatedEdges = board.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  return (
    <aside className="orbit-inspector nodrag nowheel" aria-label="Knoten-Inspector">
      <header><div><span>{typeLabels[node.type]}</span><strong>Eigenschaften</strong></div><button type="button" onClick={onCollapse} aria-label="Eigenschaften einklappen"><CloseIcon className="h-4 w-4" /></button></header>
      <div className="orbit-inspector-scroll">
        <label><span>Titel</span><input value={node.title} onChange={(event) => updateNode(node.id, { title: event.target.value || "Unbenannt" })} /></label>
        {node.type !== "project" && node.type !== "usage" && node.type !== "frame" && node.type !== "hermesStatus" && node.type !== "hermesTasks" && node.type !== "hermesCron" && node.type !== "hermesResults" ? <label><span>Projekt</span><select aria-label="Projekt" value={node.projectId ?? ""} onChange={(event) => assignProject(node.id, event.target.value || null)}><option value="">Nicht verbunden</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : null}
        {node.type === "snippet" ? <label><span>Sprache</span><input value={node.language ?? ""} onChange={(event) => updateNode(node.id, { language: event.target.value })} /></label> : null}
        <p className="orbit-inspector-hint">Größe und Position direkt am Knoten verändern.</p>
        <label className="orbit-inspector-check"><input type="checkbox" checked={node.locked} onChange={(event) => updateNode(node.id, { locked: event.target.checked })} /><span>Position sperren</span></label>
        <section><h3>Verbindungen</h3>{relatedEdges.map((edge) => <div className="orbit-edge-editor" key={edge.id}><input aria-label="Verbindungsbezeichnung" value={edge.label ?? ""} placeholder={edge.kind} onChange={(event) => updateEdge(edge.id, { label: event.target.value || null })} /><button type="button" onClick={() => removeEdge(edge.id)} aria-label="Verbindung entfernen"><TrashIcon className="h-3.5 w-3.5" /></button></div>)}<div className="orbit-edge-create"><select aria-label="Zielknoten" value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Mit Knoten verbinden…</option>{board.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select><button type="button" aria-label="Verbindung erstellen" disabled={!targetId} onClick={() => { if (targetId) { addEdgeToStore({ source: node.id, target: targetId, kind: "manual", label: "verbunden mit" }); setTargetId(""); } }}><PlusIcon className="h-4 w-4" /></button></div></section>
      </div>
    </aside>
  );
}

function OrbitCanvas() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeActive = useRouteActivity();
  const document = useOrbitStore((state) => state.document);
  const hydrated = useOrbitStore((state) => state.hydrated);
  const dirty = useOrbitStore((state) => state.dirty);
  const saving = useOrbitStore((state) => state.saving);
  const syncError = useOrbitStore((state) => state.syncError);
  const syncNotice = useOrbitStore((state) => state.syncNotice);
  const updatedAt = useOrbitStore((state) => state.updatedAt);
  const addNode = useOrbitStore((state) => state.addNode);
  const addPreviewGroup = useOrbitStore((state) => state.addPreviewGroup);
  const updateNode = useOrbitStore((state) => state.updateNode);
  const removeNode = useOrbitStore((state) => state.removeNode);
  const duplicateNode = useOrbitStore((state) => state.duplicateNode);
  const focusNode = useOrbitStore((state) => state.focusNode);
  const addEdgeToStore = useOrbitStore((state) => state.addEdge);
  const removeEdge = useOrbitStore((state) => state.removeEdge);
  const updateEdge = useOrbitStore((state) => state.updateEdge);
  const setViewport = useOrbitStore((state) => state.setViewport);
  const setWorldBounds = useOrbitStore((state) => state.setWorldBounds);
  const removeNodeAndReleaseSlots = useCallback((nodeId: string) => {
    const current = getActiveOrbitBoard();
    void releasePreviewSlots(previewSlotsReleasedWithNode(current, nodeId));
    removeNode(nodeId);
  }, [removeNode]);
  const activateBoard = useOrbitStore((state) => state.activateBoard);
  const addBoard = useOrbitStore((state) => state.addBoard);
  const renameBoard = useOrbitStore((state) => state.renameBoard);
  const removeBoard = useOrbitStore((state) => state.removeBoard);
  const replaceDocument = useOrbitStore((state) => state.replaceDocument);
  const projectsQuery = useQuery({ ...wraptQueries.projects(), enabled: routeActive });
  const projects = useMemo(
    () => projectsQuery.data?.projects.filter((project) => project.availability === "available") ?? [],
    [projectsQuery.data?.projects],
  );
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const selectProject = useWorkspaceStore((state) => state.selectProject);
  const isMobile = useResponsiveShell().isTouchShell;
  const board = document.boards.find((candidate) => candidate.id === document.activeBoardId) ?? document.boards[0]!;
  const hasPreviewSlots = useMemo(() => board.nodes.some((node) => node.type === "previewSlot"), [board.nodes]);
  const servicesQuery = useQuery({ ...wraptQueries.services(), enabled: routeActive });
  const localPortsQuery = useQuery({ ...wraptQueries.localPorts(), enabled: routeActive && hasPreviewSlots });
  const refreshLocalPorts = localPortsQuery.refetch;
  const orbitNodeRuntime = useMemo(() => ({
    projects: projectsQuery.data?.projects ?? [],
    services: servicesQuery.data?.services ?? [],
    localPorts: localPortsQuery.data ?? null,
    localPortsLoading: localPortsQuery.isLoading,
    localPortsError: localPortsQuery.isError,
    refreshLocalPorts,
  }), [localPortsQuery.data, localPortsQuery.isError, localPortsQuery.isLoading, projectsQuery.data?.projects, refreshLocalPorts, servicesQuery.data?.services]);
  const boardIndex = useMemo(() => createOrbitBoardIndex(board), [board]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const pastePositionRef = useRef<{ x: number; y: number } | null>(null);
  const instanceRef = useRef<ReactFlowInstance | null>(null);
  // Paletten-Payloads, die vor der Server-Hydrierung eintreffen (z. B. Klick auf
  // „Files" in der Sidebar, während das Orbit-Dokument noch lädt), würden beim
  // `initialize` verloren gehen. Sie werden hier gesammelt und nach der
  // Hydrierung verarbeitet.
  const pendingPayloadsRef = useRef<OrbitPalettePayload[]>([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [projectBrowserOpen, setProjectBrowserOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [connectionsVisible, setConnectionsVisible] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [snapPreview, setSnapPreview] = useState<OrbitSnapPreview | null>(null);
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const [canvasInteraction, setCanvasInteraction] = useState<CanvasInteraction | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [edgeMenu, setEdgeMenu] = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const [edgeEditing, setEdgeEditing] = useState(false);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState("");
  const [contextMenu, setContextMenu] = useState<{ kind: "pane" | "node"; x: number; y: number; flowPosition: { x: number; y: number }; nodeId?: string } | null>(null);
  const [contextRename, setContextRename] = useState(false);
  const [contextName, setContextName] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [workspaceEditing, setWorkspaceEditing] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mobileCanvasMode, setMobileCanvasMode] = useState<MobileCanvasMode>("navigate");
  const [mobileHintVisible, setMobileHintVisible] = useState(() => {
    try { return window.localStorage.getItem("wrapt:orbit-touch-hint:v1") !== "dismissed"; } catch { return true; }
  });
  const [toolbarOverflow, setToolbarOverflow] = useState({ before: false, after: false });
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>([]);
  const flowNodesRef = useRef<FlowNode[]>([]);
  const historyRef = useRef<typeof document[]>([]);
  const futureRef = useRef<typeof document[]>([]);
  const previousDocumentRef = useRef(document);
  const historyReadyRef = useRef(false);
  const restoringHistoryRef = useRef(false);
  const canvasInteractionRef = useRef<CanvasInteraction | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const connectionRef = useRef<{ sourceId: string | null; completed: boolean }>({ sourceId: null, completed: false });
  const contextMenuRef = useRef(contextMenu);
  const contextMenuElementRef = useRef<HTMLDivElement>(null);
  const suppressContextMenuRef = useRef(false);
  const toolbarRef = useRef<HTMLElement>(null);
  const prevFocusedNodeIdRef = useRef<string | null>(document.focusedNodeId);
  const nodeGeometryKey = useMemo(
    () => board.nodes.map((node) => `${node.id}:${node.parentId ?? ""}:${node.position.x}:${node.position.y}:${node.size.width}:${node.size.height}:${node.zIndex}:${Number(node.locked)}:${node.previewLayout ?? ""}:${node.previewTarget ?? ""}:${node.previewDeviceId ?? ""}:${node.previewSlotId ?? ""}`).join("|"),
    [board.nodes],
  );

  const canvasInteractive = !isMobile || mobileCanvasMode === "interact";
  contextMenuRef.current = contextMenu;
  useMenuFocus(contextMenuElementRef, contextMenu !== null && !contextRename, () => {
    setContextMenu(null);
    setContextRename(false);
  });

  const beginCanvasInteraction = useCallback((interaction: CanvasInteraction) => {
    canvasInteractionRef.current = interaction;
    setCanvasInteraction(interaction);
  }, []);

  const endCanvasInteraction = useCallback(() => {
    if (canvasInteractionRef.current !== null) {
      canvasInteractionRef.current = null;
      setCanvasInteraction(null);
    }
    setDraggingNodeId(null);
    setSnapPreview(null);
    setResizingNodeId(null);
    setDeleteArmed(false);
  }, []);

  useEffect(() => {
    const focusedChanged = prevFocusedNodeIdRef.current !== document.focusedNodeId;
    prevFocusedNodeIdRef.current = document.focusedNodeId;
    const currentBoard = boardRef.current;
    const nextNodes = (() => {
      const current = flowNodesRef.current;
      const selectedIds = focusedChanged ? null : new Set(current.filter((n) => n.selected).map((n) => n.id));
      return currentBoard.nodes.map((node) => {
        const flow = flowNode(node, document.focusedNodeId, canvasInteractive, currentBoard, undefined, boardIndex);
        if (selectedIds?.has(node.id)) flow.selected = true;
        return flow;
      });
    })();
    flowNodesRef.current = nextNodes;
    setFlowNodes(nextNodes);
  }, [boardIndex, nodeGeometryKey, document.focusedNodeId, canvasInteractive, board.id]);
  const nodesById = boardIndex.nodesById;
  useEffect(() => { setFlowEdges(board.edges.map((edge) => flowEdge(edge, nodesById))); }, [board.edges, nodesById]);
  useEffect(() => {
    setEdgeMenu(null);
    setContextMenu(null);
    setDraggingNodeId(null);
    canvasInteractionRef.current = null;
    setCanvasInteraction(null);
    setDeleteArmed(false);
    setInspectorOpen(false);
    setWorkspaceEditing(false);
    setWorkspaceName(board.name);
    const viewport = { x: board.viewport.x, y: board.viewport.y, zoom: board.viewport.zoom };
    if (instanceRef.current && !viewportsEqual(instanceRef.current.getViewport(), viewport)) {
      // React Flow verwaltet die sichtbare Bewegung selbst. Eine animierte
      // Rückanwendung nach jedem Autosave würde eine neue Benutzerbewegung
      // bekämpfen und den Canvas kurz auf den alten Stand ziehen.
      void instanceRef.current.setViewport(viewport, { duration: 0 });
    }
  }, [board.id, board.name, board.viewport.x, board.viewport.y, board.viewport.zoom]);
  useEffect(() => { setInspectorOpen(false); }, [document.focusedNodeId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (globalThis.document.visibilityState === "hidden") endCanvasInteraction();
    };
    globalThis.window.addEventListener("pointerup", endCanvasInteraction, true);
    globalThis.window.addEventListener("pointercancel", endCanvasInteraction, true);
    globalThis.window.addEventListener("lostpointercapture", endCanvasInteraction, true);
    globalThis.window.addEventListener("blur", endCanvasInteraction);
    globalThis.document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      globalThis.window.removeEventListener("pointerup", endCanvasInteraction, true);
      globalThis.window.removeEventListener("pointercancel", endCanvasInteraction, true);
      globalThis.window.removeEventListener("lostpointercapture", endCanvasInteraction, true);
      globalThis.window.removeEventListener("blur", endCanvasInteraction);
      globalThis.document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [endCanvasInteraction]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!contextMenuRef.current) return;
      const target = event.target instanceof globalThis.Element ? event.target : null;
      if (target?.closest(".orbit-context-menu")) return;
      setContextMenu(null);
      setContextRename(false);
    };
    const handleContextMenu = (event: MouseEvent) => {
      if (!contextMenuRef.current) return;
      event.preventDefault();
      setContextMenu(null);
      setContextRename(false);
      const target = event.target instanceof globalThis.Element ? event.target : null;
      if (target?.closest(".react-flow")) suppressContextMenuRef.current = true;
    };
    globalThis.document.addEventListener("pointerdown", handlePointerDown, true);
    globalThis.document.addEventListener("contextmenu", handleContextMenu, true);
    return () => {
      globalThis.document.removeEventListener("pointerdown", handlePointerDown, true);
      globalThis.document.removeEventListener("contextmenu", handleContextMenu, true);
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const pinch = (event: WheelEvent) => {
      if (!event.ctrlKey || !instanceRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = wrapper.getBoundingClientRect();
      const viewport = instanceRef.current.getViewport();
      const screenX = event.clientX - bounds.left;
      const screenY = event.clientY - bounds.top;
      const anchorX = (screenX - viewport.x) / viewport.zoom;
      const anchorY = (screenY - viewport.y) / viewport.zoom;
      const zoom = Math.max(.1, Math.min(2.2, viewport.zoom * Math.exp(-event.deltaY * .0025)));
      void instanceRef.current.setViewport({ x: screenX - anchorX * zoom, y: screenY - anchorY * zoom, zoom });
    };
    const relayed = (event: Event) => {
      const detail = (event as CustomEvent<{ clientX: number; clientY: number; deltaY: number }>).detail;
      pinch(new WheelEvent("wheel", { ctrlKey: true, clientX: detail.clientX, clientY: detail.clientY, deltaY: detail.deltaY, cancelable: true }));
    };
    wrapper.addEventListener("wheel", pinch, { passive: false, capture: true });
    window.addEventListener("orbit:iframe-pinch", relayed);
    return () => {
      wrapper.removeEventListener("wheel", pinch, { capture: true });
      window.removeEventListener("orbit:iframe-pinch", relayed);
    };
  }, [board.id]);

  const updateToolbarOverflow = useCallback(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const maxScroll = Math.max(0, toolbar.scrollWidth - toolbar.clientWidth);
    setToolbarOverflow({
      before: toolbar.scrollLeft > 4,
      after: toolbar.scrollLeft < maxScroll - 4,
    });
  }, []);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || !isMobile) {
      setToolbarOverflow({ before: false, after: false });
      return;
    }
    const frame = window.requestAnimationFrame(updateToolbarOverflow);
    const observer = new ResizeObserver(updateToolbarOverflow);
    observer.observe(toolbar);
    for (const child of toolbar.children) observer.observe(child);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [board.id, document.boards.length, isMobile, updateToolbarOverflow]);

  const scrollToolbar = (direction: -1 | 1) => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    toolbar.scrollBy({ left: direction * Math.max(180, toolbar.clientWidth * .72), behavior: "smooth" });
  };

  const toggleMobileCanvasMode = () => {
    const next: MobileCanvasMode = mobileCanvasMode === "navigate" ? "interact" : "navigate";
    setMobileCanvasMode(next);
    setMobileHintVisible(false);
    if (next === "navigate") {
      focusNode(null);
      setEdgeMenu(null);
    }
  };
  useEffect(() => {
    if (!hydrated) return;
    if (!historyReadyRef.current) {
      historyReadyRef.current = true;
      previousDocumentRef.current = document;
      return;
    }
    if (restoringHistoryRef.current) {
      restoringHistoryRef.current = false;
      previousDocumentRef.current = document;
      return;
    }
    const previous = previousDocumentRef.current;
    const handle = window.setTimeout(() => {
      historyRef.current = [...historyRef.current.slice(-39), previous];
      futureRef.current = [];
      previousDocumentRef.current = document;
      setHistoryVersion((value) => value + 1);
    }, 450);
    return () => window.clearTimeout(handle);
  }, [document, hydrated]);

  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    futureRef.current.push(document);
    restoringHistoryRef.current = true;
    replaceDocument(previous);
    setHistoryVersion((value) => value + 1);
  };
  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(document);
    restoringHistoryRef.current = true;
    replaceDocument(next);
    setHistoryVersion((value) => value + 1);
  };

  const centerPosition = useCallback(() => {
    const instance = instanceRef.current;
    const wrapper = wrapperRef.current;
    if (!instance || !wrapper) return { x: 0, y: 0 };
    const bounds = wrapper.getBoundingClientRect();
    return instance.screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
  }, []);

  const revealPosition = useCallback((position: { x: number; y: number }, size: { width: number; height: number }) => {
    const instance = instanceRef.current;
    const wrapper = wrapperRef.current;
    if (!instance || !wrapper) return;
    const bounds = wrapper.getBoundingClientRect();
    const horizontalRoom = Math.max(240, bounds.width - (isMobile ? 32 : 360));
    const verticalRoom = Math.max(220, bounds.height - (isMobile ? 150 : 130));
    const zoom = Math.max(.22, Math.min(1, horizontalRoom / size.width, verticalRoom / size.height));
    const targetX = isMobile ? bounds.width / 2 : horizontalRoom / 2;
    const targetY = 88 + verticalRoom / 2;
    const centerX = position.x + size.width / 2;
    const centerY = position.y + size.height / 2;
    void instance.setViewport({ x: targetX - centerX * zoom, y: targetY - centerY * zoom, zoom }, { duration: 240 });
  }, [isMobile]);

  const addPayload = useCallback((payload: OrbitPalettePayload, requestedPosition?: { x: number; y: number }) => {
    if (!useOrbitStore.getState().hydrated) {
      // Noch nicht mit dem Server synchronisiert: den Payload zurückstellen,
      // damit der Knoten nicht beim Laden des Dokuments überschrieben wird.
      pendingPayloadsRef.current.push(payload);
      return;
    }
    const requestedCenter = requestedPosition ?? centerPosition();
    const current = getActiveOrbitBoard();
    if (payload.type === "previewGroup") {
      const layout = payload.layout ?? "1";
      const size = previewGroupSize(layout);
      const position = requestedPosition
        ? { x: requestedCenter.x - size.width / 2, y: requestedCenter.y - size.height / 2 }
        : freePosition(current, requestedCenter, size);
      const source = payload.referenceId ? current.nodes.find((node) => node.id === payload.referenceId && node.type === "previewGroup") : undefined;
      const sourceSlots = source ? current.nodes.filter((node) => node.parentId === source.id && node.type === "previewSlot").sort((left, right) => left.zIndex - right.zIndex) : [];
      const id = addPreviewGroup({
        layout,
        title: payload.title,
        position,
        projectId: source?.projectId ?? selectedProjectId,
        targetPort: payload.targetPort ?? null,
      });
      if (id && source) {
        updateNode(id, { previewReferenceId: source.id });
        const created = getActiveOrbitBoard().nodes.filter((node) => node.parentId === id && node.type === "previewSlot").sort((left, right) => left.zIndex - right.zIndex);
        created.forEach((slot, index) => {
          const original = sourceSlots[index];
          if (original) updateNode(slot.id, {
            title: original.title,
            previewTarget: original.previewTarget,
            previewPath: original.previewPath,
            previewDeviceId: original.previewDeviceId,
            previewOrientation: original.previewOrientation,
            previewSlotId: original.previewSlotId,
            previewIsolation: original.previewIsolation,
            previewRuntime: original.previewRuntime,
            previewReferenceId: source.id,
          });
        });
      }
      if (id) {
        focusNode(isMobile ? null : id);
        if (!requestedPosition) revealPosition(position, size);
      }
      return;
    }
    if (payload.type === "project" && payload.projectId) {
      const existing = current.nodes.find((node) => node.type === "project" && node.projectId === payload.projectId);
      selectProject(payload.projectId);
      if (existing) { focusNode(existing.id); void instanceRef.current?.fitView({ nodes: [{ id: existing.id }], duration: 260, padding: .7 }); return; }
    }
    const nearest = nearestProject(current, requestedCenter);
    const focusedNode = current.nodes.find((node) => node.id === document.focusedNodeId);
    const focusedProjectId = focusedNode?.projectId ?? null;
    const nearbyProjectId = nearest && nearest.distance < 620 ? nearest.node.projectId : null;
    const inferredProjectId = resolveOrbitProjectId(payload.projectId, focusedProjectId, selectedProjectId, nearbyProjectId);
    const project = projects.find((candidate) => candidate.id === inferredProjectId);
    const toolType = payload.type === "tool" ? payload.toolType ?? "terminal" : null;
    const size = orbitDefaultNodeSize(payload.type, toolType);
    const desiredCenter = requestedPosition || payload.type === "project"
      ? requestedCenter
      : projectOrbitCenter(current, inferredProjectId, requestedCenter, size);
    const position = payload.type === "frame" && requestedPosition
      ? { x: requestedCenter.x - size.width / 2, y: requestedCenter.y - size.height / 2 }
      : freePosition(current, desiredCenter, size);
    const id = addNode({
      type: payload.type,
      title: payload.title,
      position,
      projectId: payload.type === "project" ? payload.projectId ?? null : inferredProjectId,
      toolType,
      previewId: toolType === "preview" ? payload.previewId ?? project?.previews[0]?.id ?? null : null,
      provider: payload.provider ?? null,
      content: payload.type === "todo" ? serializeOrbitTodo([]) : payload.type === "note" ? "" : payload.type === "snippet" ? "// Code-Snippet\n" : payload.type === "file" ? "" : "",
      language: payload.type === "snippet" ? "typescript" : null,
    });
    if (id) {
      focusNode(payload.type === "project" || !isMobile ? id : null);
      if (!requestedPosition) revealPosition(position, size);
    }
  }, [addNode, addPreviewGroup, centerPosition, document.focusedNodeId, focusNode, isMobile, projects, revealPosition, selectProject, selectedProjectId, updateNode]);

  const [pasteStatus, setPasteStatus] = useState("");
  const queryClient = useQueryClient();

  // Bilder landen als Vorschau-Node in der Mediengalerie, alle anderen Dateitypen
  // werden still in die Dateigalerie hochgeladen (nur Statusmeldung, kein Node).
  const archiveFiles = useCallback(async (files: File[], origin?: { x: number; y: number }) => {
    const point = origin ?? pastePositionRef.current ?? centerPosition();
    let uploadedToGallery = 0;
    for (const [index, file] of files.entries()) {
      try {
        if (file.type.startsWith("image/")) {
          const asset = await apiClient.uploadOrbitAsset(file);
          addNode({ type: "asset", title: asset.filename, position: { x: point.x + index * 32, y: point.y + index * 32 }, size: orbitDefaultNodeSize("asset"), assetId: asset.id, assetMimeType: asset.mimeType, assetBytes: asset.bytes });
          setPasteStatus(`${asset.filename} wurde archiviert.`);
        } else {
          const uploaded = await apiClient.uploadGalleryFile(file);
          uploadedToGallery += 1;
          setPasteStatus(`${uploaded.filename} wurde in die Dateigalerie hochgeladen.`);
        }
      } catch (error) { setPasteStatus(error instanceof Error ? error.message : "Die Datei konnte nicht hochgeladen werden."); }
    }
    if (uploadedToGallery > 0) await queryClient.invalidateQueries({ queryKey: ["gallery", "files"] });
  }, [addNode, centerPosition, queryClient]);

  const pasteIntoOrbit = useCallback((event: ClipboardEvent | React.ClipboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return false;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable=true], .orbit-tool-content, [role=dialog], [role=menu]")) return false;
    const clipboard = event.clipboardData;
    if (!clipboard) return false;
    const files = Array.from(clipboard.files);
    if (!files.length) for (const item of Array.from(clipboard.items)) if (item.kind === "file" && item.type.startsWith("image/")) { const file = item.getAsFile(); if (file) files.push(file); }
    if (files.length) { event.preventDefault(); void archiveFiles(files); return true; }
    const text = clipboard.getData("text/plain");
    if (!text) return false;
    event.preventDefault();
    const point = pastePositionRef.current ?? centerPosition();
    const id = addNode({ type: "note", title: "Eingefügter Text", content: text, position: point });
    if (id) { focusNode(isMobile ? null : id); setPasteStatus("Text wurde als neue Notiz eingefügt."); }
    return true;
  }, [addNode, archiveFiles, centerPosition, focusNode, isMobile]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!wrapperRef.current || (!wrapperRef.current.contains(target) && globalThis.document.activeElement !== wrapperRef.current)) return;
      if (pasteIntoOrbit(event)) event.stopPropagation();
    };
    window.addEventListener("paste", paste, true);
    return () => window.removeEventListener("paste", paste, true);
  }, [pasteIntoOrbit]);

  useEffect(() => {
    const listener = (event: Event) => {
      const payload = (event as CustomEvent<OrbitPalettePayload>).detail;
      dequeueOrbitPayload(payload);
      addPayload(payload);
    };
    window.addEventListener("orbit:add", listener);
    return () => window.removeEventListener("orbit:add", listener);
  }, [addPayload]);

  useEffect(() => {
    const listener = () => setProjectBrowserOpen(true);
    window.addEventListener("orbit:project-browser", listener);
    return () => window.removeEventListener("orbit:project-browser", listener);
  }, []);

  useEffect(() => {
    if (!hydrated || location.pathname !== "/workbench") return;
    for (const intent of consumeOrbitIntents()) addPayload(intent);
  }, [addPayload, hydrated, location.pathname]);

  // Vor der Hydrierung zurückgestellte Paletten-Payloads jetzt verarbeiten.
  useEffect(() => {
    if (!hydrated) return;
    const pending = pendingPayloadsRef.current;
    if (pending.length === 0) return;
    pendingPayloadsRef.current = [];
    for (const payload of pending) addPayload(payload);
  }, [addPayload, hydrated]);

  // Anfragen, deren `orbit:add`-Event vor dem Mount der Workbench verloren ging
  // (z. B. Sidebar-Klick direkt nach dem Seitenaufbau), über die Queue nachholen.
  useEffect(() => {
    if (!hydrated) return;
    for (const payload of consumeOrbitPayloads()) addPayload(payload);
  }, [addPayload, hydrated]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "/") { event.preventDefault(); setCommandOpen(true); setCommandQuery(""); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); setCommandQuery(""); }
      if (event.key === "Escape") { setCommandOpen(false); setContextMenu(null); setEdgeMenu(null); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const expandTerritoryForGeometry = useCallback((geometry: FlowGeometry) => {
    const current = getActiveOrbitBoard();
    const bounds = expandedOrbitBounds(current.worldBounds, geometry);
    if (!orbitBoundsEqual(bounds, current.worldBounds)) setWorldBounds(bounds);
  }, [setWorldBounds]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const previous = flowNodesRef.current;
    const applied = applyNodeChanges(changes, previous);
    const appliedById = new Map(applied.map((node) => [node.id, node] as const));
    const changedIds = new Set(changes.filter((change) => change.type === "position" || change.type === "dimensions").map((change) => change.id));
    const layoutParentIds = new Set(
      changes
        .filter((change) => change.type === "position" || change.type === "dimensions")
        .map((change) => boardIndex.nodesById.get(change.id))
        .filter((node): node is OrbitNode => node?.type === "previewGroup")
        .map((node) => node.id),
    );
    const geometryOverrides = new Map<string, FlowGeometry>();
    for (const id of changedIds) {
      const stored = boardIndex.nodesById.get(id);
      if (!stored || (stored.parentId !== null && layoutParentIds.has(stored.parentId))) continue;
      const changed = appliedById.get(id);
      const geometry = changed ? geometryFromFlowNode(changed) : null;
      if (geometry) geometryOverrides.set(id, geometry);
    }
    const next = applied.map((node) => {
      const stored = boardIndex.nodesById.get(node.id);
      if (!stored || geometryOverrides.size === 0) return node;
      const derived = flowNode(stored, document.focusedNodeId, canvasInteractive, board, geometryOverrides, boardIndex);
      return {
        ...node,
        position: derived.position,
        width: derived.width!,
        height: derived.height!,
        style: derived.style ?? {},
        hidden: derived.hidden ?? false,
      };
    });
    flowNodesRef.current = next;
    setFlowNodes(next);
    const resizeStart = changes.find((change) => change.type === "dimensions" && change.resizing);
    const resizeEnd = changes.some((change) => change.type === "dimensions" && change.resizing === false);
    if (resizeStart && "id" in resizeStart) setResizingNodeId(resizeStart.id);
    if (resizeEnd) setResizingNodeId(null);
    for (const [id, geometry] of geometryOverrides) {
      const stored = boardIndex.nodesById.get(id);
      if (stored?.parentId === null) expandTerritoryForGeometry(geometry);
    }
    for (const change of changes) {
      const stored = "id" in change ? boardIndex.nodesById.get(change.id) : undefined;
      if (change.type === "select" && change.selected) {
        if (stored?.type === "project" && stored.projectId) selectProject(stored.projectId);
      }
      if (change.type === "remove") removeNodeAndReleaseSlots(change.id);
    }
  }, [board, boardIndex, canvasInteractive, document.focusedNodeId, expandTerritoryForGeometry, removeNodeAndReleaseSlots, selectProject]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setFlowEdges((current) => applyEdgeChanges(changes, current));
    for (const change of changes) if (change.type === "remove") removeEdge(change.id);
  }, [removeEdge]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    if (connectionRef.current.completed) return;
    connectionRef.current.completed = true;
    const id = addEdgeToStore({
      source: connection.source,
      target: connection.target,
      kind: "manual",
      label: "verbunden mit",
      sourceSide: connection.sourceHandle === "left" ? "left" : connection.sourceHandle === "right" ? "right" : null,
      targetSide: connection.targetHandle === "left" ? "left" : connection.targetHandle === "right" ? "right" : null,
    });
    if (id) setFlowEdges((current) => addEdge({ ...connection, id }, current));
  }, [addEdgeToStore]);

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectionRef.current = { sourceId: params.nodeId, completed: false };
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
    const started = connectionRef.current;
    connectionRef.current = { sourceId: null, completed: false };
    if (started.completed || !started.sourceId) return;
    const point = dragPoint(event);
    const targetId = connectionState.toNode?.id ?? (point ? orbitNodeIdAtPoint(point, started.sourceId) : null);
    if (!targetId || targetId === started.sourceId) return;
    addEdgeToStore({ source: started.sourceId, target: targetId, kind: "manual", label: "verbunden mit" });
  }, [addEdgeToStore]);

  const connectToNodeBody = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const started = connectionRef.current;
    if (started.completed || !started.sourceId) return;
    const element = globalThis.document.elementFromPoint(event.clientX, event.clientY);
    if (element?.closest(".react-flow__handle")) return;
    const targetId = orbitNodeIdAtPoint({ x: event.clientX, y: event.clientY }, started.sourceId);
    if (!targetId || targetId === started.sourceId) return;
    const id = addEdgeToStore({ source: started.sourceId, target: targetId, kind: "manual", label: "verbunden mit" });
    if (id) connectionRef.current.completed = true;
  }, [addEdgeToStore]);

  const expandTerritory = useCallback((dragged: FlowNode) => {
    const source = getActiveOrbitBoard();
    const stored = source.nodes.find((node) => node.id === dragged.id);
    if (!stored || stored.parentId !== null) return;
    expandTerritoryForGeometry({
      position: dragged.position,
      size: {
        width: dragged.width ?? dragged.measured?.width ?? stored.size.width,
        height: dragged.height ?? dragged.measured?.height ?? stored.size.height,
      },
    });
  }, [expandTerritoryForGeometry]);

  const isOverDeleteZone = useCallback((event: MouseEvent | TouchEvent) => {
    const point = dragPoint(event);
    const wrapper = wrapperRef.current;
    if (!point || !wrapper) return false;
    const bounds = wrapper.getBoundingClientRect();
    return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.bottom - DELETE_ZONE_HEIGHT && point.y <= bounds.bottom;
  }, []);

  const startNodeDrag: OnNodeDrag = useCallback((_event, dragged) => {
    beginCanvasInteraction("node");
    setDraggingNodeId(dragged.id);
    setSnapPreview(null);
    setEdgeMenu(null);
  }, [beginCanvasInteraction]);

  const trackNodeDrag: OnNodeDrag = useCallback((event, dragged) => {
    setDeleteArmed(isOverDeleteZone(event));
    expandTerritory(dragged);
    const point = dragPoint(event);
    const worldPoint = point ? instanceRef.current?.screenToFlowPosition(point) : null;
    const current = getActiveOrbitBoard();
    setSnapPreview(worldPoint ? orbitSnapPreview(current, dragged.id, worldPoint, createOrbitBoardIndex(current)) : null);
  }, [expandTerritory, isOverDeleteZone]);

  const finishNodeDrag: OnNodeDrag = useCallback((event, dragged) => {
    const point = dragPoint(event);
    const currentBefore = getActiveOrbitBoard();
    const currentIndex = createOrbitBoardIndex(currentBefore);
    const worldPoint = point ? instanceRef.current?.screenToFlowPosition(point) : null;
    const snap = worldPoint ? orbitSnapPreview(currentBefore, dragged.id, worldPoint, currentIndex) : null;
    const shouldDelete = isOverDeleteZone(event);
    endCanvasInteraction();
    setDraggingNodeId(null);
    setDeleteArmed(false);
    if (shouldDelete) {
      window.setTimeout(() => removeNodeAndReleaseSlots(dragged.id), 120);
      return;
    }
    const stored = currentIndex.nodesById.get(dragged.id);
    if (stored?.type === "previewSlot" && worldPoint) {
      if (snap?.action === "swap" && snap.targetSlotId) {
        const target = currentIndex.nodesById.get(snap.targetSlotId);
        if (target) {
          updateNode(stored.id, { zIndex: target.zIndex });
          updateNode(target.id, { zIndex: stored.zIndex });
          return;
        }
      }
      if (snap?.action === "attach") {
        const targetGroup = currentIndex.nodesById.get(snap.targetGroupId);
        if (targetGroup?.type === "previewGroup") {
          const occupied = currentIndex.previewSlotsByParent.get(targetGroup.id)?.length ?? 0;
          if (occupied >= 6) return;
          const capacity = Number(targetGroup.previewLayout ?? "1");
          const required = occupied + 1;
          if (required > capacity) {
            useOrbitStore.getState().setPreviewGroupLayout(targetGroup.id, required <= 2 ? "2" : required <= 3 ? "3" : "6");
          }
          const nextGroup = getActiveOrbitBoard().nodes.find((node) => node.id === targetGroup.id && node.type === "previewGroup");
          const geometry = nextGroup ? previewSlotGeometry(nextGroup, occupied) : null;
          updateNode(stored.id, {
            parentId: targetGroup.id,
            position: geometry?.position ?? { x: 8, y: 52 },
            size: geometry?.size ?? orbitDefaultNodeSize("previewSlot"),
          });
          return;
        }
      }
      if (stored.parentId) {
        const parent = currentIndex.nodesById.get(stored.parentId);
        const outside = parent ? !containsOrbitPoint(orbitNodeWorldRectangle(currentBefore, parent, currentIndex), worldPoint) : true;
        if (outside) {
          const size = orbitDefaultNodeSize("previewSlot");
          updateNode(stored.id, { parentId: null, position: { x: worldPoint.x - size.width / 2, y: worldPoint.y - size.height / 2 }, size });
          return;
        }
      }
    }
    updateNode(dragged.id, { position: dragged.position });
    const current = getActiveOrbitBoard();
    setWorldBounds(compactedOrbitBounds(current.nodes.map((node) => node.id === dragged.id ? { ...node, position: dragged.position } : node)));
  }, [endCanvasInteraction, isOverDeleteZone, removeNodeAndReleaseSlots, setWorldBounds, updateNode]);

  const startCanvasPan: OnMoveStart = useCallback(() => {
    beginCanvasInteraction("pane");
  }, [beginCanvasInteraction]);

  const finishCanvasPan: OnMoveEnd = useCallback((event, viewport) => {
    endCanvasInteraction();
    if (event) setViewport(viewport);
  }, [endCanvasInteraction, setViewport]);

  const compactTerritory = () => {
    const current = getActiveOrbitBoard();
    setWorldBounds(compactedOrbitBounds(current.nodes));
    void instanceRef.current?.fitView({ duration: 260, padding: .18 });
  };

  const createWorkspace = () => {
    const name = `Arbeitsfläche ${document.boards.length + 1}`;
    addBoard(name);
  };

  const saveWorkspaceName = () => {
    const value = workspaceName.trim();
    if (!value) return;
    renameBoard(board.id, value);
    setWorkspaceEditing(false);
  };

  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    const position = instanceRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (event.dataTransfer.files.length && position) { void archiveFiles(Array.from(event.dataTransfer.files), position); return; }
    const raw = event.dataTransfer.getData("application/x-orbit-node") || event.dataTransfer.getData("text/plain");
    if (!raw || !instanceRef.current) return;
    try { addPayload(JSON.parse(raw) as OrbitPalettePayload, instanceRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })); } catch { /* Ignore unrelated browser drags. */ }
  };

  const commands = commandPayloads(projects).filter((item) => `${item.payload.title} ${item.keywords}`.toLowerCase().includes(commandQuery.toLowerCase())).slice(0, 12);
  const syncLabel = syncError ? "Synchronisierung gestört" : saving ? "Wird gespeichert" : dirty ? "Ungespeicherte Änderung" : syncNotice ? "Serverstand übernommen" : "Auf Server gespeichert";
  const syncTone = syncError ? "error" : saving || dirty ? "busy" : syncNotice ? "info" : "saved";
  const activeNodeIds = useMemo(() => new Set(board.nodes.map((node) => node.id)), [board.nodes]);
  const activeFlowNodes = useMemo(() => flowNodes
    .filter((node) => activeNodeIds.has(node.id))
    .map((node) => {
      const classes = [
        node.className,
        node.id === snapPreview?.targetGroupId ? "is-snap-target" : "",
        node.id === snapPreview?.targetSlotId ? "is-snap-slot-target" : "",
        node.id === resizingNodeId ? "is-resizing" : "",
      ].filter(Boolean).join(" ");
      return classes ? { ...node, className: classes } : node;
    }), [activeNodeIds, flowNodes, resizingNodeId, snapPreview]);
  const activeFlowEdges = useMemo(() => flowEdges.filter((edge) => activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target)), [activeNodeIds, flowEdges]);
  const contextNode = contextMenu?.nodeId ? board.nodes.find((node) => node.id === contextMenu.nodeId) : undefined;
  const snapTarget = snapPreview ? board.nodes.find((node) => node.id === snapPreview.targetGroupId) : undefined;
  const snapSlot = snapPreview?.targetSlotId ? board.nodes.find((node) => node.id === snapPreview.targetSlotId) : undefined;

  const openContextMenu = (event: MouseEvent | React.MouseEvent, kind: "pane" | "node", nodeId?: string) => {
    event.preventDefault();
    if (suppressContextMenuRef.current) {
      suppressContextMenuRef.current = false;
      return;
    }
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const instance = instanceRef.current;
    if (!bounds || !instance) return;
    const x = Math.min(bounds.width - 246, Math.max(8, event.clientX - bounds.left));
    const y = Math.min(bounds.height - 300, Math.max(8, event.clientY - bounds.top));
    setContextMenu({ kind, ...(nodeId ? { nodeId } : {}), x, y, flowPosition: instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
    setContextRename(false);
    setContextName(nodeId ? board.nodes.find((node) => node.id === nodeId)?.title ?? "" : "");
    setEdgeMenu(null);
    if (nodeId) focusNode(nodeId);
  };

  const addFromContext = (payload: OrbitPalettePayload) => {
    if (!contextMenu) return;
    addPayload(payload, contextMenu.flowPosition);
    setContextMenu(null);
  };

  if (!hydrated) return <div className="orbit-loading" role="status" aria-label="Orbit wird vom Server geladen"><span /><span /><span /><span /><strong className="sr-only">Orbit wird vom Server geladen</strong></div>;

  return (
    <div
      className={`orbit-page ${dragActive ? "is-drag-active" : ""} ${canvasInteraction === "node" ? "is-orbit-interacting" : ""} ${isMobile ? `is-mobile-${mobileCanvasMode}` : ""}`}
      data-mobile-mode={isMobile ? mobileCanvasMode : undefined}
      ref={wrapperRef}
      tabIndex={0}
      onPaste={pasteIntoOrbit}
      onPointerUpCapture={connectToNodeBody}
    >
      <nav ref={toolbarRef} className="orbit-main-island" aria-label="Orbit-Steuerung" data-history-version={historyVersion} onScroll={updateToolbarOverflow}>
        <div className="orbit-workspace-control">
          {workspaceEditing ? <form className="orbit-workspace-rename" onSubmit={(event) => { event.preventDefault(); saveWorkspaceName(); }}>
            <input autoFocus aria-label="Name der Arbeitsfläche" value={workspaceName} maxLength={80} onChange={(event) => setWorkspaceName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setWorkspaceName(board.name); setWorkspaceEditing(false); } }} />
            <button type="submit" disabled={!workspaceName.trim()} aria-label="Arbeitsflächenname speichern" title="Arbeitsflächenname speichern"><SaveIcon className="h-4 w-4" /></button>
            <button type="button" onClick={() => { setWorkspaceName(board.name); setWorkspaceEditing(false); }} aria-label="Umbenennen abbrechen" title="Umbenennen abbrechen"><CloseIcon className="h-4 w-4" /></button>
          </form> : <>
            <label><span>Arbeitsfläche</span><select aria-label="Arbeitsfläche auswählen" value={board.id} onChange={(event) => activateBoard(event.target.value)}>{document.boards.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.nodes.length}</option>)}</select></label>
            <button type="button" onClick={() => { setWorkspaceName(board.name); setWorkspaceEditing(true); }} aria-label="Arbeitsfläche umbenennen" title="Arbeitsfläche umbenennen"><EditIcon className="h-4 w-4" /></button>
          </>}
          <button type="button" onClick={createWorkspace} aria-label="Arbeitsfläche hinzufügen" title="Arbeitsfläche hinzufügen"><PlusIcon className="h-4 w-4" /></button>
          {document.boards.length > 1 ? <button type="button" onClick={() => removeBoard(board.id)} aria-label="Arbeitsfläche entfernen" title="Arbeitsfläche entfernen"><TrashIcon className="h-4 w-4" /></button> : null}
        </div>
        <span className="orbit-island-divider" />
        <div className="orbit-island-buttons" aria-label="Verlauf und Knoten">
          <button type="button" onClick={undo} disabled={historyRef.current.length === 0} title="Rückgängig" aria-label="Rückgängig"><UndoIcon className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={futureRef.current.length === 0} title="Wiederholen" aria-label="Wiederholen"><RedoIcon className="h-4 w-4" /></button>
          <button type="button" onClick={() => addPayload({ type: "note", title: "Neue Notiz" })} title="Notiz hinzufügen" aria-label="Notiz hinzufügen"><NoteIcon className="h-4 w-4" /></button>
          <button type="button" onClick={() => addPayload({ type: "frame", title: "Neuer Bereich" })} title="Bereich hinzufügen" aria-label="Bereich hinzufügen"><FrameIcon className="h-4 w-4" /></button>
          <button type="button" onClick={() => setConnectionsVisible((visible) => !visible)} className={connectionsVisible ? "is-active" : ""} title="Verbindungen umschalten" aria-label="Verbindungen umschalten"><LocateIcon className="h-4 w-4" /></button>
        </div>
        <span className="orbit-island-divider" />
        <div className={`orbit-sync-status is-${syncTone} ${syncOpen ? "is-open" : ""}`}>
          <button type="button" onClick={() => setSyncOpen((open) => !open)} aria-label={syncLabel} aria-expanded={syncOpen} title={syncLabel}><span /></button>
          <div className="orbit-sync-popover" role="status">
            <header><strong>{syncLabel}</strong><small>{updatedAt && !dirty ? `Revision ${useOrbitStore.getState().revision} · ${new Date(updatedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "Server-Synchronisierung"}</small>{syncError ? <p className="orbit-sync-message">{syncError}</p> : syncNotice ? <p className="orbit-sync-message is-info">{syncNotice}</p> : null}</header>
            <div><span className="is-saved" /><p><strong>Grün</strong><small>Alle Änderungen sind gespeichert.</small></p></div>
            <div><span className="is-busy" /><p><strong>Gelb</strong><small>Änderungen warten oder werden gespeichert.</small></p></div>
            <div><span className="is-info" /><p><strong>Blau</strong><small>Ein neuerer Serverstand wurde übernommen.</small></p></div>
            <div><span className="is-error" /><p><strong>Rot</strong><small>Die Synchronisierung benötigt Aufmerksamkeit.</small></p></div>
          </div>
        </div>
      </nav>
      {isMobile && toolbarOverflow.before ? <button type="button" className="orbit-toolbar-step is-before" onClick={() => scrollToolbar(-1)} aria-label="Steuerleiste zurückscrollen"><ChevronLeftIcon className="h-4 w-4" /></button> : null}
      {isMobile && toolbarOverflow.after ? <button type="button" className="orbit-toolbar-step is-after" onClick={() => scrollToolbar(1)} aria-label="Steuerleiste weiterscrollen"><ChevronRightIcon className="h-4 w-4" /></button> : null}
      <PreviewContextIsland board={board} focusedNodeId={document.focusedNodeId} onOpenHub={() => navigate("/previews")} />

      <div className="orbit-quick-panel" aria-label="Canvas-Steuerung">
        <div className="orbit-quick-primary"><button type="button" onClick={() => { setCommandQuery(""); setCommandOpen(true); }}><CommandIcon className="h-4 w-4" /><span>Befehl</span></button><button type="button" className="orbit-compact-action" onClick={compactTerritory}><SelectBoxIcon className="h-4 w-4" /><span>Kompaktieren</span></button>{isMobile ? <><button type="button" className="orbit-mobile-mode" onClick={toggleMobileCanvasMode} aria-pressed={mobileCanvasMode === "interact"} aria-label={mobileCanvasMode === "navigate" ? "Canvas-Modus: Navigieren. Zu Inhalt benutzen wechseln" : "Canvas-Modus: Inhalt benutzen. Zu Navigieren wechseln"}>{mobileCanvasMode === "navigate" ? <HandIcon className="h-4 w-4" /> : <PointerIcon className="h-4 w-4" />}<span>{mobileCanvasMode === "navigate" ? "Canvas" : "Inhalt"}</span></button></> : null}</div>
        <div className="orbit-zoom-row" aria-label="Canvas-Ansicht"><button type="button" onClick={() => instanceRef.current?.zoomOut({ duration: 160 })} aria-label="Verkleinern" title="Verkleinern"><MinusIcon className="h-4 w-4" /></button><button type="button" onClick={() => instanceRef.current?.zoomIn({ duration: 160 })} aria-label="Vergrößern" title="Vergrößern"><PlusIcon className="h-4 w-4" /></button><button type="button" onClick={() => instanceRef.current?.fitView({ duration: 220, padding: .18 })} aria-label="Alles zeigen" title="Alles zeigen"><FullscreenIcon className="h-4 w-4" /></button></div>
      </div>
      {isMobile && mobileHintVisible ? <div className="orbit-mobile-hint" role="status"><div><strong>Zwei Finger bewegen und zoomen</strong><span>Wechsle zu Inhalt, um Tools und Notizen zu bedienen.</span></div><button type="button" onClick={() => { setMobileHintVisible(false); try { window.localStorage.setItem("wrapt:orbit-touch-hint:v1", "dismissed"); } catch { /* Hint remains session-local without storage. */ } }} aria-label="Gestenhinweis schließen"><CloseIcon className="h-4 w-4" /></button></div> : null}
      <OrbitNodeRuntimeProvider data={orbitNodeRuntime}>
        <ReactFlow
          key={board.id}
          nodes={activeFlowNodes}
          edges={connectionsVisible ? activeFlowEdges : []}
        onlyRenderVisibleElements={false}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDragStart={startNodeDrag}
        onNodeDrag={trackNodeDrag}
        onNodeDragStop={finishNodeDrag}
        onNodeClick={(event, node) => {
          const target = event.target as HTMLElement;
          const isContentInteraction = Boolean(target.closest("input, textarea, select, button, a, [contentEditable=true], .orbit-tool-content"));
          if (isContentInteraction) return;
          if (!event.metaKey && !event.ctrlKey) focusNode(node.id);
          const stored = getActiveOrbitBoard().nodes.find((candidate) => candidate.id === node.id);
          if (stored?.type === "project" && stored.projectId) selectProject(stored.projectId);
        }}
        onNodeContextMenu={(event, node) => openContextMenu(event, "node", node.id)}
        onPaneContextMenu={(event) => openContextMenu(event, "pane")}
        onEdgeClick={(event, edge) => {
          event.stopPropagation();
          const bounds = wrapperRef.current?.getBoundingClientRect();
          const stored = board.edges.find((candidate) => candidate.id === edge.id);
          if (bounds) {
            setEdgeMenu({ edgeId: edge.id, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
            setEdgeEditing(false);
            setEdgeLabelDraft(stored?.label ?? "");
            setContextMenu(null);
          }
        }}
        onPaneClick={(event) => { pastePositionRef.current = instanceRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? null; wrapperRef.current?.focus(); focusNode(null); setEdgeMenu(null); setContextMenu(null); }}
        onDrop={drop}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { if (!elementContainsEventTarget(event.currentTarget, event.relatedTarget)) setDragActive(false); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onInit={(instance) => { instanceRef.current = instance; }}
        onMoveStart={startCanvasPan}
        onMoveEnd={finishCanvasPan}
        defaultViewport={board.viewport}
        minZoom={.1}
        maxZoom={2.2}
        translateExtent={[[board.worldBounds.minX - 500, board.worldBounds.minY - 500], [board.worldBounds.maxX + 500, board.worldBounds.maxY + 500]]}
        nodeExtent={[[board.worldBounds.minX, board.worldBounds.minY], [board.worldBounds.maxX, board.worldBounds.maxY]]}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={48}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Meta", "Control"]}
        selectionOnDrag={false}
        selectNodesOnDrag={false}
        panOnDrag
        panOnScroll={!isMobile}
        zoomOnPinch
        zoomOnDoubleClick={!isMobile}
        preventScrolling
        elementsSelectable={canvasInteractive}
        nodesConnectable={canvasInteractive}
        nodeDragThreshold={isMobile ? 8 : 1}
        paneClickDistance={isMobile ? 8 : 1}
        nodeClickDistance={isMobile ? 8 : 0}
        nodesFocusable
        edgesFocusable
        fitView={board.nodes.length === 0}
        className="orbit-flow"
        proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color={minimapToken("--orbit-canvas-dot", "#343434")} />
        </ReactFlow>
      </OrbitNodeRuntimeProvider>
      {canvasInteraction === "node" ? <div className="orbit-interaction-shield" aria-hidden onPointerUp={endCanvasInteraction} onPointerCancel={endCanvasInteraction} /> : null}
      <OrbitMiniMap board={board} wrapper={wrapperRef} />
      <div className="orbit-drop-cue" aria-hidden><PlusIcon className="h-5 w-5" /><span>Auf dem Orbit ablegen</span></div>
      {snapPreview && snapTarget ? <div className="orbit-snap-cue is-visible" role="status" aria-live="polite"><FrameIcon className="h-4 w-4" /><div><strong>{snapPreview.action === "swap" ? "Slot tauschen" : "Preview einordnen"}</strong><span>{snapSlot ? `${snapSlot.title} in ${snapTarget.title}` : snapTarget.title}</span></div></div> : null}
      <div className={`orbit-delete-zone ${draggingNodeId ? "is-visible" : ""} ${deleteArmed ? "is-armed" : ""}`} aria-hidden={!draggingNodeId}><TrashIcon className="h-5 w-5" /><div><strong>{deleteArmed ? "Loslassen zum Entfernen" : "Hierher ziehen zum Entfernen"}</strong><span>Der Knoten wird aus dieser Arbeitsfläche gelöscht.</span></div></div>
      {edgeMenu ? <div className={`orbit-edge-menu ${edgeEditing ? "is-editing" : ""}`} style={{ left: edgeMenu.x, top: edgeMenu.y }} role="dialog" aria-label="Verbindung bearbeiten" onPointerDown={(event) => event.stopPropagation()}>
        {edgeEditing ? <form onSubmit={(event) => { event.preventDefault(); updateEdge(edgeMenu.edgeId, { label: edgeLabelDraft.trim() || null }); setEdgeEditing(false); }}><input autoFocus aria-label="Verbindungstext" value={edgeLabelDraft} maxLength={80} onChange={(event) => setEdgeLabelDraft(event.target.value)} /><button type="submit"><SaveIcon className="h-3.5 w-3.5" /> Speichern</button></form> : <><span>Verbindung</span><div><button type="button" className="is-edit" onClick={() => setEdgeEditing(true)}><EditIcon className="h-3.5 w-3.5" /> Bearbeiten</button><button type="button" className="is-delete" onClick={() => { removeEdge(edgeMenu.edgeId); setEdgeMenu(null); }}><TrashIcon className="h-3.5 w-3.5" /> Löschen</button></div></>}
      </div> : null}
      {contextMenu ? <div ref={contextMenuElementRef} className="orbit-context-menu nodrag nowheel" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" aria-label={contextMenu.kind === "node" ? "Knotenaktionen" : "Schnellaktionen"} onPointerDown={(event) => event.stopPropagation()}>
        <header><span>{contextMenu.kind === "node" ? typeLabels[contextNode?.type ?? "note"] : "Neue Fläche"}</span><strong>{contextNode?.title ?? "Schnell hinzufügen"}</strong></header>
        {contextRename && contextNode ? <form onSubmit={(event) => { event.preventDefault(); updateNode(contextNode.id, { title: contextName.trim() || "Unbenannt" }); setContextMenu(null); }}><input autoFocus value={contextName} maxLength={120} aria-label="Neuer Name" onChange={(event) => setContextName(event.target.value)} /><button type="submit"><SaveIcon className="h-4 w-4" /> Speichern</button></form> : contextMenu.kind === "node" && contextNode ? <div className="orbit-context-actions">
          <button type="button" role="menuitem" onClick={() => { setInspectorOpen(true); setContextMenu(null); }}><EditIcon className="h-4 w-4" /><span>Eigenschaften bearbeiten</span></button>
          <button type="button" role="menuitem" onClick={() => setContextRename(true)}><EditIcon className="h-4 w-4" /><span>Name ändern</span></button>
          <button type="button" role="menuitem" onClick={() => { duplicateNode(contextNode.id); setContextMenu(null); }}><CopyIcon className="h-4 w-4" /><span>Duplizieren</span></button>
          <button type="button" role="menuitem" onClick={() => { updateNode(contextNode.id, { locked: !contextNode.locked }); setContextMenu(null); }}><LockIcon className="h-4 w-4" /><span>{contextNode.locked ? "Position entsperren" : "Position sperren"}</span></button>
          {/* Farbe des Knotens. Die von ihm ausgehenden Verbindungen ziehen mit
              (siehe orbitEdgeColor) — deshalb steht das direkt im Kontextmenü. */}
          <OrbitColorPicker
            value={contextNode.color}
            onSelect={(color) => { updateNode(contextNode.id, { color }); setContextMenu(null); }}
          />
          <button type="button" role="menuitem" className="is-danger" onClick={() => { removeNodeAndReleaseSlots(contextNode.id); setContextMenu(null); }}><TrashIcon className="h-4 w-4" /><span>Komplett löschen</span></button>
        </div> : <div className="orbit-context-actions">
          <button type="button" role="menuitem" onClick={() => addFromContext({ type: "note", title: "Neue Textfläche" })}><NoteIcon className="h-4 w-4" /><span>Neue Textfläche</span></button>
          <button type="button" role="menuitem" onClick={() => addFromContext({ type: "todo", title: "To-do-Liste" })}><TodoIcon className="h-4 w-4" /><span>Neue To-do-Liste</span></button>
          <button type="button" role="menuitem" onClick={() => addFromContext({ type: "tool", title: "Terminal", toolType: "terminal" })}><CommandIcon className="h-4 w-4" /><span>Neues Terminal</span></button>
          <button type="button" role="menuitem" onClick={() => addFromContext({ type: "tool", title: "Codex", toolType: "codex" })}><CommandIcon className="h-4 w-4" /><span>Codex öffnen</span></button>
          <button type="button" role="menuitem" onClick={() => addFromContext({ type: "tool", title: "OpenCode", toolType: "opencode" })}><CommandIcon className="h-4 w-4" /><span>OpenCode öffnen</span></button>
          <button type="button" role="menuitem" onClick={() => addFromContext({ type: "frame", title: "Neuer Bereich" })}><FrameIcon className="h-4 w-4" /><span>Neuer Bereich</span></button>
          <button type="button" role="menuitem" onClick={() => addFromContext({ type: "previewGroup", title: "Einzel-Preview", layout: "1" })}><FrameIcon className="h-4 w-4" /><span>Einzel-Preview</span></button>
          <button type="button" role="menuitem" onClick={() => addFromContext({ type: "previewGroup", title: "3er-Preview-Gruppe", layout: "3" })}><FrameIcon className="h-4 w-4" /><span>3er-Preview-Gruppe</span></button>
          <button type="button" role="menuitem" onClick={() => { setContextMenu(null); navigate("/files"); }}><FinderIcon className="h-4 w-4" /><span>Dateimanager öffnen</span></button>
          <button type="button" role="menuitem" onClick={() => { setContextMenu(null); setCommandOpen(true); }}><SearchIcon className="h-4 w-4" /><span>Alle Aktionen</span></button>
        </div>}
      </div> : null}
      <OrbitInspector projects={projects} expanded={inspectorOpen} onExpand={() => setInspectorOpen(true)} onCollapse={() => setInspectorOpen(false)} />

      {commandOpen ? <div className="orbit-command-backdrop" onPointerDown={() => setCommandOpen(false)}><div className="orbit-command" role="dialog" aria-modal="true" aria-label="Orbit-Befehl" onPointerDown={(event) => event.stopPropagation()}><div className="orbit-command-mobile-head"><div><span>Orbit-Palette</span><strong>Knoten hinzufügen</strong></div><button type="button" onClick={() => setCommandOpen(false)} aria-label="Palette schließen"><CloseIcon className="h-5 w-5" /></button></div><label><SearchIcon className="h-4 w-4" /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && commands[0]) { addPayload(commands[0].payload); setCommandOpen(false); } }} placeholder="Terminal, Notiz oder Projekt…" /><kbd>Esc</kbd></label><div className="orbit-command-results"><button type="button" className="orbit-command-project-browser" onClick={() => { setCommandOpen(false); setProjectBrowserOpen(true); }}><span>Server</span><strong><FolderSearchIcon className="h-4 w-4" /> Projektordner durchsuchen</strong></button>{commands.map((item, index) => <button type="button" key={`${item.payload.type}-${item.payload.title}`} className={index === 0 ? "is-active" : ""} onClick={() => { addPayload(item.payload); setCommandOpen(false); }}><span>{item.payload.type === "tool" ? item.payload.toolType : typeLabels[item.payload.type]}</span><strong>{item.payload.title}</strong>{index === 0 ? <kbd>Enter</kbd> : null}</button>)}{commands.length === 0 ? <p>Kein passender Knoten gefunden.</p> : null}</div></div></div> : null}
      <OrbitProjectBrowserDialog open={projectBrowserOpen} onClose={() => setProjectBrowserOpen(false)} />
      <div className="orbit-territory-readout">Gebiet {Math.round(board.worldBounds.maxX - board.worldBounds.minX)} × {Math.round(board.worldBounds.maxY - board.worldBounds.minY)}</div>
      <div className="sr-only" aria-live="polite">{syncLabel}</div>
      <div className="sr-only" aria-live="polite">{pasteStatus}</div>
      <div className="sr-only" aria-live="polite">{isMobile ? mobileCanvasMode === "navigate" ? "Canvas-Navigation aktiv" : "Inhaltsbedienung aktiv" : ""}</div>
    </div>
  );
}

export function Workbench() {
  return <ReactFlowProvider><OrbitSync /><OrbitCanvas /></ReactFlowProvider>;
}
