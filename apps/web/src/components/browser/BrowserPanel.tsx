import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, MonitorSmartphone, RotateCw, Server, ShieldCheck } from "lucide-react";
import { apiClient } from "../../lib/apiClient";
import { normalizePreviewTarget } from "../../lib/previewTargets";
import { DevicePickerButton } from "../DevicePickerButton";
import { DevicePreviewFrame } from "../DevicePreviewFrame";
import { PreviewSlotFrame } from "../PreviewSlotFrame";
import type { DeviceOrientation, DevicePresetId } from "../../config/devicePresets";
import { ChromiumBrowser, type ChromiumBrowserState } from "./ChromiumBrowser";

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
export function BrowserPanel({ instanceId }: { instanceId: string }) {
  const targetStorageKey = `workbench:browser-target:${instanceId}`;
  const slotStorageKey = `workbench:browser-slot:${instanceId}`;

  const [target, setTarget] = useState<LocalTarget | null>(() => readStoredTarget(targetStorageKey));
  const [forceStream, setForceStream] = useState(false);
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
  const heldSlotRef = useRef<{ slotId: number; targetPort: number } | null>(null);

  useEffect(() => {
    setAddressDraft(target ? addressForTarget(target) : "");
  }, [target]);

  const releaseHeldSlot = useCallback(() => {
    const held = heldSlotRef.current;
    if (!held) return;
    heldSlotRef.current = null;
    void apiClient.assignPreviewSlot({
      slotId: held.slotId,
      targetPort: null,
      isolate: false,
      expectedTargetPort: held.targetPort,
    }).catch(() => {
      // Slot kann sich zwischenzeitlich geändert haben – nichts weiter zu tun.
    });
    try {
      window.sessionStorage.removeItem(slotStorageKey);
    } catch {
      // Der Server gibt den Slot trotzdem frei.
    }
  }, [slotStorageKey]);

  // Deckt sowohl das Schließen in der klassischen Workbench als auch das
  // Entfernen eines Orbit-Werkzeugknotens ab: React unmountet in beiden
  // Fällen dieselbe Komponente.
  useEffect(() => () => releaseHeldSlot(), [releaseHeldSlot]);

  const goLocal = (nextTarget: LocalTarget) => {
    if (heldSlotRef.current && heldSlotRef.current.targetPort !== nextTarget.port) releaseHeldSlot();
    setForceStream(false);
    setPublicUrl(null);
    setTarget(nextTarget);
    storeTarget(targetStorageKey, nextTarget);
  };

  const useStreamForCurrentTarget = () => {
    releaseHeldSlot();
    setForceStream(true);
  };

  const onLocalAddress = (value: string) => {
    const parsed = normalizePreviewTarget(value);
    if (parsed?.kind === "local") goLocal({ port: parsed.port, path: parsed.path });
  };

  const submitAddress = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = normalizePreviewTarget(addressDraft);
    if (parsed?.kind === "local") goLocal({ port: parsed.port, path: parsed.path });
  };

  const localMode = target !== null && !forceStream;
  const streamOrigin = streamState && streamState.url !== "about:blank" ? hostOf(streamState.url) : null;

  const streamExtraActions = (
    <>
      <DevicePickerButton deviceId={deviceId} onChange={setDeviceId} />
      {deviceId !== "responsive" ? (
        <button type="button" title="Ausrichtung drehen" aria-label="Ausrichtung drehen" onClick={() => setOrientation((current) => current === "portrait" ? "landscape" : "portrait")}>
          <MonitorSmartphone className="h-4 w-4" />
        </button>
      ) : null}
      {forceStream && target ? (
        <button type="button" className="is-active" title="Direkte iframe-Vorschau verwenden" aria-label="Direkte iframe-Vorschau verwenden" onClick={() => setForceStream(false)}>
          <ShieldCheck className="h-4 w-4" />
        </button>
      ) : null}
    </>
  );

  return (
    <div className="browser-panel">
      {localMode ? (
        <header className="browser-toolbar">
          <form className="browser-address" onSubmit={submitAddress}>
            <ShieldCheck className="h-3.5 w-3.5" />
            <input value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} aria-label="Browser-Adresse" placeholder="Port oder lokale Adresse" />
          </form>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} aria-label="Neu laden" title="Neu laden"><RotateCw className="h-4 w-4" /></button>
          <DevicePickerButton deviceId={deviceId} onChange={setDeviceId} />
          {deviceId !== "responsive" ? (
            <button type="button" title="Ausrichtung drehen" aria-label="Ausrichtung drehen" onClick={() => setOrientation((current) => current === "portrait" ? "landscape" : "portrait")}>
              <MonitorSmartphone className="h-4 w-4" />
            </button>
          ) : null}
          <button type="button" title="Server-Chromium verwenden: geteilte Geräte- oder Cookie-Session" aria-label="Server-Chromium verwenden" onClick={useStreamForCurrentTarget}>
            <Server className="h-4 w-4" />
          </button>
          {publicUrl ? <a href={publicUrl} target="_blank" rel="noopener noreferrer" aria-label="In neuem Tab öffnen" title="In neuem Tab öffnen"><ExternalLink className="h-4 w-4" /></a> : null}
        </header>
      ) : null}
      <div className="browser-panel-body">
        {localMode ? (
          <PreviewSlotFrame
            targetPort={target!.port}
            path={target!.path}
            requestedSlotId={slotId}
            isolate={false}
            deviceId={deviceId}
            orientation={orientation}
            reloadKey={reloadKey}
            title="Browser-Vorschau"
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
              key={forceStream && target ? `local-stream:${target.port}` : "stream"}
              instanceId={forceStream && target ? `${instanceId}:local:${target.port}` : instanceId}
              {...(forceStream && target ? { initialUrl: `http://127.0.0.1:${target.port}${target.path}` } : {})}
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
