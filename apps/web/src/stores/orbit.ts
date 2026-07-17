import {
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
} from "@workbench/contracts";
import { create } from "zustand";
import { generateId } from "../lib/id";

const DEFAULT_BOARD_ID = "orbit-default";

export function freshOrbitWorkspace(): OrbitWorkspace {
  return orbitWorkspaceSchema.parse({
    version: 4,
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
  provider?: "codex" | "opencode" | null;
  content?: string;
  language?: string | null;
}

interface OrbitState {
  document: OrbitWorkspace;
  revision: number;
  updatedAt: string | null;
  hydrated: boolean;
  dirty: boolean;
  saving: boolean;
  syncError: string | null;
  initialize(response: OrbitDocumentResponse, migrated?: OrbitWorkspace): void;
  applyRemote(response: OrbitDocumentResponse): void;
  resolveConflict(response: OrbitDocumentResponse, message: string): void;
  markSaving(saving: boolean): void;
  markSaved(response: OrbitDocumentResponse, savedDocument: OrbitWorkspace): void;
  markSyncError(message: string | null): void;
  addNode(input: AddOrbitNodeInput): string | null;
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

export function orbitDefaultNodeSize(type: OrbitNode["type"], toolType?: PanelType | null) {
  if (type === "project") return { width: 240, height: 170 };
  if (type === "frame") return { width: 680, height: 440 };
  if (type === "tool") return toolType === "terminal" || toolType === "codex" || toolType === "opencode"
    ? { width: 620, height: 380 }
    : { width: 720, height: 460 };
  if (type === "usage") return { width: 340, height: 230 };
  if (type === "todo") return { width: 390, height: 300 };
  if (type === "snippet") return { width: 420, height: 260 };
  return { width: 340, height: 220 };
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
    provider: input.type === "usage" ? (input.provider ?? "codex") : null,
    content: input.content ?? "",
    language: input.language ?? (input.type === "snippet" ? "typescript" : null),
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
  return orbitWorkspaceSchema.parse({ version: 4, activeBoardId: safeBoards[0]!.id, focusedNodeId: null, boards: safeBoards });
}

export const useOrbitStore = create<OrbitState>((set, get) => ({
  document: freshOrbitWorkspace(),
  revision: 0,
  updatedAt: null,
  hydrated: false,
  dirty: false,
  saving: false,
  syncError: null,
  initialize: (response, migrated) => set({
    document: !response.initialized && migrated ? migrated : response.document,
    revision: response.revision,
    updatedAt: response.updatedAt,
    hydrated: true,
    dirty: !response.initialized && Boolean(migrated),
    syncError: null,
  }),
  applyRemote: (response) => set((state) => state.dirty || response.revision <= state.revision ? state : ({
    document: response.document,
    revision: response.revision,
    updatedAt: response.updatedAt,
    syncError: null,
  })),
  resolveConflict: (response, syncError) => set({
    document: response.document,
    revision: response.revision,
    updatedAt: response.updatedAt,
    hydrated: true,
    dirty: false,
    saving: false,
    syncError,
  }),
  markSaving: (saving) => set({ saving }),
  markSaved: (response, savedDocument) => set((state) => state.document === savedDocument ? ({
    document: response.document,
    revision: response.revision,
    updatedAt: response.updatedAt,
    dirty: false,
    saving: false,
    syncError: null,
  }) : ({
    revision: response.revision,
    updatedAt: response.updatedAt,
    dirty: true,
    saving: false,
    syncError: null,
  })),
  markSyncError: (syncError) => set({ syncError, saving: false }),
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
  updateNode: (nodeId, patch) => set((state) => ({
    document: updateActiveBoard(state.document, (board) => ({ ...board, nodes: board.nodes.map((node) => node.id === nodeId ? { ...node, ...patch } : node) })),
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
    document: updateActiveBoard({ ...state.document, focusedNodeId: state.document.focusedNodeId === nodeId ? null : state.document.focusedNodeId }, (board) => ({
      ...board,
      nodes: board.nodes.filter((node) => node.id !== nodeId && node.parentId !== nodeId),
      edges: board.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    })),
    dirty: true,
  })),
  duplicateNode: (nodeId) => {
    const board = activeBoard(get().document);
    const source = board.nodes.find((node) => node.id === nodeId);
    if (!source) return null;
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
  setWorldBounds: (worldBounds) => set((state) => ({ document: updateActiveBoard(state.document, (board) => ({ ...board, worldBounds })), dirty: true })),
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
