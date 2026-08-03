import { ArrowLeftIcon, ArrowRightIcon, BracesIcon, BrowserIcon, CameraIcon, CloseIcon, DevtoolsIcon, ExternalLinkIcon, HandIcon, LoaderIcon, MoreIcon, PlusIcon, PointerIcon, RefreshIcon, SearchIcon } from "../icons";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LocalPort } from "@workbench/contracts";
import { LocalPorts } from "./LocalPorts";
import { browserClipboardAction, utf8ByteLength, writeClipboardText } from "../../lib/clipboard";
import { normalizePreviewTarget } from "../../lib/previewTargets";
import { useMenuFocus } from "../../lib/useMenuFocus";
import { useModalFocus } from "../../lib/useModalFocus";

export interface ChromiumBrowserState {
  url: string;
  title: string;
  loading: boolean;
}

type BrowserStatus = "connecting" | "ready" | "disconnected" | "error";
type ServerMessage =
  | { type: "browser.ready"; sessionId: string; url: string; title: string; width: number; height: number }
  | { type: "browser.state"; sessionId: string; url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean }
  | { type: "browser.frame"; sessionId: string; data: string; width: number; height: number }
  | { type: "browser.screenshot"; sessionId: string; data: string }
  | { type: "browser.source"; sessionId: string; source: string; url: string }
  | { type: "browser.clipboard"; sessionId: string; requestId: string; text: string | null; error: string | null }
  | { type: "browser.closed"; sessionId: string }
  | { type: "browser.error"; sessionId?: string; code: string; message: string }
  | { type: "browser.pong" };

function websocketUrl(): string {
  const url = new URL("/api/v1/browser", window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function createUuid(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`; }
}

function normalizeAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "about:blank") return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed)) return `http://${trimmed}`;
  if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function readSession(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

function storeSession(key: string, value: string | null) {
  try { if (value) window.sessionStorage.setItem(key, value); else window.sessionStorage.removeItem(key); } catch { /* Browser remains usable without session storage. */ }
}

const browserClipboardMaximumBytes = 1_048_576;
type ClipboardRequestPurpose = "copy" | "sync";

function BrowserSourceDialog({ sourceView, onClose }: {
  sourceView: { source: string; url: string } | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef, sourceView !== null, onClose);
  if (!sourceView) return null;
  return <div ref={dialogRef} className="browser-source-backdrop" role="dialog" aria-modal="true" aria-label="Seitenquelltext" tabIndex={-1}>
    <section><header><div><span>Seitenquelltext</span><strong>{sourceView.url}</strong></div><button type="button" onClick={onClose} aria-label="Seitenquelltext schließen"><CloseIcon className="h-4 w-4" /></button></header><pre>{sourceView.source}</pre></section>
  </div>;
}

export function ChromiumBrowser({
  instanceId,
  profileKey,
  initialUrl,
  active = true,
  onLocalAddress,
  onStateChange,
  extraToolbarActions,
}: {
  instanceId: string;
  profileKey?: string;
  initialUrl?: string;
  active?: boolean;
  /** Ziel löst sich zu einem lokalen Port auf: Aufrufer übernimmt (z. B. schnelle iframe-Vorschau statt Chromium-Stream). */
  onLocalAddress?: (value: string) => void;
  onStateChange?: (state: ChromiumBrowserState) => void;
  extraToolbarActions?: ReactNode;
}) {
  const storageKey = `workbench-browser-session:${instanceId}`;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contextMenuElementRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const controllerIdRef = useRef(createUuid());
  const controllerChannelRef = useRef<BroadcastChannel | null>(null);
  const activeControllerRef = useRef(true);
  const activeRef = useRef(active);
  const sessionRef = useRef<string | null>(readSession(storageKey));
  const disposedRef = useRef(false);
  const reconnectRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const resizeRef = useRef<number | null>(null);
  const pendingUrlRef = useRef<string | null>(null);
  const initialNavigationRef = useRef<string | null>(initialUrl ?? null);
  const requestedUrlRef = useRef<string | null>(null);
  const addressEditingRef = useRef(false);
  const touchScrollRef = useRef<{ x: number; y: number } | null>(null);
  const clipboardSelectionRef = useRef("");
  const latestSelectionRequestRef = useRef<string | null>(null);
  const activeCopyRequestRef = useRef<string | null>(null);
  const clipboardRequestsRef = useRef(new Map<string, { purpose: ClipboardRequestPurpose; timeout: number }>());
  const fatalConnectionRef = useRef(false);
  const retriesRef = useRef(0);
  const frameTimeoutRef = useRef<number | null>(null);
  const frameRenderRef = useRef<number | null>(null);
  const [status, setStatus] = useState<BrowserStatus>(initialUrl || sessionRef.current ? "connecting" : "disconnected");
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [state, setState] = useState({ url: "about:blank", title: "Neuer Tab", loading: false, canGoBack: false, canGoForward: false });
  const [frameReady, setFrameReady] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const pressedPointerRef = useRef<{ x: number; y: number; button: "left" | "middle" | "right" | "none" } | null>(null);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [devtoolsSessionId, setDevtoolsSessionId] = useState<string | null>(null);
  const [sourceView, setSourceView] = useState<{ source: string; url: string } | null>(null);
  const [touchMode, setTouchMode] = useState<"interact" | "scroll">("scroll");
  const [clipboardStatus, setClipboardStatus] = useState("");
  const lastFrameRef = useRef<{ data: string; width: number; height: number } | null>(null);
  useMenuFocus(contextMenuElementRef, contextMenu !== null, () => setContextMenu(null));
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const renderLatestFrame = useCallback(() => {
    if (!activeRef.current || frameRenderRef.current !== null) return;
    frameRenderRef.current = window.setTimeout(() => {
      frameRenderRef.current = null;
      const latest = lastFrameRef.current;
      if (!activeRef.current || !latest) return;
      if (imageRef.current) imageRef.current.src = `data:image/jpeg;base64,${latest.data}`;
      setFrameReady(true);
    }, 16);
  }, []);

  useEffect(() => {
    const updateActivity = () => {
      activeRef.current = active && globalThis.document.visibilityState !== "hidden";
      if (activeRef.current) renderLatestFrame();
    };
    updateActivity();
    globalThis.document.addEventListener("visibilitychange", updateActivity);
    return () => globalThis.document.removeEventListener("visibilitychange", updateActivity);
  }, [active, renderLatestFrame]);

  useEffect(() => {
    onStateChangeRef.current?.(state);
  }, [state]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`workbench-browser-control:${profileKey ?? instanceId}`);
    controllerChannelRef.current = channel;
    channel.onmessage = (event) => {
      if ((event.data as { controllerId?: string } | null)?.controllerId !== controllerIdRef.current) activeControllerRef.current = false;
    };
    channel.postMessage({ controllerId: controllerIdRef.current });
    return () => { channel.close(); controllerChannelRef.current = null; };
  }, [instanceId, profileKey]);

  const claimControl = useCallback(() => {
    activeControllerRef.current = true;
    controllerChannelRef.current?.postMessage({ controllerId: controllerIdRef.current });
    const sessionId = sessionRef.current;
    const viewport = viewportRef.current;
    if (sessionId && viewport && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "browser.resize", sessionId, width: Math.max(320, Math.min(2_400, Math.round(viewport.clientWidth))), height: Math.max(220, Math.min(1_600, Math.round(viewport.clientHeight))) }));
    }
  }, []);

  const send = useCallback((message: object) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    const type = (message as { type?: string }).type ?? "";
    if (["browser.resize", "browser.pointer", "browser.wheel", "browser.key", "browser.text"].includes(type) && !activeControllerRef.current) return false;
    socketRef.current.send(JSON.stringify(message));
    return true;
  }, []);

  const startFrameTimeout = useCallback(() => {
    if (frameTimeoutRef.current) window.clearTimeout(frameTimeoutRef.current);
    frameTimeoutRef.current = window.setTimeout(() => {
      if (!disposedRef.current) {
        setError("Der Browser braucht zu lange zum Laden. Bitte erneut versuchen.");
      }
    }, 15_000);
  }, []);

  const clearFrameTimeout = useCallback(() => {
    if (frameTimeoutRef.current) window.clearTimeout(frameTimeoutRef.current);
    frameTimeoutRef.current = null;
  }, []);

  const requestSelection = useCallback((purpose: ClipboardRequestPurpose) => {
    const sessionId = sessionRef.current;
    if (!sessionId || state.url === "about:blank") return false;
    const requestId = `${purpose}:${createUuid()}`;
    const timeout = window.setTimeout(() => {
      clipboardRequestsRef.current.delete(requestId);
      if (activeCopyRequestRef.current === requestId) {
        activeCopyRequestRef.current = null;
        setClipboardStatus("Kopieren hat zu lange gedauert. Bitte erneut versuchen.");
      }
    }, 3_000);
    clipboardRequestsRef.current.set(requestId, { purpose, timeout });
    latestSelectionRequestRef.current = requestId;
    if (purpose === "copy") activeCopyRequestRef.current = requestId;
    if (send({ type: "browser.copy", sessionId, requestId })) return true;
    window.clearTimeout(timeout);
    clipboardRequestsRef.current.delete(requestId);
    if (purpose === "copy") setClipboardStatus("Browser ist noch nicht verbunden.");
    return false;
  }, [send, state.url]);

  const dimensions = useCallback(() => {
    const viewport = viewportRef.current;
    return {
      width: Math.max(320, Math.min(2_400, Math.round(viewport?.clientWidth ?? 1_280))),
      height: Math.max(220, Math.min(1_600, Math.round(viewport?.clientHeight ?? 720))),
    };
  }, []);

  const createOrAttach = useCallback(() => {
    const size = dimensions();
    if (sessionRef.current) send({ type: "browser.attach", sessionId: sessionRef.current, ...size });
    else send({ type: "browser.create", requestId: createUuid(), instanceId, ...(profileKey ? { profileKey } : {}), ...(initialUrl ? { initialUrl } : {}), ...size });
  }, [dimensions, initialUrl, instanceId, profileKey, send]);

  const connect = useCallback(() => {
    if (disposedRef.current || fatalConnectionRef.current || socketRef.current?.readyState === WebSocket.CONNECTING || socketRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");
    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
      socket.onopen = () => {
      if (!activeRef.current) {
        socket.close();
        return;
      }
      retriesRef.current = 0;
      setError(null);
      createOrAttach();
      heartbeatRef.current = window.setInterval(() => { if (activeRef.current) send({ type: "browser.ping" }); }, 25_000);
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      if (message.type === "browser.ready") {
        sessionRef.current = message.sessionId;
        storeSession(storageKey, message.sessionId);
        setDevtoolsSessionId(message.sessionId);
        setStatus("ready");
        setState((current) => ({ ...current, url: message.url, title: message.title }));
        const pendingUrl = pendingUrlRef.current ?? initialNavigationRef.current;
        if (pendingUrl) {
          pendingUrlRef.current = null;
          initialNavigationRef.current = null;
          requestedUrlRef.current = pendingUrl;
          setAddress(pendingUrl === "about:blank" ? "" : pendingUrl);
          setFrameReady(false);
          startFrameTimeout();
          if (message.url !== pendingUrl) send({ type: "browser.navigate", sessionId: message.sessionId, url: pendingUrl });
        } else {
          if (!addressEditingRef.current) setAddress(message.url === "about:blank" ? "" : message.url);
          if (message.url !== "about:blank") startFrameTimeout();
        }
      } else if (message.type === "browser.state") {
        setStatus("ready");
        setState({ url: message.url, title: message.title, loading: message.loading, canGoBack: message.canGoBack, canGoForward: message.canGoForward });
        if (message.loading) startFrameTimeout();
        const requestedUrl = requestedUrlRef.current;
        const staleBlankState = requestedUrl !== null && requestedUrl !== "about:blank" && message.url === "about:blank";
        if (!staleBlankState && !addressEditingRef.current) {
          setAddress(message.url === "about:blank" ? "" : message.url);
          if (message.url === requestedUrl || !message.loading) requestedUrlRef.current = null;
        }
      } else if (message.type === "browser.frame") {
        if (!activeRef.current) return;
        clearFrameTimeout();
        lastFrameRef.current = { data: message.data, width: message.width, height: message.height };
        renderLatestFrame();
      } else if (message.type === "browser.screenshot") {
        const bytes = Uint8Array.from(atob(message.data), (character) => character.charCodeAt(0));
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        link.download = `workbench-browser-${new Date().toISOString().replaceAll(":", "-")}.png`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
      } else if (message.type === "browser.source") {
        setSourceView({ source: message.source, url: message.url });
      } else if (message.type === "browser.clipboard") {
        const pending = clipboardRequestsRef.current.get(message.requestId);
        if (!pending) return;
        window.clearTimeout(pending.timeout);
        clipboardRequestsRef.current.delete(message.requestId);
        const latest = latestSelectionRequestRef.current === message.requestId;
        if (latest) clipboardSelectionRef.current = message.text ?? "";
        if (pending.purpose !== "copy" || activeCopyRequestRef.current !== message.requestId) return;
        activeCopyRequestRef.current = null;
        if (message.error || message.text === null) {
          setClipboardStatus(message.error ?? "Die Browserauswahl konnte nicht kopiert werden.");
          return;
        }
        void writeClipboardText(message.text)
          .then(() => setClipboardStatus("Browserauswahl kopiert."))
          .catch((copyError) => setClipboardStatus(copyError instanceof Error ? copyError.message : "Kopieren wurde vom Browser nicht erlaubt."));
      } else if (message.type === "browser.closed") {
        for (const pending of clipboardRequestsRef.current.values()) window.clearTimeout(pending.timeout);
        clipboardRequestsRef.current.clear();
        activeCopyRequestRef.current = null;
        latestSelectionRequestRef.current = null;
        clipboardSelectionRef.current = "";
        sessionRef.current = null;
        storeSession(storageKey, null);
        setDevtoolsSessionId(null);
        clearFrameTimeout();
        setStatus("disconnected");
        socketRef.current?.close();
      } else if (message.type === "browser.error") {
        if (message.code === "SESSION_NOT_FOUND") {
          sessionRef.current = null;
          storeSession(storageKey, null);
          setDevtoolsSessionId(null);
          createOrAttach();
          return;
        }
        if (message.code === "UNAUTHORIZED" || message.code === "FORBIDDEN" || message.code === "TOO_MANY_SESSIONS" || message.code === "BROWSER_START_FAILED") fatalConnectionRef.current = true;
        clearFrameTimeout();
        setStatus("error");
        setError(message.message);
      }
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
        socketRef.current = null;
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      for (const pending of clipboardRequestsRef.current.values()) window.clearTimeout(pending.timeout);
      clipboardRequestsRef.current.clear();
      activeCopyRequestRef.current = null;
      latestSelectionRequestRef.current = null;
      clipboardSelectionRef.current = "";
      if (disposedRef.current || fatalConnectionRef.current || !activeRef.current) return;
      setStatus("disconnected");
      reconnectRef.current = window.setTimeout(connect, Math.min(10_000, 500 * (2 ** retriesRef.current++)));
    };
    socket.onerror = () => socket.close();
  }, [clearFrameTimeout, createOrAttach, renderLatestFrame, send, startFrameTimeout, storageKey]);

  useEffect(() => {
    activeRef.current = active && globalThis.document.visibilityState !== "hidden";
    if (activeRef.current) {
      if (!socketRef.current && (initialUrl || sessionRef.current)) connect();
    } else {
      socketRef.current?.close();
    }
    const updateVisibility = () => {
      activeRef.current = active && globalThis.document.visibilityState !== "hidden";
      if (activeRef.current) {
        if (!socketRef.current && (initialUrl || sessionRef.current)) connect();
      } else {
        socketRef.current?.close();
      }
    };
    globalThis.document.addEventListener("visibilitychange", updateVisibility);
    return () => globalThis.document.removeEventListener("visibilitychange", updateVisibility);
  }, [active, connect, initialUrl]);

  useEffect(() => {
    disposedRef.current = false;
    const clipboardRequests = clipboardRequestsRef.current;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      resizeRef.current = window.setTimeout(() => {
        if (!activeRef.current) return;
        const sessionId = sessionRef.current;
        if (sessionId) send({ type: "browser.resize", sessionId, ...dimensions() });
      }, 60);
    });
    observer.observe(viewport);
    // Kein Chromium-Prozess für den bloßen Blank-Zustand: Erst ein bekanntes
    // Ziel (initialUrl) oder eine wiederaufnehmbare Session rechtfertigt die
    // Verbindung. Freie Navigation stößt sie in navigate() selbst an.
    if (activeRef.current && (initialUrl || sessionRef.current)) connect();
    return () => {
      disposedRef.current = true;
      observer.disconnect();
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      if (frameRenderRef.current) window.clearTimeout(frameRenderRef.current);
      frameRenderRef.current = null;
      clearFrameTimeout();
      for (const pending of clipboardRequests.values()) window.clearTimeout(pending.timeout);
      clipboardRequests.clear();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clearFrameTimeout, connect, dimensions, initialUrl, send]);

  const navigate = (value?: string) => {
    claimControl();
    const requestedAddress = value ?? addressRef.current?.value ?? address;
    const trimmed = requestedAddress.trim();
    if (!trimmed) return;
    if (onLocalAddress && trimmed !== "about:blank" && normalizePreviewTarget(trimmed)?.kind === "local") {
      onLocalAddress(trimmed);
      return;
    }
    const url = normalizeAddress(requestedAddress);
    clipboardSelectionRef.current = "";
    setClipboardStatus("");
    if (url === "about:blank" && !sessionRef.current) {
      // Ohne laufende Session reicht ein lokaler Reset auf den Blank-Zustand –
      // dafür braucht es keinen Chromium-Prozess.
      requestedUrlRef.current = null;
      pendingUrlRef.current = null;
      setAddress("");
      setFrameReady(false);
      setError(null);
      setStatus("disconnected");
      setState((current) => ({ ...current, url: "about:blank", loading: false, canGoBack: false, canGoForward: false }));
      return;
    }
    requestedUrlRef.current = url;
    setAddress(url);
    setFrameReady(false);
    startFrameTimeout();
    const sessionId = sessionRef.current;
    if (!sessionId) {
      pendingUrlRef.current = url;
      if (!socketRef.current || socketRef.current.readyState === WebSocket.CLOSED) connect();
      return;
    }
    send({ type: "browser.navigate", sessionId, url });
  };
  const simpleAction = (type: "browser.back" | "browser.forward" | "browser.reload") => {
    claimControl();
    const sessionId = sessionRef.current;
    if (sessionId) send({ type, sessionId });
  };
  const localPort = (port: LocalPort) => {
    if (!port.localUrl) return;
    if (onLocalAddress) onLocalAddress(port.localUrl);
    else navigate(port.localUrl);
  };

  const pointFor = (clientX: number, clientY: number) => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const size = dimensions();
    const scale = Math.min(bounds.width / size.width, bounds.height / size.height);
    const left = bounds.left + (bounds.width - size.width * scale) / 2;
    const top = bounds.top + (bounds.height - size.height * scale) / 2;
    return { x: Math.max(0, Math.min(size.width, (clientX - left) / scale)), y: Math.max(0, Math.min(size.height, (clientY - top) / scale)) };
  };
  const pointer = (action: "move" | "down" | "up", event: React.PointerEvent) => {
    const sessionId = sessionRef.current;
    const point = pointFor(event.clientX, event.clientY);
    if (!sessionId || !point || state.url === "about:blank") return;
    if (touchMode === "scroll" && event.pointerType !== "mouse") {
      if (action === "down") {
        touchScrollRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        (event.currentTarget as HTMLElement).focus();
      } else if (action === "move" && touchScrollRef.current) {
        send({ type: "browser.wheel", sessionId, ...point, deltaX: touchScrollRef.current.x - event.clientX, deltaY: touchScrollRef.current.y - event.clientY });
        touchScrollRef.current = { x: event.clientX, y: event.clientY };
      } else if (action === "up") touchScrollRef.current = null;
      return;
    }
    if (action === "down") {
      clipboardSelectionRef.current = "";
      event.currentTarget.setPointerCapture(event.pointerId);
      (event.currentTarget as HTMLElement).focus();
    }
    const button = event.button === 1 ? "middle" : event.button === 2 ? "right" : event.button === 0 ? "left" : "none";
    if (action === "down") pressedPointerRef.current = { ...point, button };
    send({ type: "browser.pointer", sessionId, action, ...point, button, buttons: event.buttons });
    if (action === "up") pressedPointerRef.current = null;
    if (action === "up" && event.button === 0) window.setTimeout(() => requestSelection("sync"), 30);
  };
  const cancelPointer = () => {
    touchScrollRef.current = null;
    const sessionId = sessionRef.current;
    const pressed = pressedPointerRef.current;
    pressedPointerRef.current = null;
    if (sessionId && pressed) send({ type: "browser.pointer", sessionId, action: "up", ...pressed, buttons: 0 });
  };
  useEffect(() => () => {
    touchScrollRef.current = null;
    const sessionId = sessionRef.current;
    const pressed = pressedPointerRef.current;
    pressedPointerRef.current = null;
    if (sessionId && pressed) send({ type: "browser.pointer", sessionId, action: "up", ...pressed, buttons: 0 });
  }, [send]);
  const wheel = (event: React.WheelEvent) => {
    claimControl();
    if (event.ctrlKey) { event.preventDefault(); return; }
    const sessionId = sessionRef.current;
    const point = pointFor(event.clientX, event.clientY);
    if (!sessionId || !point || state.url === "about:blank") return;
    event.preventDefault();
    send({ type: "browser.wheel", sessionId, ...point, deltaX: event.deltaX, deltaY: event.deltaY });
  };

  const openBrowserMenu = (event: React.MouseEvent | React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setContextMenu({
      x: Math.max(0, Math.min(bounds.width - 222, Math.max(8, event.clientX - bounds.left))),
      y: Math.max(0, Math.min(bounds.height - 270, Math.max(8, event.clientY - bounds.top))),
    });
  };

  const sessionAction = (type: "browser.screenshot" | "browser.source") => {
    const sessionId = sessionRef.current;
    if (sessionId) send({ type, sessionId });
    setContextMenu(null);
  };

  const devtoolsUrl = devtoolsSessionId
    ? `/workbench/devtools/inspector.html?ws=${encodeURIComponent(`${window.location.host}/api/v1/browser/devtools/${devtoolsSessionId}`)}`
    : null;
  const key = (event: React.KeyboardEvent) => {
    claimControl();
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const viewport = viewportRef.current;
      setContextMenu(viewport ? {
        x: Math.max(8, Math.min(viewport.clientWidth - 222, viewport.clientWidth / 2 - 111)),
        y: Math.max(8, Math.min(viewport.clientHeight - 270, viewport.clientHeight / 2 - 135)),
      } : { x: 8, y: 8 });
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") { event.preventDefault(); addressRef.current?.focus(); addressRef.current?.select(); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") { event.preventDefault(); simpleAction("browser.reload"); return; }
    const sessionId = sessionRef.current;
    if (!sessionId || state.url === "about:blank") return;
    const clipboardAction = browserClipboardAction(event);
    if (clipboardAction === "paste") return;
    if (clipboardAction === "copy") {
      event.preventDefault();
      event.stopPropagation();
      const selection = clipboardSelectionRef.current;
      if (selection) {
        void writeClipboardText(selection)
          .then(() => setClipboardStatus("Browserauswahl kopiert."))
          .catch((copyError) => setClipboardStatus(copyError instanceof Error ? copyError.message : "Kopieren wurde vom Browser nicht erlaubt."));
      } else {
        setClipboardStatus("Browserauswahl wird gelesen…");
        requestSelection("copy");
      }
      return;
    }
    const changesSelection = event.shiftKey || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a");
    if (changesSelection) clipboardSelectionRef.current = "";
    event.preventDefault();
    event.stopPropagation();
    const modifiers = [event.altKey ? "Alt" : null, event.ctrlKey ? "Control" : null, event.metaKey ? "Meta" : null, event.shiftKey ? "Shift" : null].filter((value): value is "Alt" | "Control" | "Meta" | "Shift" => value !== null);
    send({ type: "browser.key", sessionId, key: event.key, code: event.code, modifiers });
    if (changesSelection) window.setTimeout(() => requestSelection("sync"), 40);
  };

  const blank = state.url === "about:blank";
  return (
    <section className="chromium-browser" aria-label="Chromium Browser">
      <header className="browser-toolbar">
        <div className="browser-nav-buttons">
          <button type="button" disabled={!state.canGoBack} onClick={() => simpleAction("browser.back")} aria-label="Zurück"><ArrowLeftIcon className="h-4 w-4" /></button>
          <button type="button" disabled={!state.canGoForward} onClick={() => simpleAction("browser.forward")} aria-label="Vorwärts"><ArrowRightIcon className="h-4 w-4" /></button>
          <button type="button" onClick={() => simpleAction("browser.reload")} aria-label="Neu laden"><RefreshIcon className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`} /></button>
        </div>
        <form className="browser-address" onSubmit={(event) => { event.preventDefault(); navigate(); }}>
          {state.loading ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : blank ? <SearchIcon className="h-3.5 w-3.5" /> : <BrowserIcon className="h-3.5 w-3.5" />}
          <input ref={addressRef} value={address} onChange={(event) => setAddress(event.target.value)} onFocus={(event) => { addressEditingRef.current = true; event.currentTarget.select(); }} onBlur={() => { addressEditingRef.current = false; }} placeholder="Suchen oder Adresse eingeben" aria-label="Browser-Adresse" />
        </form>
        <button type="button" onClick={() => navigate("about:blank")} aria-label="Neuer Tab" title="Lokale Dienste öffnen"><PlusIcon className="h-4 w-4" /></button>
        <button type="button" className="browser-touch-mode" onClick={() => setTouchMode((current) => current === "scroll" ? "interact" : "scroll")} aria-label={touchMode === "scroll" ? "Browsermodus: Scrollen. Zu Interagieren wechseln" : "Browsermodus: Interagieren. Zu Scrollen wechseln"} aria-pressed={touchMode === "interact"}>{touchMode === "scroll" ? <HandIcon className="h-4 w-4" /> : <PointerIcon className="h-4 w-4" />}</button>
        <button type="button" className="browser-more-button" onClick={() => { const viewport = viewportRef.current; setContextMenu(viewport ? { x: Math.max(0, viewport.clientWidth - 222), y: 8 } : { x: 8, y: 8 }); }} aria-label="Weitere Browseraktionen" aria-expanded={contextMenu !== null}><MoreIcon className="h-4 w-4" /></button>
        {/^https?:/.test(state.url) ? <a href={state.url} target="_blank" rel="noopener noreferrer" aria-label="Seite in neuem Tab öffnen"><ExternalLinkIcon className="h-4 w-4" /></a> : null}
        {extraToolbarActions}
        <span className={`browser-connection is-${status}`} title={error ?? state.title} />
      </header>
      <div
        ref={viewportRef}
        className="browser-viewport"
        tabIndex={0}
        onPointerMove={(event) => pointer("move", event)}
        onPointerDown={(event) => { claimControl(); if (event.button === 2) openBrowserMenu(event); else { setContextMenu(null); pointer("down", event); } }}
        onPointerUp={(event) => pointer("up", event)}
        onPointerCancel={cancelPointer}
        onWheel={wheel}
        onContextMenu={openBrowserMenu}
        onKeyDown={key}
        onPaste={(event) => {
          const sessionId = sessionRef.current;
          const text = event.clipboardData.getData("text/plain");
          if (!sessionId || !text) return;
          event.preventDefault();
          event.stopPropagation();
          if (utf8ByteLength(text) > browserClipboardMaximumBytes) {
            setClipboardStatus("Der einzufügende Text ist größer als 1 MiB und wurde nicht eingefügt.");
            return;
          }
          if (send({ type: "browser.text", sessionId, text })) setClipboardStatus("Text im Browser eingefügt.");
          else setClipboardStatus("Browser ist noch nicht verbunden.");
        }}
      >
        <img ref={imageRef} className={blank ? "is-hidden" : ""} alt="Gerenderte Chromium-Seite" draggable={false} decoding="async" />
        {blank ? <LocalPorts onOpen={localPort} compact /> : null}
        {!blank && !frameReady && !error ? <div className="browser-loading"><LoaderIcon className="h-5 w-5 animate-spin" /><span>Chromium lädt die Seite</span></div> : null}
        {error ? <div className="browser-error"><BrowserIcon className="h-5 w-5" /><strong>Browser nicht verfügbar</strong><span>{error}</span><div><button type="button" className="quiet-button-primary" onClick={() => window.location.reload()}>Wiederverbinden</button><button type="button" className="quiet-button" onClick={() => navigate("about:blank")}>Lokale Dienste</button></div></div> : null}
        {clipboardStatus ? <p className="browser-clipboard-status" role="status">{clipboardStatus}</p> : null}
        {contextMenu ? <div ref={contextMenuElementRef} className="browser-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" aria-label="Browseraktionen" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" disabled={!state.canGoBack} onClick={() => { simpleAction("browser.back"); setContextMenu(null); }}><ArrowLeftIcon className="h-4 w-4" /> Zurück</button>
          <button type="button" role="menuitem" disabled={!state.canGoForward} onClick={() => { simpleAction("browser.forward"); setContextMenu(null); }}><ArrowRightIcon className="h-4 w-4" /> Vorwärts</button>
          <button type="button" role="menuitem" onClick={() => { simpleAction("browser.reload"); setContextMenu(null); }}><RefreshIcon className="h-4 w-4" /> Neu laden</button>
          <span />
          <button type="button" role="menuitem" disabled={blank} onClick={() => sessionAction("browser.source")}><BracesIcon className="h-4 w-4" /> Seitenquelltext</button>
          <button type="button" role="menuitem" disabled={blank} onClick={() => sessionAction("browser.screenshot")}><CameraIcon className="h-4 w-4" /> Screenshot aufnehmen</button>
          <button type="button" role="menuitem" disabled={!devtoolsUrl} onClick={() => { setDevtoolsOpen(true); setContextMenu(null); }}><DevtoolsIcon className="h-4 w-4" /> Untersuchen</button>
        </div> : null}
      </div>
      {devtoolsOpen && devtoolsUrl ? <section className="browser-devtools" aria-label="Entwicklertools"><header><div><span>Chromium</span><strong>Developer Tools</strong></div><button type="button" onClick={() => setDevtoolsOpen(false)} aria-label="Developer Tools schließen"><CloseIcon className="h-4 w-4" /></button></header><iframe src={devtoolsUrl} title="Chromium Developer Tools" /></section> : null}
      <BrowserSourceDialog sourceView={sourceView} onClose={() => setSourceView(null)} />
    </section>
  );
}
