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

  it("verhindert eine selbstverstärkende MutationObserver-Schleife in Firefox", () => {
    expect(remoteBrowserFallbackScript).toContain("if (button.disabled) button.disabled = false");
    expect(remoteBrowserFallbackScript).toContain('if (button.hasAttribute("aria-disabled"))');
    expect(remoteBrowserFallbackScript).toContain('button.classList.contains("cursor-not-allowed")');
    expect(remoteBrowserFallbackScript).toContain('attributeFilter: ["disabled", "aria-disabled", "class"]');
    expect(remoteBrowserFallbackScript).toContain("for (const node of record.addedNodes) scan(node)");
    expect(remoteBrowserFallbackScript).not.toContain("new MutationObserver(scan)");
  });

  it("normalisiert Deep-Links auf den T3-Thread vor dem Router-Start", () => {
    expect(t3RouteBridgeScript).toContain('pathname.startsWith(prefix + "/")');
    expect(t3RouteBridgeScript).toContain("history.replaceState");
    expect(t3RouteBridgeScript).toContain('pathname.slice(prefix.length)');
    // Alte Tiefenlinks unter dem _chat-Layout werden auf die Root-Thread-Route umgeschrieben
    expect(t3RouteBridgeScript).toContain('segments[0] === "_chat"');
    expect(t3RouteBridgeScript).toContain("[0-9a-fA-F-]{36}$");
  });

  it("meldet den geöffneten T3-Thread an die Workbench beziehungsweise den Server", () => {
    expect(t3RouteBridgeScript).toContain('source: "remote-workplace-t3"');
    expect(t3RouteBridgeScript).toContain('type: "route.changed"');
    expect(t3RouteBridgeScript).toContain("window.parent.postMessage");
    expect(t3RouteBridgeScript).toContain("/api/v1/notifications/presence");
    // Threads liegen am Root: /$environmentId/$threadId (ältere _chat-Pfade werden mitgelesen)
    expect(t3RouteBridgeScript).toContain('segments[0] === "_chat" ? segments[2] ?? null : segments.length >= 2 ? segments[1] ?? null : null');
    expect(t3RouteBridgeScript).toContain('addEventListener("focus", report)');
  });

  it("begrenzt den eingebetteten T3-Verlauf auf das iframe", () => {
    expect(t3RouteBridgeScript).toContain("__remoteWorkplaceT3Index");
    expect(t3RouteBridgeScript).toContain("history.back = function () { history.go(-1); }");
    expect(t3RouteBridgeScript).toContain("historyIndex + delta < 0");
  });

  it("injiziert die Route-Bridge in T3-HTML auch bei Deep-Links", () => {
    const html = injectT3HtmlBridge("<!doctype html><html><head></head><body></body></html>");
    expect(html.indexOf('data-remote-workplace-t3-route="1"')).toBeGreaterThan(-1);
    expect(html.indexOf("data-remote-workplace-browser-fallback")).toBeGreaterThan(-1);
    expect(html.indexOf("</head>")).toBeGreaterThan(html.indexOf('data-remote-workplace-t3-route="1"'));
  });
});
