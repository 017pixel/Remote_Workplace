import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Maximize2, Minimize2, MonitorSmartphone, Server, ShieldCheck, Smartphone } from "lucide-react";
import { useParams } from "react-router-dom";
import { orbitWorkspaceSchema, type OrbitNode } from "@workbench/contracts";
import { workbenchQueries } from "../lib/queryOptions";
import { normalizePreviewTarget, previewTargetOrigin } from "../lib/previewTargets";
import { PreviewSlotFrame } from "../components/PreviewSlotFrame";
import { DevicePreviewFrame } from "../components/DevicePreviewFrame";
import { ChromiumBrowser } from "../components/browser/ChromiumBrowser";
import { defaultPreviewDeviceId, getGroupedDevicePresets, type DeviceOrientation, type DevicePresetId } from "../config/devicePresets";
import { previewGroupSnapshotKey } from "../lib/previewWindow";

// Lokale Auswahl, die dem Orbit-Dokument folgt: Ändert jemand das Gerät an
// einem anderen Gerät, übernimmt dieses Fenster den neuen Wert.
function useSyncedState<T>(value: T): [T, (next: T) => void] {
  const [state, setState] = useState(value);
  useEffect(() => setState(value), [value]);
  return [state, setState];
}

export function PreviewStandaloneSlot({ node, lazy = false }: { node: OrbitNode; lazy?: boolean }) {
  const target = normalizePreviewTarget(node.previewTarget ?? "");
  const [deviceId, setDeviceId] = useSyncedState<DevicePresetId>((node.previewDeviceId ?? defaultPreviewDeviceId) as DevicePresetId);
  const [orientation, setOrientation] = useSyncedState<DeviceOrientation>(node.previewOrientation);
  const [runtime, setRuntime] = useSyncedState(node.previewRuntime);
  const origin = previewTargetOrigin(target);
  return (
    <article className="preview-group-page-slot">
      <header>
        <div><span className={`orbit-preview-state ${target ? "is-active" : ""}`} /><strong>{node.title}</strong>{node.previewIsolation ? <i title="Eigene Session" /> : null}</div>
        <div className="preview-slot-runtime" role="group" aria-label="Preview-Quelle">
          <button type="button" className={runtime === "iframe" ? "is-active" : ""} aria-pressed={runtime === "iframe"} title="Direkt: iframe auf den lokalen Devserver" onClick={() => setRuntime("iframe")}><ShieldCheck className="h-3.5 w-3.5" /><span>Direkt</span></button>
          <button type="button" className={runtime === "shared-browser" ? "is-active" : ""} aria-pressed={runtime === "shared-browser"} title="Server: gestreamter Chromium auf dem Entwicklungsserver" onClick={() => setRuntime("shared-browser")}><Server className="h-3.5 w-3.5" /><span>Server</span></button>
        </div>
        <label><Smartphone className="h-3.5 w-3.5" /><select value={deviceId} onChange={(event) => setDeviceId(event.target.value as DevicePresetId)} aria-label={`Gerät für ${node.title}`}>{getGroupedDevicePresets().map((group) => <optgroup key={group.group} label={group.label}>{group.devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</optgroup>)}</select></label>
        {deviceId !== "responsive" ? <button type="button" onClick={() => setOrientation(orientation === "portrait" ? "landscape" : "portrait")} aria-label="Ausrichtung drehen"><MonitorSmartphone className="h-3.5 w-3.5" /></button> : null}
      </header>
      <div className="preview-group-page-viewport">
        {!target ? <div className="preview-group-page-empty">Für diesen Slot ist noch kein Ziel hinterlegt.</div> : runtime === "shared-browser" ? (
          <DevicePreviewFrame deviceId={deviceId} orientation={orientation} runtime="shared-browser" origin={origin}>
            <ChromiumBrowser instanceId={`preview-slot:${node.id}`} profileKey={`preview-slot:${node.previewSlotId ?? node.id}`} initialUrl={target.kind === "local" ? `http://127.0.0.1:${target.port}${node.previewPath}` : target.url} />
          </DevicePreviewFrame>
        ) : target.kind === "local" ? (
          <PreviewSlotFrame targetPort={target.port} path={node.previewPath} requestedSlotId={node.previewSlotId} isolate={node.previewIsolation} deviceId={deviceId} orientation={orientation} title={node.title} lazy={lazy} projectId={node.projectId} sessionKey={`orbit-preview:${node.id}`} />
        ) : (
          <DevicePreviewFrame deviceId={deviceId} orientation={orientation} runtime="iframe" origin={origin}><iframe src={target.url} title={node.title} className="h-full w-full border-0 bg-white" allowFullScreen /></DevicePreviewFrame>
        )}
      </div>
    </article>
  );
}

export function PreviewSlotCarousel({ slots, className, lazy = false }: { slots: OrbitNode[]; className: string; lazy?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    if (activeIndex >= slots.length) setActiveIndex(Math.max(0, slots.length - 1));
  }, [activeIndex, slots.length]);
  const select = (index: number) => {
    setActiveIndex(index);
    const track = trackRef.current;
    if (track) track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
  };
  return <>
    <div
      ref={trackRef}
      className={className}
      onScroll={(event) => {
        if (slots.length === 0) {
          setActiveIndex(0);
          return;
        }
        const width = event.currentTarget.clientWidth;
        if (width > 0) setActiveIndex(Math.min(slots.length - 1, Math.max(0, Math.round(event.currentTarget.scrollLeft / width))));
      }}
    >
      {slots.map((slot) => <PreviewStandaloneSlot key={slot.id} node={slot} lazy={lazy} />)}
    </div>
    {slots.length > 1 ? <div className="preview-group-page-dots" aria-label="Preview-Slot auswählen">{slots.map((slot, index) => <button type="button" key={slot.id} className={index === activeIndex ? "is-active" : ""} aria-label={`Slot ${index + 1} anzeigen`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => select(index)}><span /></button>)}</div> : null}
  </>;
}

// Die Gruppe wird alle fünf Sekunden nachgeladen, damit Änderungen aus dem
// Orbit (Ziel, Gerät, Layout) auch in externen Fenstern und auf anderen
// Geräten ankommen.
function usePreviewGroup(groupId: string | undefined) {
  const query = useQuery({ ...workbenchQueries.orbit(), refetchInterval: 5_000 });
  const found = useMemo(() => {
    let snapshot = null;
    if (groupId) try {
      const stored = JSON.parse(window.localStorage.getItem(previewGroupSnapshotKey(groupId)) ?? "null") as { document?: unknown; savedAt?: number } | null;
      if (stored && typeof stored.savedAt === "number" && Date.now() - stored.savedAt < 10_000) snapshot = orbitWorkspaceSchema.safeParse(stored.document).data ?? null;
    } catch { snapshot = null; }
    for (const board of (snapshot ?? query.data?.document)?.boards ?? []) {
      const group = board.nodes.find((node) => node.id === groupId && node.type === "previewGroup");
      if (group) {
        const slots = board.nodes.filter((node) => node.parentId === group.id && node.type === "previewSlot").sort((left, right) => left.zIndex - right.zIndex).slice(0, Number(group.previewLayout ?? "1"));
        return { group, slots };
      }
    }
    return null;
  }, [groupId, query.data]);
  return { found, isLoading: query.isLoading };
}

export function PreviewGroupRoute() {
  const { groupId } = useParams();
  const { found, isLoading } = usePreviewGroup(groupId);
  if (isLoading) return <div className="route-skeleton" aria-label="Preview-Gruppe wird geladen"><span /><span /><span /></div>;
  if (!found) return <div className="preview-group-page-missing"><strong>Preview-Gruppe nicht gefunden</strong><span>Die Gruppe wurde gelöscht oder gehört nicht zum aktuellen Orbit-Dokument.</span></div>;
  return (
    <main className="preview-group-page" data-layout={found.group.previewLayout ?? "1"}>
      <header><div><span>Preview-Gruppe</span><h1>{found.group.title}</h1></div><a href="/workbench/workbench"><ExternalLink className="h-4 w-4" />Im Orbit öffnen</a></header>
      <PreviewSlotCarousel slots={found.slots} className="preview-group-page-grid" />
      <small className="preview-group-page-note">Geräterahmen sind visuell. DPR und CSS-Safe-Areas lassen sich in iframes nicht vollständig emulieren.</small>
    </main>
  );
}

// Eigenständiges Browserfenster: alle Slots nebeneinander, ohne Workbench-Navigation.
export function PreviewGroupWindowRoute() {
  const { groupId } = useParams();
  const { found, isLoading } = usePreviewGroup(groupId);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => {
    if (found) document.title = `${found.group.title} · Previews`;
  }, [found]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);
  if (isLoading) return <div className="route-skeleton" aria-label="Preview-Gruppe wird geladen"><span /><span /><span /></div>;
  if (!found) return <div className="preview-group-page-missing"><strong>Preview-Gruppe nicht gefunden</strong><span>Die Gruppe wurde gelöscht oder gehört nicht zum aktuellen Orbit-Dokument.</span></div>;
  return (
    <main className="preview-window" data-layout={found.group.previewLayout ?? "1"}>
      <header className="preview-window-bar">
        <span>Preview-Gruppe</span>
        <strong>{found.group.title}</strong>
        <small>{found.slots.length} {found.slots.length === 1 ? "Slot" : "Slots"}</small>
        <button type="button" onClick={toggleFullscreen} title={fullscreen ? "Vollbild verlassen" : "Vollbild"} aria-label={fullscreen ? "Vollbild verlassen" : "Vollbild"}>
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </header>
      <div className="preview-window-grid">
        {found.slots.map((slot) => <PreviewStandaloneSlot key={slot.id} node={slot} />)}
      </div>
    </main>
  );
}
