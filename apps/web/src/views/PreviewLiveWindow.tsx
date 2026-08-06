import { useEffect, useMemo, useState } from "react";
import { CopyIcon, DeviceRotateIcon, SmartphoneIcon } from "../components/icons";
import { LocalPreviewRuntime } from "../components/preview/LocalPreviewRuntime";
import { getGroupedDevicePresets, type DeviceOrientation } from "../config/devicePresets";
import { normalizePreviewTarget } from "../lib/previewTargets";
import { writeClipboardText } from "../lib/clipboard";

export function PreviewLiveWindowRoute() {
  const input = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    const port = Number(query.get("port"));
    const projectId = query.get("project") ?? "";
    const path = query.get("path") ?? "/";
    const title = query.get("title")?.slice(0, 120) || "Development Preview";
    const normalized = normalizePreviewTarget(`http://127.0.0.1:${port}${path}`);
    return normalized?.kind === "local" && projectId ? { projectId, port: normalized.port, path: normalized.path, title } : null;
  }, []);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<DeviceOrientation>("portrait");
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (input) document.title = `${input.title} · Preview`; }, [input]);
  if (!input) return <main className="preview-live-window is-invalid"><strong>Preview-Ziel ungültig</strong></main>;

  return (
    <main className="preview-live-window">
      <header className="preview-live-window-bar">
        <div className="preview-live-window-title"><span>Preview</span><strong>{input.title}</strong></div>
        <label className="preview-live-device-select">
          <SmartphoneIcon className="h-4 w-4" />
          <select value={deviceId ?? "__default"} onChange={(event) => setDeviceId(event.target.value === "__default" ? null : event.target.value)} aria-label="Geräteansicht">
            <option value="__default">Standardgerät</option>
            {getGroupedDevicePresets().map((group) => <optgroup key={group.group} label={group.label}>{group.devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</optgroup>)}
          </select>
        </label>
        <button type="button" onClick={() => setOrientation((value) => value === "portrait" ? "landscape" : "portrait")} aria-label="Ausrichtung drehen" title="Ausrichtung drehen"><DeviceRotateIcon className="h-4 w-4" /></button>
        <div className="preview-live-url"><span>{publicUrl ?? `localhost:${input.port}`}</span><button type="button" disabled={!publicUrl} aria-label="Tailscale-URL kopieren" onClick={() => {
          if (!publicUrl) return;
          void writeClipboardText(publicUrl).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1_500); });
        }}><CopyIcon className="h-4 w-4" /><span>{copied ? "Kopiert" : "Kopieren"}</span></button></div>
      </header>
      <section className="preview-live-stage">
        <LocalPreviewRuntime targetPort={input.port} path={input.path} projectId={input.projectId} sessionKey={`preview-live:${input.projectId}:${input.port}`} isolate={false} deviceId={deviceId} orientation={orientation} title={input.title} showControls onSlotAssigned={(_slotId, url) => setPublicUrl(url)} onOrientationChange={setOrientation} />
      </section>
    </main>
  );
}
