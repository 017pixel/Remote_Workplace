import { describe, expect, it } from "vitest";
import {
  PREVIEW_BRIDGE_ROUTE,
  bridgeScriptSource,
  charsetOf,
  injectBridgeScript,
  isInjectableContentType,
} from "./bridge.js";

const options = { maxBytes: 2_097_152, charset: "utf-8", scriptSource: PREVIEW_BRIDGE_ROUTE };

describe("HTML-Bridge", () => {
  it("injiziert genau ein externes Script in den head", () => {
    const result = injectBridgeScript(Buffer.from("<!doctype html><html><head><title>App</title></head><body>ok</body></html>"), options);
    expect(result.status).toBe("injected");
    expect(result.html).toContain(`<script src="${PREVIEW_BRIDGE_ROUTE}" data-workbench-preview-bridge=""></script>`);
    expect(result.html?.match(/data-workbench-preview-bridge/g)).toHaveLength(1);
    expect(result.html).toContain("<title>App</title>");
  });

  it("unterstützt Dokumente ohne head", () => {
    const result = injectBridgeScript(Buffer.from("<p>Nur Text</p>"), options);
    expect(result.status).toBe("injected");
    expect(result.html).toContain(PREVIEW_BRIDGE_ROUTE);
    expect(result.html).toContain("Nur Text");
  });

  it("erkennt eine bereits vorhandene Bridge", () => {
    const once = injectBridgeScript(Buffer.from("<html><head></head><body></body></html>"), options);
    const twice = injectBridgeScript(Buffer.from(once.html!), options);
    expect(twice.status).toBe("already-present");
    expect(twice.html).toBeNull();
  });

  it("lässt zu große und nicht-UTF-8-Antworten unverändert", () => {
    expect(injectBridgeScript(Buffer.from("<html></html>"), { ...options, maxBytes: 4 }).status).toBe("too-large");
    expect(injectBridgeScript(Buffer.from("<html></html>"), { ...options, charset: "iso-8859-1" }).status).toBe("unsupported-charset");
  });

  it("erhält Umlaute korrekt", () => {
    const result = injectBridgeScript(Buffer.from("<html><head></head><body>Grüße über Ports</body></html>", "utf8"), options);
    expect(result.html).toContain("Grüße über Ports");
  });

  it("liest das Charset und den Content-Type", () => {
    expect(charsetOf("text/html; charset=UTF-8")).toBe("utf-8");
    expect(charsetOf("text/html")).toBe("utf-8");
    expect(charsetOf("text/html; charset=\"iso-8859-1\"")).toBe("iso-8859-1");
    expect(isInjectableContentType("text/html; charset=utf-8")).toBe(true);
    expect(isInjectableContentType("text/event-stream")).toBe(false);
    expect(isInjectableContentType(undefined)).toBe(false);
  });

  it("bettet die Slot-Konfiguration in das ausgelieferte Script ein", () => {
    const source = bridgeScriptSource({
      version: "v1",
      slotId: 2,
      mapping: { "4000": "https://server.test:8452/" },
      workbenchOrigins: ["https://server.test:8443"],
      resetRoute: "/__workbench/preview-reset",
      diagnosticsEnabled: true,
      storageSyncEnabled: false,
      maxStorageBytes: 262_144,
      maxStorageKeys: 1_000,
    });
    expect(source).toContain("\"4000\":\"https://server.test:8452/\"");
    expect(source).toContain("workbench.preview.hello-request");
    // Die Bridge darf keine privilegierte Aktion auslösen können.
    expect(source).not.toContain("/api/v1/previews/repair");
  });
});
