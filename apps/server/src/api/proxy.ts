import type { FastifyReply, FastifyRequest } from "fastify";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createProxyHandler(allowedOrigins: string[]) {
  const allowedOriginSet = new Set(allowedOrigins);
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
      throw new AppError(400, "INVALID_TARGET", "Ungültiges Proxy-Ziel.");
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new AppError(400, "INVALID_TARGET", "Nur http(s) Ziele sind erlaubt.");
    }
    if (!allowedOrigins.includes(target.origin)) {
      throw new AppError(403, "PROXY_FORBIDDEN", "Diese Origin ist nicht für den Proxy freigegeben.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.proxyTimeoutMilliseconds);
    try {
      let current = target;
      let upstream: Response | undefined;
      for (let redirects = 0; redirects <= 5; redirects += 1) {
        if (!allowedOriginSet.has(current.origin)) {
          throw new AppError(403, "PROXY_REDIRECT_FORBIDDEN", "Die Weiterleitung verlässt die freigegebene Origin.");
        }
        upstream = await fetch(current.href, {
          method: "GET",
          headers: { accept: request.headers.accept ?? "*/*" },
          redirect: "manual",
          signal: controller.signal,
        });
        if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
        const location = upstream.headers.get("location");
        await upstream.body?.cancel();
        if (!location) break;
        if (redirects === 5) throw new Error("Zu viele Weiterleitungen.");
        current = new URL(location, current);
      }
      if (!upstream) throw new Error("Keine Upstream-Antwort.");
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
        const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
        if (declaredLength > settings.proxyMaximumHtmlBytes) throw new Error("HTML-Antwort überschreitet das Größenlimit.");
        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > settings.proxyMaximumHtmlBytes) {
            await reader.cancel();
            throw new Error("HTML-Antwort überschreitet das Größenlimit.");
          }
          chunks.push(value);
        }
        const html = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString("utf8");
        const rewritten = html.replace(attrRe, (_match, attr: string, open: string, url: string, quote: string) => {
          if (attr !== "srcset") {
            return `${attr}=${open}${proxyPrefix}${encodeURIComponent(url)}${quote}`;
          }
          // srcset enthält mehrere Kandidaten ("url 1x, url 2x"). Jede Kandidaten-
          // URL einzeln umschreiben, die Descriptoren (1x, 2x, …) erhalten.
          const candidates = url.split(",").map((candidate) => candidate.trim());
          const rewrittenCandidates = candidates.map((candidate) => {
            const part = candidate.match(/^(\S+)(.*)$/);
            if (!part) return candidate;
            const candidateUrl = part[1]!;
            const descriptor = part[2] ?? "";
            return `${proxyPrefix}${encodeURIComponent(candidateUrl)}${descriptor}`;
          });
          return `${attr}=${open}${rewrittenCandidates.join(", ")}${quote}`;
        });
        return reply.send(rewritten);
      }
      return reply.send(body);
    } catch (error) {
      if (error instanceof AppError) throw error;
      request.log.error({ err: error }, "Proxy-Fehler");
      throw new AppError(502, "PROXY_ERROR", "Die Upstream-Anfrage ist fehlgeschlagen.", null, true);
    } finally {
      clearTimeout(timeout);
    }
  };
}
