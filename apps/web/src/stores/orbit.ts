import {
  ORBIT_DOCUMENT_VERSION,
  ORBIT_LIMITS,
  orbitWorkspaceSchema,
  type OrbitBoard,
  type OrbitBounds,
  type OrbitDocumentResponse,
  type OrbitEdge,
  type OrbitNode,
  type OrbitWorkspace,
  type PanelType,
  type Workspace,
} from "@wrapt/contracts";
import { create } from "zustand";
import { generateId } from "../lib/id";

const DEFAULT_BOARD_ID = "orbit-default";

/**
 * Hebt ein Orbit-Dokument auf Version 8. Preview-Slots erhalten eine stabile
 * Storage-Identität; ein bisher leeres Gerät bleibt als ausdrückliches
 * "responsive" erhalten, damit der sichtbare Zustand sich nicht ändert. Erst
 * neu erzeugte Slots erben die Benutzerpräferenz über `null`.
 */
export function migrateOrbitDocument(document: OrbitWorkspace): OrbitWorkspace {
  if (document.version === ORBIT_DOCUMENT_VERSION) return document;
  return orbitWorkspaceSchema.parse({
    ...document,
    version: ORBIT_DOCUMENT_VERSION,
    boards: document.boards.map((board) => ({
      ...board,
      nodes: board.nodes.map((node) => node.type !== "previewSlot" ? node : {
        ...node,
        previewDeviceId: node.previewDeviceId ?? "responsive",
        previewStorageProfileId: node.previewStorageProfileId ?? generateId(),
      }),
    })),
  });
}

export function freshOrbitWorkspace(): OrbitWorkspace {
  return orbitWorkspaceSchema.parse({
    version: ORBIT_DOCUMENT_VERSION,
    activeBoardId: DEFAULT_BOARD_ID,
    focusedNodeId: null,
    boards: [{
      id: DEFAULT_BOARD_ID,
      name: "Arbeitsfläche 1",
      viewport: { x: 0, y: 0, zoom: 0.8 },
      worldBounds: { minX: -1_600, minY: -1_000, maxX: 1_600, maxY: 1_000 },
      nodes: [],
      edges: [],
    }],
  });
}

// Neue Orbit-Knoten bekommen bewusst mehr Arbeitsfläche. Bereits gespeicherte
// individuelle Größen bleiben unverändert.
export const ORBIT_DEFAULT_SIZE_SCALE = 1.25;

function orbitDefaultSize(width: number, height: number) {
  return {
    width: Math.round(width * ORBIT_DEFAULT_SIZE_SCALE),
    height: Math.round(height * ORBIT_DEFAULT_SIZE_SCALE),
  };
}

export interface AddOrbitNodeInput {
  type: OrbitNode["type"];
  title: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  projectId?: string | null;
  parentId?: string | null;
  runtimeId?: string | null;
  toolType?: PanelType | null;
  previewId?: string | null;
  previewLayout?: "1" | "2" | "3" | "6" | null;
  previewTarget?: string | null;
  previewPath?: string;
  previewDeviceId?: string | null;
  previewOrientation?: "portrait" | "landscape";
  previewSlotId?: number | null;
  previewStorageProfileId?: string | null;
  previewIsolation?: boolean;
  previewRuntime?: "iframe" | "shared-browser";
  previewReferenceId?: string | null;
  previewLastUsedAt?: string | null;
  assetId?: string | null;
  assetMimeType?: string | null;
  assetBytes?: number | null;
  provider?: "codex" | "opencode" | "claude" | null;
  content?: string;
  language?: string | null;
  hermesSourceFilter?: "all" | "web" | "telegram" | "cron";
  hermesStatusFilter?: "all" | "success" | "failed";
  extensionId?: string | null;
  contributionId?: string | null;
  stateVersion?: number | null;
  state?: Record<string, unknown>;
}

interface OrbitState {
  document: OrbitWorkspace;
  revision: number;
  updatedAt: string | null;
  hydrated: boolean;
  dirty: boolean;
  saving: boolean;
  syncError: string | null;
  syncNotice: string | null;
  initialize(response: OrbitDocumentResponse, migrated?: OrbitWorkspace): void;
  applyRemote(response: OrbitDocumentResponse): void;
  resolveConflict(response: OrbitDocumentResponse, message: string): void;
  markSaving(saving: boolean): void;
  markSaved(response: OrbitDocumentResponse, savedDocument: OrbitWorkspace): void;
  markSaveBlocked(message: string): void;
  markSyncError(message: string | null): void;
  addNode(input: AddOrbitNodeInput): string | null;
  addPreviewGroup(input: { layout: "1" | "2" | "3" | "6"; title?: string; position: { x: number; y: number }; projectId?: string | null; targetPort?: number | null }): string | null;
  setPreviewGroupLayout(groupId: string, layout: "1" | "2" | "3" | "6"): void;
  updateNode(nodeId: string, patch: Partial<Omit<OrbitNode, "id" | "type">>): void;
  assignProject(nodeId: string, projectId: string | null): void;
  removeNode(nodeId: string): void;
  duplicateNode(nodeId: string): string | null;
  focusNode(nodeId: string | null): void;
  addEdge(edge: Omit<OrbitEdge, "id" | "sourceSide" | "targetSide" | "waypoints"> & Partial<Pick<OrbitEdge, "sourceSide" | "targetSide" | "waypoints">>): string | null;
  updateEdge(edgeId: string, patch: Partial<Pick<OrbitEdge, "label" | "kind" | "sourceSide" | "targetSide" | "waypoints">>): void;
  removeEdge(edgeId: string): void;
  setViewport(viewport: OrbitBoard["viewport"]): void;
  setWorldBounds(bounds: OrbitBounds): void;
  activateBoard(boardId: string): void;
  addBoard(name?: string): string | null;
  renameBoard(boardId: string, name: string): void;
  removeBoard(boardId: string): void;
  replaceDocument(document: OrbitWorkspace): void;
}

function activeBoard(document: OrbitWorkspace): OrbitBoard {
  return document.boards.find((board) => board.id === document.activeBoardId) ?? document.boards[0]!;
}

function updateActiveBoard(document: OrbitWorkspace, updater: (board: OrbitBoard) => OrbitBoard): OrbitWorkspace {
  return {
    ...document,
    boards: document.boards.map((board) => board.id === document.activeBoardId ? updater(board) : board),
  };
}

const sharedPreviewSlotFields = new Set<keyof OrbitNode>([
  "title",
  "previewTarget",
  "previewPath",
  "previewDeviceId",
  "previewOrientation",
  "previewSlotId",
  "previewIsolation",
  "previewRuntime",
  "previewLastUsedAt",
  "content",
]);

function updatePreviewReferences(
  board: OrbitBoard,
  nodeId: string,
  patch: Partial<Omit<OrbitNode, "id" | "type">>,
): OrbitBoard {
  const source = board.nodes.find((node) => node.id === nodeId);
  if (!source) return board;
  const synchronizedPatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => sharedPreviewSlotFields.has(key as keyof OrbitNode)),
  ) as Partial<Omit<OrbitNode, "id" | "type">>;
  if (source.type === "previewGroup" && patch.title !== undefined) {
    const canonicalId = source.previewReferenceId ?? source.id;
    return {
      ...board,
      nodes: board.nodes.map((node) =>
        node.type === "previewGroup" && (node.id === canonicalId || node.previewReferenceId === canonicalId)
          ? { ...node, title: patch.title! }
          : node.id === nodeId ? { ...node, ...patch } : node
      ),
    };
  }
  if (source.type !== "previewSlot" || Object.keys(synchronizedPatch).length === 0) {
    return { ...board, nodes: board.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node) };
  }
  const parent = source.parentId ? board.nodes.find((node) => node.id === source.parentId && node.type === "previewGroup") : null;
  const canonicalGroupId = source.previewReferenceId ?? parent?.previewReferenceId ?? parent?.id ?? null;
  if (!canonicalGroupId || !source.parentId) {
    return { ...board, nodes: board.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node) };
  }
  const sourceSiblings = board.nodes.filter((node) => node.type === "previewSlot" && node.parentId === source.parentId).sort((left, right) => left.zIndex - right.zIndex);
  const sourceIndex = sourceSiblings.findIndex((node) => node.id === source.id);
  const relatedGroupIds = new Set(
    board.nodes
      .filter((node) => node.type === "previewGroup" && (node.id === canonicalGroupId || node.previewReferenceId === canonicalGroupId))
      .map((node) => node.id),
  );
  const relatedSlotIds = new Set<string>();
  for (const groupId of relatedGroupIds) {
    const sibling = board.nodes.filter((node) => node.type === "previewSlot" && node.parentId === groupId).sort((left, right) => left.zIndex - right.zIndex)[sourceIndex];
    if (sibling) relatedSlotIds.add(sibling.id);
  }
  return {
    ...board,
    nodes: board.nodes.map((node) => {
      if (node.id === nodeId) return { ...node, ...patch };
      return relatedSlotIds.has(node.id) ? { ...node, ...synchronizedPatch } : node;
    }),
  };
}

export function orbitDefaultNodeSize(type: OrbitNode["type"], toolType?: PanelType | null) {
  if (type === "project") return orbitDefaultSize(240, 170);
  if (type === "frame") return orbitDefaultSize(680, 440);
  if (type === "previewGroup") return orbitDefaultSize(880, 420);
  if (type === "previewSlot") return orbitDefaultSize(480, 360);
  if (type === "tool") return toolType === "terminal" || toolType === "codex" || toolType === "opencode"
    ? orbitDefaultSize(620, 380)
    : orbitDefaultSize(720, 460);
  if (type === "usage") return orbitDefaultSize(340, 230);
  if (type === "hermesStatus") return orbitDefaultSize(320, 260);
  if (type === "hermesTasks") return orbitDefaultSize(380, 300);
  if (type === "hermesCron") return orbitDefaultSize(380, 320);
  if (type === "hermesResults") return orbitDefaultSize(400, 380);
  if (type === "todo") return orbitDefaultSize(390, 300);
  if (type === "snippet") return orbitDefaultSize(420, 260);
  if (type === "asset") return orbitDefaultSize(420, 300);
  if (type === "gallery" || type === "fileGallery") return orbitDefaultSize(960, 680);
  return orbitDefaultSize(340, 220);
}

const PREVIEW_GROUP_GAP = 8;
const PREVIEW_GROUP_PADDING = 8;
const PREVIEW_GROUP_HEADER = 44;

// Ein Slot ist so bemessen, dass ein iPhone 13 (390 × 844) im Geräterahmen
// gut lesbar bleibt. Beim Layoutwechsel bleibt diese Größe erhalten – die
// Gruppe wächst stattdessen um einen weiteren Slot.
export const previewSlotBaseSize = orbitDefaultSize(400, 660);

export function previewLayoutMatrix(layout: "1" | "2" | "3" | "6") {
  return {
    columns: layout === "1" ? 1 : layout === "2" ? 2 : 3,
    rows: layout === "6" ? 2 : 1,
  };
}

export function previewGroupSizeForSlot(layout: "1" | "2" | "3" | "6", slot = previewSlotBaseSize) {
  const { columns, rows } = previewLayoutMatrix(layout);
  return {
    width: Math.round(PREVIEW_GROUP_PADDING * 2 + columns * slot.width + PREVIEW_GROUP_GAP * (columns - 1)),
    height: Math.round(PREVIEW_GROUP_HEADER + PREVIEW_GROUP_PADDING * 2 + rows * slot.height + PREVIEW_GROUP_GAP * (rows - 1)),
  };
}

export function previewGroupSize(layout: "1" | "2" | "3" | "6") {
  return previewGroupSizeForSlot(layout);
}

export function previewSlotGeometry(group: OrbitNode, index: number) {
  const { columns, rows } = previewLayoutMatrix(group.previewLayout ?? "1");
  const width = Math.max(160, (group.size.width - PREVIEW_GROUP_PADDING * 2 - PREVIEW_GROUP_GAP * (columns - 1)) / columns);
  const height = Math.max(96, (group.size.height - PREVIEW_GROUP_HEADER - PREVIEW_GROUP_PADDING * 2 - PREVIEW_GROUP_GAP * (rows - 1)) / rows);
  return {
    position: {
      x: PREVIEW_GROUP_PADDING + (index % columns) * (width + PREVIEW_GROUP_GAP),
      y: PREVIEW_GROUP_HEADER + PREVIEW_GROUP_PADDING + Math.floor(index / columns) * (height + PREVIEW_GROUP_GAP),
    },
    size: { width, height },
  };
}

interface PreviewRect { x: number; y: number; width: number; height: number }

function rectsOverlap(left: PreviewRect, right: PreviewRect): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

// Wächst eine Gruppe, wird der neue Slot bevorzugt rechts angehängt. Ist dort
// bereits ein anderer Knoten, rutscht die Gruppe stattdessen nach links.
export function previewGroupGrowthOffset(
  nodes: readonly OrbitNode[],
  group: OrbitNode,
  nextSize: { width: number; height: number },
): number {
  const delta = nextSize.width - group.size.width;
  if (delta <= 0) return 0;
  const others = nodes.filter((node) => node.id !== group.id && !node.parentId && node.type !== "frame");
  const collides = (rect: PreviewRect) => others.some((node) => rectsOverlap(rect, { x: node.position.x, y: node.position.y, width: node.size.width, height: node.size.height }));
  const right = { x: group.position.x + group.size.width, y: group.position.y, width: delta, height: nextSize.height };
  if (!collides(right)) return 0;
  const left = { x: group.position.x - delta, y: group.position.y, width: delta, height: nextSize.height };
  return collides(left) ? 0 : -delta;
}

function nodeFromInput(input: AddOrbitNodeInput, zIndex: number): OrbitNode {
  return {
    id: generateId(),
    type: input.type,
    title: input.title.trim().slice(0, 120) || "Unbenannt",
    position: input.position,
    size: input.size ?? orbitDefaultNodeSize(input.type, input.toolType),
    projectId: input.projectId ?? null,
    parentId: input.parentId ?? null,
    runtimeId: input.runtimeId ?? (input.type === "tool" ? generateId() : null),
    toolType: input.type === "tool" ? (input.toolType ?? "terminal") : null,
    previewId: input.previewId ?? null,
    previewLayout: input.type === "previewGroup" ? (input.previewLayout ?? "1") : null,
    previewTarget: input.type === "previewSlot" ? (input.previewTarget ?? null) : null,
    previewPath: input.previewPath ?? "/",
    // `null` erbt ab v7 die Benutzerpräferenz (Standard iPhone 13).
    previewDeviceId: input.type === "previewSlot" ? (input.previewDeviceId ?? null) : null,
    previewOrientation: input.previewOrientation ?? "portrait",
    previewSlotId: input.type === "previewSlot" ? (input.previewSlotId ?? null) : null,
    previewStorageProfileId: input.type === "previewSlot" ? (input.previewStorageProfileId ?? generateId()) : null,
    previewIsolation: input.previewIsolation ?? true,
    previewRuntime: input.previewRuntime ?? "iframe",
    previewReferenceId: input.previewReferenceId ?? null,
    previewLastUsedAt: input.previewLastUsedAt ?? null,
    assetId: input.type === "asset" ? (input.assetId ?? null) : null,
    assetMimeType: input.type === "asset" ? (input.assetMimeType ?? null) : null,
    assetBytes: input.type === "asset" ? (input.assetBytes ?? null) : null,
    provider: input.type === "usage" ? (input.provider ?? "codex") : null,
    content: input.content ?? "",
    language: input.language ?? (input.type === "snippet" ? "typescript" : null),
    color: null,
    hermesSourceFilter: input.hermesSourceFilter ?? "all",
    hermesStatusFilter: input.hermesStatusFilter ?? "all",
    extensionId: input.type === "extension" ? (input.extensionId ?? null) : null,
    contributionId: input.type === "extension" ? (input.contributionId ?? null) : null,
    stateVersion: input.type === "extension" ? (input.stateVersion ?? 1) : null,
    state: input.type === "extension" ? (input.state ?? {}) : {},
    locked: false,
    zIndex,
  };
}

function connectProject(nodes: OrbitNode[], newNode: OrbitNode): OrbitEdge[] {
  if (!newNode.projectId || newNode.type === "project") return [];
  const hub = nodes.find((node) => node.type === "project" && node.projectId === newNode.projectId);
  return hub ? [{ id: generateId(), source: hub.id, target: newNode.id, kind: "project", label: "gehört zu", sourceSide: null, targetSide: null, waypoints: [] }] : [];
}

export function migrateWorkspaceToOrbit(workspace: Workspace): OrbitWorkspace {
  const boards = workspace.workspaces.map((page, pageIndex): OrbitBoard => {
    const panelIds = page.groups.flatMap((group) => group.panelIds);
    const panels = panelIds.flatMap((id) => {
      const panel = workspace.panels.find((candidate) => candidate.id === id);
      return panel ? [panel] : [];
    });
    const projectIds = [...new Set(panels.map((panel) => panel.projectId).filter((id): id is string => id !== null))];
    if (projectIds.length === 0 && workspace.selectedProjectId) projectIds.push(workspace.selectedProjectId);
    const nodes: OrbitNode[] = [];
    const edges: OrbitEdge[] = [];
    projectIds.forEach((projectId, index) => {
      nodes.push(nodeFromInput({
        type: "project", title: projectId, projectId,
        position: { x: index * 1_050 - 300, y: pageIndex * 120 - 100 },
      }, nodes.length));
    });
    panels.forEach((panel, index) => {
      const hubIndex = Math.max(0, projectIds.indexOf(panel.projectId ?? ""));
      const angle = (index % 6) / 6 * Math.PI * 2;
      const centerX = hubIndex * 1_050 - 300;
      const node = nodeFromInput({
        type: "tool",
        title: panel.type,
        toolType: panel.type,
        projectId: panel.projectId,
        previewId: panel.previewId,
        runtimeId: panel.id,
        position: { x: centerX + Math.cos(angle) * 430, y: -100 + Math.sin(angle) * 300 },
      }, nodes.length);
      nodes.push(node);
      edges.push(...connectProject(nodes, node));
    });
    return {
      id: `orbit-${page.id}`.slice(0, 100),
      name: page.name,
      viewport: { x: 0, y: 0, zoom: 0.75 },
      worldBounds: { minX: -1_600, minY: -1_000, maxX: Math.max(1_600, projectIds.length * 1_200), maxY: 1_000 },
      nodes,
      edges,
    };
  });
  const safeBoards = boards.length > 0 ? boards : freshOrbitWorkspace().boards;
  return orbitWorkspaceSchema.parse({ version: ORBIT_DOCUMENT_VERSION, activeBoardId: safeBoards[0]!.id, focusedNodeId: null, boards: safeBoards });
}

export const useOrbitStore = create<OrbitState>((set, get) => ({
  document: freshOrbitWorkspace(),
  revision: 0,
  updatedAt: null,
  hydrated: false,
  dirty: false,
  saving: false,
  syncError: null,
  syncNotice: null,
  initialize: (response, migrated) => set({
    document: migrateOrbitDocument(!response.initialized && migrated ? migrated : response.document),
    revision: response.revision,
    updatedAt: response.updatedAt,
    hydrated: true,
    // Auch eine reine Schemamigration muss gespeichert werden.
    dirty: (!response.initialized && Boolean(migrated)) || response.document.version !== ORBIT_DOCUMENT_VERSION,
    syncError: null,
    syncNotice: null,
  }),
  applyRemote: (response) => set((state) => {
    if (state.dirty || response.revision < state.revision) return state;
    if (response.revision > state.revision) return {
      document: response.document,
      revision: response.revision,
      updatedAt: response.updatedAt,
      syncError: null,
      syncNotice: null,
    };
    return state.syncError || state.syncNotice ? { ...state, syncError: null, syncNotice: null } : state;
  }),
  // Der lokale Entwurf bleibt erhalten. Nur die Basisrevision wird angehoben;
  // OrbitSync blockiert einen automatischen Retry bis zur nächsten Bearbeitung.
  resolveConflict: (response, message) => set((state) => ({
    document: state.document,
    revision: response.revision,
    updatedAt: response.updatedAt,
    hydrated: true,
    dirty: true,
    saving: false,
    syncError: null,
    syncNotice: message,
  })),
  markSaving: (saving) => set({ saving }),
  markSaved: (response, savedDocument) => set((state) => state.document === savedDocument ? ({
    // Den lokalen Objektverweis behalten. React Flow kann während der
    // Antwort noch eine Pointer-Geste ausführen; ein unnötiger Dokumenttausch
    // darf dabei keinen sichtbaren Canvas-Zustand zurücksetzen.
    revision: response.revision,
    updatedAt: response.updatedAt,
    dirty: false,
    saving: false,
    syncError: null,
    syncNotice: null,
  }) : ({
    revision: response.revision,
    updatedAt: response.updatedAt,
    dirty: true,
    saving: false,
    syncError: null,
    syncNotice: null,
  })),
  markSaveBlocked: (syncError) => set({ syncError, syncNotice: null, saving: false, dirty: true }),
  markSyncError: (syncError) => set({ syncError, syncNotice: null, saving: false }),
  addNode: (input) => {
    const board = activeBoard(get().document);
    if (board.nodes.length >= ORBIT_LIMITS.maxNodesPerBoard) return null;
    if (input.type === "tool" && board.nodes.filter((node) => node.type === "tool").length >= ORBIT_LIMITS.maxToolNodesPerBoard) return null;
    const node = nodeFromInput(input, Math.max(0, ...board.nodes.map((item) => item.zIndex)) + 1);
    set((state) => ({
      document: updateActiveBoard({ ...state.document, focusedNodeId: node.id }, (current) => ({
        ...current,
        nodes: [...current.nodes, node],
        edges: [...current.edges, ...connectProject(current.nodes, node)],
      })),
      dirty: true,
    }));
    return node.id;
  },
  addPreviewGroup: ({ layout, title, position, projectId = null, targetPort = null }) => {
    const board = activeBoard(get().document);
    const slotCount = Number(layout);
    if (board.nodes.length + slotCount + 1 > ORBIT_LIMITS.maxNodesPerBoard) return null;
    const maximumZ = Math.max(0, ...board.nodes.map((item) => item.zIndex));
    const group = nodeFromInput({
      type: "previewGroup",
      title: title ?? `Preview-Gruppe · ${layout}`,
      position,
      size: previewGroupSize(layout),
      projectId,
      previewLayout: layout,
      previewLastUsedAt: new Date().toISOString(),
    }, maximumZ + 1);
    const slots = Array.from({ length: slotCount }, (_, index) => {
      const geometry = previewSlotGeometry(group, index);
      return nodeFromInput({
        type: "previewSlot",
        title: index === 0 ? "Preview" : `Slot ${index + 1}`,
        position: geometry.position,
        size: geometry.size,
        parentId: group.id,
        projectId,
        previewTarget: targetPort === null ? null : String(targetPort),
        previewPath: "/",
        previewIsolation: true,
      }, maximumZ + 2 + index);
    });
    set((state) => ({
      document: updateActiveBoard({ ...state.document, focusedNodeId: group.id }, (current) => ({
        ...current,
        nodes: [...current.nodes, group, ...slots],
      })),
      dirty: true,
    }));
    return group.id;
  },
  setPreviewGroupLayout: (groupId, layout) => set((state) => ({
    document: updateActiveBoard(state.document, (board) => {
      const requestedGroup = board.nodes.find((node) => node.id === groupId && node.type === "previewGroup");
      if (!requestedGroup) return board;
      const canonicalGroupId = requestedGroup.previewReferenceId ?? requestedGroup.id;
      const groups = board.nodes
        .filter((node) => node.type === "previewGroup" && (node.id === canonicalGroupId || node.previewReferenceId === canonicalGroupId))
        .sort((left, right) => left.id === canonicalGroupId ? -1 : right.id === canonicalGroupId ? 1 : left.zIndex - right.zIndex);
      const needed = Number(layout);
      const additionalNodes = groups.reduce((total, group) => {
        const current = board.nodes.filter((node) => node.parentId === group.id && node.type === "previewSlot").length;
        return total + Math.max(0, needed - current);
      }, 0);
      if (board.nodes.length + additionalNodes > ORBIT_LIMITS.maxNodesPerBoard) return board;
      let nodes = board.nodes;
      let maximumZ = Math.max(0, ...nodes.map((item) => item.zIndex));
      for (const group of groups) {
        // Die aktuelle Slot-Größe bleibt erhalten: Ein zusätzlicher Preview wird
        // angehängt statt alle Slots zusammenzuquetschen.
        const slotSize = previewSlotGeometry(group, 0).size;
        const size = previewGroupSizeForSlot(layout, slotSize);
        const offsetX = previewGroupGrowthOffset(nodes, group, size);
        const nextGroup = {
          ...group,
          size,
          position: offsetX === 0 ? group.position : { ...group.position, x: group.position.x + offsetX },
          previewLayout: layout,
          previewLastUsedAt: new Date().toISOString(),
        };
        nodes = nodes.map((node) => node.id === group.id ? nextGroup : node);
        const currentSlots = nodes.filter((node) => node.parentId === group.id && node.type === "previewSlot").sort((left, right) => left.zIndex - right.zIndex);
        for (let index = currentSlots.length; index < needed; index += 1) {
          const geometry = previewSlotGeometry(nextGroup, index);
          const canonicalSlot = group.id === canonicalGroupId
            ? null
            : nodes.filter((node) => node.parentId === canonicalGroupId && node.type === "previewSlot").sort((left, right) => left.zIndex - right.zIndex)[index];
          nodes = [...nodes, nodeFromInput({
            type: "previewSlot",
            title: canonicalSlot?.title ?? `Slot ${index + 1}`,
            position: geometry.position,
            size: geometry.size,
            parentId: group.id,
            projectId: group.projectId,
            previewTarget: canonicalSlot?.previewTarget ?? null,
            previewPath: canonicalSlot?.previewPath ?? "/",
            previewDeviceId: canonicalSlot?.previewDeviceId ?? null,
            previewOrientation: canonicalSlot?.previewOrientation ?? "portrait",
            previewSlotId: canonicalSlot?.previewSlotId ?? null,
            // Referenzgruppen teilen das Storage-Profil des kanonischen Slots.
            previewStorageProfileId: canonicalSlot?.previewStorageProfileId ?? null,
            previewIsolation: canonicalSlot?.previewIsolation ?? true,
            previewRuntime: canonicalSlot?.previewRuntime ?? "iframe",
            previewReferenceId: group.id === canonicalGroupId ? null : canonicalGroupId,
          }, ++maximumZ)];
        }
      }
      return { ...board, nodes };
    }),
    dirty: true,
  })),
  updateNode: (nodeId, patch) => set((state) => ({
    document: updateActiveBoard(state.document, (board) => updatePreviewReferences(board, nodeId, patch)),
    dirty: true,
  })),
  assignProject: (nodeId, projectId) => set((state) => ({
    document: updateActiveBoard(state.document, (board) => {
      const node = board.nodes.find((candidate) => candidate.id === nodeId);
      if (!node || node.type === "project") return board;
      const withoutOldBinding = board.edges.filter((edge) => edge.kind !== "project" || edge.target !== nodeId);
      const hub = projectId ? board.nodes.find((candidate) => candidate.type === "project" && candidate.projectId === projectId) : undefined;
      return {
        ...board,
        nodes: board.nodes.map((candidate) => candidate.id === nodeId ? { ...candidate, projectId } : candidate),
        edges: hub ? [...withoutOldBinding, { id: generateId(), source: hub.id, target: nodeId, kind: "project", label: "gehört zu", sourceSide: null, targetSide: null, waypoints: [] }] : withoutOldBinding,
      };
    }),
    dirty: true,
  })),
  removeNode: (nodeId) => set((state) => ({
    document: updateActiveBoard({ ...state.document, focusedNodeId: state.document.focusedNodeId === nodeId ? null : state.document.focusedNodeId }, (board) => {
      const removedIds = new Set([nodeId, ...board.nodes.filter((node) => node.parentId === nodeId).map((node) => node.id)]);
      return {
        ...board,
        nodes: board.nodes.filter((node) => !removedIds.has(node.id)),
        edges: board.edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)),
      };
    }),
    dirty: true,
  })),
  duplicateNode: (nodeId) => {
    const board = activeBoard(get().document);
    const source = board.nodes.find((node) => node.id === nodeId);
    if (!source) return null;
    if (source.type === "previewGroup") {
      const groupId = get().addPreviewGroup({
        layout: source.previewLayout ?? "1",
        title: `${source.title} Kopie`,
        position: { x: source.position.x + 48, y: source.position.y + 48 },
        projectId: source.projectId,
      });
      if (!groupId) return null;
      const originalSlots = board.nodes.filter((node) => node.parentId === source.id && node.type === "previewSlot");
      const nextBoard = activeBoard(get().document);
      const copies = nextBoard.nodes.filter((node) => node.parentId === groupId && node.type === "previewSlot");
      copies.forEach((copy, index) => {
        const original = originalSlots[index];
        if (original) get().updateNode(copy.id, {
          title: original.title,
          previewTarget: original.previewTarget,
          previewPath: original.previewPath,
          previewDeviceId: original.previewDeviceId,
          previewOrientation: original.previewOrientation,
          previewSlotId: null,
          previewIsolation: original.previewIsolation,
          previewRuntime: original.previewRuntime,
        });
      });
      return groupId;
    }
    return get().addNode({
      ...source,
      title: `${source.title} Kopie`,
      position: { x: source.position.x + 48, y: source.position.y + 48 },
      runtimeId: source.type === "tool" ? generateId() : source.runtimeId,
    });
  },
  focusNode: (focusedNodeId) => set((state) => ({ document: { ...state.document, focusedNodeId } })),
  addEdge: (edge) => {
    const board = activeBoard(get().document);
    if (board.edges.length >= ORBIT_LIMITS.maxEdgesPerBoard || edge.source === edge.target) return null;
    if (!board.nodes.some((node) => node.id === edge.source) || !board.nodes.some((node) => node.id === edge.target)) return null;
    const id = generateId();
    const next: OrbitEdge = {
      ...edge,
      id,
      sourceSide: edge.sourceSide ?? null,
      targetSide: edge.targetSide ?? null,
      waypoints: edge.waypoints ?? [],
    };
    set((state) => ({ document: updateActiveBoard(state.document, (current) => ({ ...current, edges: [...current.edges, next] })), dirty: true }));
    return id;
  },
  updateEdge: (edgeId, patch) => set((state) => ({ document: updateActiveBoard(state.document, (board) => ({ ...board, edges: board.edges.map((edge) => edge.id === edgeId ? { ...edge, ...patch } : edge) })), dirty: true })),
  removeEdge: (edgeId) => set((state) => ({ document: updateActiveBoard(state.document, (board) => ({ ...board, edges: board.edges.filter((edge) => edge.id !== edgeId) })), dirty: true })),
  setViewport: (viewport) => set((state) => {
    const current = activeBoard(state.document).viewport;
    if (Math.abs(current.x - viewport.x) <= .01 && Math.abs(current.y - viewport.y) <= .01 && Math.abs(current.zoom - viewport.zoom) <= .001) return state;
    return { document: updateActiveBoard(state.document, (board) => ({ ...board, viewport })), dirty: true };
  }),
  setWorldBounds: (worldBounds) => set((state) => {
    const current = activeBoard(state.document).worldBounds;
    if (current.minX === worldBounds.minX && current.minY === worldBounds.minY && current.maxX === worldBounds.maxX && current.maxY === worldBounds.maxY) return state;
    return { document: updateActiveBoard(state.document, (board) => ({ ...board, worldBounds })), dirty: true };
  }),
  activateBoard: (activeBoardId) => set((state) => state.document.boards.some((board) => board.id === activeBoardId) ? { document: { ...state.document, activeBoardId, focusedNodeId: null }, dirty: true } : state),
  addBoard: (name) => {
    const state = get();
    if (state.document.boards.length >= ORBIT_LIMITS.maxBoards) return null;
    const id = generateId();
    const board: OrbitBoard = { id, name: name?.trim().slice(0, 80) || `Arbeitsfläche ${state.document.boards.length + 1}`, viewport: { x: 0, y: 0, zoom: .8 }, worldBounds: { minX: -1_600, minY: -1_000, maxX: 1_600, maxY: 1_000 }, nodes: [], edges: [] };
    set({ document: { ...state.document, boards: [...state.document.boards, board], activeBoardId: id, focusedNodeId: null }, dirty: true });
    return id;
  },
  renameBoard: (boardId, name) => { const value = name.trim().slice(0, 80); if (value) set((state) => ({ document: { ...state.document, boards: state.document.boards.map((board) => board.id === boardId ? { ...board, name: value } : board) }, dirty: true })); },
  removeBoard: (boardId) => set((state) => {
    if (state.document.boards.length <= 1) return state;
    const boards = state.document.boards.filter((board) => board.id !== boardId);
    return { document: { ...state.document, boards, activeBoardId: state.document.activeBoardId === boardId ? boards[0]!.id : state.document.activeBoardId, focusedNodeId: null }, dirty: true };
  }),
  replaceDocument: (document) => set({ document: orbitWorkspaceSchema.parse(document), dirty: true }),
}));

export function getActiveOrbitBoard(): OrbitBoard {
  return activeBoard(useOrbitStore.getState().document);
}
