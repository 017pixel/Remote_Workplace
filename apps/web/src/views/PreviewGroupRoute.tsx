import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DeviceRotateIcon, ExternalLinkIcon, FullscreenIcon, RestoreIcon, SmartphoneIcon } from "../components/icons";
import { useParams } from "react-router";
import { orbitWorkspaceSchema, type OrbitNode } from "@wrapt/contracts";
import { wraptQueries } from "../lib/queryOptions";
import { normalizePreviewTarget } from "../lib/previewTargets";
import { PreviewSlotFrame } from "../components/PreviewSlotFrame";
import { getGroupedDevicePresets, type DeviceOrientation } from "../config/devicePresets";
import { resolvePreviewDevice } from "../lib/previewDevice";
import { ExternalPreviewChoice } from "../components/preview/ExternalPreviewChoice";
import { previewGroupSnapshotKey } from "../lib/previewWindow";
import { useRouteActivity } from "../lib/routeActivity";

// Lokale Auswahl, die dem Orbit-Dokument folgt: Ändert jemand das Gerät an
// einem anderen Gerät, übernimmt dieses Fenster den neuen Wert.
function useSyncedState<T>(value: T): [T, (next: T) => void] {
  const [state, setState] = useState(value);
  useEffect(() => setState(value), [value]);
  return [state, setState];
}

export function PreviewStandaloneSlot({ node, lazy = false }: { node: OrbitNode; lazy?: boolean }) {
  const target = normalizePreviewTarget(node.previewTarget ?? "");
  const [deviceId, setDeviceId] = useSyncedState<string | null>(node.previewDeviceId);
  const [orientation, setOrientation] = useSyncedState<DeviceOrientation>(node.previewOrientation);
  const preference = useQuery(wraptQueries.previewDevicePreference());
  const resolvedDevice = resolvePreviewDevice({ deviceId, orientation }, preference.data);
  return (
    <article className="preview-group-page-slot">
      <header>
        <div><span className={`orbit-preview-state ${target ? "is-active" : ""}`} /><strong>{node.title}</strong>{node.previewIsolation ? <i title="Eigene Session" /> : null}</div>
        <label><SmartphoneIcon className="h-3.5 w-3.5" /><select value={deviceId ?? "__default"} onChange={(event) => setDeviceId(event.target.value === "__default" ? null : event.target.value)} aria-label={`Gerät für ${node.title}`}><option value="__default">Standard verwenden</option>{getGroupedDevicePresets().map((group) => <optgroup key={group.group} label={group.label}>{group.devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</optgroup>)}</select></label>
        {resolvedDevice.deviceId !== "responsive" ? <button type="button" onClick={() => setOrientation(orientation === "portrait" ? "landscape" : "portrait")} aria-label="Ausrichtung drehen"><DeviceRotateIcon className="h-3.5 w-3.5" /></button> : null}
      </header>
      <div className="preview-group-page-viewport">
        {!target ? <div className="preview-group-page-empty">Für diesen Slot ist noch kein Ziel hinterlegt.</div> : target.kind === "local" ? (
          <PreviewSlotFrame
            targetPort={target.port}
            path={node.previewPath}
            requestedSlotId={node.previewSlotId}
            isolate={node.previewIsolation}
            storageProfileId={node.previewStorageProfileId}
            previewNodeId={node.id}
            deviceId={deviceId}
            orientation={orientation}
            title={node.title}
            lazy={lazy}
            showControls
            projectId={node.projectId}
            sessionKey={`preview-window:${node.id}`}
            onOrientationChange={setOrientation}
          />
        ) : (
          <ExternalPreviewChoice url={target.url} />
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
  const routeActive = useRouteActivity();
  const query = useQuery({ ...wraptQueries.orbit(), refetchInterval: 5_000, enabled: routeActive });
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
      <header><div><span>Preview-Gruppe</span><h1>{found.group.title}</h1></div><a href="/wrapt/workbench"><ExternalLinkIcon className="h-4 w-4" />Im Orbit öffnen</a></header>
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
          {fullscreen ? <RestoreIcon className="h-4 w-4" /> : <FullscreenIcon className="h-4 w-4" />}
        </button>
      </header>
      <div className="preview-window-grid">
        {found.slots.map((slot) => <PreviewStandaloneSlot key={slot.id} node={slot} />)}
      </div>
    </main>
  );
}
