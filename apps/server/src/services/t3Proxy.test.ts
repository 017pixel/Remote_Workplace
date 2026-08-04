import { describe, expect, it } from "vitest";
import { injectT3HtmlBridge, remoteBrowserFallbackScript, t3HttpRoutes, t3RouteBridgeScript } from "./t3Proxy.js";

describe("T3-Proxy", () => {
  it("leitet gespeicherte Bildanhänge an T3 weiter", () => {
    expect(t3HttpRoutes).toContain("/api/assets/*");
  });

  it("leitet die T3-API-Gruppen für Threads und Connect weiter", () => {
    expect(t3HttpRoutes).toContain("/api/orchestration/*");
    expect(t3HttpRoutes).toContain("/api/connect/*");
    expect(t3HttpRoutes).toContain("/api/t3-connect/*");
    expect(t3HttpRoutes).toContain("/api/observability/*");
    expect(t3HttpRoutes).toContain("/oauth/*");
  });

  it("brückt die Web-Browserkarte an den umgebenden Workbench-ToolPanel", () => {
    expect(remoteBrowserFallbackScript).toContain("remote-workplace:open-browser");
    expect(remoteBrowserFallbackScript).toContain("window.parent.postMessage");
    expect(remoteBrowserFallbackScript).toContain("/browser");
    expect(remoteBrowserFallbackScript).toContain("data-url");
    expect(remoteBrowserFallbackScript).toContain("url");
  });

  it("normalisiert Deep-Links auf den T3-Thread vor dem Router-Start", () => {
    expect(t3RouteBridgeScript).toContain('pathname.startsWith(prefix + "/")');
    expect(t3RouteBridgeScript).toContain("history.replaceState");
    expect(t3RouteBridgeScript).toContain('pathname.slice(prefix.length)');
  });

  it("meldet den geöffneten T3-Thread an die Workbench beziehungsweise den Server", () => {
    expect(t3RouteBridgeScript).toContain('source: "remote-workplace-t3"');
    expect(t3RouteBridgeScript).toContain('type: "route.changed"');
    expect(t3RouteBridgeScript).toContain("window.parent.postMessage");
    expect(t3RouteBridgeScript).toContain("/api/v1/notifications/presence");
    expect(t3RouteBridgeScript).toContain("segments.length >= 2 ? segments[1] : null");
    expect(t3RouteBridgeScript).toContain('addEventListener("focus", report)');
  });

  it("injiziert die Route-Bridge in T3-HTML auch bei Deep-Links", () => {
    const html = injectT3HtmlBridge("<!doctype html><html><head></head><body></body></html>");
    expect(html.indexOf('data-remote-workplace-t3-route="1"')).toBeGreaterThan(-1);
    expect(html.indexOf("data-remote-workplace-browser-fallback")).toBeGreaterThan(-1);
    expect(html.indexOf("</head>")).toBeGreaterThan(html.indexOf('data-remote-workplace-t3-route="1"'));
  });
});
