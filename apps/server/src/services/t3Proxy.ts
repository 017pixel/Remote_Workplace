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
  };
}

function proxyHttp(request: FastifyRequest, reply: FastifyReply) {
  reply.removeHeader("content-security-policy");
  return reply.from(`${t3HttpUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    rewriteRequestHeaders: (_originalRequest, headers) => proxyHeaders(request, headers),
  });
}

async function proxyIndex(_request: FastifyRequest, reply: FastifyReply) {
  const response = await fetch(`${t3HttpUpstream}/`);
  const html = await response.text();
  if (!response.ok) return reply.status(response.status).type("text/plain").send("T3 Code ist nicht erreichbar.");
  reply.removeHeader("content-security-policy");
  return reply.type("text/html").send(html.replace(
    "<head>",
    "<head><script>if(location.pathname==='/t3')history.replaceState(null,'','/');</script>",
  ));
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
  if (request.headers.cookie) optionalHeaders.cookie = request.headers.cookie;
  if (request.headers.origin) optionalHeaders.origin = request.headers.origin;
  if (request.headers["user-agent"]) optionalHeaders["user-agent"] = request.headers["user-agent"];
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
  const httpRoutes = [
    "/", "/t3/*", "/assets/*", "/.well-known/t3/*", "/api/auth/*",
    "/favicon.ico", "/apple-touch-icon.png",
  ];
  for (const url of httpRoutes) {
    app.route({ method: "GET", url, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
    app.route({ method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"], url, config: { rateLimit: false }, helmet: false, handler: proxyHttp });
  }
  app.route({ method: "GET", url: "/ws", config: { rateLimit: false }, helmet: false, handler: proxyHttp, wsHandler: proxyWebSocket });
}
