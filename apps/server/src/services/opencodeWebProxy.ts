import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import WebSocket from "ws";
import { settings } from "../config/settings.js";

const opencodePrefix = "/opencode";
const opencodeAuthority = `${settings.opencodeWebHost}:${settings.opencodeWebPort}`;
const opencodeHttpUpstream = `http://${opencodeAuthority}`;
const opencodeWebSocketUpstream = `ws://${opencodeAuthority}`;
const bufferedMessageLimit = 512 * 1024;
const maxInjectedHtmlBytes = 4 * 1024 * 1024;

/**
 * OpenCode Web ist eine SPA. Die Anwendung kennt den Workbench-Präfix nicht,
 * deshalb entfernt die Bridge ihn vor dem Router-Start und meldet den aktuellen
 * Session-Pfad an die Workbench bzw. an die serverseitige Presence.
 *
 * OpenCode 1.18 nutzt unter anderem `/server/<serverKey>/session/<id>` und die
 * kompatible Form `/<base64-directory>/session/<id>`. Die Erkennung bleibt
 * absichtlich auf beide Formen sowie Query-Deep-Links begrenzt.
 */
export const opencodeRouteBridgeScript = `<script data-wrapt-opencode-route="1">
(() => {
  const prefix = "/opencode";
  const scopedPath = (value) => {
    try {
      const url = new URL(value, window.location.href);
      const page = new URL(window.location.href);
      const sameHost = url.hostname === page.hostname && url.port === page.port;
      if (!sameHost) return url.toString();
      // Die OpenCode-Bridge meldet Standalone-Presence über die Workbench-API.
      if (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/")) return url.toString();
      if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) return url.toString();
      url.pathname = prefix + (url.pathname === "/" ? "/" : url.pathname);
      return url.toString();
    } catch {
      return value;
    }
  };
  const sessionFrom = (path) => {
    const query = new URLSearchParams(window.location.search);
    const querySession = query.get("session") || query.get("sessionId");
    if (querySession) return querySession;
    const segments = path.split("?")[0].split("/").filter(Boolean);
    const index = segments.findIndex((segment) => segment === "session" || segment === "sessions");
    return index >= 0 ? segments[index + 1] || null : null;
  };
  const encodeDirectory = (value) => {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  };
  const normalize = () => {
    const current = new URL(window.location.href);
    let nextPath = current.pathname;
    if (nextPath === prefix || nextPath.startsWith(prefix + "/")) nextPath = nextPath.slice(prefix.length) || "/";
    const session = current.searchParams.get("session") || current.searchParams.get("sessionId");
    const directory = current.searchParams.get("directory");
    if (session && directory) {
      // OpenCode 1.18.18 akzeptiert die legacy directory/session-Route lokal.
      nextPath = "/" + encodeDirectory(directory) + "/session/" + encodeURIComponent(session);
      current.search = "";
    }
    if (window.location.pathname !== nextPath || current.search !== window.location.search) {
      window.history.replaceState(window.history.state, "", nextPath + current.search + current.hash);
    }
  };
  // OpenCode erzeugt seine Client-URL aus window.location.origin und
  // verwendet absolute /global-, /session- und /event-Pfade. In der
  // Workbench muss nur dieser OpenCode-Kontext unter /opencode landen;
  // externe URLs bleiben unverändert.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (input instanceof Request) return nativeFetch(new Request(scopedPath(input.url), input), init);
    return nativeFetch(scopedPath(input), init);
  };
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(url, protocols) { super(scopedPath(url), protocols); }
  };
  if (window.EventSource) {
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(url, config) { super(scopedPath(url), config); }
    };
  }
  const nativeXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return nativeXhrOpen.call(this, method, scopedPath(url), ...rest);
  };
  normalize();
  const report = () => {
    const path = window.location.pathname + window.location.search + window.location.hash;
    const payload = { source: "opencode", sessionId: sessionFrom(path) };
    if (window.parent === window) {
      try {
        fetch("/api/v1/notifications/presence", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch { /* Presence ist Best Effort. */ }
    } else {
      window.parent.postMessage({ source: "wrapt-opencode", version: 1, type: "route.changed", path }, window.location.origin);
    }
  };
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  history.pushState = function (state, title, url) {
    const result = originalPushState(state, title, url);
    report();
    return result;
  };
  history.replaceState = function (state, title, url) {
    const result = originalReplaceState(state, title, url);
    report();
    return result;
  };
  addEventListener("popstate", report);
  addEventListener("focus", report);
  report();
})();
</script>`;

export const opencodeHttpRoutes = ["/", "/opencode/*"] as const;

function contentType(headers: IncomingHttpHeaders): string {
  const value = headers["content-type"];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isHtml(headers: IncomingHttpHeaders): boolean {
  return contentType(headers).toLowerCase().includes("text/html");
}

export function injectOpenCodeHtmlBridge(html: string): string {
  // Die gebündelte SPA referenziert JavaScript, CSS und Icons mit absoluten
  // `/assets/...`-URLs. Diese Requests müssen vor dem Script-Lauf den Proxy
  // erreichen; dynamische API-/Socket-URLs übernimmt die Bridge selbst.
  const scopedHtml = html.replace(
    /((?:src|href)=['"])\/(?!opencode(?:\/|['"]))/gi,
    "$1/opencode/",
  );
  return scopedHtml.includes("</head>")
    ? scopedHtml.replace("</head>", `${opencodeRouteBridgeScript}</head>`)
    : `${opencodeRouteBridgeScript}${scopedHtml}`;
}

function rewriteResponseHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const result = { ...headers };
  if (isHtml(result)) {
    delete result["content-length"];
    delete result["content-encoding"];
    result["cache-control"] = "no-store, no-cache, must-revalidate";
  }
  return result;
}

function upstreamPath(rawUrl: string): string {
  const url = new URL(rawUrl, "http://wrapt.local");
  const pathname = url.pathname === opencodePrefix
    ? "/"
    : url.pathname.startsWith(`${opencodePrefix}/`)
      ? url.pathname.slice(opencodePrefix.length)
      : url.pathname;
  return `${pathname}${url.search}`;
}

function proxyHeaders(request: FastifyRequest, headers: Record<string, string | string[] | undefined>) {
  return {
    ...headers,
    host: request.headers.host ?? opencodeAuthority,
    "x-forwarded-host": request.headers.host ?? opencodeAuthority,
    "x-forwarded-prefix": opencodePrefix,
    "x-forwarded-proto": "https",
    "accept-encoding": "identity",
  };
}

function proxyHttp(request: FastifyRequest, reply: FastifyReply) {
  reply.removeHeader("content-security-policy");
  return reply.from(`${opencodeHttpUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    rewriteRequestHeaders: (_originalRequest, headers) => proxyHeaders(request, headers),
    rewriteHeaders: (headers) => rewriteResponseHeaders(headers),
    onResponse: (_request, response, rawResponse) => {
      const upstreamResponse = rawResponse as unknown as { headers: IncomingHttpHeaders; stream: Readable };
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
          response.status(502).type("text/plain").send("Die OpenCode-Web-Seite ist zu groß.");
          return;
        }
        response.type("text/html; charset=utf-8").send(injectOpenCodeHtmlBridge(Buffer.concat(chunks).toString("utf8")));
      });
      upstreamResponse.stream.on("error", () => {
        if (!response.sent) response.status(502).type("text/plain").send("OpenCode Web ist nicht erreichbar.");
      });
    },
  });
}

async function proxyIndex(_request: FastifyRequest, reply: FastifyReply) {
  const response = await fetch(`${opencodeHttpUpstream}/`);
  if (!response.ok) {
    await response.body?.cancel();
    return reply.status(response.status).type("text/plain").send("OpenCode Web ist nicht erreichbar.");
  }
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
        return reply.status(502).type("text/plain").send("Die OpenCode-Web-Seite ist zu groß.");
      }
      chunks.push(Buffer.from(value));
    }
  }
  reply.removeHeader("content-security-policy");
  return reply.type("text/html").send(injectOpenCodeHtmlBridge(Buffer.concat(chunks, bytes).toString("utf8")));
}

function closeCode(code: number): number {
  return code === 1005 || code === 1006 ? 1011 : code;
}

function rawDataBytes(data: WebSocket.RawData): number {
  if (Array.isArray(data)) return data.reduce((total, chunk) => total + chunk.length, 0);
  return data.byteLength;
}

function proxyWebSocket(source: WebSocket, request: FastifyRequest) {
  const forwarded: Record<string, string> = {};
  for (const headerName of ["authorization", "cookie", "origin", "sec-websocket-protocol", "user-agent"] as const) {
    const value = request.headers[headerName];
    if (typeof value === "string") forwarded[headerName] = value;
  }
  const target = new WebSocket(`${opencodeWebSocketUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    headers: proxyHeaders(request, forwarded),
  });
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  let pendingBytes = 0;
  source.on("message", (data, binary) => {
    if (target.readyState === WebSocket.OPEN) { target.send(data, { binary }); return; }
    if (target.readyState !== WebSocket.CONNECTING) return;
    pendingBytes += rawDataBytes(data);
    if (pendingBytes > bufferedMessageLimit) {
      source.close(1009, "OpenCode-WebSocket-Puffer überschritten");
      target.terminate();
      return;
    }
    pending.push({ data, binary });
  });
  target.on("open", () => {
    for (const message of pending.splice(0)) target.send(message.data, { binary: message.binary });
    pendingBytes = 0;
  });
  target.on("message", (data, binary) => { if (source.readyState === WebSocket.OPEN) source.send(data, { binary }); });
  source.on("close", (code, reason) => target.readyState === WebSocket.OPEN ? target.close(closeCode(code), reason) : target.terminate());
  target.on("close", (code, reason) => { if (source.readyState === WebSocket.OPEN) source.close(closeCode(code), reason); });
  source.on("error", () => target.terminate());
  target.on("error", () => { if (source.readyState === WebSocket.OPEN) source.close(1011, "OpenCode Web ist nicht erreichbar"); });
}

export async function registerOpenCodeWebProxy(app: FastifyInstance) {
  app.route({ method: "GET", url: opencodePrefix, config: { rateLimit: false }, helmet: false, handler: proxyIndex });
  app.route({ method: "GET", url: `${opencodePrefix}/*`, config: { rateLimit: false }, helmet: false, handler: proxyHttp, wsHandler: proxyWebSocket });
  app.route({ method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"], url: `${opencodePrefix}/*`, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
}
