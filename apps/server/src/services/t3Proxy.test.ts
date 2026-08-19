import { describe, expect, it } from "vitest";
import { injectT3HtmlBridge, remoteBrowserFallbackScript, remoteEditorFallbackScript, t3HttpRoutes, t3IsEditorOpenButton, t3OpenInCwdFromFiber, t3RouteBridgeScript } from "./t3Proxy.js";

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
    expect(remoteBrowserFallbackScript).toContain("wrapt:open-browser");
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

  it("brückt den T3-Open-in-VS-Code-Button an den code-server der Workbench", () => {
    expect(remoteEditorFallbackScript).toContain("wrapt:open-editor");
    expect(remoteEditorFallbackScript).toContain("=== \"Open file in preferred editor\"");
    expect(remoteEditorFallbackScript).toContain("[data-chat-header-actions]");
    expect(remoteEditorFallbackScript).toContain("__reactFiber$");
    expect(remoteEditorFallbackScript).toContain("window.parent.postMessage");
    expect(remoteEditorFallbackScript).toContain("/editor/");
    // Die vscode://-URL ist nicht abfangbar (window.location.assign ist nicht
    // überschreibbar), also wird der Klick selbst unterbunden.
    expect(remoteEditorFallbackScript).toContain("event.stopImmediatePropagation()");
    expect(remoteEditorFallbackScript).toContain("new MutationObserver");
  });

  it("erkennt den T3-Open-Button über aria-label, Text und Kopfbereich", () => {
    expect(t3IsEditorOpenButton({ ariaLabel: "Open file in preferred editor", text: null, inHeaderActions: true, hasIcon: true })).toBe(true);
    expect(t3IsEditorOpenButton({ ariaLabel: null, text: "Open", inHeaderActions: true, hasIcon: true })).toBe(true);
    expect(t3IsEditorOpenButton({ ariaLabel: null, text: "Open", inHeaderActions: false, hasIcon: true })).toBe(false);
    expect(t3IsEditorOpenButton({ ariaLabel: null, text: "Open", inHeaderActions: true, hasIcon: false })).toBe(false);
    expect(t3IsEditorOpenButton({ ariaLabel: "Copy options", text: "Open", inHeaderActions: true, hasIcon: true })).toBe(false);
  });

  it("liest den Zielordner aus den React-Props entlang der Fiber-Kette", () => {
    const element = {
      __reactFiber$abc: {
        memoizedProps: { type: "button", children: "Open" },
        return: {
          memoizedProps: {},
          return: {
            memoizedProps: { openInCwd: "/home/user/projects/Wrapt", environmentId: "env-1" },
            return: null,
          },
        },
      },
    };
    expect(t3OpenInCwdFromFiber(element)).toBe("/home/user/projects/Wrapt");
  });

  it("liefert ohne Fiber-Marker oder ohne openInCwd-Prop keinen Ordner", () => {
    expect(t3OpenInCwdFromFiber(null)).toBeNull();
    expect(t3OpenInCwdFromFiber({})).toBeNull();
    const element = {
      __reactFiber$abc: {
        memoizedProps: { onClick: () => undefined },
        return: null,
      },
    };
    expect(t3OpenInCwdFromFiber(element)).toBeNull();
  });

  it("unterbindet die vscode://-Navigation, die in Chrome und Firefox nicht abfangbar ist", () => {
    // Stattdessen setzt das Script auf Button-Interception um: Der Klick wird
    // in der Capture-Phase gestoppt, bevor T3 die tote Deep-Link-URL baut.
    expect(remoteEditorFallbackScript).toContain("addEventListener(\"click\", (event) => {");
    expect(remoteEditorFallbackScript).toContain("event.preventDefault()");
    expect(remoteEditorFallbackScript).toContain("openEditor(button)");
    expect(remoteEditorFallbackScript).not.toContain("Location.prototype.assign");
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
    expect(t3RouteBridgeScript).toContain('source: "wrapt-t3"');
    expect(t3RouteBridgeScript).toContain('type: "route.changed"');
    expect(t3RouteBridgeScript).toContain("window.parent.postMessage");
    expect(t3RouteBridgeScript).toContain("/api/v1/notifications/presence");
    // Threads liegen am Root: /$environmentId/$threadId (ältere _chat-Pfade werden mitgelesen)
    expect(t3RouteBridgeScript).toContain('segments[0] === "_chat" ? segments[2] ?? null : segments.length >= 2 ? segments[1] ?? null : null');
    expect(t3RouteBridgeScript).toContain('addEventListener("focus", report)');
  });

  it("begrenzt den eingebetteten T3-Verlauf auf das iframe", () => {
    expect(t3RouteBridgeScript).toContain("__wraptT3Index");
    expect(t3RouteBridgeScript).toContain("history.back = function () { history.go(-1); }");
    expect(t3RouteBridgeScript).toContain("historyIndex + delta < 0");
  });

  it("injiziert die Route-Bridge in T3-HTML auch bei Deep-Links", () => {
    const html = injectT3HtmlBridge("<!doctype html><html><head></head><body></body></html>");
    expect(html.indexOf('data-wrapt-t3-route="1"')).toBeGreaterThan(-1);
    expect(html.indexOf("data-wrapt-browser-fallback")).toBeGreaterThan(-1);
    expect(html.indexOf("wrapt:open-editor")).toBeGreaterThan(-1);
    expect(html.indexOf("</head>")).toBeGreaterThan(html.indexOf('data-wrapt-t3-route="1"'));
  });
});
