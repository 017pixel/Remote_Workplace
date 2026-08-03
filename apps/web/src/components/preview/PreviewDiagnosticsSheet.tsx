import { useRef, useState } from "react";
import { CloseIcon } from "../icons";
import type {
  PreviewDiagnosticEvent,
  PreviewLocalStorageState,
  PreviewSessionResponse,
} from "@workbench/contracts";
import type { BridgeStatus } from "../../lib/previewBridgeClient";
import type { DeviceOrientation, DevicePresetId } from "../../config/devicePresets";
import { findDevicePreset } from "../../config/devicePresets";
import { useModalFocus } from "../../lib/useModalFocus";

type DiagnosticsTab = "console" | "errors" | "network" | "routing" | "info";

const tabs: Array<{ id: DiagnosticsTab; label: string }> = [
  { id: "console", label: "Console" },
  { id: "errors", label: "Fehler" },
  { id: "network", label: "Netzwerk" },
  { id: "routing", label: "Routing" },
  { id: "info", label: "Preview-Info" },
];

const sourceLabels: Record<PreviewDiagnosticEvent["source"], string> = {
  client: "Client",
  gateway: "Gateway",
  socket: "Socket",
  system: "System",
  inferred: "Vermutung",
};

const completenessLabels: Record<PreviewDiagnosticEvent["completeness"], string> = {
  complete: "vollständig",
  partial: "unvollständig",
  inferred: "vermutet",
};

const limitationLabels: Record<string, string> = {
  "cookies-share-host": "Cookies gelten hostweit — Ports isolieren sie nicht.",
  "no-indexeddb-sync": "IndexedDB wird nicht synchronisiert.",
  "no-service-worker-sync": "Service Worker werden nicht synchronisiert.",
  "no-session-storage-sync": "sessionStorage wird nicht synchronisiert.",
  "approximate-device-metrics": "DPR und Safe Area sind nur angenähert.",
  "bridge-unavailable": "Die Client-Bridge ist nicht aktiv.",
  "partial-network-visibility": "Requests aus Workern erscheinen nicht.",
};

function EventRow({ event }: { event: PreviewDiagnosticEvent }) {
  const [open, setOpen] = useState(false);
  const details = Object.entries(event.metadata);
  return (
    <li className={`preview-diagnostic-row is-${event.severity}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
        <span className="preview-diagnostic-source">{sourceLabels[event.source]}</span>
        <span className="preview-diagnostic-message">{event.message}</span>
        {event.completeness !== "complete" ? <em>{completenessLabels[event.completeness]}</em> : null}
      </button>
      {open && details.length > 0 ? (
        <dl>
          {details.map(([key, value]) => (
            <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

export interface PreviewDiagnosticsSheetProps {
  events: PreviewDiagnosticEvent[];
  dropped: number;
  bridgeStatus: BridgeStatus;
  session: PreviewSessionResponse | null;
  storageState: PreviewLocalStorageState | null;
  storageConflict: string | null;
  slotId: number | null;
  targetPort: number;
  device: { deviceId: DevicePresetId; orientation: DeviceOrientation; inherited: boolean };
  onClose: () => void;
  onToggleStorage: (enabled: boolean) => Promise<void>;
  onRestoreStorage: (revision: number) => Promise<void>;
  onKeepLocal: () => void;
  onResetSlot: () => Promise<void>;
}

/**
 * Diagnose als Bottom Sheet: mobil über die volle Breite, auf großen Flächen als
 * angedockte Karte. Jeder Eintrag nennt Quelle und Vollständigkeit; technische
 * Details bleiben eingeklappt.
 */
export function PreviewDiagnosticsSheet({
  events,
  dropped,
  bridgeStatus,
  session,
  storageState,
  storageConflict,
  slotId,
  targetPort,
  device,
  onClose,
  onToggleStorage,
  onRestoreStorage,
  onKeepLocal,
  onResetSlot,
}: PreviewDiagnosticsSheetProps) {
  const [tab, setTab] = useState<DiagnosticsTab>("console");
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  const preset = findDevicePreset(device.deviceId);
  useModalFocus(sheetRef, true, onClose);

  const filtered = events.filter((event) => {
    if (tab === "console") return event.category === "console";
    if (tab === "errors") return event.severity === "error" || event.category === "error";
    if (tab === "network") return event.category === "network";
    if (tab === "routing") return event.category === "routing" || event.category === "lifecycle" || event.category === "storage";
    return false;
  });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section ref={sheetRef} className="preview-diagnostics" role="dialog" aria-modal="true" aria-label="Preview-Diagnose" tabIndex={-1}>
      <header>
        <div className="preview-diagnostics-tabs" role="tablist">
          {tabs.map((entry) => (
            <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id}
              className={tab === entry.id ? "is-active" : ""} onClick={() => setTab(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
        <button type="button" className="preview-diagnostics-close" onClick={onClose} aria-label="Diagnose schließen"><CloseIcon className="h-4 w-4" /></button>
      </header>

      {dropped > 0 ? <p className="preview-diagnostics-note">{dropped} Ereignisse verworfen, um die Preview flüssig zu halten.</p> : null}

      {tab === "info" ? (
        <div className="preview-diagnostics-info">
          <dl>
            <div><dt>Ziel</dt><dd>localhost:{targetPort}</dd></div>
            <div><dt>Slot</dt><dd>{slotId ?? "—"}</dd></div>
            <div><dt>Routing-Revision</dt><dd>{session?.routingRevision ?? "—"}</dd></div>
            <div><dt>Bridge</dt><dd>{bridgeStatus.connected ? `verbunden (${bridgeStatus.version ?? "?"})` : bridgeStatus.unavailable ? "nicht verfügbar" : "verbindet…"}</dd></div>
            <div><dt>Gerät</dt><dd>{preset.label} · {device.orientation === "portrait" ? "Hochformat" : "Querformat"}{device.inherited ? " · Standard" : ""}</dd></div>
          </dl>

          <h3>Grenzen dieser Preview</h3>
          <ul className="preview-diagnostics-limitations">
            {(session?.limitations ?? []).map((limitation) => (
              <li key={limitation}>{limitationLabels[limitation] ?? limitation}</li>
            ))}
          </ul>

          <h3>App-Speicher</h3>
          {storageState === null ? (
            <p className="preview-diagnostics-note">Für diese Preview ist kein Storage-Profil hinterlegt.</p>
          ) : (
            <div className="preview-diagnostics-storage">
              <label>
                <input
                  type="checkbox"
                  checked={storageState.enabled}
                  disabled={busy}
                  onChange={(event) => void run(() => onToggleStorage(event.target.checked))}
                />
                <span>localStorage-Snapshot aktivieren</span>
              </label>
              <p className="preview-diagnostics-note">
                Snapshots enthalten alles aus localStorage — auch scriptlesbare Login-Tokens. Cookies, IndexedDB,
                Cache Storage, sessionStorage und Service Worker werden nicht übertragen.
              </p>
              {storageState.current ? (
                <p className="preview-diagnostics-note">
                  Revision {storageState.current.revision} · {storageState.current.keyCount} Schlüssel ·{" "}
                  {Math.round(storageState.current.byteCount / 1024)} KiB
                  {storageState.current.status === "unavailable" ? " · nicht entschlüsselbar" : ""}
                </p>
              ) : null}
              {storageConflict ? (
                <div className="preview-diagnostics-conflict">
                  <strong>Konflikt</strong>
                  <span>{storageConflict}</span>
                  <div>
                    <button type="button" onClick={onKeepLocal} disabled={busy}>Lokalen Zustand behalten</button>
                    {storageState.current ? (
                      <button type="button" disabled={busy} onClick={() => void run(() => onRestoreStorage(storageState.current!.revision))}>
                        Serverzustand übernehmen
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : storageState.current ? (
                <button type="button" disabled={busy} onClick={() => void run(() => onRestoreStorage(storageState.current!.revision))}>
                  Snapshot wiederherstellen
                </button>
              ) : null}
              {storageState.history.length > 0 ? (
                <details>
                  <summary>Frühere Revisionen</summary>
                  <ul>
                    {storageState.history.map((snapshot) => (
                      <li key={snapshot.revision}>
                        <span>Revision {snapshot.revision} · {snapshot.keyCount} Schlüssel</span>
                        <button type="button" disabled={busy} onClick={() => void run(() => onRestoreStorage(snapshot.revision))}>Wiederherstellen</button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}

          <h3>Slot-Speicher</h3>
          <p className="preview-diagnostics-note">
            Der Reset leert Storage, Cache Storage und Service Worker dieser Slot-Origin. Cookies bleiben unangetastet,
            weil sie hostweit auch andere Slots betreffen. Für echte Cookie-Isolation das Browser-Werkzeug mit Server-Chromium verwenden.
          </p>
          <button type="button" className="preview-diagnostics-danger" disabled={busy || slotId === null} onClick={() => void run(onResetSlot)}>
            Slot-Speicher zurücksetzen
          </button>
        </div>
      ) : (
        <ul className="preview-diagnostic-list">
          {filtered.length === 0 ? <li className="preview-diagnostics-note">Noch keine Ereignisse in dieser Ansicht.</li> : null}
          {filtered.slice(-200).reverse().map((event) => <EventRow key={event.id} event={event} />)}
        </ul>
      )}
    </section>
  );
}
