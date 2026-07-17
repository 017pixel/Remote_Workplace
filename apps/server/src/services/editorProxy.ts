import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import replyFrom from "@fastify/reply-from";
import WebSocket from "ws";

const editorPrefix = "/editor";
const editorUpstream = "http://127.0.0.1:8080";
const editorWebSocketUpstream = "ws://127.0.0.1:8080";
const bufferedMessageLimit = 512 * 1024;

function upstreamPath(rawUrl: string): string {
  const url = new URL(rawUrl, "http://workbench.local");
  const pathname = url.pathname.startsWith(editorPrefix)
    ? url.pathname.slice(editorPrefix.length) || "/"
    : url.pathname;
  return `${pathname}${url.search}`;
}

function forwardedHeaders(request: FastifyRequest, headers: Record<string, string | string[] | undefined>) {
  return {
    ...headers,
    host: request.headers.host ?? "127.0.0.1:8080",
    "x-forwarded-host": request.headers.host ?? "127.0.0.1:8080",
    "x-forwarded-prefix": editorPrefix,
    "x-forwarded-proto": "https",
  };
}

function proxyHttp(request: FastifyRequest, reply: FastifyReply) {
  // The trusted loopback upstream owns its CSP. Keeping the Workbench CSP here
  // would block Vite's React preamble and code-server's nonce/eval policy.
  reply.removeHeader("content-security-policy");
  if (upstreamPath(request.raw.url ?? request.url).startsWith("/absproxy/")) {
    reply.header(
      "content-security-policy",
      "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss: https:; img-src 'self' data: blob: https:; font-src 'self' data: blob:; worker-src 'self' blob:; manifest-src 'self'; frame-ancestors 'self'",
    );
  }
  return reply.from(`${editorUpstream}${upstreamPath(request.raw.url ?? request.url)}`, {
    rewriteRequestHeaders: (_originalRequest, headers) => forwardedHeaders(request, headers),
  });
}

function closeCode(code: number): number {
  return code === 1005 || code === 1006 ? 1011 : code;
}

function rawDataBytes(data: WebSocket.RawData): number {
  if (Array.isArray(data)) return data.reduce((total, chunk) => total + chunk.length, 0);
  return data.byteLength;
}

function proxyWebSocket(source: WebSocket, request: FastifyRequest) {
  const protocolHeader = request.headers["sec-websocket-protocol"];
  const protocols = typeof protocolHeader === "string"
    ? protocolHeader.split(",").map((protocol) => protocol.trim()).filter(Boolean)
    : [];
  const optionalHeaders: Record<string, string> = {};
  if (request.headers.cookie) optionalHeaders.cookie = request.headers.cookie;
  if (request.headers.origin) optionalHeaders.origin = request.headers.origin;
  if (request.headers["user-agent"]) optionalHeaders["user-agent"] = request.headers["user-agent"];
  const target = new WebSocket(
    `${editorWebSocketUpstream}${upstreamPath(request.raw.url ?? request.url)}`,
    protocols,
    {
      headers: forwardedHeaders(request, optionalHeaders),
    },
  );
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  let pendingBytes = 0;

  source.on("message", (data, binary) => {
    if (target.readyState === WebSocket.OPEN) {
      target.send(data, { binary });
      return;
    }
    if (target.readyState !== WebSocket.CONNECTING) return;
    pendingBytes += rawDataBytes(data);
    if (pendingBytes > bufferedMessageLimit) {
      source.close(1009, "Editor-WebSocket-Puffer überschritten");
      target.terminate();
      return;
    }
    pending.push({ data, binary });
  });
  target.on("open", () => {
    for (const message of pending.splice(0)) target.send(message.data, { binary: message.binary });
    pendingBytes = 0;
  });
  target.on("message", (data, binary) => {
    if (source.readyState === WebSocket.OPEN) source.send(data, { binary });
  });
  source.on("close", (code, reason) => {
    if (target.readyState === WebSocket.OPEN) target.close(closeCode(code), reason);
    else if (target.readyState === WebSocket.CONNECTING) target.terminate();
  });
  target.on("close", (code, reason) => {
    if (source.readyState === WebSocket.OPEN) source.close(closeCode(code), reason);
  });
  source.on("error", () => target.terminate());
  target.on("error", () => {
    if (source.readyState === WebSocket.OPEN) source.close(1011, "Editor-WebSocket nicht erreichbar");
  });
}

export async function registerEditorProxy(app: FastifyInstance) {
  await app.register(replyFrom);

  for (const url of ["/editor", "/editor/*"]) {
    app.route({
      method: "GET",
      url,
      // The trusted upstream owns its response policy. Applying Workbench's
      // CSP/X-Frame-Options here breaks code-server's hashed worker bootstrap
      // and makes Firefox warn about duplicate framing policies.
      config: { rateLimit: false },
      helmet: false,
      handler: proxyHttp,
      wsHandler: proxyWebSocket,
    });
    app.route({
      method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"],
      url,
      config: { rateLimit: false },
      helmet: false,
      handler: proxyHttp,
    });
  }
}
