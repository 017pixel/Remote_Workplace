import { describe, expect, it } from "vitest";
import { injectOpenCodeHtmlBridge, opencodeHttpRoutes, opencodeRouteBridgeScript } from "./opencodeWebProxy.js";

describe("OpenCode-Web-Proxy", () => {
  it("registriert Root und prefixed SPA-Routen", () => {
    expect(opencodeHttpRoutes).toContain("/");
    expect(opencodeHttpRoutes).toContain("/opencode/*");
  });

  it("injiziert die Route-Bridge vor dem Head-Ende und scoped Assets", () => {
    const html = injectOpenCodeHtmlBridge("<!doctype html><html><head><script src=\"/assets/app.js\"></script></head><body></body></html>");
    expect(html).toContain('data-wrapt-opencode-route="1"');
    expect(html).toContain('src="/opencode/assets/app.js"');
    expect(html.indexOf('data-wrapt-opencode-route="1"')).toBeLessThan(html.indexOf("</head>"));
  });

  it("normalisiert den Workbench-Präfix und die OpenCode-Session-Deep-Links", () => {
    expect(opencodeRouteBridgeScript).toContain('nextPath.startsWith(prefix + "/")');
    expect(opencodeRouteBridgeScript).toContain('nextPath.slice(prefix.length)');
    expect(opencodeRouteBridgeScript).toContain('current.searchParams.get("session")');
    expect(opencodeRouteBridgeScript).toContain('current.searchParams.get("directory")');
    expect(opencodeRouteBridgeScript).toContain('"/" + encodeDirectory(directory) + "/session/"');
  });

  it("scoped absolute API-, XHR- und WebSocket-Ziele auf den Proxy", () => {
    expect(opencodeRouteBridgeScript).toContain("const scopedPath = (value) =>");
    expect(opencodeRouteBridgeScript).toContain('url.pathname === "/api/v1"');
    expect(opencodeRouteBridgeScript).toContain("window.fetch = (input, init)");
    expect(opencodeRouteBridgeScript).toContain("class extends NativeWebSocket");
    expect(opencodeRouteBridgeScript).toContain("XMLHttpRequest.prototype.open");
  });

  it("meldet OpenCode-Presence im Standalone- und iframe-Modus", () => {
    expect(opencodeRouteBridgeScript).toContain('source: "opencode"');
    expect(opencodeRouteBridgeScript).toContain('source: "wrapt-opencode"');
    expect(opencodeRouteBridgeScript).toContain('type: "route.changed"');
    expect(opencodeRouteBridgeScript).toContain("/api/v1/notifications/presence");
    expect(opencodeRouteBridgeScript).toContain('segments[index + 1] || null');
  });

  it("meldet Session-Wechsel und Fokus erneut", () => {
    expect(opencodeRouteBridgeScript).toContain('history.pushState = function');
    expect(opencodeRouteBridgeScript).toContain('history.replaceState = function');
    expect(opencodeRouteBridgeScript).toContain('addEventListener("popstate", report)');
    expect(opencodeRouteBridgeScript).toContain('addEventListener("focus", report)');
  });
});
