import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { CloseIcon, CodeFileIcon, CopyIcon, DeviceRotateIcon, ExternalLinkIcon, FileIcon, FolderCodeIcon, FrameIcon, FullscreenIcon, MoreIcon, PlusIcon, RefreshIcon, SaveIcon, TodoIcon, TrashIcon } from "../icons";
import { Handle, NodeResizeControl, Position, useStore, type NodeProps } from "@xyflow/react";
import { ORBIT_SIZE_LIMITS, type HermesCronJob, type HermesResult, type HermesStatus, type HermesTask, type LocalPortsResponse, type OrbitNode, type Panel, type Project, type Service } from "@workbench/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";
import { orbitNodeColor } from "../../lib/orbitAppearance";
import { formatUsageReset, orbitProviderWindows } from "../../lib/orbitUsage";
import { parseOrbitTodo, serializeOrbitTodo, type OrbitTodoItem } from "../../lib/orbitTodo";
import { orbitDefaultNodeSize, previewSlotGeometry, useOrbitStore } from "../../stores/orbit";
import { ToolPanel } from "../ToolPanel";
import { OrbitGalleryNode } from "./OrbitGalleryNode";
import { LocalPorts } from "../browser/LocalPorts";
import { PreviewSlotFrame } from "../PreviewSlotFrame";
import { PreviewDeviceMenu } from "../preview/PreviewDeviceMenu";
import { ExternalPreviewChoice } from "../preview/ExternalPreviewChoice";
import { resolvePreviewDevice } from "../../lib/previewDevice";
import { normalizePreviewTarget } from "../../lib/previewTargets";
import { openPreviewGroupWindow } from "../../lib/previewWindow";
import { previewSlotReleasedOnTargetChange, previewSessionKeysWithNode, previewSlotsReleasedWithNode, releasePreviewSessions, releasePreviewSlots } from "../../lib/previewSlotLifecycle";
import { elementContainsEventTarget } from "../../lib/domEvents";
import { useRouteActivity } from "../../lib/routeActivity";
import { orbitNodeRendererRegistry } from "../../extensions/orbitNodeRendererRegistry";
import { hermesSourceLabels } from "../../lib/hermesPresentation";

function hermesSessionRoute(sessionId: string): string {
  const path = `/chat?resume=${encodeURIComponent(sessionId)}`;
  return `/hermes-agent?path=${encodeURIComponent(path)}`;
}

const toolLabels: Record<NonNullable<Panel["type"]>, string> = {
  "t3-code": "T3 Code",
  "code-server": "Code-Server",
  preview: "Preview",
  browser: "Browser",
  terminal: "Terminal",
  codex: "Codex",
  opencode: "OpenCode",
  files: "Files",
  notion: "Notion (Legacy)",
  hermes: "Hermes Agent",
};

export interface OrbitNodeRuntimeData {
  projects: Project[];
  services: Service[];
  localPorts: LocalPortsResponse | null;
  localPortsLoading: boolean;
  localPortsError: boolean;
  refreshLocalPorts: () => Promise<unknown>;
}

const emptyOrbitNodeRuntime: OrbitNodeRuntimeData = {
  projects: [],
  services: [],
  localPorts: null,
  localPortsLoading: false,
  localPortsError: false,
  refreshLocalPorts: async () => undefined,
};

const OrbitNodeRuntimeContext = createContext<OrbitNodeRuntimeData>(emptyOrbitNodeRuntime);

export function OrbitNodeRuntimeProvider({ data, children }: { data: OrbitNodeRuntimeData; children: ReactNode }) {
  return <OrbitNodeRuntimeContext.Provider value={data}>{children}</OrbitNodeRuntimeContext.Provider>;
}

function useOrbitNodeRuntime(): OrbitNodeRuntimeData {
  return useContext(OrbitNodeRuntimeContext);
}

const activeNodeMapCache = new WeakMap<readonly OrbitNode[], ReadonlyMap<string, OrbitNode>>();
const projectNodeCountCache = new WeakMap<readonly OrbitNode[], ReadonlyMap<string, number>>();

function nodeMap(nodes: readonly OrbitNode[]): ReadonlyMap<string, OrbitNode> {
  const cached = activeNodeMapCache.get(nodes);
  if (cached) return cached;
  const map = new Map(nodes.map((node) => [node.id, node] as const));
  activeNodeMapCache.set(nodes, map);
  return map;
}

function projectNodeCounts(nodes: readonly OrbitNode[]): ReadonlyMap<string, number> {
  const cached = projectNodeCountCache.get(nodes);
  if (cached) return cached;
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (!node.projectId) continue;
    counts.set(node.projectId, (counts.get(node.projectId) ?? 0) + 1);
  }
  projectNodeCountCache.set(nodes, counts);
  return counts;
}

function useActiveOrbitNode(id: string): OrbitNode | undefined {
  return useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board ? nodeMap(board.nodes).get(id) : undefined;
  });
}

// Acht Griffe statt vier: Ecken skalieren beide Achsen, die Seitenmitten je eine.
// Damit lassen sich Flächen gezielt in die Breite oder Höhe ziehen.
const resizeCorners = [
  "top-left", "top", "top-right",
  "left", "right",
  "bottom-left", "bottom", "bottom-right",
] as const;

function EdgeHandles({ frame = false }: { frame?: boolean }) {
  const className = `orbit-handle${frame ? " orbit-frame-handle" : ""}`;
  // Die Griffe sitzen bewusst nicht in der Seitenmitte: Dort liegen die
  // Resize-Punkte (z-index 24) über dem Handle (z-index 18) und fingen
  // jeden Verbindungs-Drag ab. 30 % bzw. 70 % liegen frei davon.
  return <><Handle id="left" type="source" position={Position.Left} style={{ top: "30%" }} className={className} /><Handle id="right" type="source" position={Position.Right} style={{ top: "70%" }} className={className} /></>;
}

function OrbitNodeResizer({
  id,
  selected,
  minWidth,
  minHeight,
}: {
  id: string;
  selected: boolean;
  minWidth: number;
  minHeight: number;
}) {
  if (!selected) return null;
  return resizeCorners.map((position) => (
    <NodeResizeControl
      key={position}
      nodeId={id}
      position={position}
      minWidth={Math.max(minWidth, ORBIT_SIZE_LIMITS.minWidth)}
      minHeight={Math.max(minHeight, ORBIT_SIZE_LIMITS.minHeight)}
      maxWidth={ORBIT_SIZE_LIMITS.maxWidth}
      maxHeight={ORBIT_SIZE_LIMITS.maxHeight}
      className="orbit-resize-corner"
      onResizeEnd={(_event, params) => useOrbitStore.getState().updateNode(id, {
        position: { x: params.x, y: params.y },
        size: { width: params.width, height: params.height },
      })}
    >
      <span className="orbit-resize-dot" aria-hidden />
    </NodeResizeControl>
  ));
}

function NodeChrome({ id, title, children, selected, resizable = true }: { id: string; title: string; children: React.ReactNode; selected: boolean; resizable?: boolean }) {
  return (
    <div className={`orbit-node-shell ${selected ? "is-selected" : ""}`}>
      {resizable ? <OrbitNodeResizer id={id} selected={selected} minWidth={160} minHeight={96} /> : null}
      <header className="orbit-node-header orbit-node-drag-handle">
        <span className="orbit-node-status" />
        <strong>{title}</strong>
      </header>
      <div className="orbit-node-content nodrag nopan nowheel">{children}</div>
      <EdgeHandles />
    </div>
  );
}

function ProjectNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const relatedCount = useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    if (!board || !node.projectId) return 0;
    return Math.max(0, (projectNodeCounts(board.nodes).get(node.projectId) ?? 0) - 1);
  });
  const { projects } = useOrbitNodeRuntime();
  const project = projects.find((candidate) => candidate.id === node.projectId);
  const color = orbitNodeColor(node);
  return (
    <div className={`orbit-project-node ${selected ? "is-selected" : ""}`} style={{ "--orbit-project-color": color } as React.CSSProperties}>
      <OrbitNodeResizer id={id} selected={selected} minWidth={190} minHeight={140} />
      <div className="orbit-project-orbit orbit-node-drag-handle">
        <FolderCodeIcon className="h-5 w-5" />
        <span>Projekt</span>
        <strong>{project?.name ?? node.title}</strong>
        <small>{relatedCount} verbundene Knoten</small>
      </div>
      <EdgeHandles />
    </div>
  );
}

function ToolNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const focusNode = useOrbitStore((state) => state.focusNode);
  const runtime = useOrbitNodeRuntime();
  const project = runtime.projects.find((candidate) => candidate.id === node.projectId);
  const zoom = useStore((state) => Math.round(state.transform[2] * 100) / 100);
  const type = node.toolType ?? "terminal";
  const previewId = type === "preview" ? (node.previewId ?? project?.previews[0]?.id ?? null) : node.previewId;
  const panel: Panel = { id: node.runtimeId ?? node.id, type, projectId: node.projectId, previewId, reloadKey: 0 };
  const codeServerMode = runtime.services.find((service) => service.id === "code-server")?.mode ?? "external";
  return (
    <div className={`orbit-live-node ${selected ? "is-selected" : ""}`}>
      <OrbitNodeResizer id={id} selected={selected} minWidth={320} minHeight={220} />
      <div className="orbit-live-drag-handle orbit-node-drag-handle" title={`${toolLabels[type]} verschieben`} aria-label={`${toolLabels[type]} verschieben`}><span /></div>
      <div className="orbit-tool-content nodrag nopan nowheel">
        <ToolPanel
          panel={panel}
          project={project}
          codeServerMode={codeServerMode}
          isFocused={selected}
          minimal
          terminalRenderScale={zoom}
          onFocus={() => focusNode(id)}
        />
      </div>
      <EdgeHandles />
    </div>
  );
}

function NoteNode({ id, selected }: { id: string; selected: boolean }) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const node = useActiveOrbitNode(id)!;
  return <NodeChrome id={id} title={node.title} selected={selected}><textarea aria-label={`${node.title} bearbeiten`} value={node.content} onChange={(event) => updateNode(id, { content: event.target.value })} placeholder="Notiz schreiben…" className="orbit-note-editor nodrag nowheel" /></NodeChrome>;
}

function TodoNode({ id, selected }: { id: string; selected: boolean }) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const node = useActiveOrbitNode(id)!;
  const [draft, setDraft] = useState("");
  const items = useMemo(() => parseOrbitTodo(node.content), [node.content]);
  const saveItems = (next: OrbitTodoItem[]) => updateNode(id, { content: serializeOrbitTodo(next) });
  const addItem = () => {
    const text = draft.trim();
    if (!text || items.length >= 250) return;
    saveItems([...items, { id: globalThis.crypto.randomUUID(), text, done: false }]);
    setDraft("");
  };
  const completed = items.filter((item) => item.done).length;
  return <NodeChrome id={id} title={node.title} selected={selected}>
    <div className="orbit-todo nodrag nowheel">
      <div className="orbit-todo-list" role="list" aria-label={`${node.title} Aufgaben`}>
        {items.map((item, index) => <div className={`orbit-todo-item ${item.done ? "is-done" : ""}`} role="listitem" key={item.id}>
          <input type="checkbox" checked={item.done} aria-label={`Aufgabe ${index + 1} abhaken`} onChange={(event) => saveItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, done: event.target.checked } : candidate))} />
          <input value={item.text} aria-label={`Aufgabe ${index + 1}`} maxLength={500} onChange={(event) => saveItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, text: event.target.value } : candidate))} />
          <button type="button" aria-label={`Aufgabe ${index + 1} löschen`} onClick={() => saveItems(items.filter((candidate) => candidate.id !== item.id))}><TrashIcon className="h-3.5 w-3.5" /></button>
        </div>)}
        {items.length === 0 ? <div className="orbit-todo-empty"><TodoIcon className="h-5 w-5" /><span>Noch keine Aufgaben</span></div> : null}
      </div>
      <form className="orbit-todo-add" onSubmit={(event) => { event.preventDefault(); addItem(); }}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} aria-label="Neue Aufgabe" placeholder="Aufgabe hinzufügen…" />
        <button type="submit" aria-label="Aufgabe hinzufügen" disabled={!draft.trim()}><PlusIcon className="h-4 w-4" /></button>
      </form>
      <small>{completed} von {items.length} erledigt</small>
    </div>
  </NodeChrome>;
}

function SnippetNode({ id, selected }: { id: string; selected: boolean }) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const node = useActiveOrbitNode(id)!;
  return <NodeChrome id={id} title={node.title} selected={selected}><div className="orbit-snippet-meta"><CodeFileIcon className="h-3.5 w-3.5" /><input aria-label="Programmiersprache" value={node.language ?? "text"} onChange={(event) => updateNode(id, { language: event.target.value })} /></div><textarea aria-label={`${node.title} Code bearbeiten`} value={node.content} onChange={(event) => updateNode(id, { content: event.target.value })} spellCheck={false} placeholder="Code einfügen…" className="orbit-code-editor nodrag nowheel" /></NodeChrome>;
}

function FileNode({ id, selected }: { id: string; selected: boolean }) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const node = useActiveOrbitNode(id)!;
  const [status, setStatus] = useState<string | null>(null);
  const [overwriteVersion, setOverwriteVersion] = useState<string | null>(null);
  const save = async () => {
    if (!node.projectId) { setStatus("Bitte zuerst ein Projekt zuordnen."); return; }
    try {
      const result = await apiClient.createProjectFile(node.projectId, {
        path: node.title,
        content: node.content,
        overwrite: overwriteVersion !== null,
        ...(overwriteVersion !== null ? { expectedVersion: overwriteVersion } : {}),
      });
      if (!result) throw new Error("Der Server hat keine Dateibestätigung zurückgegeben.");
      setStatus(`${result.path} wurde gespeichert.`);
      setOverwriteVersion(result.version);
    } catch (error) {
      const currentVersion = error instanceof ApiClientError && typeof error.details?.currentVersion === "string"
        ? error.details.currentVersion
        : null;
      setOverwriteVersion(error instanceof ApiClientError && error.code === "FILE_EXISTS" ? currentVersion : null);
      setStatus(error instanceof Error ? error.message : "Datei konnte nicht gespeichert werden.");
    }
  };
  return <NodeChrome id={id} title={node.title} selected={selected}><input className="orbit-file-path" aria-label="Relativer Dateipfad" value={node.title} onChange={(event) => { updateNode(id, { title: event.target.value || "datei.txt" }); setOverwriteVersion(null); }} /><textarea aria-label="Dateiinhalt bearbeiten" value={node.content} onChange={(event) => updateNode(id, { content: event.target.value })} spellCheck={false} className="orbit-code-editor nodrag nowheel" /><button type="button" className="orbit-inline-action" onClick={() => void save()}><SaveIcon className="h-3.5 w-3.5" /> {overwriteVersion ? "Datei aktualisieren" : "Im Projekt erstellen"}</button>{status ? <p className="orbit-node-message" role="status">{status}</p> : null}</NodeChrome>;
}

function AssetNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const url = node.assetId ? apiClient.orbitAssetUrl(node.assetId) : "";
  const image = Boolean(node.assetMimeType?.startsWith("image/"));
  const size = new Intl.NumberFormat("de-DE", { style: "unit", unit: "byte", unitDisplay: "narrow", notation: "compact" }).format(node.assetBytes ?? 0);
  if (image) return <div className={`orbit-image-node ${selected ? "is-selected" : ""}`}>
    <OrbitNodeResizer id={id} selected={selected} minWidth={120} minHeight={90} />
    <div className="orbit-image-drag-handle orbit-node-drag-handle" aria-label="Bild verschieben" title="Bild verschieben"><span /></div>
    <img src={url} alt="" />
    <EdgeHandles />
  </div>;
  return <NodeChrome id={id} title={node.title} selected={selected}>
    <div className="orbit-asset-file"><FileIcon className="h-8 w-8" /><strong>{node.title}</strong><small>{node.assetMimeType} · {size}</small></div>
    <a className="orbit-inline-action orbit-asset-link" href={url} download>Öffnen</a>
  </NodeChrome>;
}

function UsageNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const routeActive = useRouteActivity();
  const usage = useQuery({ ...workbenchQueries.usage(), enabled: routeActive });
  const provider = usage.data?.providers.find((candidate) => candidate.providerId === node.provider);
  const windows = orbitProviderWindows(provider);
  return <NodeChrome id={id} title={`${provider?.providerName ?? node.title} Limits`} selected={selected}><div className="orbit-usage-list">{windows.length ? windows.map((window) => <div className="orbit-usage-row" key={window.id}><div><span>{window.label}</span><strong>{window.remaining}% frei</strong></div><div className="orbit-usage-track"><i style={{ width: `${window.remaining}%` }} /></div><small className="orbit-usage-reset">{formatUsageReset(window.resetsAt)}</small></div>) : <p>{usage.isLoading ? "Nutzung wird geladen…" : "Keine Limitdaten verfügbar."}</p>}</div><small className="orbit-usage-updated">Aktualisierung alle 60 Sekunden</small></NodeChrome>;
}

function hermesDate(value: string | null): string {
  if (!value) return "–";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function HermesNodeState({ loading, error, empty = "Keine Daten verfügbar." }: { loading: boolean; error: boolean; empty?: string }) {
  if (loading) return <p className="orbit-hermes-state">Hermes-Daten werden geladen…</p>;
  if (error) return <p className="orbit-hermes-state is-error">Hermes ist momentan nicht erreichbar. Diagnose öffnen.</p>;
  return <p className="orbit-hermes-state">{empty}</p>;
}

function HermesStatusNode({ id, selected }: { id: string; selected: boolean }) {
  const routeActive = useRouteActivity();
  const query = useQuery({ ...workbenchQueries.hermesStatus(), enabled: routeActive });
  const status = query.data as HermesStatus | undefined;
  return <NodeChrome id={id} title="Hermes Status" selected={selected}>
    {status ? <div className="orbit-hermes-status nodrag">
      <div className="orbit-hermes-status-head"><span className={`orbit-hermes-state-dot ${status.reachable ? "is-ok" : "is-error"}`} /><strong>{status.reachable ? "Erreichbar" : "Nicht erreichbar"}</strong><small>{hermesDate(status.checkedAt)}</small></div>
      <div className="orbit-hermes-facts">
        <div><span>Version</span><strong>{status.version ?? "Unbekannt"}</strong></div>
        <div><span>Anbieter</span><strong>{status.provider ?? "Nicht gesetzt"}</strong></div>
        <div><span>Modell</span><strong>{status.model ?? "Nicht gesetzt"}</strong></div>
        <div><span>Dashboard</span><strong>{status.dashboard.state}</strong></div>
        <div><span>Gateway</span><strong>{status.gateway.state}</strong></div>
        <div><span>Telegram</span><strong>{status.gateway.telegramConnected === null ? "Unbekannt" : status.gateway.telegramConnected ? "Verbunden" : "Getrennt"}</strong></div>
      </div>
      {status.update.available || status.update.pending ? <p className="orbit-hermes-state is-warning">Update {status.update.pending ? "verschoben" : "verfügbar"}.</p> : null}
    </div> : <HermesNodeState loading={query.isLoading} error={query.isError} />}
  </NodeChrome>;
}

function HermesTasksNode({ id, selected }: { id: string; selected: boolean }) {
  const routeActive = useRouteActivity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const node = useActiveOrbitNode(id)!;
  const query = useQuery({ ...workbenchQueries.hermesTasks(), enabled: routeActive });
  const [cancelling, setCancelling] = useState<string | null>(null);
  const tasks = (query.data?.tasks ?? []).filter((task) => node.hermesSourceFilter === "all" || task.source === node.hermesSourceFilter);
  const cancel = async (task: HermesTask) => {
    setCancelling(task.sessionId);
    try {
      await apiClient.cancelHermesTask(task.sessionId);
      await queryClient.invalidateQueries({ queryKey: workbenchQueries.hermesTasks().queryKey });
    } finally {
      setCancelling(null);
    }
  };
  return <NodeChrome id={id} title="Hermes Aufgaben" selected={selected}>
    {tasks.length ? <div className="orbit-hermes-list nodrag">
      {tasks.map((task) => <article className="orbit-hermes-list-item" key={task.id}>
        <div className="orbit-hermes-list-main"><strong>{task.title}</strong><small>{hermesSourceLabels[task.source]} · {task.model ?? "Modell unbekannt"}</small></div>
        <div className="orbit-hermes-list-meta"><span>{task.runtimeSeconds}s</span><button type="button" className="orbit-hermes-action is-danger" disabled={!task.cancellable || cancelling === task.sessionId} onClick={() => void cancel(task)}>{cancelling === task.sessionId ? "Stoppt…" : "Stoppen"}</button><button type="button" className="orbit-hermes-action" onClick={() => navigate(hermesSessionRoute(task.sessionId))}>Öffnen</button></div>
      </article>)}
    </div> : <HermesNodeState loading={query.isLoading} error={query.isError} empty="Keine laufenden Aufgaben." />}
  </NodeChrome>;
}

function HermesCronNode({ id, selected }: { id: string; selected: boolean }) {
  const routeActive = useRouteActivity();
  const navigate = useNavigate();
  const query = useQuery({ ...workbenchQueries.hermesCron(), enabled: routeActive });
  const jobs = query.data?.jobs ?? [];
  const openJob = (job: HermesCronJob) => navigate(`/hermes-agent?path=${encodeURIComponent(job.adminPath)}`);
  return <NodeChrome id={id} title="Hermes Automatisierungen" selected={selected}>
    {jobs.length ? <div className="orbit-hermes-list nodrag">{jobs.map((job) => <article className="orbit-hermes-list-item" key={job.id}>
      <div className="orbit-hermes-list-main"><strong>{job.name}</strong><small>{job.schedule || "Kein Zeitplan"} · {job.enabled ? "Aktiv" : "Pausiert"}</small></div>
      <div className="orbit-hermes-list-meta"><span className={`orbit-hermes-status-text is-${job.lastStatus}`}>{job.lastStatus}</span><button type="button" className="orbit-hermes-action" onClick={() => openJob(job)}>Verwalten</button></div>
    </article>)}</div> : <HermesNodeState loading={query.isLoading} error={query.isError} empty="Keine Cronjobs gefunden." />}
  </NodeChrome>;
}

function HermesResultsNode({ id, selected }: { id: string; selected: boolean }) {
  const routeActive = useRouteActivity();
  const navigate = useNavigate();
  const node = useActiveOrbitNode(id)!;
  const sourceFilter = node.hermesSourceFilter === "all" ? undefined : node.hermesSourceFilter;
  const statusFilter = node.hermesStatusFilter === "all" ? undefined : node.hermesStatusFilter;
  const query = useQuery({ ...workbenchQueries.hermesResults(sourceFilter, statusFilter), enabled: routeActive });
  const results = query.data?.results ?? [];
  return <NodeChrome id={id} title="Hermes Ergebnisse" selected={selected}>
    {results.length ? <div className="orbit-hermes-list nodrag">{results.map((result: HermesResult) => <article className="orbit-hermes-list-item" key={result.id}>
      <div className="orbit-hermes-list-main"><strong>{result.title}</strong><small>{hermesSourceLabels[result.source]} · {hermesDate(result.finishedAt)}</small><p>{result.preview}</p></div>
      <div className="orbit-hermes-list-meta"><span className={`orbit-hermes-status-text is-${result.status}`}>{result.status === "success" ? "Erfolg" : "Fehler"}</span><button type="button" className="orbit-hermes-action" onClick={() => navigate(hermesSessionRoute(result.sessionId))}>Öffnen</button></div>
    </article>)}</div> : <HermesNodeState loading={query.isLoading} error={query.isError} empty="Noch keine Ergebnisse." />}
  </NodeChrome>;
}

function FrameNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  return <div className={`orbit-frame-node ${selected ? "is-selected" : ""}`}><OrbitNodeResizer id={id} selected={selected} minWidth={320} minHeight={240} /><div className="orbit-frame-title orbit-node-drag-handle"><FrameIcon className="h-3.5 w-3.5" />{node.title}</div><EdgeHandles frame /></div>;
}

function PreviewGroupNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const updateNode = useOrbitStore((state) => state.updateNode);
  const setLayout = useOrbitStore((state) => state.setPreviewGroupLayout);
  const duplicateNode = useOrbitStore((state) => state.duplicateNode);
  const removeNode = useOrbitStore((state) => state.removeNode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const menuTriggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const layout = node.previewLayout ?? "1";
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!elementContainsEventTarget(menuTriggerRef.current, event.target) && !elementContainsEventTarget(menuRef.current, event.target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const position = () => {
      const bounds = menuTriggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setMenuStyle({ top: bounds.bottom + 4, right: Math.max(8, window.innerWidth - bounds.right) });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [menuOpen]);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const close = () => {
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    if (board) {
      void releasePreviewSlots(previewSlotsReleasedWithNode(board, id));
      void releasePreviewSessions(previewSessionKeysWithNode(board, id));
    }
    removeNode(id);
  };
  return (
    <div className={`orbit-preview-group ${selected ? "is-selected" : ""}`}>
      <OrbitNodeResizer id={id} selected={selected} minWidth={420} minHeight={300} />
      <header className="orbit-preview-group-header orbit-node-drag-handle">
        <input
          className="nodrag"
          value={node.title}
          aria-label="Name der Preview-Gruppe"
          onChange={(event) => updateNode(id, { title: event.target.value || "Preview-Gruppe", previewLastUsedAt: new Date().toISOString() })}
        />
        {/* Freie Fläche der Leiste bleibt Ziehgriff für die ganze Gruppe. */}
        <span className="orbit-preview-group-drag" aria-hidden />
        <div className="orbit-preview-layout nodrag" aria-label="Gruppenlayout">
          {(["1", "2", "3", "6"] as const).map((value) => <button type="button" key={value} className={layout === value ? "is-active" : ""} onClick={() => setLayout(id, value)}>{value}</button>)}
        </div>
        <button type="button" className="nodrag" title="Alle Slots neu laden" aria-label="Alle Slots neu laden" onClick={() => {
          const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
          board?.nodes.filter((slot) => slot.parentId === id).forEach((slot) => updateNode(slot.id, { content: String(Number(slot.content || "0") + 1) }));
        }}><RefreshIcon className="h-3.5 w-3.5" /></button>
        <button type="button" className="nodrag" title={fullscreen ? "Vollbild verlassen" : "Orbit mit laufenden Previews im Vollbild anzeigen"} aria-label={fullscreen ? "Vollbild verlassen" : "Vollbild"} onClick={(event) => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void event.currentTarget.closest(".react-flow")?.requestFullscreen?.();
        }}><FullscreenIcon className="h-3.5 w-3.5" /></button>
        <div className="orbit-preview-menu-wrap nodrag" ref={menuTriggerRef}>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Gruppenmenü" aria-expanded={menuOpen}><MoreIcon className="h-3.5 w-3.5" /></button>
          {menuOpen ? createPortal(<div ref={menuRef} className="orbit-preview-menu is-portal" style={menuStyle}><button type="button" onClick={() => { openPreviewGroupWindow(id, useOrbitStore.getState().document); setMenuOpen(false); }}><ExternalLinkIcon className="h-3.5 w-3.5" />Externes Fenster</button><button type="button" onClick={() => { duplicateNode(id); setMenuOpen(false); }}><CopyIcon className="h-3.5 w-3.5" />Duplizieren</button><button type="button" onClick={() => { updateNode(id, { previewLastUsedAt: new Date().toISOString() }); setMenuOpen(false); }}><SaveIcon className="h-3.5 w-3.5" />Als Vorlage merken</button></div>, document.fullscreenElement ?? document.body) : null}
        </div>
        <button type="button" className="nodrag is-danger" title="Gruppe schließen" aria-label="Gruppe schließen" onClick={close}><CloseIcon className="h-3.5 w-3.5" /></button>
      </header>
      <div className="orbit-preview-group-grid" aria-hidden />
      <EdgeHandles />
    </div>
  );
}

function PreviewSlotNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const updateNode = useOrbitStore((state) => state.updateNode);
  const focusNode = useOrbitStore((state) => state.focusNode);
  const [targetDraft, setTargetDraft] = useState(node.previewTarget ?? "");
  const target = normalizePreviewTarget(node.previewTarget ?? "");
  const runtime = useOrbitNodeRuntime();
  const reachable = target?.kind === "external" || (target?.kind === "local" && runtime.localPorts?.ports.some((port) => port.port === target.port && port.protocol !== "unknown"));
  const stateTitle = !target ? "Kein Preview-Ziel" : reachable ? "Preview-Ziel erreichbar" : runtime.localPortsLoading ? "Erreichbarkeit wird geprüft" : "Preview-Ziel nicht erreichbar";
  const routeActive = useRouteActivity();
  const devicePreference = useQuery({ ...workbenchQueries.previewDevicePreference(), enabled: routeActive });
  const resolvedDevice = resolvePreviewDevice({ deviceId: node.previewDeviceId, orientation: node.previewOrientation }, devicePreference.data);
  const deviceId = resolvedDevice.deviceId;
  const reloadKey = Number(node.content || "0");
  const saveTarget = (value: string) => {
    const normalized = normalizePreviewTarget(value);
    if (!normalized) return;
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    const release = board ? previewSlotReleasedOnTargetChange(board, id) : null;
    if (release) void releasePreviewSlots([release]);
    void releasePreviewSessions([`orbit-preview:${id}`]);
    updateNode(id, {
      previewTarget: normalized.kind === "local" ? String(normalized.port) : normalized.url,
      previewPath: normalized.kind === "local" ? normalized.path : "/",
      previewSlotId: null,
      previewLastUsedAt: new Date().toISOString(),
    });
    setTargetDraft(normalized.kind === "local" ? String(normalized.port) : normalized.url);
  };
  const clear = () => {
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    const release = board ? previewSlotReleasedOnTargetChange(board, id) : null;
    if (release) void releasePreviewSlots([release]);
    void releasePreviewSessions([`orbit-preview:${id}`]);
    updateNode(id, { previewTarget: null, previewSlotId: null });
    setTargetDraft("");
  };
  const detach = () => {
    if (!node.parentId) return;
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    const group = board?.nodes.find((candidate) => candidate.id === node.parentId);
    const siblings = group ? board?.nodes.filter((candidate) => candidate.parentId === group.id && candidate.type === "previewSlot").sort((left, right) => left.zIndex - right.zIndex) : undefined;
    const slotIndex = siblings?.findIndex((candidate) => candidate.id === node.id) ?? -1;
    const geometry = group && slotIndex >= 0 ? previewSlotGeometry(group, slotIndex) : null;
    const size = geometry?.size ?? orbitDefaultNodeSize("previewSlot");
    updateNode(id, {
      parentId: null,
      position: group ? { x: group.position.x + (geometry?.position.x ?? node.position.x) + 32, y: group.position.y + (geometry?.position.y ?? node.position.y) + 32 } : node.position,
      size,
    });
  };
  return (
    <div className={`orbit-preview-slot ${selected ? "is-selected" : ""} ${node.previewIsolation ? "is-isolated" : ""}`}>
      {!node.parentId ? <OrbitNodeResizer id={id} selected={selected} minWidth={320} minHeight={240} /> : null}
      <header
        className="orbit-node-drag-handle"
        title={node.parentId ? "Ziehen oder doppelklicken zum Herauslösen" : "Preview verschieben"}
        onDoubleClick={(event) => {
          const target = event.target as HTMLElement;
          if (node.parentId && (target === event.currentTarget || target.classList.contains("orbit-preview-slot-drag"))) detach();
        }}
      >
        <span className={`orbit-preview-state ${reachable ? "is-active" : target && !runtime.localPortsLoading ? "is-error" : ""}`} title={stateTitle} />
        <input className="nodrag" value={node.title} aria-label="Slot-Label" maxLength={40} onChange={(event) => updateNode(id, { title: event.target.value || "Preview" })} />
        {node.previewIsolation ? <i title="Eigene localStorage-/IndexedDB-Session" /> : null}
        {/* Freie Fläche zieht den Slot aus der Gruppe heraus. */}
        <span className="orbit-preview-slot-drag" aria-hidden />
        <PreviewDeviceMenu
          className="nodrag"
          deviceId={node.previewDeviceId}
          orientation={node.previewOrientation}
          onSlotDeviceChange={(next) => updateNode(id, { previewDeviceId: next })}
        />
        {deviceId !== "responsive" ? <button type="button" className="nodrag" title="Ausrichtung drehen" onClick={() => updateNode(id, { previewOrientation: node.previewOrientation === "portrait" ? "landscape" : "portrait" })}><DeviceRotateIcon className="h-3 w-3" /></button> : null}
        <button type="button" className="nodrag" title="Slot leeren" onClick={clear}><CloseIcon className="h-3 w-3" /></button>
      </header>
      <div className="orbit-preview-slot-body nodrag nopan nowheel">
        {!target ? <div className="orbit-preview-empty">
          <form onSubmit={(event) => { event.preventDefault(); saveTarget(targetDraft); }}><input value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} placeholder="Port oder URL" aria-label="Preview-Port oder URL" /><button type="submit" disabled={!normalizePreviewTarget(targetDraft)}><ExternalLinkIcon className="h-3.5 w-3.5" />Öffnen</button></form>
          <LocalPorts compact projectId={node.projectId} allowAllPorts dataOverride={runtime.localPorts} loadingOverride={runtime.localPortsLoading} errorOverride={runtime.localPortsError} refreshOverride={runtime.refreshLocalPorts} onOpen={(port) => saveTarget(String(port.port))} />
          <small>Port-Slots trennen localStorage und IndexedDB. Cookies gelten weiterhin hostweit.</small>
        </div> : target.kind === "local" ? (
          <PreviewSlotFrame
            targetPort={target.port}
            path={node.previewPath}
            requestedSlotId={node.previewSlotId}
            isolate={node.previewIsolation}
            storageProfileId={node.previewStorageProfileId}
            previewNodeId={id}
            deviceId={node.previewDeviceId}
            orientation={node.previewOrientation}
            reloadKey={reloadKey}
            title={node.title}
            lazy
            showControls
            projectId={node.projectId}
            sessionKey={`orbit-preview:${id}`}
            onSlotAssigned={(slotId) => { if (slotId !== node.previewSlotId) updateNode(id, { previewSlotId: slotId }); }}
            onOrientationChange={(next) => updateNode(id, { previewOrientation: next })}
            onFocus={() => focusNode(id)}
          />
        ) : <ExternalPreviewChoice url={target.url} />}
      </div>
      {!node.parentId ? <EdgeHandles /> : null}
    </div>
  );
}

/**
 * Generischer Extension-Knoten: Der UI-Entrypoint registriert Renderer gegen
 * die Contribution-ID. Fehlt der Renderer (Extension nicht installiert,
 * deaktiviert oder fehlgeschlagen), zeigt der Host einen kernelgehosteten
 * Placeholder — der State bleibt dabei vollständig erhalten.
 */
function ExtensionOrbitNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board ? nodeMap(board.nodes).get(id) : undefined;
  });
  if (node === undefined) return null;
  const renderer = orbitNodeRendererRegistry.getRenderer(node.contributionId);
  if (renderer !== undefined) return renderer.render(node);
  return (
    <NodeChrome id={id} title={node.title} selected={selected}>
      <div className="orbit-extension-missing">
        <strong>Extension nicht verfügbar</strong>
        <span className="font-mono">{node.extensionId ?? "unbekannt"}</span>
        <p>Die Daten dieses Elements bleiben erhalten.</p>
      </div>
    </NodeChrome>
  );
}

function OrbitNodeComponent(props: NodeProps) {  const id = props.id;
  const selected = Boolean(props.selected);
  const type = useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board ? nodeMap(board.nodes).get(id)?.type : undefined;
  });
  const content = useMemo(() => {
    if (type === "project") return <ProjectNode id={id} selected={selected} />;
    if (type === "tool") return <ToolNode id={id} selected={selected} />;
    if (type === "previewGroup") return <PreviewGroupNode id={id} selected={selected} />;
    if (type === "previewSlot") return <PreviewSlotNode id={id} selected={selected} />;
    if (type === "note") return <NoteNode id={id} selected={selected} />;
    if (type === "todo") return <TodoNode id={id} selected={selected} />;
    if (type === "snippet") return <SnippetNode id={id} selected={selected} />;
    if (type === "file") return <FileNode id={id} selected={selected} />;
    if (type === "asset") return <AssetNode id={id} selected={selected} />;
    if (type === "gallery") return <NodeChrome id={id} title="Mediengalerie" selected={selected}><OrbitGalleryNode variant="media" /></NodeChrome>;
    if (type === "fileGallery") return <NodeChrome id={id} title="Dateigalerie" selected={selected}><OrbitGalleryNode variant="files" /></NodeChrome>;
    if (type === "usage") return <UsageNode id={id} selected={selected} />;
    if (type === "hermesStatus") return <HermesStatusNode id={id} selected={selected} />;
    if (type === "hermesTasks") return <HermesTasksNode id={id} selected={selected} />;
    if (type === "hermesCron") return <HermesCronNode id={id} selected={selected} />;
    if (type === "hermesResults") return <HermesResultsNode id={id} selected={selected} />;
    if (type === "frame") return <FrameNode id={id} selected={selected} />;
    if (type === "extension") return <ExtensionOrbitNode id={id} selected={selected} />;
    return null;
  }, [id, selected, type]);
  return content;
}

export const OrbitNodeView = memo(OrbitNodeComponent);
