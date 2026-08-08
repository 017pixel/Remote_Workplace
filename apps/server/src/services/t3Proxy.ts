import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import WebSocket from "ws";
import { settings } from "../config/settings.js";

const t3Prefix = "/t3";
// Genau eine Instanz, unabhängig vom Kanal. Adresse aus der Config, damit Proxy,
// systemd-Unit und Health-Check nicht auseinanderlaufen können.
const t3Authority = `${settings.t3Host}:${settings.t3Port}`;
const t3HttpUpstream = `http://${t3Authority}`;
const t3WebSocketUpstream = `ws://${t3Authority}`;
const bufferedMessageLimit = 512 * 1024;
const maxInjectedHtmlBytes = 4 * 1024 * 1024;

/**
 * T3 Code läuft hinter dem Workbench-Präfix `/t3`, seine Browser-Routen liegen
 * aber am Root (`/$environmentId/$threadId`). Bei einem Deep-Link muss das
 * Präfix deshalb vor dem Router-Start aus der sichtbaren URL entfernt werden.
 * Frühere Workbench-Versionen erzeugten Tiefenlinks unter dem `/_chat`-Layout;
 * diese werden zusätzlich auf die Root-Thread-Route umgeschrieben.
 *
 * Die Bridge meldet außerdem den aktuell geöffneten T3-Thread nach oben:
 * Im iframe an die Workbench per `postMessage`, im eigenständigen Fenster
 * direkt per `PUT /api/v1/notifications/presence`. So gelten Benachrichtigungen
 * für einen Thread als gesehen, sobald der Nutzer genau diesen Chat öffnet.
 */
export const t3RouteBridgeScript = `<script data-remote-workplace-t3-route="1">
(() => {
  const prefix = "/t3";
  const pathname = window.location.pathname;
  if (pathname === prefix || pathname.startsWith(prefix + "/")) {
    const nextPath = pathname.slice(prefix.length) || "/";
    // Die T3-Thread-Route liegt am Root (/$environmentId/$threadId). Alte
    // Tiefenlinks unter dem /_chat-Layout (/_chat/<environmentId>/<threadId>
    // aus früheren Workbench-Versionen) werden vor dem Router-Start auf die
    // korrekte Form umgeschrieben. UUID-Paare sind eindeutig.
    const segments = nextPath.split("/").filter(Boolean);
    const legacyChatThread = segments.length >= 3
      && segments[0] === "_chat"
      && /^[0-9a-fA-F-]{36}$/.test(segments[1] ?? "")
      && /^[0-9a-fA-F-]{36}$/.test(segments[2] ?? "");
    const normalized = legacyChatThread ? "/" + segments.slice(1).join("/") : nextPath;
    window.history.replaceState(window.history.state, "", normalized + window.location.search + window.location.hash);
  }
  const historyIndexKey = "__remoteWorkplaceT3Index";
  let historyIndex = Number.isInteger(window.history.state?.[historyIndexKey]) ? window.history.state[historyIndexKey] : 0;
  window.history.replaceState({ ...window.history.state, [historyIndexKey]: historyIndex }, "", window.location.href);
  const presence = () => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    // Threads liegen am Root (/$environmentId/$threadId); ältere Pfade unter
    // dem _chat-Layout gelten als /_chat/<environmentId>/<threadId>.
    const threadId = segments[0] === "_chat" ? segments[2] ?? null : segments.length >= 2 ? segments[1] ?? null : null;
    return { source: "t3", threadId };
  };
  const report = () => {
    const path = window.location.pathname + window.location.search + window.location.hash;
    if (window.parent === window) {
      try {
        fetch("/api/v1/notifications/presence", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(presence()) });
      } catch { /* Presence ist Best Effort. */ }
    } else {
      window.parent.postMessage({ source: "remote-workplace-t3", version: 1, type: "route.changed", path }, window.location.origin);
    }
  };
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  const originalGo = history.go.bind(history);
  history.pushState = function (state, title, url) {
    historyIndex += 1;
    const result = originalPushState({ ...state, [historyIndexKey]: historyIndex }, title, url);
    report();
    return result;
  };
  history.replaceState = function (state, title, url) {
    const result = originalReplaceState({ ...state, [historyIndexKey]: historyIndex }, title, url);
    report();
    return result;
  };
  history.go = function (delta) {
    if (window.parent !== window && typeof delta === "number" && delta < 0 && historyIndex + delta < 0) return;
    originalGo(delta);
  };
  history.back = function () { history.go(-1); };
  addEventListener("popstate", (event) => {
    const nextIndex = event.state?.[historyIndexKey];
    if (Number.isInteger(nextIndex)) historyIndex = nextIndex;
    report();
  });
  addEventListener("focus", report);
  report();
})();
</script>`;

// T3 Code deaktiviert seine integrierte Browser-Preview im Web-Modus, weil
// dort die Electron-API `window.desktopBridge.preview` fehlt. Innerhalb der
// Workbench gibt es dafür bereits einen eigenen, serverseitigen Browser. Der
// kleine Fallback macht die deaktivierte T3-Karte zu einem Brückensignal an
// den umgebenden ToolPanel. Die optionale Zieladresse wird dabei nur als
// Hinweis weitergereicht und in der Workbench erneut normalisiert. Die
// eigentliche Browser-Implementierung bleibt in `apps/web/src/components/browser`.
export const remoteBrowserFallbackScript = `<script>
(() => {
  const messageType = "remote-workplace:open-browser";
  const mark = "data-remote-workplace-browser-fallback";
  const normalizeUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  };
  const targetUrl = (button) => normalizeUrl(
    button.getAttribute("data-url") || button.closest("a")?.href || "",
  );
  const openBrowser = (button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    if (!button.textContent?.trim().startsWith("Browser")) return;
    if (button.getAttribute(mark) !== "true") {
      button.setAttribute(mark, "true");
      button.title = "Remote-Workplace-Browser öffnen";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const url = targetUrl(button);
        const message = { type: messageType, ...(url ? { url } : {}) };
        if (window.parent === window) window.location.assign("/browser");
        else window.parent.postMessage(message, window.location.origin);
      }, true);
    }
    // Nur echte Zustandsänderungen schreiben. Der Observer sieht diese
    // Attribute selbst; bedingungslose Schreibzugriffe erzeugen in Firefox
    // sonst eine endlose MutationObserver-Kette und frieren das iframe ein.
    if (button.disabled) button.disabled = false;
    if (button.hasAttribute("aria-disabled")) button.removeAttribute("aria-disabled");
    if (button.classList.contains("cursor-not-allowed") || button.classList.contains("opacity-40")) {
      button.classList.remove("cursor-not-allowed", "opacity-40");
    }
  };
  const scan = (root) => {
    if (!(root instanceof Element)) return;
    if (root.matches("button")) openBrowser(root);
    for (const button of root.querySelectorAll("button")) openBrowser(button);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.addedNodes) scan(node);
      } else if (record.type === "attributes") {
        openBrowser(record.target);
      } else {
        openBrowser(record.target.parentElement?.closest("button"));
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-disabled", "class"],
    characterData: true,
  });
  scan(document.documentElement);
})();
</script>`;

export const t3HttpRoutes = [
  "/", "/t3/*", "/assets/*", "/.well-known/t3/*", "/api/auth/*",
  "/api/assets/*", "/api/orchestration/*", "/api/connect/*", "/api/t3-connect/*", "/api/observability/*", "/oauth/*",
  "/favicon.ico", "/apple-touch-icon.png",
] as const;

function contentType(headers: IncomingHttpHeaders): string {
  const value = headers["content-type"];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isHtml(headers: IncomingHttpHeaders): boolean {
  return contentType(headers).toLowerCase().includes("text/html");
}

export function injectT3HtmlBridge(html: string): string {
  const bridge = `${t3RouteBridgeScript}${remoteBrowserFallbackScript}`;
  return html.includes("</head>") ? html.replace("</head>", `${bridge}</head>`) : `${bridge}${html}`;
}

function rewriteResponseHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const result = { ...headers };
  if (isHtml(result)) {
    // The bridge changes the body length. Remove upstream framing headers
    // before @fastify/reply-from starts the response.
    delete result["content-length"];
    delete result["content-encoding"];
    result["cache-control"] = "no-store, no-cache, must-revalidate";
  }
  return result;
}

type T3UpstreamResponse = {
  headers: IncomingHttpHeaders;
  stream: Readable;
};

function upstreamPath(rawUrl: string): string {
  const url = new URL(rawUrl, "http://workbench.local");
  const pathname = url.pathname === t3Prefix
    ? "/"
    : url.pathname.startsWith(`${t3Prefix}/`)
      ? url.pathname.slice(t3Prefix.length)
      : url.pathname;
  return `${pathname}${url.search}`;
}

function proxyHeaders(request: FastifyRequest, headers: Record<string, string | string[] | undefined>) {
  return {
    ...headers,
    host: request.headers.host ?? t3Authority,
    "x-forwarded-host": request.headers.host ?? t3Authority,
    "x-forwarded-prefix": t3Prefix,
    "x-forwarded-proto": "https",
    // HTML deep-link normalization happens in onResponse. Keep the upstream
    // body readable instead of buffering compressed bytes.
    "accept-encoding": "identity",
  };
}

function proxyHttp(request: FastifyRequest, reply: FastifyReply) {
  reply.removeHeader("content-security-policy");
  return reply.from(`${t3HttpUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    rewriteRequestHeaders: (_originalRequest, headers) => proxyHeaders(request, headers),
    rewriteHeaders: (headers) => rewriteResponseHeaders(headers),
    onResponse: (_request, response, rawResponse) => {
      const upstreamResponse = rawResponse as unknown as T3UpstreamResponse;
      if (!isHtml(upstreamResponse.headers) || request.method === "HEAD") {
        response.send(upstreamResponse.stream);
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      upstreamResponse.stream.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes <= maxInjectedHtmlBytes) chunks.push(buffer);
      });
      upstreamResponse.stream.on("end", () => {
        if (bytes > maxInjectedHtmlBytes) {
          response.status(502).type("text/plain").send("Die T3-Code-Seite ist zu groß.");
          return;
        }
        response.type("text/html; charset=utf-8").send(injectT3HtmlBridge(Buffer.concat(chunks).toString("utf8")));
      });
      upstreamResponse.stream.on("error", () => {
        if (!response.sent) response.status(502).type("text/plain").send("T3 Code ist nicht erreichbar.");
      });
    },
  });
}

async function proxyIndex(_request: FastifyRequest, reply: FastifyReply) {
  const response = await fetch(`${t3HttpUpstream}/`);
  if (!response.ok) {
    await response.body?.cancel();
    return reply.status(response.status).type("text/plain").send("T3 Code ist nicht erreichbar.");
  }
  // Dieselbe harte Byte-Grenze wie im injizierenden Proxy-Pfad (F01-09).
  const reader = response.body?.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxInjectedHtmlBytes) {
        await reader.cancel();
        return reply.status(502).type("text/plain").send("Die T3-Code-Seite ist zu groß.");
      }
      chunks.push(Buffer.from(value));
    }
  }
  reply.removeHeader("content-security-policy");
  return reply.type("text/html").send(injectT3HtmlBridge(Buffer.concat(chunks, bytes).toString("utf8")));
}

function closeCode(code: number): number {
  return code === 1005 || code === 1006 ? 1011 : code;
}

function rawDataBytes(data: WebSocket.RawData): number {
  if (Array.isArray(data)) return data.reduce((total, chunk) => total + chunk.length, 0);
  return data.byteLength;
}

function proxyWebSocket(source: WebSocket, request: FastifyRequest) {
  const optionalHeaders: Record<string, string> = {};
  for (const headerName of ["authorization", "cookie", "origin", "sec-websocket-protocol", "user-agent"] as const) {
    const value = request.headers[headerName];
    if (typeof value === "string") optionalHeaders[headerName] = value;
  }
  const target = new WebSocket(`${t3WebSocketUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    headers: proxyHeaders(request, optionalHeaders),
  });
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  let pendingBytes = 0;
  source.on("message", (data, binary) => {
    if (target.readyState === WebSocket.OPEN) { target.send(data, { binary }); return; }
    if (target.readyState !== WebSocket.CONNECTING) return;
    pendingBytes += rawDataBytes(data);
    if (pendingBytes > bufferedMessageLimit) { source.close(1009, "T3-WebSocket-Puffer überschritten"); target.terminate(); return; }
    pending.push({ data, binary });
  });
  target.on("open", () => { for (const message of pending.splice(0)) target.send(message.data, { binary: message.binary }); pendingBytes = 0; });
  target.on("message", (data, binary) => { if (source.readyState === WebSocket.OPEN) source.send(data, { binary }); });
  source.on("close", (code, reason) => target.readyState === WebSocket.OPEN ? target.close(closeCode(code), reason) : target.terminate());
  target.on("close", (code, reason) => { if (source.readyState === WebSocket.OPEN) source.close(closeCode(code), reason); });
  source.on("error", () => target.terminate());
  target.on("error", () => { if (source.readyState === WebSocket.OPEN) source.close(1011, "T3 Code ist nicht erreichbar"); });
}

export async function registerT3Proxy(app: FastifyInstance) {
  app.route({ method: "GET", url: "/t3", config: { rateLimit: false }, helmet: false, handler: proxyIndex });
  for (const url of t3HttpRoutes) {
    app.route({ method: "GET", url, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
    app.route({ method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"], url, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
  }
  app.route({ method: "GET", url: "/ws", config: { rateLimit: false }, helmet: false, handler: proxyHttp, wsHandler: proxyWebSocket });
}
