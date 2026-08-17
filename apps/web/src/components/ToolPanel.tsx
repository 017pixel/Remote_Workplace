import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, DeviceRotateIcon, ExternalLinkIcon, FullscreenIcon, RefreshIcon, RestoreIcon, WarningIcon } from "./icons";
import type { Panel, Project, ServiceMode } from "@workbench/contracts";
import { WORKBENCH_LIMITS } from "@workbench/contracts";
import { useWorkbenchNotice } from "../stores/workbenchNotice";
import { useWorkspaceStore } from "../stores/workspace";
import { StateDot } from "./primitives";
import { DevicePickerButton } from "./DevicePickerButton";
import { DevicePreviewFrame } from "./DevicePreviewFrame";
import type { DeviceOrientation, DevicePresetId } from "../config/devicePresets";
import { TerminalArea } from "./terminal/TerminalArea";
import { FileManagerPanel } from "./files/FileManagerPanel";
import { LocalPorts } from "./browser/LocalPorts";
import { BrowserPanel } from "./browser/BrowserPanel";
import { PreviewSlotFrame, relayCanvasPinch } from "./PreviewSlotFrame";
import { apiClient } from "../lib/apiClient";
import { ToolActionMenu } from "./ToolActionMenu";
import { normalizePreviewTarget } from "../lib/previewTargets";
import { useRouteActivity } from "../lib/routeActivity";
import { t3ThreadIdFromPath } from "../lib/t3Thread";
import { usePanelPresenceStore } from "../stores/panelPresence";

const HermesShell = lazy(() => import("./hermes/HermesShell").then((module) => ({ default: module.HermesShell })));

const panelTitles: Record<Panel["type"], string> = {
  "t3-code": "T3 Code",
  "code-server": "Editor",
  preview: "Preview",
  browser: "Browser",
  terminal: "Terminal",
  codex: "Codex",
  opencode: "OpenCode",
  files: "Files",
  notion: "Notion (Legacy)",
  hermes: "Hermes Agent",
};

interface ResolvedPanel {
  url: string | null;
  mode: ServiceMode;
  embed: boolean;
  proxyUrl: string | null;
  reason: string | null;
  targetPort: number | null;
  path: string;
}

export function projectBoundCodeServerUrl(baseUrl: string, projectPath: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("folder", projectPath);
  return url.toString();
}

export function projectBoundCodeServerProxyUrl(projectPath: string): string {
  return `/editor/?${new URLSearchParams({ folder: projectPath }).toString()}`;
}

function resolvePanel(panel: Panel, project: Project | undefined, codeServerMode: ServiceMode): ResolvedPanel | null {
  if (panel.type === "terminal" || panel.type === "codex" || panel.type === "opencode") {
    return { url: null, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: null, path: "/" };
  }
  if (panel.type === "browser") return { url: null, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: null, path: "/" };
  if (panel.type === "files") return { url: null, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: null, path: "/" };
  if (panel.type === "hermes") return { url: null, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: null, path: "/" };
  if (panel.type === "notion") return { url: null, mode: "external", embed: false, proxyUrl: null, reason: "Diese frühere Notion-Integration wird nicht mehr ausgeführt. Der Knoten bleibt erhalten, damit seine Position, Verbindungen und gespeicherten Inhalte nicht verloren gehen.", targetPort: null, path: "/" };
  if (panel.type === "preview" && !project) {
    return { url: null, mode: "embedded", embed: false, proxyUrl: null, reason: "Keine Preview ausgewählt.", targetPort: null, path: "/" };
  }
  if (!project) return null;
  if (panel.type === "t3-code") {
    const url = project.links.t3Code;
    return {
      url,
      mode: "hybrid",
      embed: url !== null,
      // Das gehostete T3-Web-UI (app.t3.codes) wird direkt eingebettet statt über
      // den /t3-Proxy: Dort sind mehrere Backends/Umgebungen verfügbar und der
      // Browser verbindet sich selbst mit jedem T3-Server (lokal und CHAPPiEs).
      // Die frühere Route-Bridge des Proxys (Thread-Presence, Deep-Links) greift
      // damit nicht mehr — bewusste Entscheidung für das Hosted-UI.
      proxyUrl: null,
      reason: url === null ? "T3 Code ist für dieses Projekt nicht verfügbar." : null,
      targetPort: null,
      path: "/",
    };
  }
  if (panel.type === "code-server") {
    const configuredUrl = project.links.codeServer;
    // Ein Zielordner aus dem T3-„Open"-Button übersteuert das Projektverzeichnis.
    const targetFolder = panel.codeServerFolder ?? project.path;
    const url = configuredUrl === null ? null : projectBoundCodeServerUrl(configuredUrl, targetFolder);
    const embed = configuredUrl !== null && (codeServerMode === "hybrid" || codeServerMode === "embedded");
    return {
      url,
      mode: codeServerMode,
      embed,
      proxyUrl: embed ? projectBoundCodeServerProxyUrl(targetFolder) : null,
      reason: configuredUrl === null ? "code-server ist auf dem Server nicht installiert." : null,
      targetPort: null,
      path: "/",
    };
  }
  const preview = project.previews.find((p) => p.id === panel.previewId);
  if (!preview) {
    return { url: null, mode: "external", embed: false, proxyUrl: null, reason: "Preview wurde nicht gefunden.", targetPort: null, path: "/" };
  }
  return {
    url: preview.url ?? (preview.targetPort ? `http://127.0.0.1:${preview.targetPort}${preview.path}` : null),
    mode: preview.mode,
    embed: preview.url !== null || preview.targetPort !== null,
    proxyUrl: null,
    reason: preview.url === null && preview.targetPort === null ? "Für diese Preview ist kein Ziel konfiguriert." : null,
    targetPort: preview.targetPort,
    path: preview.path,
  };
}

interface ToolPanelProps {
  panel: Panel;
  project: Project | undefined;
  isFocused: boolean;
  codeServerMode?: ServiceMode;
  onFocus?: () => void;
  standalone?: boolean;
  externalMaximized?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
  onReload?: () => void;
  onClose?: () => void;
  minimal?: boolean;
  terminalRenderScale?: number;
  actionPlacement?: "overlay" | "topbar" | "hidden";
}

export function ToolPanel({ panel, project, isFocused, codeServerMode = "external", onFocus, standalone = false, externalMaximized, onMaximizedChange, onReload, onClose, minimal = false, terminalRenderScale = 1, actionPlacement = "overlay" }: ToolPanelProps) {
  const openPanel = useWorkspaceStore((s) => s.openPanel);
  const reloadPanel = useWorkspaceStore((s) => s.reloadPanel);
  const closePanel = useWorkspaceStore((s) => s.closePanel);
  const maximizePanel = useWorkspaceStore((s) => s.maximizePanel);
  const restorePanels = useWorkspaceStore((s) => s.restorePanels);
  const maximizedPanelId = useWorkspaceStore((s) => s.maximizedPanelId);
  const routeActive = useRouteActivity();
  const [standaloneMaximized, setStandaloneMaximized] = useState(false);
  const [standaloneReloadKey, setStandaloneReloadKey] = useState(0);
  const [topbarTarget, setTopbarTarget] = useState<HTMLElement | null>(null);
  const isMaximized = externalMaximized ?? (standalone ? standaloneMaximized : maximizedPanelId === panel.id);
  const [deviceId, setDeviceId] = useState<DevicePresetId>("responsive");
  const [orientation, setOrientation] = useState<DeviceOrientation>("portrait");
  const [localPreview, setLocalPreview] = useState<ResolvedPanel | null>(null);
  const [previewPublicUrl, setPreviewPublicUrl] = useState<string | null>(null);
  const [previewSlotId, setPreviewSlotId] = useState<number | null>(() => {
    try {
      const raw = window.sessionStorage.getItem(`workbench:preview-slot:${panel.id}`);
      return raw ? Number(raw) : null;
    } catch { return null; }
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (panel.type !== "t3-code") return;
    // Die T3-Route-Bridge meldet Thread-Wechsel global per postMessage. Nur
    // Meldungen aus dem eigenen iframe zählen, damit mehrere T3-Panels ihre
    // Threads nicht vermischen (event.source-Vergleich).
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { source?: unknown; version?: unknown; type?: unknown; path?: unknown } | null;
      if (!data || data.version !== 1 || data.type !== "route.changed" || typeof data.path !== "string") return;
      usePanelPresenceStore.getState().setT3Thread(panel.id, t3ThreadIdFromPath(data.path));
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      usePanelPresenceStore.getState().clearPanel(panel.id);
    };
  }, [panel.id, panel.type]);

  useEffect(() => {
    if (panel.type !== "t3-code") return;
    const handleT3BrowserRequest = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type !== "remote-workplace:open-browser") return;
      const target = typeof data.url === "string" ? normalizePreviewTarget(data.url) : null;
      const browserUrl = target?.kind === "local"
        ? `http://127.0.0.1:${target.port}${target.path}`
        : target?.kind === "external" ? target.url : null;
      if (openPanel({
        type: "browser",
        projectId: panel.projectId,
        ...(browserUrl ? { browserUrl } : {}),
      }) === null) {
        useWorkbenchNotice.getState().show(`Es können höchstens ${WORKBENCH_LIMITS.maxResidentTools} Werkzeuge gleichzeitig geöffnet sein. Schließe zuerst ein Panel.`);
      }
    };
    window.addEventListener("message", handleT3BrowserRequest);
    return () => window.removeEventListener("message", handleT3BrowserRequest);
  }, [openPanel, panel.id, panel.projectId, panel.type]);

  useEffect(() => {
    if (panel.type !== "t3-code") return;
    // Der T3-„Open in VS Code"-Button öffnet seinen Zielordner statt einer
    // toten vscode://-Navigation im code-server der Workbench: eingebettet als
    // neuer Editor-Bereich, auf der eigenständigen Werkzeugseite als Sprung.
    const handleT3EditorRequest = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; folder?: unknown } | null;
      if (data?.type !== "remote-workplace:open-editor") return;
      const folder = typeof data.folder === "string" && data.folder.length > 0 ? data.folder : null;
      if (standalone) {
        const params = new URLSearchParams(folder ? { folder } : {});
        window.location.assign(`/code-editor/?${params.toString()}`);
        return;
      }
      if (openPanel({
        type: "code-server",
        projectId: panel.projectId,
        ...(folder ? { codeServerFolder: folder } : {}),
      }) === null) {
        useWorkbenchNotice.getState().show(`Es können höchstens ${WORKBENCH_LIMITS.maxResidentTools} Werkzeuge gleichzeitig geöffnet sein. Schließe zuerst ein Panel.`);
      }
    };
    window.addEventListener("message", handleT3EditorRequest);
    return () => window.removeEventListener("message", handleT3EditorRequest);
  }, [openPanel, panel.id, panel.projectId, panel.type, standalone]);

  useEffect(() => {
    if (panel.type !== "preview" || localPreview) return;
    const queryPort = standalone ? Number(new URLSearchParams(window.location.search).get("port")) : NaN;
    let storedPort = NaN;
    try { storedPort = Number(window.sessionStorage.getItem(`workbench:preview-target:${panel.id}`)); } catch { /* session storage may be unavailable */ }
    const port = Number.isInteger(queryPort) && queryPort > 0 ? queryPort : storedPort;
    if (Number.isInteger(port) && port > 0 && port <= 65_535) {
      setLocalPreview({ url: `http://127.0.0.1:${port}/`, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: port, path: "/" });
    }
  }, [localPreview, panel.id, panel.type, standalone]);

  const configuredPanel = resolvePanel(panel, project, codeServerMode);
  const resolved = panel.type === "preview" && localPreview ? localPreview : configuredPanel;

  const [loaded, setLoaded] = useState(false);
  const effectiveReloadKey = panel.reloadKey + standaloneReloadKey;
  const panelSource = panel.type === "t3-code"
    ? `${resolved?.proxyUrl ?? resolved?.url ?? ""}${panel.t3Path ?? ""}`
    : resolved?.proxyUrl ?? resolved?.url ?? "";
  useEffect(() => {
    setLoaded(false);
  }, [effectiveReloadKey, panelSource]);

  useEffect(() => {
    if (actionPlacement !== "topbar" || !routeActive) { setTopbarTarget(null); return; }
    setTopbarTarget(document.getElementById("topbar-tool-actions"));
  }, [actionPlacement, routeActive]);

  useEffect(() => {
    if (!isMaximized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (onMaximizedChange) onMaximizedChange(false);
        else if (standalone) setStandaloneMaximized(false);
        else restorePanels();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("has-maximized-tool");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("has-maximized-tool");
    };
  }, [isMaximized, onMaximizedChange, restorePanels, standalone]);

  const showAvailabilityWarning =
    !minimal && project && project.availability !== "available" && resolved?.reason === null;
  const showPreviewStart = panel.type === "preview" && !localPreview && (configuredPanel === null || configuredPanel.reason !== null);
  const reload = () => {
    if (onReload) onReload();
    else if (standalone) setStandaloneReloadKey((key) => key + 1);
    else reloadPanel(panel.id);
  };
  const close = () => {
    if (panel.type === "preview" && previewSlotId !== null) {
      void apiClient.assignPreviewSlot({
        slotId: previewSlotId,
        targetPort: null,
        isolate: true,
        ...(resolved?.targetPort ? { expectedTargetPort: resolved.targetPort } : {}),
      });
      try {
        window.sessionStorage.removeItem(`workbench:preview-slot:${panel.id}`);
        window.sessionStorage.removeItem(`workbench:preview-target:${panel.id}`);
      } catch {
        // Der Server gibt den Slot trotzdem frei.
      }
    }
    if (onClose) onClose();
    else closePanel(panel.id);
  };
  const panelActions = resolved !== null && !minimal && actionPlacement !== "hidden" && standalone ? (
    <>
      {isMaximized ? (
        <button
          type="button"
          title="Wiederherstellen"
          aria-label="Wiederherstellen"
          onClick={() => onMaximizedChange ? onMaximizedChange(false) : setStandaloneMaximized(false)}
          className="icon-button"
        ><RestoreIcon className="h-4 w-4" /></button>
      ) : null}
      <ToolActionMenu
        className={actionPlacement === "topbar" ? "is-topbar" : ""}
        externalHref={resolved.proxyUrl ?? resolved.url ?? window.location.href}
        isFullscreen={isMaximized}
        onFullscreen={() => onMaximizedChange ? onMaximizedChange(!isMaximized) : standalone ? setStandaloneMaximized(!isMaximized) : restorePanels()}
        onReload={reload}
      />
    </>
  ) : resolved !== null && !minimal && actionPlacement !== "hidden" ? (
    <div className={`panel-island ${actionPlacement === "topbar" && !isMaximized ? "is-topbar" : ""} ${actionPlacement === "topbar" && panel.type === "code-server" ? "is-flat-toolbar" : ""} ${isMaximized ? "is-maximized-actions" : ""}`}>
      {panel.type === "preview" ? <DevicePickerButton deviceId={deviceId} onChange={setDeviceId} /> : null}
      {panel.type === "preview" && deviceId !== "responsive" ? <button type="button" title="Ausrichtung drehen" aria-label="Ausrichtung drehen" onClick={() => setOrientation((current) => current === "portrait" ? "landscape" : "portrait")} className="icon-button"><DeviceRotateIcon className="h-4 w-4" /></button> : null}
      {panel.type === "preview" && resolved?.targetPort ? <span className="preview-slot-badge">{previewSlotId ? `SLOT ${previewSlotId}` : "SLOT"}</span> : null}
      {resolved.url ? <button type="button" title="Neu laden" aria-label="Neu laden" onClick={reload} className="icon-button"><RefreshIcon className="h-4 w-4" /></button> : null}
      {resolved.url ? <a href={previewPublicUrl ?? resolved.proxyUrl ?? resolved.url} target="_blank" rel="noopener noreferrer" title="In neuem Tab öffnen" aria-label="In neuem Tab öffnen" className="icon-button"><ExternalLinkIcon className="h-4 w-4" /></a> : null}
      {isMaximized ? <button type="button" title="Wiederherstellen" aria-label="Wiederherstellen" onClick={() => onMaximizedChange ? onMaximizedChange(false) : standalone ? setStandaloneMaximized(false) : restorePanels()} className="icon-button"><RestoreIcon className="h-4 w-4" /></button> : <button type="button" title="Vollbild" aria-label="Vollbild" onClick={() => onMaximizedChange ? onMaximizedChange(true) : standalone ? setStandaloneMaximized(true) : maximizePanel(panel.id)} className="icon-button"><FullscreenIcon className="h-4 w-4" /></button>}
      {!standalone ? <button type="button" title="Schließen" aria-label="Schließen" onClick={close} className="icon-button danger"><CloseIcon className="h-4 w-4" /></button> : null}
    </div>
  ) : null;

  return (
    <section
      data-panel-type={panel.type}
      className={`tool-surface group flex h-full min-h-0 flex-col ${standalone ? "tool-surface-standalone" : ""} ${isMaximized ? "tool-surface-maximized" : ""} ${
        isFocused ? "border-ink-600" : "border-line"
      }`}
      onPointerDown={(event) => {
        // Eingebettete Werkzeuge, insbesondere T3 Code, gehören zur Knoten-
        // Oberfläche. Ihre Pointer-Gesten dürfen nicht als Canvas-Pan starten.
        event.stopPropagation();
        onFocus?.();
      }}
      onWheel={(event) => event.stopPropagation()}
    >
      {!minimal && !standalone ? <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-ink-900 px-3">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded ${
            isFocused ? "bg-ink-800 text-text" : "text-muted"
          }`}
          aria-hidden
        >
          <StateDot state={["terminal", "codex", "opencode", "browser", "files", "hermes"].includes(panel.type) || resolved?.url ? "active" : "inactive"} />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-medium text-text">
            {panelTitles[panel.type]}
            {project ? <span className="text-muted"> · {project.name}</span> : null}
          </div>
        </div>
      </header> : null}

      {panelActions ? actionPlacement === "topbar"
        ? routeActive && topbarTarget ? createPortal(panelActions, topbarTarget) : null
        : panelActions : null}

      {showAvailabilityWarning ? (
        <div className="flex items-center gap-2 border-b border-warn/20 bg-warn-soft/50 px-3 py-1.5 text-[12px] text-warn">
          <WarningIcon className="h-3.5 w-3.5 shrink-0" />
          Projekt-Verfügbarkeit: {project!.availability}. Aktionen könnten fehlschlagen.
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-ink-950">
        {panel.type === "files" ? (
          <FileManagerPanel minimal={minimal} />
        ) : panel.type === "browser" ? (
          <BrowserPanel
            instanceId={panel.id}
            requestKey={panel.reloadKey}
            {...(panel.browserUrl ? { initialUrl: panel.browserUrl } : {})}
          />
        ) : panel.type === "preview" && resolved?.targetPort ? (
          <PreviewSlotFrame
            targetPort={resolved.targetPort}
            path={resolved.path}
            requestedSlotId={previewSlotId}
            previewNodeId={`panel:${panel.id}`}
            deviceId={deviceId}
            orientation={orientation}
            reloadKey={effectiveReloadKey}
            showControls
            title={`${project?.name ?? "Lokale"} Preview`}
            onSlotAssigned={(slotId, url) => {
              setPreviewSlotId(slotId);
              setPreviewPublicUrl(url);
              try { window.sessionStorage.setItem(`workbench:preview-slot:${panel.id}`, String(slotId)); } catch { /* Session remains server-side. */ }
            }}
            {...(onFocus ? { onFocus } : {})}
          />
        ) : panel.type === "terminal" || panel.type === "codex" || panel.type === "opencode" ? (
          <div className="flex h-full min-h-0">
            <TerminalArea
              areaId={panel.id}
              initialProjectId={panel.projectId}
              kind={panel.type === "terminal" ? "shell" : panel.type}
              renderScale={terminalRenderScale}
              maxTabs={1}
              minimal={minimal}
            />
          </div>
        ) : panel.type === "hermes" ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted">Hermes wird geladen…</div>}>
            <HermesShell variant="panel" minimal={minimal} panel={panel} active={routeActive && isFocused} />
          </Suspense>
        ) : showPreviewStart ? (
          <LocalPorts projectId={project?.id ?? null} projectName={project?.name ?? "dieses Projekt"} allowAllPorts onOpen={(port) => {
            if (!port.localUrl) return;
            setLocalPreview({ url: port.localUrl, mode: "embedded", embed: true, proxyUrl: port.proxyUrl, reason: null, targetPort: port.port, path: "/" });
          }} />
        ) : resolved === null ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-faint">
            Projektdaten werden geladen…
          </div>
        ) : resolved.reason ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <WarningIcon className="h-6 w-6 text-warn" />
            <p className="text-sm text-muted">{resolved.reason}</p>
          </div>
        ) : resolved.embed && resolved.url ? (
          <>
            {!loaded ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-950 text-sm text-muted">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-600 border-t-accent" />
              </div>
            ) : null}
            <DevicePreviewFrame
              deviceId={panel.type === "preview" ? deviceId : "responsive"}
              orientation={orientation}
            >
              <iframe
                key={effectiveReloadKey}
                ref={iframeRef}
                src={panelSource}
                title={panelTitles[panel.type]}
                onLoad={(event) => { setLoaded(true); relayCanvasPinch(event.currentTarget); }}
                onPointerDown={(event) => {
                  event.currentTarget.focus();
                  event.currentTarget.contentWindow?.focus();
                }}
                onContextMenu={(event) => event.preventDefault()}
                className="h-full w-full border-0 bg-white"
                allowFullScreen
                referrerPolicy="same-origin"
                {...(panel.type === "t3-code" ? { allow: "local-network" } : {})}
              />
            </DevicePreviewFrame>
          </>
        ) : resolved.url ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <ExternalLinkIcon className="h-6 w-6 text-muted" />
            <p className="max-w-xs text-sm text-muted">
              Dieses Werkzeug kann nicht eingebettet werden.
            </p>
            <a
              href={resolved.url}
              target="_blank"
              rel="noopener noreferrer"
              className="quiet-button-primary"
            >
              Extern öffnen
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
