import type { FastifyReply, FastifyRequest } from "fastify";
import { settings } from "../config/settings.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createProxyHandler(allowedOrigins: string[]) {
  const originAlt = allowedOrigins.map(escapeRegex).join("|");
  const attrRe = new RegExp(
    `(?<attr>src|href|srcset|action)=(["'])(?<url>(?:${originAlt})[^"']*)(?<quote>["'])`,
    "g",
  );
  const proxyPrefix = "/api/v1/proxy/";

  return async function proxyHandler(request: FastifyRequest, reply: FastifyReply) {
    const params = request.params as Record<string, string>;
    const encoded = params["*"] ?? "";
    let target: URL;
    try {
      target = new URL(decodeURIComponent(encoded));
    } catch {
      return reply.status(400).send({ error: { code: "INVALID_TARGET", message: "Ungültiges Proxy-Ziel." } });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return reply.status(400).send({ error: { code: "INVALID_TARGET", message: "Nur http(s) Ziele sind erlaubt." } });
    }
    if (!allowedOrigins.includes(target.origin)) {
      return reply.status(403).send({ error: { code: "PROXY_FORBIDDEN", message: "Diese Origin ist nicht für den Proxy freigegeben." } });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.proxyTimeoutMilliseconds);
    try {
      const upstream = await fetch(target.href, {
        method: "GET",
        headers: { accept: request.headers.accept ?? "*/*" },
        redirect: "follow",
        signal: controller.signal,
      });
      reply.status(upstream.status);
      const contentType = upstream.headers.get("content-type") ?? "";
      if (contentType) reply.header("content-type", contentType);
      for (const header of [
        "content-encoding",
        "content-length",
        "transfer-encoding",
        "x-frame-options",
        "content-security-policy",
        "content-security-policy-report-only",
        "content-disposition",
        "set-cookie",
      ]) {
        reply.removeHeader(header);
      }
      reply.header("cache-control", "no-store");

      const body = upstream.body;
      if (body && contentType.includes("text/html")) {
        const html = await upstream.text();
        const rewritten = html.replace(attrRe, (_match, attr: string, open: string, url: string, quote: string) =>
          `${attr}=${open}${proxyPrefix}${encodeURIComponent(url)}${quote}`,
        );
        return reply.send(rewritten);
      }
      return reply.send(body);
    } catch (error) {
      request.log.error({ err: error }, "Proxy-Fehler");
      return reply.status(502).send({ error: { code: "PROXY_ERROR", message: "Die Upstream-Anfrage ist fehlgeschlagen." } });
    } finally {
      clearTimeout(timeout);
    }
  };
}
