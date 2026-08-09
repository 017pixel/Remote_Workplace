import replyFrom, { type FastifyReplyFromHooks } from "@fastify/reply-from";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import WebSocket from "ws";
import type { Readable } from "node:stream";
import {
  PREVIEW_BRIDGE_ROUTE,
  PREVIEW_BRIDGE_VERSION,
  PREVIEW_RESET_ROUTE,
  bridgeScriptSource,
  charsetOf,
  injectBridgeScript,
  isInjectableContentType,
  type BridgeInjectionStatus,
} from "./bridge.js";
import type { PreviewSlotDefinition, SlotRoute } from "./routing.js";
import { AppError } from "../utils/errors.js";

export type HeaderBag = Record<string, string | string[] | undefined>;

const hopByHopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/** Anfrageheader für den lokalen Devserver. */
export function proxyRequestHeaders(options: {
  headers: HeaderBag;
  targetPort: number;
  targetProtocol: "http" | "https";
  publicOrigin: string;
  upstreamOrigin?: string;
}): Record<string, string> {
  const headers: HeaderBag = { ...options.headers };
  for (const name of hopByHopHeaders) delete headers[name];
  delete headers["content-length"];
  delete headers["sec-websocket-key"];
  delete headers["sec-websocket-version"];
  headers.host = `127.0.0.1:${options.targetPort}`;
  const publicUrl = new URL(options.publicOrigin);
  headers["x-forwarded-host"] = publicUrl.host;
  headers["x-forwarded-proto"] = publicUrl.protocol.replace(":", "");
  headers["x-forwarded-port"] = publicUrl.port || (publicUrl.protocol === "https:" ? "443" : "80");
  if (options.headers.origin) {
    headers.origin = options.upstreamOrigin ?? `${options.targetProtocol}://127.0.0.1:${options.targetPort}`;
  }
  return headers as Record<string, string>;
}

function isLoopbackHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(hostname.toLowerCase());
}

/** Schreibt genau die Ziel-URLs bekannter lokaler Dienste auf ihre Slot-Origin um. */
export function rewriteLocalUrl(value: string, mapping: Record<string, string>): string {
  try {
    const url = new URL(value);
    if (!isLoopbackHost(url.hostname)) return value;
    const replacement = mapping[url.port];
    if (!replacement) return value;
    const publicUrl = new URL(replacement);
    publicUrl.pathname = url.pathname;
    publicUrl.search = url.search;
    publicUrl.hash = url.hash;
    return publicUrl.href;
  } catch {
    return value;
  }
}

/**
 * Zerlegt einen `Link`-Header in seine Einträge, statt ihn als eine URL zu
 * behandeln. Kommas innerhalb von spitzen Klammern oder Anführungszeichen bleiben
 * dabei erhalten.
 */
export function splitLinkHeader(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inBrackets = false;
  let inQuotes = false;
  for (const character of value) {
    if (character === "<" && !inQuotes) inBrackets = true;
    else if (character === ">" && !inQuotes) inBrackets = false;
    else if (character === "\"") inQuotes = !inQuotes;
    if (character === "," && !inBrackets && !inQuotes) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function rewriteLinkHeader(value: string, mapping: Record<string, string>): string {
  return splitLinkHeader(value)
    .map((entry) => entry.replace(/^<([^>]*)>/, (_match, url: string) => `<${rewriteLocalUrl(url, mapping)}>`))
    .join(", ");
}

/** Meldet `Domain=localhost`-Cookies, ohne sie still umzuschreiben. */
export function cookieDomainWarnings(setCookie: string | string[] | undefined): string[] {
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return values
    .filter((cookie) => /;\s*domain\s*=\s*(localhost|127\.0\.0\.1)\s*(;|$)/i.test(cookie))
    .map((cookie) => cookie.split(";")[0]?.split("=")[0]?.trim() ?? "cookie");
}

function parseCspDirectives(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const name = tokens.shift()?.toLowerCase();
    if (!name) continue;
    directives.set(name, tokens);
  }
  return directives;
}

function serializeCspDirectives(directives: Map<string, string[]>): string {
  return [...directives.entries()].map(([name, values]) => [name, ...values].join(" ")).join("; ");
}

/**
 * Passt für bestätigte lokale Devserver ausschließlich die Embedding-Regel an:
 * `X-Frame-Options` entfällt und `frame-ancestors` erhält die Workbench-Origin.
 * Der restliche CSP bleibt erhalten; jede Änderung wird protokolliert.
 */
export function adjustEmbeddingPolicy(headers: HeaderBag, options: { workbenchOrigins: readonly string[]; allowBridgeScript: boolean }): {
  headers: HeaderBag;
  changes: string[];
} {
  const result: HeaderBag = { ...headers };
  const changes: string[] = [];
  if (result["x-frame-options"] !== undefined) {
    delete result["x-frame-options"];
    changes.push("X-Frame-Options entfernt");
  }
  for (const header of ["content-security-policy", "content-security-policy-report-only"]) {
    const raw = result[header];
    if (raw !== undefined && typeof raw !== "string") continue;
    // Eine erzwungene Policy wird auch dann angelegt, wenn der Upstream keine
    // CSP oder keine frame-ancestors-Direktive geliefert hat. XFO darf nie
    // entfernt werden, ohne einen gleichwertigen, engeren Ersatz zu setzen.
    if (header === "content-security-policy" && raw === undefined) {
      result[header] = `frame-ancestors ${options.workbenchOrigins.join(" ")}`;
      changes.push(`${header}: frame-ancestors für die Workbench gesetzt`);
      continue;
    }
    if (raw === undefined) continue;
    const directives = parseCspDirectives(raw);
    const ancestors = directives.get("frame-ancestors");
    if (ancestors) {
      const missing = options.workbenchOrigins.filter((origin) => !ancestors.includes(origin));
      if (missing.length > 0 || ancestors.includes("'none'")) {
        directives.set("frame-ancestors", [...ancestors.filter((entry) => entry !== "'none'"), ...missing]);
        changes.push(`${header}: frame-ancestors um die Workbench ergänzt`);
      }
    } else {
      directives.set("frame-ancestors", [...options.workbenchOrigins]);
      changes.push(`${header}: frame-ancestors für die Workbench gesetzt`);
    }
    if (options.allowBridgeScript) {
      const scriptSource = directives.get("script-src") ?? directives.get("default-src");
      if (scriptSource && !scriptSource.includes("'self'")) {
        directives.set("script-src", [...scriptSource, "'self'"]);
        changes.push(`${header}: script-src um 'self' für die Bridge ergänzt`);
      }
    }
    result[header] = serializeCspDirectives(directives);
  }
  return { headers: result, changes };
}

/**
 * Verständliche 502-Seite, wenn der Zielport nicht antwortet. Sie lädt sich mit
 * einem Zähler im sessionStorage der Slot-Origin begrenzt selbst neu, damit das
 * Preview nach einem automatischen Devserver-Neustart ohne Nutzereingriff
 * wiederkommt. Nach zehn Versuchen stoppt der Reload; ein späteres manuelles
 * Neuladen startet frisch.
 */
export function devServerDownPage(): string {
  return "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><title>Preview nicht erreichbar</title>"
    + "<script>"
    + "(function(){"
    + "try{"
    + "var key='workbench:preview-retry';"
    + "var raw=window.sessionStorage.getItem(key);"
    + "var now=Date.now();"
    + "var attempt=0;"
    + "if(raw){try{var state=JSON.parse(raw);"
    + "if(state&&typeof state.n==='number'&&typeof state.at==='number'&&now-state.at<120000)attempt=state.n+1;"
    + "}catch(e){attempt=0}}"
    + "if(attempt<10){window.sessionStorage.setItem(key,JSON.stringify({n:attempt,at:now}));"
    + "window.setTimeout(function(){window.location.reload()},5000);"
    + "}else{window.sessionStorage.removeItem(key)}"
    + "}catch(e){}"
    + "})();"
    + "</script>"
    + "</head><body>"
    + "<p style=\"font:14px sans-serif\">Der Entwicklungs-Server antwortet gerade nicht. "
    + "Die Workbench versucht, ihn automatisch neu zu starten; diese Seite lädt sich selbst neu.</p>"
    + "</body></html>";
}

export interface GatewayDiagnosticEvent {
  slotId: number;
  sessionId: string | null;
  routingRevision: number;
  category: "network" | "routing" | "lifecycle";
  severity: "debug" | "info" | "warn" | "error";
  message: string;
  route: string | null;
  metadata: Record<string, unknown>;
}

export interface PreviewGatewayOptions {
  definitions: readonly PreviewSlotDefinition[];
  /** Liefert die aktuelle Route eines Slots aus dem zuletzt veröffentlichten Snapshot. */
  route: (slotId: number) => SlotRoute | null;
  routingRevision: () => number;
  publicUrlForSlot: (slotId: number) => string;
  workbenchOrigins: readonly string[];
  flags: {
    gatewayV2Enabled: boolean;
    bridgeEnabled: boolean;
    diagnosticsEnabled: boolean;
    storageSyncEnabled: boolean;
    maxInjectableHtmlBytes: number;
    maxStorageBytes: number;
    maxStorageKeys: number;
  };
  onDiagnostic?: (event: GatewayDiagnosticEvent) => void;
}

interface RequestContext {
  route: SlotRoute;
  startedAt: number;
  bridge: () => string;
}

// Der Diagnose-Kontext eines Requests überlebt bis zum `onResponse`-Hook.
const requestContexts = new WeakMap<FastifyRequest, RequestContext>();

function closeCode(code: number): number {
  return code === 1005 || code === 1006 ? 1011 : code;
}

function proxyWebSocket(source: WebSocket, request: FastifyRequest, options: {
  targetPort: number;
  targetProtocol: "http" | "https";
  publicOrigin: string;
  upstreamOrigin?: string;
  onEvent?: (severity: "info" | "warn", message: string) => void;
}) {
  const protocolHeader = request.headers["sec-websocket-protocol"];
  const protocols = typeof protocolHeader === "string"
    ? protocolHeader.split(",").map((protocol) => protocol.trim()).filter(Boolean)
    : [];
  const rawUrl = request.raw.url ?? request.url;
  const target = new WebSocket(`${options.targetProtocol === "https" ? "wss" : "ws"}://127.0.0.1:${options.targetPort}${rawUrl}`, protocols, {
    headers: proxyRequestHeaders({
      headers: request.headers as HeaderBag,
      targetPort: options.targetPort,
      targetProtocol: options.targetProtocol,
      publicOrigin: options.publicOrigin,
      ...(options.upstreamOrigin === undefined ? {} : { upstreamOrigin: options.upstreamOrigin }),
    }),
    rejectUnauthorized: false,
  });
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = [];
  let pendingBytes = 0;
  const maximumPendingBytes = 512 * 1024;
  const maximumBufferedBytes = 2 * 1024 * 1024;

  const closeForBackpressure = () => {
    if (source.readyState === WebSocket.OPEN) source.close(1013, "Preview-WebSocket ist überlastet");
    if (target.readyState === WebSocket.OPEN) target.close(1013, "Preview-WebSocket ist überlastet");
    else if (target.readyState === WebSocket.CONNECTING) target.terminate();
  };

  source.on("message", (data, binary) => {
    if (target.readyState === WebSocket.OPEN) {
      if (target.bufferedAmount > maximumBufferedBytes) {
        closeForBackpressure();
        return;
      }
      target.send(data, { binary });
      return;
    }
    if (target.readyState !== WebSocket.CONNECTING) return;
    pendingBytes += Array.isArray(data) ? data.reduce((sum, chunk) => sum + chunk.length, 0) : data.byteLength;
    if (pendingBytes > maximumPendingBytes) {
      source.close(1009, "Preview-WebSocket-Puffer überschritten");
      target.terminate();
      return;
    }
    pending.push({ data, binary });
  });
  target.on("open", () => {
    for (const message of pending.splice(0)) target.send(message.data, { binary: message.binary });
    pendingBytes = 0;
    options.onEvent?.("info", "WebSocket geöffnet");
  });
  target.on("message", (data, binary) => {
    if (source.readyState !== WebSocket.OPEN) return;
    if (source.bufferedAmount > maximumBufferedBytes) {
      closeForBackpressure();
      return;
    }
    source.send(data, { binary });
  });
  source.on("close", (code, reason) => {
    if (target.readyState === WebSocket.OPEN) target.close(closeCode(code), reason);
    else if (target.readyState === WebSocket.CONNECTING) target.terminate();
  });
  target.on("close", (code) => {
    options.onEvent?.(code === 1000 ? "info" : "warn", `WebSocket geschlossen (${code})`);
    if (source.readyState === WebSocket.OPEN) source.close(closeCode(code));
  });
  source.on("error", () => target.terminate());
  target.on("error", () => {
    options.onEvent?.("warn", "Preview-Devserver für WebSocket nicht erreichbar");
    if (source.readyState === WebSocket.OPEN) source.close(1011, "Preview-Devserver nicht erreichbar");
  });
}

/**
 * Betreibt je Slot einen eigenen Listener auf Loopback. Der Listener liest pro
 * Request genau eine Route aus dem aktuellen Routing-Snapshot.
 */
export class PreviewGateway {
  private readonly options: PreviewGatewayOptions;
  private readonly listeners: FastifyInstance[] = [];

  constructor(options: PreviewGatewayOptions) {
    this.options = options;
  }

  private diagnostic(event: GatewayDiagnosticEvent) {
    if (!this.options.flags.diagnosticsEnabled) return;
    this.options.onDiagnostic?.(event);
  }

  private reportBridgeUnavailable(slotId: number, route: SlotRoute, url: string, status: string) {
    this.diagnostic({
      slotId,
      sessionId: route.sessionId,
      routingRevision: this.options.routingRevision(),
      category: "routing",
      severity: "warn",
      message: `Client-Bridge nicht verfügbar (${status}).`,
      route: url,
      metadata: { bridgeUnavailable: true, status },
    });
  }

  private resolveRoute(slotId: number): SlotRoute {
    const route = this.options.route(slotId);
    if (!route) {
      throw new AppError(503, "PREVIEW_SLOT_UNASSIGNED", "Dieser Preview-Slot ist noch keinem Devserver zugewiesen.");
    }
    if (route.state === "quarantined") {
      throw new AppError(409, "PREVIEW_SLOT_QUARANTINED", "Dieser Preview-Slot steht in Quarantäne und liefert keine Inhalte aus.");
    }
    return route;
  }

  private async createListener(definition: PreviewSlotDefinition): Promise<FastifyInstance> {
    const listener = Fastify({ logger: false, trustProxy: ["127.0.0.1", "::1"] });
    await listener.register(replyFrom);
    await listener.register(websocket);
    const publicOrigin = () => new URL(this.options.publicUrlForSlot(definition.id)).origin;

    // Reservierte Routen. Sie erreichen den Devserver nie.
    listener.get(PREVIEW_BRIDGE_ROUTE, { config: { rateLimit: false } }, async (_request, reply) => {
      const route = this.options.route(definition.id);
      const source = bridgeScriptSource({
        version: PREVIEW_BRIDGE_VERSION,
        slotId: definition.id,
        mapping: route?.mapping ?? {},
        workbenchOrigins: [...this.options.workbenchOrigins],
        resetRoute: PREVIEW_RESET_ROUTE,
        diagnosticsEnabled: this.options.flags.diagnosticsEnabled,
        storageSyncEnabled: this.options.flags.storageSyncEnabled,
        maxStorageBytes: this.options.flags.maxStorageBytes,
        maxStorageKeys: this.options.flags.maxStorageKeys,
      });
      return reply
        .header("content-type", "application/javascript; charset=utf-8")
        .header("cache-control", "no-store")
        .send(source);
    });
    // Minimale Reset-Seite der Slot-Origin: Sie lädt nur die Bridge, damit die
    // Workbench Storage und Service Worker verifiziert leeren kann.
    listener.get(PREVIEW_RESET_ROUTE, { config: { rateLimit: false } }, async (_request, reply) =>
      reply
        .type("text/html; charset=utf-8")
        .header("cache-control", "no-store")
        .send(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Preview-Slot zurücksetzen</title>`
          + `<script src="${PREVIEW_BRIDGE_ROUTE}" ${"data-workbench-preview-bridge"}></script></head><body></body></html>`),
    );
    listener.post(PREVIEW_RESET_ROUTE, { config: { rateLimit: false } }, async (_request, reply) =>
      // Die Bridge löscht und inventarisiert die isolierten Speicherbereiche selbst.
      // Clear-Site-Data würde den laufenden Kontext vor seinem Prüfbericht verlieren.
      reply
        .header("cache-control", "no-store")
        .status(204)
        .send(),
    );

    const proxyHttp = (request: FastifyRequest, reply: FastifyReply) => {
      let route: SlotRoute;
      try {
        route = this.resolveRoute(definition.id);
      } catch (error) {
        // Browser sehen statt rohem JSON eine verständliche Seite: Die nackte
        // Slot-URL funktioniert nur, solange eine Session diese Origin besitzt.
        if (error instanceof AppError && error.code === "PREVIEW_SLOT_UNASSIGNED"
          && String(request.headers.accept ?? "").includes("text/html")) {
          return reply.type("text/html; charset=utf-8").status(503).send(
            "<!doctype html><meta charset=\"utf-8\"><title>Preview nicht aktiv</title>"
            + "<p style=\"font:14px sans-serif\">Dieser Preview-Slot ist keinem Entwicklungs-Server zugewiesen. "
            + "Öffne die Vorschau aus der Workbench (Seite „Previews“), damit dieser Slot eine aktive Sitzung erhält.</p>",
          );
        }
        throw error;
      }
      const startedAt = Date.now();
      const origin = publicOrigin();
      const upstreamOrigin = route.role === "dependency" && route.primaryTarget
        ? `${route.primaryTarget.targetProtocol}://127.0.0.1:${route.primaryTarget.targetPort}`
        : undefined;
      const injectBridge = this.options.flags.bridgeEnabled && this.options.flags.gatewayV2Enabled;
      let injectionStatus: BridgeInjectionStatus | "skipped" = "skipped";

      const proxyOptions: FastifyReplyFromHooks = {
        rewriteRequestHeaders: () => {
          const headers = proxyRequestHeaders({
            headers: request.headers as HeaderBag,
            targetPort: route.targetPort,
            targetProtocol: route.targetProtocol,
            publicOrigin: origin,
            ...(upstreamOrigin === undefined ? {} : { upstreamOrigin }),
          });
          // Ohne Komprimierung lässt sich HTML zuverlässig parsen.
          if (injectBridge) delete headers["accept-encoding"];
          return headers;
        },
        rewriteHeaders: (headers) => {
          const incoming = headers as HeaderBag;
          const adjusted = adjustEmbeddingPolicy(incoming, {
            workbenchOrigins: this.options.workbenchOrigins,
            allowBridgeScript: injectBridge,
          });
          const rewritten = adjusted.headers;
          for (const header of ["location", "content-location"]) {
            const value = rewritten[header];
            if (typeof value === "string") rewritten[header] = rewriteLocalUrl(value, route.mapping);
          }
          if (typeof rewritten.link === "string") rewritten.link = rewriteLinkHeader(rewritten.link, route.mapping);
          for (const name of cookieDomainWarnings(rewritten["set-cookie"])) {
            this.diagnostic({
              slotId: definition.id,
              sessionId: route.sessionId,
              routingRevision: this.options.routingRevision(),
              category: "routing",
              severity: "warn",
              message: `Cookie „${name}" nutzt Domain=localhost und gilt hostweit für alle Slots.`,
              route: request.url,
              metadata: { limitation: "cookies-share-host" },
            });
          }
          if (adjusted.changes.length > 0) {
            this.diagnostic({
              slotId: definition.id,
              sessionId: route.sessionId,
              routingRevision: this.options.routingRevision(),
              category: "routing",
              severity: "info",
              message: `Sicherheitsrichtlinie angepasst: ${adjusted.changes.join(", ")}`,
              route: request.url,
              metadata: { changes: adjusted.changes },
            });
          }
          if (route.role === "dependency" && request.headers.origin) {
            rewritten["access-control-allow-origin"] = request.headers.origin;
            rewritten["access-control-allow-credentials"] = "true";
            const vary = String(rewritten.vary ?? "");
            rewritten.vary = vary.split(",").map((item) => item.trim().toLowerCase()).includes("origin") ? vary : [vary, "Origin"].filter(Boolean).join(", ");
          }
          if (injectBridge && isInjectableContentType(String(incoming["content-type"] ?? ""))) {
            delete rewritten["content-length"];
            delete rewritten["content-encoding"];
          }
          return rewritten;
        },
        ...(injectBridge ? {
          onResponse: async (_request, responseReply, response) => {
            const upstream = response as unknown as { headers: HeaderBag; stream: NodeJS.ReadableStream & AsyncIterable<unknown> };
            const contentType = String(upstream.headers["content-type"] ?? "");
            if (!isInjectableContentType(contentType)) return responseReply.send(upstream.stream);
            const announced = Number(upstream.headers["content-length"]);
            // Ist die Größe bereits angekündigt und zu groß, wird gar nicht erst gepuffert.
            if (Number.isFinite(announced) && announced > this.options.flags.maxInjectableHtmlBytes) {
              injectionStatus = "too-large";
              this.reportBridgeUnavailable(definition.id, route, request.url, "too-large");
              return responseReply.send(upstream.stream);
            }
            const body = await collect(upstream.stream, this.options.flags.maxInjectableHtmlBytes);
            if (body === null) {
              // Die Antwort ist größer als das Injektionslimit. Der Stream ist
              // teilweise gelesen und lässt sich nicht mehr vollständig durchreichen;
              // deshalb sauber abbrechen und eine kurze Fehlerseite senden.
              injectionStatus = "too-large";
              this.reportBridgeUnavailable(definition.id, route, request.url, "too-large");
              const upstreamStream = upstream.stream as Readable;
              upstreamStream.destroy();
              return responseReply.code(502).type("text/html; charset=utf-8").send(
                "<!doctype html><meta charset=\"utf-8\"><title>Antwort zu groß</title><p style=\"font:14px sans-serif\">Die Antwort des Entwicklungs-Servers überschreitet die Größenbegrenzung für die Einbettung und wurde abgebrochen.</p>",
              );
            }
            const injection = injectBridgeScript(body, {
              maxBytes: this.options.flags.maxInjectableHtmlBytes,
              charset: charsetOf(contentType),
              scriptSource: PREVIEW_BRIDGE_ROUTE,
            });
            injectionStatus = injection.status;
            if (injection.status !== "injected" || injection.html === null) {
              if (injection.status !== "already-present") {
                this.reportBridgeUnavailable(definition.id, route, request.url, injection.status);
              }
              return responseReply.send(body);
            }
            return responseReply.send(injection.html);
          },
        } : {}),
        onError: (errorReply, error) => {
          this.diagnostic({
            slotId: definition.id,
            sessionId: route.sessionId,
            routingRevision: this.options.routingRevision(),
            category: "network",
            severity: "error",
            message: `Weiterleitung fehlgeschlagen: ${error.error.message}`,
            route: request.url,
            metadata: { durationMs: Date.now() - startedAt },
          });
          // Browser sehen statt einer nackten Fehlermeldung eine Seite, die
          // sich nach einem Devserver-Neustart von selbst erholt.
          if (String(request.headers.accept ?? "").includes("text/html")) {
            return errorReply.code(502).type("text/html; charset=utf-8").send(devServerDownPage());
          }
          errorReply.send(error.error);
        },
        timeout: 30_000,
      };
      requestContexts.set(request, {
        route,
        startedAt,
        bridge: () => injectionStatus,
      });
      return reply.from(`${route.targetProtocol}://127.0.0.1:${route.targetPort}${request.raw.url ?? request.url}`, proxyOptions);
    };

    // Statuscode und Laufzeit stehen erst nach der Antwort fest.
    listener.addHook("onResponse", async (request, reply) => {
      const context = requestContexts.get(request);
      if (!context) return;
      requestContexts.delete(request);
      this.diagnostic({
        slotId: definition.id,
        sessionId: context.route.sessionId,
        routingRevision: this.options.routingRevision(),
        category: "network",
        severity: reply.statusCode >= 500 ? "error" : reply.statusCode >= 400 ? "warn" : "debug",
        message: `${request.method} ${request.url} → ${reply.statusCode}`,
        route: request.url,
        metadata: {
          status: reply.statusCode,
          durationMs: Date.now() - context.startedAt,
          targetPort: context.route.targetPort,
          bridge: context.bridge(),
        },
      });
    });

    for (const url of ["/", "/*"]) {
      listener.route({
        method: "GET",
        url,
        config: { rateLimit: false },
        helmet: false,
        handler: proxyHttp,
        wsHandler: (socket, request) => {
          const route = this.resolveRoute(definition.id);
          const upstreamOrigin = route.role === "dependency" && route.primaryTarget
            ? `${route.primaryTarget.targetProtocol}://127.0.0.1:${route.primaryTarget.targetPort}`
            : undefined;
          proxyWebSocket(socket, request, {
            targetPort: route.targetPort,
            targetProtocol: route.targetProtocol,
            publicOrigin: publicOrigin(),
            ...(upstreamOrigin === undefined ? {} : { upstreamOrigin }),
            onEvent: (severity, message) => this.diagnostic({
              slotId: definition.id,
              sessionId: route.sessionId,
              routingRevision: this.options.routingRevision(),
              category: "network",
              severity,
              message,
              route: request.url,
              metadata: { source: "socket" },
            }),
          });
        },
      });
      listener.route({
        method: ["DELETE", "PATCH", "POST", "PUT", "OPTIONS"],
        url,
        config: { rateLimit: false },
        helmet: false,
        handler: proxyHttp,
      });
    }
    await listener.listen({ host: "127.0.0.1", port: definition.internalPort });
    return listener;
  }

  async start() {
    if (this.listeners.length > 0) return;
    try {
      for (const definition of this.options.definitions) {
        this.listeners.push(await this.createListener(definition));
      }
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop() {
    const listeners = this.listeners.splice(0);
    await Promise.allSettled(listeners.map((listener) => listener.close()));
  }
}

async function collect(stream: AsyncIterable<unknown>, maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(typeof chunk === "string" ? chunk : chunk as unknown as Uint8Array);
    total += buffer.length;
    // Harte Obergrenze: Wird die Antwort größer als erlaubt, sofort abbrechen,
    // statt den gesamten Body in den Speicher zu laden (F01-01). Der Aufrufer
    // entscheidet dann, wie er mit der zu großen Antwort umgeht.
    if (total > maxBytes) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
