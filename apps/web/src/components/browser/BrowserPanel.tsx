import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceRotateIcon, ExternalLinkIcon, RefreshIcon, ServerIcon, ShieldIcon } from "../icons";
import { normalizePreviewTarget } from "../../lib/previewTargets";
import { DevicePickerButton } from "../DevicePickerButton";
import { DevicePreviewFrame } from "../DevicePreviewFrame";
import { PreviewSlotFrame } from "../PreviewSlotFrame";
import { ExternalPreviewChoice } from "../preview/ExternalPreviewChoice";
import type { DeviceOrientation, DevicePresetId } from "../../config/devicePresets";
import { ChromiumBrowser, type ChromiumBrowserState } from "./ChromiumBrowser";
import { useRouteActivity } from "../../lib/routeActivity";

interface LocalTarget {
  port: number;
  path: string;
}

function readStoredTarget(key: string): LocalTarget | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { port?: unknown; path?: unknown };
    if (typeof parsed.port !== "number" || typeof parsed.path !== "string") return null;
    return { port: parsed.port, path: parsed.path };
  } catch {
    return null;
  }
}

function storeTarget(key: string, target: LocalTarget | null) {
  try {
    if (target) window.sessionStorage.setItem(key, JSON.stringify(target));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Modus wird beim nächsten Öffnen einfach neu bestimmt.
  }
}

function addressForTarget(target: LocalTarget): string {
  return `localhost:${target.port}${target.path === "/" ? "" : target.path}`;
}

function hostOf(url: string): string | null {
  try { return new URL(url).host; } catch { return null; }
}

// Bringt die schnelle, ruckelfreie iframe-Logik der Previews auch ins
// Browser-Werkzeug: Lokale Ziele laufen als Client-iframe über einen
// Preview-Slot, alles andere bleibt der bisherige Chromium-Stream. Beide
// Wege teilen sich dieselbe Komponente, egal ob in der klassischen Workbench
// oder als Werkzeug-Knoten im Infinite Canvas – dort landet man über
// `ToolPanel`.
export function BrowserPanel({ instanceId, initialUrl, requestKey = 0 }: { instanceId: string; initialUrl?: string; requestKey?: number }) {
  const routeActive = useRouteActivity();
  const targetStorageKey = `wrapt:browser-target:${instanceId}`;
  const slotStorageKey = `wrapt:browser-slot:${instanceId}`;
  const initialTarget = initialUrl ? normalizePreviewTarget(initialUrl) : null;
  const initialLocalTarget = initialTarget?.kind === "local"
    ? { port: initialTarget.port, path: initialTarget.path }
    : null;
  const initialExternalUrl = initialTarget?.kind === "external" ? initialTarget.url : null;

  const [target, setTarget] = useState<LocalTarget | null>(() => initialLocalTarget ?? readStoredTarget(targetStorageKey));
  const [forceStream, setForceStream] = useState(initialExternalUrl !== null);
  const [slotId, setSlotId] = useState<number | null>(() => {
    try {
      const raw = window.sessionStorage.getItem(slotStorageKey);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deviceId, setDeviceId] = useState<DevicePresetId>("responsive");
  const [orientation, setOrientation] = useState<DeviceOrientation>("portrait");
  const [streamState, setStreamState] = useState<ChromiumBrowserState | null>(null);
  const [addressDraft, setAddressDraft] = useState(target ? addressForTarget(target) : "");
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [streamInitialUrl, setStreamInitialUrl] = useState<string | null>(initialExternalUrl);
  const heldSlotRef = useRef<{ slotId: number; targetPort: number } | null>(null);
  const appliedRequestRef = useRef<string | null>(null);

  useEffect(() => {
    setAddressDraft(target ? addressForTarget(target) : "");
  }, [target]);

  // Die Lease gibt `LocalPreviewRuntime` beim Unmount selbst frei; hier wird nur
  // die lokal gemerkte Slot-Zuordnung verworfen.
  const releaseHeldSlot = useCallback(() => {
    heldSlotRef.current = null;
    try {
      window.sessionStorage.removeItem(slotStorageKey);
    } catch {
      // Der Server gibt den Slot ohnehin mit der Lease frei.
    }
  }, [slotStorageKey]);

  const goLocal = (nextTarget: LocalTarget) => {
    if (heldSlotRef.current && heldSlotRef.current.targetPort !== nextTarget.port) releaseHeldSlot();
    setForceStream(false);
    setStreamInitialUrl(null);
    setPublicUrl(null);
    setTarget(nextTarget);
    storeTarget(targetStorageKey, nextTarget);
  };

  useEffect(() => {
    if (!initialUrl) return;
    const requestId = `${requestKey}:${initialUrl}`;
    if (appliedRequestRef.current === requestId) return;
    appliedRequestRef.current = requestId;
    const parsed = normalizePreviewTarget(initialUrl);
    if (!parsed) return;
    setExternalUrl(null);
    if (parsed.kind === "local") {
      if (heldSlotRef.current && heldSlotRef.current.targetPort !== parsed.port) releaseHeldSlot();
      setForceStream(false);
      setStreamInitialUrl(null);
      setPublicUrl(null);
      setTarget({ port: parsed.port, path: parsed.path });
      storeTarget(targetStorageKey, { port: parsed.port, path: parsed.path });
      return;
    }
    releaseHeldSlot();
    setTarget(null);
    setPublicUrl(null);
    setStreamInitialUrl(parsed.url);
    setForceStream(true);
  }, [initialUrl, releaseHeldSlot, requestKey, targetStorageKey]);

  const useStreamForCurrentTarget = () => {
    releaseHeldSlot();
    if (target) setStreamInitialUrl(`http://127.0.0.1:${target.port}${target.path}`);
    setForceStream(true);
  };

  const onLocalAddress = (value: string) => {
    const parsed = normalizePreviewTarget(value);
    if (parsed?.kind === "local") goLocal({ port: parsed.port, path: parsed.path });
  };

  const submitAddress = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = normalizePreviewTarget(addressDraft);
    if (parsed?.kind === "local") { setExternalUrl(null); goLocal({ port: parsed.port, path: parsed.path }); return; }
    // Externe Adressen erreichen den lokalen Preview-Gateway nie.
    if (parsed?.kind === "external") setExternalUrl(parsed.url);
  };

  const localMode = target !== null && !forceStream;
  const streamOrigin = streamState && streamState.url !== "about:blank" ? hostOf(streamState.url) : null;

  const streamExtraActions = (
    <>
      <DevicePickerButton deviceId={deviceId} onChange={setDeviceId} iconOnly />
      {deviceId !== "responsive" ? (
        <button type="button" title="Ausrichtung drehen" aria-label="Ausrichtung drehen" onClick={() => setOrientation((current) => current === "portrait" ? "landscape" : "portrait")}>
          <DeviceRotateIcon className="h-4 w-4" />
        </button>
      ) : null}
      {forceStream && target ? (
        <button type="button" className="is-active" title="Direkte iframe-Vorschau verwenden" aria-label="Direkte iframe-Vorschau verwenden" onClick={() => setForceStream(false)}>
          <ShieldIcon className="h-4 w-4" />
        </button>
      ) : null}
    </>
  );

  return (
    <div className="browser-panel">
      {localMode ? (
        <header className="browser-toolbar">
          <form className="browser-address" onSubmit={submitAddress}>
            <ShieldIcon className="h-3.5 w-3.5" />
            <input value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} aria-label="Browser-Adresse" placeholder="Port oder lokale Adresse" />
          </form>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} aria-label="Neu laden" title="Neu laden"><RefreshIcon className="h-4 w-4" /></button>
          <DevicePickerButton deviceId={deviceId} onChange={setDeviceId} iconOnly />
          {deviceId !== "responsive" ? (
            <button type="button" title="Ausrichtung drehen" aria-label="Ausrichtung drehen" onClick={() => setOrientation((current) => current === "portrait" ? "landscape" : "portrait")}>
              <DeviceRotateIcon className="h-4 w-4" />
            </button>
          ) : null}
          <button type="button" title="Server-Chromium verwenden: geteilte Geräte- oder Cookie-Session" aria-label="Server-Chromium verwenden" onClick={useStreamForCurrentTarget}>
            <ServerIcon className="h-4 w-4" />
          </button>
          {publicUrl ? <a href={publicUrl} target="_blank" rel="noopener noreferrer" aria-label="In neuem Tab öffnen" title="In neuem Tab öffnen"><ExternalLinkIcon className="h-4 w-4" /></a> : null}
        </header>
      ) : null}
      <div className="browser-panel-body">
        {externalUrl ? (
          <ExternalPreviewChoice url={externalUrl} onUseChromium={() => {
            releaseHeldSlot();
            setStreamInitialUrl(externalUrl);
            setExternalUrl(null);
            setForceStream(true);
          }} />
        ) : localMode ? (
          <PreviewSlotFrame
            targetPort={target!.port}
            path={target!.path}
            requestedSlotId={slotId}
            isolate={false}
            deviceId={deviceId}
            orientation={orientation}
            reloadKey={reloadKey}
            title="Browser-Vorschau"
            previewNodeId={`browser:${instanceId}`}
            showControls
            onOrientationChange={setOrientation}
            onSlotAssigned={(assignedSlotId, url) => {
              setSlotId(assignedSlotId);
              heldSlotRef.current = { slotId: assignedSlotId, targetPort: target!.port };
              setPublicUrl(url);
              try {
                window.sessionStorage.setItem(slotStorageKey, String(assignedSlotId));
              } catch {
                // Session bleibt serverseitig bestehen.
              }
            }}
          />
        ) : (
          <DevicePreviewFrame deviceId={deviceId} orientation={orientation} origin={streamOrigin} {...(streamOrigin ? { runtime: "shared-browser" as const } : {})}>
            <ChromiumBrowser
              key={streamInitialUrl ? `stream:${streamInitialUrl}:${requestKey}` : `stream:${requestKey}`}
              instanceId={forceStream && target && !streamInitialUrl ? `${instanceId}:local:${target.port}` : instanceId}
              active={routeActive}
              {...(streamInitialUrl ? { initialUrl: streamInitialUrl } : {})}
              onLocalAddress={onLocalAddress}
              onStateChange={setStreamState}
              extraToolbarActions={streamExtraActions}
            />
          </DevicePreviewFrame>
        )}
      </div>
    </div>
  );
}
