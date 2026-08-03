import { describe, expect, it } from "vitest";
import {
  adjustEmbeddingPolicy,
  cookieDomainWarnings,
  proxyRequestHeaders,
  rewriteLinkHeader,
  rewriteLocalUrl,
  splitLinkHeader,
} from "./gateway.js";

const mapping = { "5173": "https://server.test:8451/", "4000": "https://server.test:8452/" };

describe("Gateway-Header", () => {
  it("entfernt Hop-by-Hop-Header und setzt die öffentliche Slot-Origin", () => {
    const headers = proxyRequestHeaders({
      headers: {
        host: "server.test:8451",
        connection: "keep-alive",
        upgrade: "websocket",
        "transfer-encoding": "chunked",
        "content-length": "12",
        origin: "https://server.test:8451",
        accept: "text/html",
      },
      targetPort: 5173,
      targetProtocol: "http",
      publicOrigin: "https://server.test:8451",
    });
    expect(headers.host).toBe("127.0.0.1:5173");
    expect(headers.connection).toBeUndefined();
    expect(headers.upgrade).toBeUndefined();
    expect(headers["transfer-encoding"]).toBeUndefined();
    expect(headers["content-length"]).toBeUndefined();
    expect(headers["x-forwarded-host"]).toBe("server.test:8451");
    expect(headers["x-forwarded-proto"]).toBe("https");
    expect(headers["x-forwarded-port"]).toBe("8451");
    expect(headers.origin).toBe("http://127.0.0.1:5173");
    expect(headers.accept).toBe("text/html");
  });

  it("schreibt nur bekannte lokale Ziele um", () => {
    expect(rewriteLocalUrl("http://localhost:4000/api?a=1#top", mapping)).toBe("https://server.test:8452/api?a=1#top");
    expect(rewriteLocalUrl("http://127.0.0.1:9999/api", mapping)).toBe("http://127.0.0.1:9999/api");
    expect(rewriteLocalUrl("https://example.com/api", mapping)).toBe("https://example.com/api");
    expect(rewriteLocalUrl("kein-url", mapping)).toBe("kein-url");
  });

  it("zerlegt Link-Header, statt sie als eine URL zu behandeln", () => {
    const value = "<http://localhost:4000/a.css>; rel=preload; as=style, <http://localhost:5173/b.js>; rel=\"modulepreload, x\"";
    expect(splitLinkHeader(value)).toHaveLength(2);
    const rewritten = rewriteLinkHeader(value, mapping);
    expect(rewritten).toContain("<https://server.test:8452/a.css>");
    expect(rewritten).toContain("<https://server.test:8451/b.js>");
    expect(rewritten).toContain("rel=\"modulepreload, x\"");
  });

  it("meldet hostweite Cookies, statt sie still umzuschreiben", () => {
    const warnings = cookieDomainWarnings(["sid=abc; Path=/; Domain=localhost", "theme=dark; Path=/"]);
    expect(warnings).toEqual(["sid"]);
  });

  it("passt nur die Embedding-Regel an und behält den restlichen CSP", () => {
    const result = adjustEmbeddingPolicy({
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'self'; script-src 'nonce-x'; frame-ancestors 'none'",
    }, { workbenchOrigins: ["https://server.test:8443"], allowBridgeScript: true });
    expect(result.headers["x-frame-options"]).toBeUndefined();
    const policy = String(result.headers["content-security-policy"]);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors https://server.test:8443");
    expect(policy).not.toContain("'none'");
    expect(policy).toContain("script-src 'nonce-x' 'self'");
    expect(result.changes.length).toBeGreaterThanOrEqual(2);
  });

  it("ergänzt frame-ancestors, wenn die Upstream-CSP keine Embedding-Regel enthält", () => {
    const result = adjustEmbeddingPolicy({ "content-security-policy": "default-src 'self'" }, { workbenchOrigins: ["https://server.test:8443"], allowBridgeScript: false });
    expect(result.headers["content-security-policy"]).toBe("default-src 'self'; frame-ancestors https://server.test:8443");
    expect(result.changes).toHaveLength(1);
  });

  it("ersetzt XFO auch ohne Upstream-CSP immer durch eine enge frame-ancestors-Policy", () => {
    const result = adjustEmbeddingPolicy({ "x-frame-options": "SAMEORIGIN" }, { workbenchOrigins: ["https://server.test:8443"], allowBridgeScript: false });
    expect(result.headers["x-frame-options"]).toBeUndefined();
    expect(result.headers["content-security-policy"]).toBe("frame-ancestors https://server.test:8443");
  });
});
