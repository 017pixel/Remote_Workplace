import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileCode2,
  File,
  FolderGit2,
  Frame,
  ListTodo,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Handle, NodeResizeControl, Position, type NodeProps } from "@xyflow/react";
import type { OrbitNode, Panel } from "@workbench/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";
import { orbitNodeColor } from "../../lib/orbitAppearance";
import { formatUsageReset, orbitProviderWindows } from "../../lib/orbitUsage";
import { parseOrbitTodo, serializeOrbitTodo, type OrbitTodoItem } from "../../lib/orbitTodo";
import { useOrbitStore } from "../../stores/orbit";
import { ToolPanel } from "../ToolPanel";
import { OrbitGalleryNode } from "./OrbitGalleryNode";

const toolLabels: Record<NonNullable<Panel["type"]>, string> = {
  "t3-code": "T3 Code",
  "code-server": "Code-Server",
  preview: "Preview",
  browser: "Browser",
  terminal: "Terminal",
  codex: "Codex",
  opencode: "OpenCode",
};

function useActiveOrbitNode(id: string): OrbitNode | undefined {
  return useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board?.nodes.find((candidate) => candidate.id === id);
  });
}

// Praktisch keine Obergrenze mehr: 2.400 x 1.600 px war für große Bereiche
// (Gruppen aus mehreren Werkzeugen) zu knapp.
const ORBIT_MAX_NODE_SIZE = 20_000;

// Acht Griffe statt vier: Ecken skalieren beide Achsen, die Seitenmitten je eine.
// Damit lassen sich Flächen gezielt in die Breite oder Höhe ziehen.
const resizeCorners = [
  "top-left", "top", "top-right",
  "left", "right",
  "bottom-left", "bottom", "bottom-right",
] as const;

function EdgeHandles({ frame = false }: { frame?: boolean }) {
  const className = `orbit-handle${frame ? " orbit-frame-handle" : ""}`;
  return <><Handle id="left" type="source" position={Position.Left} className={className} /><Handle id="right" type="source" position={Position.Right} className={className} /></>;
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
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={ORBIT_MAX_NODE_SIZE}
      maxHeight={ORBIT_MAX_NODE_SIZE}
      className="orbit-resize-corner"
      onResizeEnd={(_event, params) => useOrbitStore.getState().updateNode(id, { size: { width: params.width, height: params.height } })}
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
    return board?.nodes.filter((candidate) => candidate.id !== id && candidate.projectId === node.projectId).length ?? 0;
  });
  const { data } = useQuery(workbenchQueries.projects());
  const project = data?.projects.find((candidate) => candidate.id === node.projectId);
  const color = orbitNodeColor(node);
  return (
    <div className={`orbit-project-node ${selected ? "is-selected" : ""}`} style={{ "--orbit-project-color": color } as React.CSSProperties}>
      <OrbitNodeResizer id={id} selected={selected} minWidth={190} minHeight={140} />
      <div className="orbit-project-orbit orbit-node-drag-handle">
        <FolderGit2 className="h-5 w-5" />
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
  const projects = useQuery(workbenchQueries.projects());
  const services = useQuery(workbenchQueries.services());
  const project = projects.data?.projects.find((candidate) => candidate.id === node.projectId);
  const type = node.toolType ?? "terminal";
  const previewId = type === "preview" ? (node.previewId ?? project?.previews[0]?.id ?? null) : node.previewId;
  const panel: Panel = { id: node.runtimeId ?? node.id, type, projectId: node.projectId, previewId, reloadKey: 0 };
  const codeServerMode = services.data?.services.find((service) => service.id === "code-server")?.mode ?? "external";
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
          <button type="button" aria-label={`Aufgabe ${index + 1} löschen`} onClick={() => saveItems(items.filter((candidate) => candidate.id !== item.id))}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>)}
        {items.length === 0 ? <div className="orbit-todo-empty"><ListTodo className="h-5 w-5" /><span>Noch keine Aufgaben</span></div> : null}
      </div>
      <form className="orbit-todo-add" onSubmit={(event) => { event.preventDefault(); addItem(); }}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} aria-label="Neue Aufgabe" placeholder="Aufgabe hinzufügen…" />
        <button type="submit" aria-label="Aufgabe hinzufügen" disabled={!draft.trim()}><Plus className="h-4 w-4" /></button>
      </form>
      <small>{completed} von {items.length} erledigt</small>
    </div>
  </NodeChrome>;
}

function SnippetNode({ id, selected }: { id: string; selected: boolean }) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const node = useActiveOrbitNode(id)!;
  return <NodeChrome id={id} title={node.title} selected={selected}><div className="orbit-snippet-meta"><FileCode2 className="h-3.5 w-3.5" /><input aria-label="Programmiersprache" value={node.language ?? "text"} onChange={(event) => updateNode(id, { language: event.target.value })} /></div><textarea aria-label={`${node.title} Code bearbeiten`} value={node.content} onChange={(event) => updateNode(id, { content: event.target.value })} spellCheck={false} placeholder="Code einfügen…" className="orbit-code-editor nodrag nowheel" /></NodeChrome>;
}

function FileNode({ id, selected }: { id: string; selected: boolean }) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const node = useActiveOrbitNode(id)!;
  const [status, setStatus] = useState<string | null>(null);
  const [canOverwrite, setCanOverwrite] = useState(false);
  const save = async (overwrite = false) => {
    if (!node.projectId) { setStatus("Bitte zuerst ein Projekt zuordnen."); return; }
    try {
      const result = await apiClient.createProjectFile(node.projectId, { path: node.title, content: node.content, overwrite });
      if (!result) throw new Error("Der Server hat keine Dateibestätigung zurückgegeben.");
      setStatus(`${result.path} wurde gespeichert.`);
      setCanOverwrite(true);
    } catch (error) {
      setCanOverwrite(error instanceof ApiClientError && error.code === "FILE_EXISTS");
      setStatus(error instanceof Error ? error.message : "Datei konnte nicht gespeichert werden.");
    }
  };
  return <NodeChrome id={id} title={node.title} selected={selected}><input className="orbit-file-path" aria-label="Relativer Dateipfad" value={node.title} onChange={(event) => { updateNode(id, { title: event.target.value || "datei.txt" }); setCanOverwrite(false); }} /><textarea aria-label="Dateiinhalt bearbeiten" value={node.content} onChange={(event) => updateNode(id, { content: event.target.value })} spellCheck={false} className="orbit-code-editor nodrag nowheel" /><button type="button" className="orbit-inline-action" onClick={() => void save(canOverwrite)}><Save className="h-3.5 w-3.5" /> {canOverwrite ? "Datei aktualisieren" : "Im Projekt erstellen"}</button>{status ? <p className="orbit-node-message" role="status">{status}</p> : null}</NodeChrome>;
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
    <div className="orbit-asset-file"><File className="h-8 w-8" /><strong>{node.title}</strong><small>{node.assetMimeType} · {size}</small></div>
    <a className="orbit-inline-action orbit-asset-link" href={url} download>Öffnen</a>
  </NodeChrome>;
}

function UsageNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const usage = useQuery(workbenchQueries.usage());
  const provider = usage.data?.providers.find((candidate) => candidate.providerId === node.provider);
  const windows = orbitProviderWindows(provider);
  return <NodeChrome id={id} title={`${provider?.providerName ?? node.title} Limits`} selected={selected}><div className="orbit-usage-list">{windows.length ? windows.map((window) => <div className="orbit-usage-row" key={window.id}><div><span>{window.label}</span><strong>{window.remaining}% frei</strong></div><div className="orbit-usage-track"><i style={{ width: `${window.remaining}%` }} /></div><small className="orbit-usage-reset">{formatUsageReset(window.resetsAt)}</small></div>) : <p>{usage.isLoading ? "Nutzung wird geladen…" : "Keine Limitdaten verfügbar."}</p>}</div><small className="orbit-usage-updated">Aktualisierung alle 60 Sekunden</small></NodeChrome>;
}

function FrameNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  return <div className={`orbit-frame-node ${selected ? "is-selected" : ""}`}><OrbitNodeResizer id={id} selected={selected} minWidth={320} minHeight={240} /><div className="orbit-frame-title orbit-node-drag-handle"><Frame className="h-3.5 w-3.5" />{node.title}</div><EdgeHandles frame /></div>;
}

function OrbitNodeComponent(props: NodeProps) {
  const id = props.id;
  const selected = Boolean(props.selected);
  const type = useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board?.nodes.find((candidate) => candidate.id === id)?.type;
  });
  const content = useMemo(() => {
    if (type === "project") return <ProjectNode id={id} selected={selected} />;
    if (type === "tool") return <ToolNode id={id} selected={selected} />;
    if (type === "note") return <NoteNode id={id} selected={selected} />;
    if (type === "todo") return <TodoNode id={id} selected={selected} />;
    if (type === "snippet") return <SnippetNode id={id} selected={selected} />;
    if (type === "file") return <FileNode id={id} selected={selected} />;
    if (type === "asset") return <AssetNode id={id} selected={selected} />;
    if (type === "gallery") return <NodeChrome id={id} title="Mediengalerie" selected={selected}><OrbitGalleryNode variant="media" /></NodeChrome>;
    if (type === "fileGallery") return <NodeChrome id={id} title="Dateigalerie" selected={selected}><OrbitGalleryNode variant="files" /></NodeChrome>;
    if (type === "usage") return <UsageNode id={id} selected={selected} />;
    if (type === "frame") return <FrameNode id={id} selected={selected} />;
    return null;
  }, [id, selected, type]);
  return content;
}

export const OrbitNodeView = memo(OrbitNodeComponent);
