import { ArrowLeft, ArrowRight, Braces, Camera, ExternalLink, Globe2, LoaderCircle, Plus, RotateCw, Search, SquareCode, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalPort } from "@workbench/contracts";
import { LocalPorts } from "./LocalPorts";

type BrowserStatus = "connecting" | "ready" | "disconnected" | "error";
type ServerMessage =
  | { type: "browser.ready"; sessionId: string; url: string; title: string; width: number; height: number }
  | { type: "browser.state"; sessionId: string; url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean }
  | { type: "browser.frame"; sessionId: string; data: string; width: number; height: number }
  | { type: "browser.screenshot"; sessionId: string; data: string }
  | { type: "browser.source"; sessionId: string; source: string; url: string }
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

export function ChromiumBrowser({ instanceId }: { instanceId: string }) {
  const storageKey = `workbench-browser-session:${instanceId}`;
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<string | null>(readSession(storageKey));
  const disposedRef = useRef(false);
  const reconnectRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const resizeRef = useRef<number | null>(null);
  const pendingUrlRef = useRef<string | null>(null);
  const requestedUrlRef = useRef<string | null>(null);
  const addressEditingRef = useRef(false);
  const fatalConnectionRef = useRef(false);
  const retriesRef = useRef(0);
  const [status, setStatus] = useState<BrowserStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [state, setState] = useState({ url: "about:blank", title: "Neuer Tab", loading: false, canGoBack: false, canGoForward: false });
  const [frameReady, setFrameReady] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const [sourceView, setSourceView] = useState<{ source: string; url: string } | null>(null);

  const send = useCallback((message: object) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(message));
    return true;
  }, []);

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
    else send({ type: "browser.create", requestId: createUuid(), instanceId, ...size });
  }, [dimensions, instanceId, send]);

  const connect = useCallback(() => {
    if (disposedRef.current || fatalConnectionRef.current || socketRef.current?.readyState === WebSocket.CONNECTING || socketRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");
    const socket = new WebSocket(websocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      retriesRef.current = 0;
      setError(null);
      createOrAttach();
      heartbeatRef.current = window.setInterval(() => send({ type: "browser.ping" }), 25_000);
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      if (message.type === "browser.ready") {
        sessionRef.current = message.sessionId;
        storeSession(storageKey, message.sessionId);
        setStatus("ready");
        setState((current) => ({ ...current, url: message.url, title: message.title }));
        const pendingUrl = pendingUrlRef.current;
        if (pendingUrl) {
          pendingUrlRef.current = null;
          setAddress(pendingUrl === "about:blank" ? "" : pendingUrl);
          setFrameReady(false);
          send({ type: "browser.navigate", sessionId: message.sessionId, url: pendingUrl });
        } else {
          if (!addressEditingRef.current) setAddress(message.url === "about:blank" ? "" : message.url);
        }
      } else if (message.type === "browser.state") {
        setStatus("ready");
        setState({ url: message.url, title: message.title, loading: message.loading, canGoBack: message.canGoBack, canGoForward: message.canGoForward });
        const requestedUrl = requestedUrlRef.current;
        const staleBlankState = requestedUrl !== null && requestedUrl !== "about:blank" && message.url === "about:blank";
        if (!staleBlankState && !addressEditingRef.current) {
          setAddress(message.url === "about:blank" ? "" : message.url);
          if (message.url === requestedUrl || !message.loading) requestedUrlRef.current = null;
        }
      } else if (message.type === "browser.frame") {
        if (imageRef.current) imageRef.current.src = `data:image/jpeg;base64,${message.data}`;
        setFrameReady(true);
      } else if (message.type === "browser.screenshot") {
        const bytes = Uint8Array.from(atob(message.data), (character) => character.charCodeAt(0));
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        link.download = `workbench-browser-${new Date().toISOString().replaceAll(":", "-")}.png`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
      } else if (message.type === "browser.source") {
        setSourceView({ source: message.source, url: message.url });
      } else if (message.type === "browser.closed") {
        sessionRef.current = null;
        storeSession(storageKey, null);
        setStatus("disconnected");
      } else if (message.type === "browser.error") {
        if (message.code === "SESSION_NOT_FOUND") {
          sessionRef.current = null;
          storeSession(storageKey, null);
          createOrAttach();
          return;
        }
        if (message.code === "UNAUTHORIZED" || message.code === "FORBIDDEN") fatalConnectionRef.current = true;
        setStatus("error");
        setError(message.message);
      }
    };
    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
      if (disposedRef.current || fatalConnectionRef.current) return;
      setStatus("disconnected");
      reconnectRef.current = window.setTimeout(connect, Math.min(10_000, 500 * (2 ** retriesRef.current++)));
    };
    socket.onerror = () => socket.close();
  }, [createOrAttach, send, storageKey]);

  useEffect(() => {
    disposedRef.current = false;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      resizeRef.current = window.setTimeout(() => {
        const sessionId = sessionRef.current;
        if (sessionId) send({ type: "browser.resize", sessionId, ...dimensions() });
      }, 120);
    });
    observer.observe(viewport);
    connect();
    return () => {
      disposedRef.current = true;
      observer.disconnect();
      if (resizeRef.current) window.clearTimeout(resizeRef.current);
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect, dimensions, send]);

  const navigate = (value?: string) => {
    const requestedAddress = value ?? addressRef.current?.value ?? address;
    if (!requestedAddress.trim()) return;
    const url = normalizeAddress(requestedAddress);
    requestedUrlRef.current = url;
    setAddress(url);
    setFrameReady(false);
    const sessionId = sessionRef.current;
    if (!sessionId) {
      pendingUrlRef.current = url;
      return;
    }
    send({ type: "browser.navigate", sessionId, url });
  };
  const simpleAction = (type: "browser.back" | "browser.forward" | "browser.reload") => {
    const sessionId = sessionRef.current;
    if (sessionId) send({ type, sessionId });
  };
  const localPort = (port: LocalPort) => { if (port.localUrl) navigate(port.localUrl); };

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
    if (action === "down") { event.currentTarget.setPointerCapture(event.pointerId); (event.currentTarget as HTMLElement).focus(); }
    const button = event.button === 1 ? "middle" : event.button === 2 ? "right" : event.button === 0 ? "left" : "none";
    send({ type: "browser.pointer", sessionId, action, ...point, button, buttons: event.buttons });
  };
  const wheel = (event: React.WheelEvent) => {
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
      x: Math.min(bounds.width - 222, Math.max(8, event.clientX - bounds.left)),
      y: Math.min(bounds.height - 270, Math.max(8, event.clientY - bounds.top)),
    });
  };

  const sessionAction = (type: "browser.screenshot" | "browser.source") => {
    const sessionId = sessionRef.current;
    if (sessionId) send({ type, sessionId });
    setContextMenu(null);
  };

  const devtoolsUrl = sessionRef.current
    ? `/workbench/devtools/inspector.html?ws=${encodeURIComponent(`${window.location.host}/api/v1/browser/devtools/${sessionRef.current}`)}`
    : null;
  const key = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") { event.preventDefault(); addressRef.current?.focus(); addressRef.current?.select(); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") { event.preventDefault(); simpleAction("browser.reload"); return; }
    const sessionId = sessionRef.current;
    if (!sessionId || state.url === "about:blank") return;
    event.preventDefault();
    event.stopPropagation();
    const modifiers = [event.altKey ? "Alt" : null, event.ctrlKey ? "Control" : null, event.metaKey ? "Meta" : null, event.shiftKey ? "Shift" : null].filter((value): value is "Alt" | "Control" | "Meta" | "Shift" => value !== null);
    send({ type: "browser.key", sessionId, key: event.key, code: event.code, modifiers });
  };

  const blank = state.url === "about:blank";
  return (
    <section className="chromium-browser" aria-label="Chromium Browser">
      <header className="browser-toolbar">
        <div className="browser-nav-buttons">
          <button type="button" disabled={!state.canGoBack} onClick={() => simpleAction("browser.back")} aria-label="Zurück"><ArrowLeft className="h-4 w-4" /></button>
          <button type="button" disabled={!state.canGoForward} onClick={() => simpleAction("browser.forward")} aria-label="Vorwärts"><ArrowRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => simpleAction("browser.reload")} aria-label="Neu laden"><RotateCw className={`h-4 w-4 ${state.loading ? "animate-spin" : ""}`} /></button>
        </div>
        <form className="browser-address" onSubmit={(event) => { event.preventDefault(); navigate(); }}>
          {state.loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : blank ? <Search className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
          <input ref={addressRef} value={address} onChange={(event) => setAddress(event.target.value)} onFocus={(event) => { addressEditingRef.current = true; event.currentTarget.select(); }} onBlur={() => { addressEditingRef.current = false; }} placeholder="Suchen oder Adresse eingeben" aria-label="Browser-Adresse" />
        </form>
        <button type="button" onClick={() => navigate("about:blank")} aria-label="Neuer Tab" title="Lokale Dienste öffnen"><Plus className="h-4 w-4" /></button>
        {/^https?:/.test(state.url) ? <a href={state.url} target="_blank" rel="noopener noreferrer" aria-label="Seite in neuem Tab öffnen"><ExternalLink className="h-4 w-4" /></a> : null}
        <span className={`browser-connection is-${status}`} title={error ?? state.title} />
      </header>
      <div
        ref={viewportRef}
        className="browser-viewport"
        tabIndex={0}
        onPointerMove={(event) => pointer("move", event)}
        onPointerDown={(event) => { if (event.button === 2) openBrowserMenu(event); else { setContextMenu(null); pointer("down", event); } }}
        onPointerUp={(event) => pointer("up", event)}
        onWheel={wheel}
        onContextMenu={openBrowserMenu}
        onKeyDown={key}
        onPaste={(event) => { const sessionId = sessionRef.current; const text = event.clipboardData.getData("text/plain"); if (sessionId && text) { event.preventDefault(); send({ type: "browser.text", sessionId, text }); } }}
      >
        <img ref={imageRef} className={blank ? "is-hidden" : ""} alt="Gerenderte Chromium-Seite" draggable={false} decoding="async" />
        {blank ? <LocalPorts onOpen={localPort} compact /> : null}
        {!blank && !frameReady && !error ? <div className="browser-loading"><LoaderCircle className="h-5 w-5 animate-spin" /><span>Chromium lädt die Seite</span></div> : null}
        {error ? <div className="browser-error"><Globe2 className="h-5 w-5" /><strong>Browser nicht verfügbar</strong><span>{error}</span></div> : null}
        {contextMenu ? <div className="browser-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" aria-label="Browseraktionen" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" disabled={!state.canGoBack} onClick={() => { simpleAction("browser.back"); setContextMenu(null); }}><ArrowLeft className="h-4 w-4" /> Zurück</button>
          <button type="button" role="menuitem" disabled={!state.canGoForward} onClick={() => { simpleAction("browser.forward"); setContextMenu(null); }}><ArrowRight className="h-4 w-4" /> Vorwärts</button>
          <button type="button" role="menuitem" onClick={() => { simpleAction("browser.reload"); setContextMenu(null); }}><RotateCw className="h-4 w-4" /> Neu laden</button>
          <span />
          <button type="button" role="menuitem" disabled={blank} onClick={() => sessionAction("browser.source")}><Braces className="h-4 w-4" /> Seitenquelltext</button>
          <button type="button" role="menuitem" disabled={blank} onClick={() => sessionAction("browser.screenshot")}><Camera className="h-4 w-4" /> Screenshot aufnehmen</button>
          <button type="button" role="menuitem" disabled={!devtoolsUrl} onClick={() => { setDevtoolsOpen(true); setContextMenu(null); }}><SquareCode className="h-4 w-4" /> Untersuchen</button>
        </div> : null}
      </div>
      {devtoolsOpen && devtoolsUrl ? <section className="browser-devtools" aria-label="Entwicklertools"><header><div><span>Chromium</span><strong>Developer Tools</strong></div><button type="button" onClick={() => setDevtoolsOpen(false)} aria-label="Developer Tools schließen"><X className="h-4 w-4" /></button></header><iframe src={devtoolsUrl} title="Chromium Developer Tools" /></section> : null}
      {sourceView ? <div className="browser-source-backdrop" role="dialog" aria-modal="true" aria-label="Seitenquelltext"><section><header><div><span>Seitenquelltext</span><strong>{sourceView.url}</strong></div><button type="button" onClick={() => setSourceView(null)} aria-label="Seitenquelltext schließen"><X className="h-4 w-4" /></button></header><pre>{sourceView.source}</pre></section></div> : null}
    </section>
  );
}
