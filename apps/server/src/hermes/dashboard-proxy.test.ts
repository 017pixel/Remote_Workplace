import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { proxyRequestHeaders, proxyWebSocketHeaders, rewriteCookiePath, rewriteHtmlAssetUrls, rewriteJavascriptAssetReferences, rewriteLocation, rewriteResponseHeaders, routeBridgeScript, upstreamPath } from "./dashboard-proxy.js";

describe("Hermes-Dashboard-Proxy", () => {
  it("schreibt den Präfixpfad korrekt zum Dashboard um", () => {
    expect(upstreamPath("/hermes")).toBe("/");
    expect(upstreamPath("/hermes/")).toBe("/");
    expect(upstreamPath("/hermes/settings?tab=cron")).toBe("/settings?tab=cron");
    expect(upstreamPath("/settings")).toBe("/settings");
  });

  it("setzt Hermes' Upstream-Host und den Forwarded-Präfix", () => {
    const headers = proxyRequestHeaders({ headers: { host: "workbench.example" } } as FastifyRequest, { accept: "text/html" });
    expect(headers.host).toBe("127.0.0.1:9119");
    expect(headers["x-forwarded-prefix"]).toBe("/hermes");
    expect(headers["x-forwarded-host"]).toBe("workbench.example");
  });

  it("übersetzt den äußeren WebSocket-Origin auf den Loopback-Upstream", () => {
    const headers = proxyWebSocketHeaders({
      headers: {
        host: "hermes.example",
        origin: "https://hermes.example",
        cookie: "session=1",
      },
    } as FastifyRequest, { cookie: "session=1" }) as Record<string, string | string[] | undefined>;
    expect(headers.origin).toBe("http://127.0.0.1:9119");
    expect(headers.cookie).toBe("session=1");
    expect(headers["x-forwarded-host"]).toBe("hermes.example");
  });

  it("fügt bei WebSocket-Clients ohne Origin keinen künstlichen Origin hinzu", () => {
    const headers = proxyWebSocketHeaders({ headers: { host: "hermes.example" } } as FastifyRequest, {}) as Record<string, string | string[] | undefined>;
    expect(headers.origin).toBeUndefined();
  });

  it("schreibt Redirects und Cookie-Pfade um, aber keine fremden absoluten URLs", () => {
    expect(rewriteLocation("/settings")).toBe("/hermes/settings");
    expect(rewriteLocation("/hermes/settings")).toBe("/hermes/settings");
    expect(rewriteLocation("//other.example/settings")).toBe("//other.example/settings");
    expect(rewriteLocation("https://other.example/settings")).toBe("https://other.example/settings");
    expect(rewriteCookiePath("session=1; Path=/; HttpOnly")).toBe("session=1; Path=/hermes; HttpOnly");
    expect(rewriteCookiePath("session=1; Path=/api; Secure")).toBe("session=1; Path=/hermes/api; Secure");
    expect(rewriteCookiePath("session=1; Path=//other.example; Secure")).toBe("session=1; Path=//other.example; Secure");
  });

  it("entfernt die HTML-Längen- und Kompressionsheader vor der Bridge-Injektion", () => {
    const headers = rewriteResponseHeaders({
      "content-type": "text/html; charset=utf-8",
      "content-length": "123",
      "content-encoding": "gzip",
    });
    expect(headers["content-type"]).toContain("text/html");
    expect(headers["content-length"]).toBeUndefined();
    expect(headers["content-encoding"]).toBeUndefined();
  });

  it("präfixt bare Vite-Assetreferenzen in Hermes-JavaScript", () => {
    expect(rewriteJavascriptAssetReferences('const a="assets/SessionsPage.js"; const b=`assets/vendor.js`; const c="./assets/local.js"; const d=import("./index.js");')).toBe('const a="hermes/assets/SessionsPage.js?rw=3"; const b=`hermes/assets/vendor.js?rw=3`; const c="./assets/local.js?rw=3"; const d=import("./index.js?rw=3");');
  });

  it("hängt den Versionsmarker nie an CSS im Vite-Preload-Manifest", () => {
    // Vite erkennt Stylesheets nur an der Endung. Mit `?rw=N` würde das
    // Stylesheet als Modul geladen und der Browser bräche mit einem
    // MIME-Type-Fehler ab.
    expect(rewriteJavascriptAssetReferences('const deps=["assets/index-Abc123.css","assets/xterm-Def456.css","assets/SystemPage-Ghi789.js"];')).toBe('const deps=["hermes/assets/index-Abc123.css","hermes/assets/xterm-Def456.css","hermes/assets/SystemPage-Ghi789.js?rw=3"];');
  });

  it("bustet den Browser-Cache für präfixierte Dashboard-Assets, aber nicht für CSS", () => {
    expect(rewriteHtmlAssetUrls('<script src="/hermes/assets/index.js"></script><link href="/hermes/assets/app.css?v=2">')).toBe('<script src="/hermes/assets/index.js?rw=3"></script><link href="/hermes/assets/app.css?v=2">');
    expect(rewriteHtmlAssetUrls('<link href="/hermes/assets/index-Abc123.css">')).toBe('<link href="/hermes/assets/index-Abc123.css">');
  });

  it("meldet Routenwechsel nach oben und nimmt Navigationsbefehle entgegen", () => {
    const bridge = routeBridgeScript();
    // Nach oben: die Workbench merkt sich die zuletzt besuchte Hermes-Seite.
    expect(bridge).toContain("route.changed");
    expect(bridge).toContain("window.parent.postMessage");
    // Nach unten: Seitenwechsel ohne Neuladen der SPA.
    expect(bridge).toContain("route.navigate");
    expect(bridge).toContain("history.pushState");
    expect(bridge).toContain("PopStateEvent");
    // Geparkte Hermes-Flächen behalten WebSockets, pausieren aber Polling.
    expect(bridge).toContain("host.activity");
    expect(bridge).toContain("if (hostActive) callback");
  });

  it("nimmt nur Navigationsbefehle vom eigenen Origin mit unverdächtigem Pfad an", () => {
    const bridge = routeBridgeScript();
    expect(bridge).toContain("event.origin !== location.origin");
    expect(bridge).toContain('data.path.startsWith("/")');
    expect(bridge).toContain('data.path.includes("..")');
    expect(bridge).toContain('data.path.startsWith("//")');
  });

  it("entfernt auch JavaScript-Längenheader bei einer Asset-Umschreibung", () => {
    const headers = rewriteResponseHeaders({
      "content-type": "text/javascript; charset=utf-8",
      "content-length": "123",
      "content-encoding": "gzip",
    });
    expect(headers["content-length"]).toBeUndefined();
    expect(headers["content-encoding"]).toBeUndefined();
  });
});
