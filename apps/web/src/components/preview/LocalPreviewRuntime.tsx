import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, DeviceRotateIcon, ExternalLinkIcon, MinusIcon, NetworkIcon, PlusIcon, RefreshIcon, WarningIcon } from "../icons";
import type {
  PreviewDiagnosticEvent,
  PreviewLocalStorageEntry,
  PreviewLocalStorageState,
  PreviewServiceEdge,
  PreviewSessionResponse,
} from "@workbench/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { previewLiveWindowUrl } from "../../lib/previewExternalOpen";
import { previewSlotUrl } from "../../lib/previewTargets";
import { PreviewBridgeClient, type BridgeStatus } from "../../lib/previewBridgeClient";
import { resolvePreviewDevice } from "../../lib/previewDevice";
import { snapshotBytes, snapshotHash } from "../../lib/previewStorageSnapshot";
import { workbenchQueries } from "../../lib/queryOptions";
import { generateId } from "../../lib/id";
import type { DeviceOrientation } from "../../config/devicePresets";
import { changeDevicePreviewScaleFactor, DevicePreviewFrame, devicePreviewScaleFactorMax, devicePreviewScaleFactorMin } from "../DevicePreviewFrame";
import { PreviewDiagnosticsSheet } from "./PreviewDiagnosticsSheet";
import { useRouteActivity } from "../../lib/routeActivity";
import { writeClipboardText } from "../../lib/clipboard";
import { runPreviewSlotReset, withPreviewSlotRecovery } from "../../lib/previewSlotRecovery";

export interface LocalPreviewRuntimeProps {
  targetPort: number;
  path?: string;
  requestedSlotId?: number | null;
  isolate?: boolean;
  /** Stabile Storage-Identität des Slots aus dem Orbit-Dokument. */
  storageProfileId?: string | null;
  previewNodeId?: string | null;
  projectId?: string | null;
  sessionKey?: string;
  /** `null` erbt die Benutzerpräferenz. */
  deviceId?: string | null;
  orientation?: DeviceOrientation;
  reloadKey?: number;
  title?: string;
  lazy?: boolean;
  /** Sichtbare Steuerung für Reload, Verlauf, Ausrichtung und Diagnose. */
  showControls?: boolean;
  interactionLocked?: boolean;
  onSlotAssigned?: (slotId: number, url: string) => void;
  onOrientationChange?: (orientation: DeviceOrientation) => void;
  onFocus?: () => void;
}

export function reloadLocalPreview(
  bridgeConnected: boolean,
  navigate: (action: "reload") => void,
  remount: () => void,
) {
  if (bridgeConnected) navigate("reload");
  else remount();
}

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
    // Cross-Origin-Previews behalten ihre native Eingabe; nur gleiche Origins melden Pinch.
  }
}

/**
 * Gemeinsame Laufzeit aller lokalen Previews: Canvas, Sidebar, Vollbildroute und
 * das Browser-Panel verwenden dieselbe Komponente. Sie kapselt Session-Lease,
 * Slot-Affinität, Bridge-Handshake, Diagnose, Geräterahmen sowie Reset- und
 * Quarantänestatus.
 */
export function LocalPreviewRuntime({
  targetPort,
  path = "/",
  requestedSlotId = null,
  isolate = true,
  storageProfileId = null,
  previewNodeId = null,
  projectId = null,
  sessionKey,
  deviceId = null,
  orientation = "portrait",
  reloadKey = 0,
  title = "Development Preview",
  lazy = false,
  showControls = false,
  interactionLocked = false,
  onSlotAssigned,
  onOrientationChange,
  onFocus,
}: LocalPreviewRuntimeProps) {
  const routeActive = useRouteActivity();
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [url, setUrl] = useState<string | null>(null);
  const [session, setSession] = useState<PreviewSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [runtimeReloadKey, setRuntimeReloadKey] = useState(0);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [events, setEvents] = useState<PreviewDiagnosticEvent[]>([]);
  const [dropped, setDropped] = useState(0);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false, version: null, href: null, unavailable: false });
  const [storageState, setStorageState] = useState<PreviewLocalStorageState | null>(null);
  const [storageConflict, setStorageConflict] = useState<string | null>(null);
  const [graphSaving, setGraphSaving] = useState(false);
  const [previewScaleFactor, setPreviewScaleFactor] = useState(1);
  const [urlCopied, setUrlCopied] = useState(false);
  const eventBufferRef = useRef<PreviewDiagnosticEvent[]>([]);
  const eventDroppedRef = useRef(0);
  const eventFlushRef = useRef<number | null>(null);
  const routeActiveRef = useRef(routeActive);

  const generatedSessionKey = useRef(sessionKey ?? `preview:${generateId()}`);
  const idempotencyRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const assignmentRef = useRef<{
    slotId: number;
    targetPort: number;
    isolate: boolean;
    publicUrl: string;
    requestFingerprint: string;
  } | null>(null);
  const storageStateRef = useRef<PreviewLocalStorageState | null>(null);  const storageWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const storageConflictBlockedRef = useRef(false);
  const conflictedEntriesRef = useRef<PreviewLocalStorageEntry[] | null>(null);
  const onSlotAssignedRef = useRef(onSlotAssigned);
  onSlotAssignedRef.current = onSlotAssigned;

  const preference = useQuery({ ...workbenchQueries.previewDevicePreference(), enabled: routeActive });
  const resolvedDevice = resolvePreviewDevice({ deviceId, orientation }, preference.data);
  const candidatesQuery = useQuery({ ...workbenchQueries.previewServiceCandidates(projectId), enabled: routeActive && visible && projectId !== null });
  const graphQuery = useQuery({
    ...workbenchQueries.previewServiceGraph(projectId ?? "-", String(targetPort)),
    enabled: routeActive && visible && projectId !== null,
  });

  const flushEventState = useCallback(() => {
    if (eventFlushRef.current !== null) {
      window.clearTimeout(eventFlushRef.current);
      eventFlushRef.current = null;
    }
    setEvents(eventBufferRef.current);
    setDropped(eventDroppedRef.current);
  }, []);
  const queueEventState = useCallback((incoming: PreviewDiagnosticEvent[], droppedCount: number) => {
    if (!routeActiveRef.current) return;
    if (incoming.length > 0) eventBufferRef.current = [...eventBufferRef.current, ...incoming].slice(-500);
    eventDroppedRef.current = droppedCount;
    if (eventFlushRef.current === null) eventFlushRef.current = window.setTimeout(flushEventState, 75);
  }, [flushEventState]);

  useEffect(() => {
    routeActiveRef.current = routeActive;
    if (routeActive) flushEventState();
  }, [flushEventState, routeActive]);

  const bridge = useMemo(() => new PreviewBridgeClient({
    onStatus: setBridgeStatus,
    onDiagnostics: queueEventState,
  }), [queueEventState]);
  useEffect(() => () => bridge.dispose(), [bridge]);
  useEffect(() => () => {
    if (eventFlushRef.current !== null) window.clearTimeout(eventFlushRef.current);
  }, []);

  // ── Sichtbarkeit ───────────────────────────────────────────────────────────
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

  // ── Session öffnen ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!routeActive || !visible) return;
    const requestFingerprint = JSON.stringify({
      projectId,
      targetPort,
      isolate,
      storageProfileId,
      requestedSlotId,
      graphRevision: graphQuery.data?.graph.updatedAt ?? null,
    });
    const current = assignmentRef.current;
    if (current && current.requestFingerprint === requestFingerprint) {
      setUrl(previewSlotUrl(current.publicUrl, path));
      return;
    }
    if (idempotencyRequestRef.current?.fingerprint !== requestFingerprint) {
      idempotencyRequestRef.current = { fingerprint: requestFingerprint, key: generateId() };
    }
    const idempotencyKey = idempotencyRequestRef.current.key;
    let active = true;
    setError(null);
    const open = (slotId: number | null) => apiClient.openPreviewSession({
      sessionKey: generatedSessionKey.current,
      projectId,
      primaryPort: targetPort,
      primaryProtocol: "http",
      isolate,
      storageProfileId,
      idempotencyKey,
      ...(slotId === null ? {} : { requestedSlotId: slotId }),
    });
    const openWithRecovery = async () => {
      try {
        return await open(requestedSlotId);
      } catch (reason) {
        if (requestedSlotId !== null && reason instanceof ApiClientError && reason.code === "PREVIEW_SLOT_CHANGED") {
          return withPreviewSlotRecovery(() => open(null));
        }
        if (!(reason instanceof ApiClientError) || reason.code !== "PREVIEW_SLOTS_EXHAUSTED") throw reason;
        return withPreviewSlotRecovery(() => open(null));
      }
    };
    void openWithRecovery().then((response) => {
      if (!active || !response) return;
      const primary = response.bindings.find((candidate) => candidate.role === "primary");
      if (!primary) throw new Error("Der zugewiesene Hauptdienst fehlt in der Serverantwort.");
      const nextUrl = previewSlotUrl(primary.publicUrl, path);
      // Der alte Zustand wird erst nach erfolgreicher neuer Bindung ersetzt.
      assignmentRef.current = { slotId: primary.slotId, targetPort, isolate, publicUrl: primary.publicUrl, requestFingerprint };
      setSession(response);
      setLoaded(false);
      setUrl(nextUrl);
      onSlotAssignedRef.current?.(primary.slotId, nextUrl);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Der Preview-Slot konnte nicht geöffnet werden.");
    });
    return () => { active = false; };
  }, [graphQuery.data?.graph.updatedAt, isolate, path, projectId, requestedSlotId, retryKey, routeActive, storageProfileId, targetPort, visible]);

  // ── Lease erneuern ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const renew = window.setInterval(() => {
      void apiClient.renewPreviewSession(session.id).catch(() => {
        // Die sichtbare Preview bleibt bestehen; der nächste Nutzerimpuls meldet den Fehler.
      });
    }, 10 * 60_000);
    return () => window.clearInterval(renew);
  }, [session]);

  // Die Session wird beim Unmount bewusst nicht geschlossen: Command-R im
  // Preview-Fenster würde sonst erst die alte Session abreißen und eine neue
  // öffnen, wobei ein anderer Tab oder ein Reclaim den Slot übernehmen kann.
  // Die Zuordnung bleibt bestehen, bis der Nutzer das Ziel entfernt, die Lease
  // abläuft oder echte Slot-Knappheit herrscht. Die Lease verlängert sich im
  // Hintergrund weiter, auch für geparkte Routen.

  // ── Bridge und Diagnose ────────────────────────────────────────────────────
  useEffect(() => {
    bridge.attach(routeActive ? iframeRef.current : null, routeActive ? url : null);
  }, [bridge, routeActive, url, reloadKey, runtimeReloadKey]);

  useEffect(() => {
    if (!session?.capabilities.includes("diagnostics")) return;
    if (!routeActive) return;
    let flushing = false;
    const flush = window.setInterval(() => {
      if (flushing) return;
      const batch = bridge.takeBatch();
      if (batch.events.length === 0 && batch.dropped === 0) return;
      flushing = true;
      void apiClient.sendPreviewDiagnostics({
          previewNodeId,
          sessionId: session.id,
          bridgeSessionId: bridge.sessionId,
          droppedSinceLastBatch: batch.dropped,
          events: batch.events.map((event) => ({ ...event, previewNodeId, sessionId: session.id })),
        }).catch(() => {
          bridge.restoreBatch(batch);
        }).finally(() => {
          flushing = false;
        });
    }, 2_000);
    return () => window.clearInterval(flush);
  }, [bridge, previewNodeId, routeActive, session]);

  // ── localStorage-Snapshot ──────────────────────────────────────────────────
  const loadStorageState = useCallback(async () => {
    if (!storageProfileId) return;
    try {
      const next = await apiClient.previewStorageState(storageProfileId) ?? null;
      storageStateRef.current = next;
      setStorageState(next);
      return next;
    } catch {
      storageStateRef.current = null;
      setStorageState(null);
      return null;
    }
  }, [storageProfileId]);

  useEffect(() => {
    if (!routeActive || !storageProfileId || !session?.capabilities.includes("storage-snapshot")) return;
    void loadStorageState();
  }, [loadStorageState, routeActive, session, storageProfileId]);

  const persistSnapshot = useCallback((entries: PreviewLocalStorageEntry[]) => {
    storageWriteQueueRef.current = storageWriteQueueRef.current.then(async () => {
      const currentState = storageStateRef.current;
      if (!storageProfileId || !currentState?.enabled || storageConflictBlockedRef.current) return;
      const hash = snapshotHash(entries);
      if (hash === currentState.current?.hash) return;
      try {
        const next = await apiClient.savePreviewStorageSnapshot(storageProfileId, {
          expectedRevision: currentState.current?.revision ?? null,
          hash,
          bridgeVersion: session?.bridgeVersion ?? "v1",
          entries,
        }) ?? null;
        storageStateRef.current = next;
        setStorageState(next);
        setStorageConflict(null);
      } catch (reason) {
        if (reason instanceof ApiClientError && reason.status === 409) {
          storageConflictBlockedRef.current = true;
          conflictedEntriesRef.current = entries;
          setStorageConflict("Der Snapshot wurde auf einem anderen Gerät geändert. Bitte wähle, welcher Stand gelten soll.");
          await loadStorageState();
          return;
        }
        // Größenüberschreitungen erzeugen eine Diagnose, keinen Preview-Ausfall.
        const failure: PreviewDiagnosticEvent = {
          id: generateId(),
          at: new Date().toISOString(),
          source: "system",
          category: "storage",
          severity: "warn",
          completeness: "complete",
          previewNodeId,
          sessionId: session?.id ?? null,
          slotId: assignmentRef.current?.slotId ?? null,
          routingRevision: session?.routingRevision ?? null,
          bridgeSessionId: bridge.sessionId,
          epoch: 0,
          sequence: 0,
          route: null,
          message: reason instanceof Error ? reason.message : "Der Storage-Snapshot konnte nicht gespeichert werden.",
          metadata: { keys: entries.length, bytes: snapshotBytes(entries) },
        };
        queueEventState([failure], eventDroppedRef.current);
      }
    }).catch(() => undefined);
  }, [bridge, loadStorageState, previewNodeId, queueEventState, session, storageProfileId]);

  useEffect(() => {
    bridge.setStorageHandler(routeActive && storageState?.enabled ? persistSnapshot : null);
  }, [bridge, persistSnapshot, routeActive, storageState]);

  // ── Service-Kandidaten ─────────────────────────────────────────────────────
  const confirmedPorts = new Set((graphQuery.data?.graph.edges ?? []).map((edge) => edge.port));
  const unconfirmed = (candidatesQuery.data?.candidates ?? []).filter((candidate) =>
    candidate.port !== targetPort && candidate.projectId === projectId && !confirmedPorts.has(candidate.port));
  const capacity = graphQuery.data?.capacity ?? null;

  const confirmCandidates = async () => {
    if (!projectId) return;
    setGraphSaving(true);
    try {
      const edges: PreviewServiceEdge[] = [
        ...(graphQuery.data?.graph.edges ?? []),
        ...unconfirmed.map((candidate) => ({
          serviceId: candidate.serviceId,
          projectId: candidate.projectId,
          port: candidate.port,
          protocol: candidate.supportsWebSocket ? "ws" as const : candidate.protocol,
          role: candidate.suggestedRole === "primary" ? "other" as const : candidate.suggestedRole,
          label: candidate.process ?? `Dienst ${candidate.port}`,
          probeStatus: candidate.probeStatus,
          source: "detected" as const,
          confirmedAt: new Date().toISOString(),
        })),
      ];
      await apiClient.savePreviewServiceGraph(projectId, String(targetPort), edges);
      await graphQuery.refetch();
      assignmentRef.current = null;
      setRetryKey((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Die Dienste konnten nicht verbunden werden.");
    } finally {
      setGraphSaving(false);
    }
  };

  const quarantined = error?.includes("Quarantäne") ?? false;

  return (
    <div ref={containerRef} className="preview-slot-frame">
      {!visible ? <div className="preview-slot-placeholder" aria-label="Preview wird bei Sichtbarkeit geladen" /> : null}

      {visible && projectId && unconfirmed.length > 0 ? (
        <div className="preview-dependency-consent">
          <NetworkIcon className="h-4 w-4" />
          <span>
            {unconfirmed.length} weitere {unconfirmed.length === 1 ? "Projekt-Dienst" : "Projekt-Dienste"} erkannt
            {capacity ? ` · ${capacity.freeSlots + capacity.reusableSlots} von ${capacity.totalSlots} Slots frei` : ""}
          </span>
          <button type="button" disabled={graphSaving} onClick={() => void confirmCandidates()}>Verbinden &amp; merken</button>
        </div>
      ) : null}

      {error ? (
        <div className="preview-slot-error">
          {quarantined ? <WarningIcon className="h-5 w-5" /> : <WarningIcon className="h-5 w-5" />}
          <span>{error}</span>
          <button type="button" onClick={() => { assignmentRef.current = null; setRetryKey((value) => value + 1); }}>Erneut versuchen</button>
        </div>
      ) : null}

      {visible && !error && !loaded ? <div className="preview-slot-loading"><span /><small>Preview wird verbunden…</small></div> : null}

      {visible && url ? (
        <DevicePreviewFrame
          deviceId={resolvedDevice.deviceId}
          orientation={resolvedDevice.orientation}
          runtime="iframe"
          origin={`localhost:${targetPort}`}
          scaleFactor={previewScaleFactor}
          interactionLocked={interactionLocked}
        >
          <iframe
            ref={iframeRef}
            key={`${url}:${reloadKey}:${runtimeReloadKey}`}
            src={url}
            title={title}
            onLoad={(event) => {
              setLoaded(true);
              bridge.beginEpoch();
              bridge.attach(event.currentTarget, url);
              // Meldet sich die Bridge nicht, bleibt die Preview nutzbar — nur ohne Diagnose.
              window.setTimeout(() => bridge.markUnavailable(), 2_500);
              relayCanvasPinch(event.currentTarget);
            }}
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

      {showControls && visible ? (
        <div className="preview-runtime-controls" role="group" aria-label="Preview steuern">
          {resolvedDevice.deviceId !== "responsive" ? (
            <div className="preview-runtime-scale" role="group" aria-label="Größe der Gerätevorschau">
              <button
                type="button"
                aria-label="Gerätevorschau verkleinern"
                title="Gerätevorschau verkleinern"
                disabled={previewScaleFactor <= devicePreviewScaleFactorMin}
                onClick={() => setPreviewScaleFactor((value) => changeDevicePreviewScaleFactor(value, -1))}
              ><MinusIcon className="h-4 w-4" /></button>
              <output aria-live="polite">{Math.round(previewScaleFactor * 100)}%</output>
              <button
                type="button"
                aria-label="Gerätevorschau vergrößern"
                title="Gerätevorschau vergrößern"
                disabled={previewScaleFactor >= devicePreviewScaleFactorMax}
                onClick={() => setPreviewScaleFactor((value) => changeDevicePreviewScaleFactor(value, 1))}
              ><PlusIcon className="h-4 w-4" /></button>
            </div>
          ) : null}
          <button type="button" aria-label="Zurück" title="Zurück" onClick={() => bridge.navigate("back")} disabled={!bridgeStatus.connected}><ChevronLeftIcon className="h-4 w-4" /></button>
          <button type="button" aria-label="Vorwärts" title="Vorwärts" onClick={() => bridge.navigate("forward")} disabled={!bridgeStatus.connected}><ChevronRightIcon className="h-4 w-4" /></button>
          <button type="button" aria-label="Neu laden" title="Neu laden" onClick={() => {
            reloadLocalPreview(
              bridgeStatus.connected,
              (action) => bridge.navigate(action),
              () => {
                setLoaded(false);
                setRuntimeReloadKey((value) => value + 1);
              },
            );
          }}><RefreshIcon className="h-4 w-4" /></button>
          {onOrientationChange && resolvedDevice.deviceId !== "responsive" ? (
            <button type="button" aria-label="Ausrichtung drehen" title="Ausrichtung drehen"
              onClick={() => onOrientationChange(resolvedDevice.orientation === "portrait" ? "landscape" : "portrait")}>
              <DeviceRotateIcon className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            className={urlCopied ? "is-copied" : undefined}
            aria-label={urlCopied ? "Preview-URL kopiert" : "Preview-URL kopieren"}
            title={urlCopied ? "Kopiert" : "Tailscale-URL kopieren"}
            disabled={!url}
            onClick={() => {
              if (!url) return;
              void writeClipboardText(url).then(() => {
                setUrlCopied(true);
                window.setTimeout(() => setUrlCopied(false), 1_800);
              }).catch(() => setUrlCopied(false));
            }}
          >{urlCopied ? <CheckIcon className="preview-runtime-copy-icon h-4 w-4" /> : <CopyIcon className="preview-runtime-copy-icon h-4 w-4" />}</button>
          {url ? (
            // Der externe Tab bekommt seine eigene Session über die Live-Route;
            // die nackte Slot-URL hinge hätte keinen Lease-Mechanismus.
            <a href={projectId ? previewLiveWindowUrl({ projectId, port: targetPort, path, title }) : url} target="_blank" rel="noopener noreferrer" aria-label="Preview extern öffnen" title="Preview extern öffnen">
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
          ) : null}
          <button type="button" aria-label="Diagnose öffnen" title="Diagnose" aria-expanded={diagnosticsOpen} onClick={() => setDiagnosticsOpen((open) => !open)}>
            <ActivityIcon className="h-4 w-4" />
            {events.some((event) => event.severity === "error") ? <i className="preview-runtime-alert" aria-hidden /> : null}
          </button>
        </div>
      ) : null}

      {diagnosticsOpen ? (
        <PreviewDiagnosticsSheet
          events={events}
          dropped={dropped}
          bridgeStatus={bridgeStatus}
          session={session}
          storageState={storageState}
          storageConflict={storageConflict}
          slotId={assignmentRef.current?.slotId ?? null}
          targetPort={targetPort}
          device={resolvedDevice}
          onClose={() => setDiagnosticsOpen(false)}
          onToggleStorage={async (enabled) => {
            if (!storageProfileId) return;
            const next = await apiClient.setPreviewStorageEnabled(storageProfileId, enabled) ?? null;
            storageStateRef.current = next;
            setStorageState(next);
          }}
          onRestoreStorage={async (revision) => {
            if (!storageProfileId) return;
            const restored = await apiClient.restorePreviewStorage(storageProfileId, revision);
            if (!restored) return;
            const written = await bridge.restoreStorage(restored.entries);
            storageConflictBlockedRef.current = false;
            conflictedEntriesRef.current = null;
            setStorageConflict(written === null ? "Der Zustand konnte im iframe nicht geschrieben werden." : null);
            await loadStorageState();
          }}
          onKeepLocal={() => {
            const entries = conflictedEntriesRef.current;
            storageConflictBlockedRef.current = false;
            conflictedEntriesRef.current = null;
            setStorageConflict(null);
            if (entries) persistSnapshot(entries);
          }}
          onResetSlot={async () => {
            const slotId = assignmentRef.current?.slotId;
            if (!slotId || !session) return;
            const started = await apiClient.beginPreviewSlotReset(slotId, {
              expectedGeneration: session.slotGeneration,
              storageProfileId,
            });
            if (!started) return;
            const report = await runPreviewSlotReset(started.resetUrl, started.nonce);
            const verification = await apiClient.verifyPreviewSlotReset(slotId, report ?? {
              nonce: started.nonce,
              serviceWorkers: 0,
              cacheStorages: 0,
              localStorageKeys: 0,
              sessionStorageKeys: 0,
              indexedDatabases: 0,
              verifiable: false,
            });
            if (!report) {
              setError(verification?.message ?? "Der Reset konnte nicht verifiziert werden. Der Slot bleibt gesperrt.");
              return;
            }
            setError(verification?.state === "quarantined" ? verification.message : null);
            assignmentRef.current = null;
            setRetryKey((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}
