import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Network } from "lucide-react";
import type { LocalPort, PreviewDependency } from "@workbench/contracts";
import { ApiClientError, apiClient } from "../lib/apiClient";
import { previewSlotUrl } from "../lib/previewTargets";
import type { DeviceOrientation, DevicePresetId } from "../config/devicePresets";
import { DevicePreviewFrame } from "./DevicePreviewFrame";

export function relayCanvasPinch(iframe: HTMLIFrameElement) {
  try {
    const target = iframe.contentWindow;
    if (!target || target.__orbitPinchRelayInstalled) return;
    target.__orbitPinchRelayInstalled = true;
    target.addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = iframe.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("orbit:iframe-pinch", { detail: {
        clientX: bounds.left + event.clientX,
        clientY: bounds.top + event.clientY,
        deltaY: event.deltaY,
      } }));
    }, { passive: false, capture: true });
  } catch {
    // Cross-origin previews retain native input. Same-origin slots relay Orbit pinch.
  }
}

export function PreviewSlotFrame({
  targetPort,
  path = "/",
  requestedSlotId = null,
  isolate = true,
  deviceId = "responsive",
  orientation = "portrait",
  reloadKey = 0,
  title = "Development Preview",
  lazy = false,
  onSlotAssigned,
  onFocus,
  projectId = null,
  sessionKey,
}: {
  targetPort: number;
  path?: string;
  requestedSlotId?: number | null;
  isolate?: boolean;
  deviceId?: DevicePresetId;
  orientation?: DeviceOrientation;
  reloadKey?: number;
  title?: string;
  lazy?: boolean;
  onSlotAssigned?: (slotId: number, url: string) => void;
  onFocus?: () => void;
  projectId?: string | null;
  sessionKey?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const generatedSessionKey = useRef(sessionKey ?? `preview:${globalThis.crypto.randomUUID()}`);
  const assignmentRef = useRef<{ slotId: number; targetPort: number; isolate: boolean; publicUrl: string } | null>(null);
  const [candidates, setCandidates] = useState<LocalPort[]>([]);
  const [dependencies, setDependencies] = useState<PreviewDependency[]>([]);
  const [dependencyReady, setDependencyReady] = useState(projectId === null);
  const onSlotAssignedRef = useRef(onSlotAssigned);
  onSlotAssignedRef.current = onSlotAssigned;

  useEffect(() => {
    if (!lazy || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    if (!projectId) { setCandidates([]); setDependencies([]); setDependencyReady(true); return; }
    const controller = new AbortController();
    setDependencyReady(false);
    void Promise.all([
      apiClient.localPorts(controller.signal),
      apiClient.previewDependencies(projectId, targetPort, controller.signal),
    ]).then(([ports, saved]) => {
      setCandidates(ports.ports.filter((port) => port.projectId === projectId && port.port !== targetPort && port.protocol !== "unknown"));
      setDependencies(saved.dependencies);
      setDependencyReady(true);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) { setDependencyReady(true); setError(reason instanceof Error ? reason.message : "Projekt-Ports konnten nicht geprüft werden."); }
    });
    return () => controller.abort();
  }, [projectId, targetPort]);

  useEffect(() => {
    if (!visible) return;
    if (!dependencyReady) return;
    const current = assignmentRef.current;
    if (current && current.targetPort === targetPort && current.isolate === isolate && (requestedSlotId === null || requestedSlotId === current.slotId)) {
      setUrl(previewSlotUrl(current.publicUrl, path));
      return;
    }
    let active = true;
    setError(null);
    setLoaded(false);
    setUrl(null);
    const assign = (slotId: number | null) => apiClient.openPreviewSession({
      sessionKey: generatedSessionKey.current,
      projectId,
      primaryPort: targetPort,
      primaryProtocol: "http",
      isolate,
      ...(slotId === null ? {} : { requestedSlotId: slotId }),
    });
    void assign(requestedSlotId).catch((reason: unknown) => {
      if (requestedSlotId !== null && reason instanceof ApiClientError && reason.code === "PREVIEW_SLOT_CHANGED") {
        return assign(null);
      }
      throw reason;
    }).then((response) => {
      if (!active || !response) return;
      const slot = response.bindings.find((candidate) => candidate.role === "primary");
      if (!slot) throw new Error("Der zugewiesene Hauptdienst fehlt in der Serverantwort.");
      const nextUrl = previewSlotUrl(slot.publicUrl, path);
      assignmentRef.current = { slotId: slot.slotId, targetPort, isolate, publicUrl: slot.publicUrl };
      setUrl(nextUrl);
      onSlotAssignedRef.current?.(slot.slotId, nextUrl);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Der Preview-Slot konnte nicht geöffnet werden.");
    });
    return () => { active = false; };
  }, [dependencyReady, dependencies, isolate, path, projectId, requestedSlotId, retryKey, targetPort, visible]);

  useEffect(() => {
    if (!visible || !url) return;
    const renew = window.setInterval(() => {
      void apiClient.openPreviewSession({
        sessionKey: generatedSessionKey.current,
        projectId,
        primaryPort: targetPort,
        primaryProtocol: "http",
        isolate,
        ...(assignmentRef.current ? { requestedSlotId: assignmentRef.current.slotId } : {}),
      }).catch(() => { /* Die sichtbare Preview bleibt bestehen; der nächste Nutzerimpuls meldet den Fehler. */ });
    }, 10 * 60_000);
    return () => window.clearInterval(renew);
  }, [isolate, projectId, targetPort, url, visible]);

  const approveCandidates = async () => {
    if (!projectId) return;
    const next = candidates.map((port) => ({ port: port.port, label: port.process ?? `Dienst ${port.port}`, protocol: port.protocol === "https" ? "https" as const : "auto" as const, enabled: true }));
    try {
      const saved = await apiClient.savePreviewDependencies({ projectId, primaryPort: targetPort, dependencies: next });
      if (saved) { setDependencies(saved.dependencies); setRetryKey((value) => value + 1); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Begleitdienste konnten nicht gespeichert werden."); }
  };
  const unapprovedCandidates = candidates.filter((candidate) => !dependencies.some((dependency) => dependency.port === candidate.port && dependency.enabled));

  return (
    <div ref={containerRef} className="preview-slot-frame">
      {!visible ? <div className="preview-slot-placeholder" aria-label="Preview wird bei Sichtbarkeit geladen" /> : null}
      {visible && dependencyReady && projectId && unapprovedCandidates.length > 0 ? <div className="preview-dependency-consent"><Network className="h-4 w-4" /><span>{unapprovedCandidates.length} weitere {unapprovedCandidates.length === 1 ? "Projekt-Dienst" : "Projekt-Dienste"} erkannt</span><button type="button" onClick={() => void approveCandidates()}>Verbinden &amp; merken</button></div> : null}
      {error ? <div className="preview-slot-error"><AlertTriangle className="h-5 w-5" /><span>{error}</span><button type="button" onClick={() => setRetryKey((value) => value + 1)}>Erneut versuchen</button></div> : null}
      {visible && !error && !loaded ? <div className="preview-slot-loading"><span /><small>Preview wird verbunden…</small></div> : null}
      {visible && url ? (
        <DevicePreviewFrame deviceId={deviceId} orientation={orientation} runtime="iframe" origin={`localhost:${targetPort}`}>
          <iframe
            key={`${url}:${reloadKey}`}
            src={url}
            title={title}
            onLoad={(event) => { setLoaded(true); relayCanvasPinch(event.currentTarget); }}
            onPointerDown={(event) => {
              onFocus?.();
              event.currentTarget.focus();
              event.currentTarget.contentWindow?.focus();
            }}
            onContextMenu={(event) => event.preventDefault()}
            className="h-full w-full border-0 bg-white"
            allowFullScreen
            referrerPolicy="same-origin"
          />
        </DevicePreviewFrame>
      ) : null}
    </div>
  );
}
