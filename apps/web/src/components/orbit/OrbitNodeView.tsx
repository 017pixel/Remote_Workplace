import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileCode2,
  File,
  Check,
  Copy,
  ExternalLink,
  FolderGit2,
  Frame,
  ListTodo,
  Maximize2,
  MonitorSmartphone,
  MoreHorizontal,
  Plus,
  RotateCw,
  Save,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
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
import { LocalPorts } from "../browser/LocalPorts";
import { PreviewSlotFrame } from "../PreviewSlotFrame";
import { DevicePreviewFrame } from "../DevicePreviewFrame";
import { ChromiumBrowser } from "../browser/ChromiumBrowser";
import { normalizePreviewTarget, previewTargetOrigin } from "../../lib/previewTargets";
import { openPreviewGroupWindow } from "../../lib/previewWindow";
import { findDevicePreset, getGroupedDevicePresets, type DevicePresetId } from "../../config/devicePresets";
import { previewSlotReleasedOnTargetChange, previewSlotsReleasedWithNode, releasePreviewSlots } from "../../lib/previewSlotLifecycle";

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

function PreviewGroupNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const updateNode = useOrbitStore((state) => state.updateNode);
  const setLayout = useOrbitStore((state) => state.setPreviewGroupLayout);
  const duplicateNode = useOrbitStore((state) => state.duplicateNode);
  const removeNode = useOrbitStore((state) => state.removeNode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const layout = node.previewLayout ?? "1";
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
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
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const close = () => {
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    if (board) void releasePreviewSlots(previewSlotsReleasedWithNode(board, id));
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
        }}><RotateCw className="h-3.5 w-3.5" /></button>
        <button type="button" className="nodrag" title={fullscreen ? "Vollbild verlassen" : "Orbit mit laufenden Previews im Vollbild anzeigen"} aria-label={fullscreen ? "Vollbild verlassen" : "Vollbild"} onClick={(event) => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void event.currentTarget.closest(".react-flow")?.requestFullscreen?.();
        }}><Maximize2 className="h-3.5 w-3.5" /></button>
        <div className="orbit-preview-menu-wrap nodrag" ref={menuRef}>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Gruppenmenü" aria-expanded={menuOpen}><MoreHorizontal className="h-3.5 w-3.5" /></button>
          {menuOpen ? <div className="orbit-preview-menu"><button type="button" onClick={() => { openPreviewGroupWindow(id, useOrbitStore.getState().document); setMenuOpen(false); }}><ExternalLink className="h-3.5 w-3.5" />Externes Fenster</button><button type="button" onClick={() => { duplicateNode(id); setMenuOpen(false); }}><Copy className="h-3.5 w-3.5" />Duplizieren</button><button type="button" onClick={() => { updateNode(id, { previewLastUsedAt: new Date().toISOString() }); setMenuOpen(false); }}><Save className="h-3.5 w-3.5" />Als Vorlage merken</button></div> : null}
        </div>
        <button type="button" className="nodrag is-danger" title="Gruppe schließen" aria-label="Gruppe schließen" onClick={close}><X className="h-3.5 w-3.5" /></button>
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
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const deviceMenuRef = useRef<HTMLDivElement>(null);
  const target = normalizePreviewTarget(node.previewTarget ?? "");
  const localPorts = useQuery(workbenchQueries.localPorts());
  const reachable = target?.kind === "external" || (target?.kind === "local" && localPorts.data?.ports.some((port) => port.port === target.port && port.protocol !== "unknown"));
  const stateTitle = !target ? "Kein Preview-Ziel" : reachable ? "Preview-Ziel erreichbar" : localPorts.isLoading ? "Erreichbarkeit wird geprüft" : "Preview-Ziel nicht erreichbar";
  const deviceId = (node.previewDeviceId ?? "responsive") as DevicePresetId;
  const reloadKey = Number(node.content || "0");
  useEffect(() => {
    if (!deviceOpen) return;
    const close = (event: MouseEvent) => {
      if (!deviceMenuRef.current?.contains(event.target as Node)) setDeviceOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setDeviceOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [deviceOpen]);
  const saveTarget = (value: string) => {
    const normalized = normalizePreviewTarget(value);
    if (!normalized) return;
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    const release = board ? previewSlotReleasedOnTargetChange(board, id) : null;
    if (release) void releasePreviewSlots([release]);
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
    updateNode(id, { previewTarget: null, previewSlotId: null });
    setTargetDraft("");
    setPublicUrl(null);
  };
  const detach = () => {
    if (!node.parentId) return;
    const board = useOrbitStore.getState().document.boards.find((candidate) => candidate.id === useOrbitStore.getState().document.activeBoardId);
    const group = board?.nodes.find((candidate) => candidate.id === node.parentId);
    updateNode(id, {
      parentId: null,
      position: group ? { x: group.position.x + node.position.x + 32, y: group.position.y + node.position.y + 32 } : node.position,
      size: { width: 480, height: 360 },
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
        <span className={`orbit-preview-state ${reachable ? "is-active" : target && !localPorts.isLoading ? "is-error" : ""}`} title={stateTitle} />
        <input className="nodrag" value={node.title} aria-label="Slot-Label" maxLength={40} onChange={(event) => updateNode(id, { title: event.target.value || "Preview" })} />
        {node.previewIsolation ? <i title="Eigene localStorage-/IndexedDB-Session" /> : null}
        {/* Freie Fläche zieht den Slot aus der Gruppe heraus. */}
        <span className="orbit-preview-slot-drag" aria-hidden />
        <div className="orbit-preview-runtime nodrag" role="group" aria-label="Preview-Quelle">
          <button
            type="button"
            className={node.previewRuntime === "iframe" ? "is-active" : ""}
            aria-pressed={node.previewRuntime === "iframe"}
            title="Direkt: iframe auf den lokalen Devserver"
            onClick={() => updateNode(id, { previewRuntime: "iframe" })}
          ><ShieldCheck className="h-3 w-3" /><span>Direkt</span></button>
          <button
            type="button"
            className={node.previewRuntime === "shared-browser" ? "is-active" : ""}
            aria-pressed={node.previewRuntime === "shared-browser"}
            title="Server: gestreamter Chromium auf dem Entwicklungsserver"
            onClick={() => updateNode(id, { previewRuntime: "shared-browser" })}
          ><Server className="h-3 w-3" /><span>Server</span></button>
        </div>
        <div className="orbit-preview-device nodrag" ref={deviceMenuRef}>
          <button type="button" onClick={() => setDeviceOpen((open) => !open)} title="Geräte-Preset wählen" aria-expanded={deviceOpen}><Smartphone className="h-3 w-3" /><span>{findDevicePreset(deviceId).label}</span></button>
          {deviceOpen ? <div className="orbit-preview-device-menu nodrag nopan nowheel">{getGroupedDevicePresets().map((group) => <div key={group.group}><small>{group.label}</small>{group.devices.map((device) => <button type="button" key={device.id} className={device.id === deviceId ? "is-active" : ""} onClick={() => { updateNode(id, { previewDeviceId: device.id }); setDeviceOpen(false); }}>{device.label}{device.id === deviceId ? <Check className="h-3 w-3" /> : null}</button>)}</div>)}</div> : null}
        </div>
        {deviceId !== "responsive" ? <button type="button" className="nodrag" title="Ausrichtung drehen" onClick={() => updateNode(id, { previewOrientation: node.previewOrientation === "portrait" ? "landscape" : "portrait" })}><MonitorSmartphone className="h-3 w-3" /></button> : null}
        <button type="button" className="nodrag" title="Slot leeren" onClick={clear}><X className="h-3 w-3" /></button>
      </header>
      <div className="orbit-preview-slot-body nodrag nopan nowheel">
        {!target ? <div className="orbit-preview-empty">
          <form onSubmit={(event) => { event.preventDefault(); saveTarget(targetDraft); }}><input value={targetDraft} onChange={(event) => setTargetDraft(event.target.value)} placeholder="Port oder URL" aria-label="Preview-Port oder URL" /><button type="submit" disabled={!normalizePreviewTarget(targetDraft)}><ExternalLink className="h-3.5 w-3.5" />Öffnen</button></form>
          <LocalPorts compact onOpen={(port) => saveTarget(String(port.port))} />
          <small>Port-Slots trennen localStorage und IndexedDB. Cookies gelten weiterhin hostweit.</small>
        </div> : node.previewRuntime === "shared-browser" ? (
          <DevicePreviewFrame deviceId={deviceId} orientation={node.previewOrientation} runtime="shared-browser" origin={previewTargetOrigin(target)}>
            <ChromiumBrowser instanceId={`preview-slot:${id}`} profileKey={`preview-slot:${node.previewSlotId ?? id}`} initialUrl={target.kind === "local" ? `http://127.0.0.1:${target.port}${node.previewPath}` : target.url} />
          </DevicePreviewFrame>
        ) : target.kind === "local" ? (
          <PreviewSlotFrame
            targetPort={target.port}
            path={node.previewPath}
            requestedSlotId={node.previewSlotId}
            isolate={node.previewIsolation}
            deviceId={deviceId}
            orientation={node.previewOrientation}
            reloadKey={reloadKey}
            title={node.title}
            lazy
            projectId={node.projectId}
            sessionKey={`orbit-preview:${id}`}
            onSlotAssigned={(slotId, url) => { if (slotId !== node.previewSlotId) updateNode(id, { previewSlotId: slotId }); setPublicUrl(url); }}
            onFocus={() => focusNode(id)}
          />
        ) : <DevicePreviewFrame deviceId={deviceId} orientation={node.previewOrientation} runtime="iframe" origin={previewTargetOrigin(target)}><iframe src={target.url} title={node.title} className="h-full w-full border-0 bg-white" allowFullScreen /></DevicePreviewFrame>}
      </div>
      {publicUrl ? <a className="orbit-preview-external nodrag" href={publicUrl} target="_blank" rel="noopener noreferrer" title="Slot extern öffnen"><Maximize2 className="h-3 w-3" /></a> : null}
      {!node.parentId ? <EdgeHandles /> : null}
    </div>
  );
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
    if (type === "frame") return <FrameNode id={id} selected={selected} />;
    return null;
  }, [id, selected, type]);
  return content;
}

export const OrbitNodeView = memo(OrbitNodeComponent);
