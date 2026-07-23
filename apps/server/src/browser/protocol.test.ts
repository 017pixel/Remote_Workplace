import { describe, expect, it } from "vitest";
import { BROWSER_CLIPBOARD_MAX_BYTES, clientBrowserMessageSchema } from "./protocol.js";

describe("browser protocol", () => {
  const sessionId = "3f7a22bb-d634-4b10-87b5-2a17f2381e5c";

  it("allows the internal blank start page and normal web URLs", () => {
    expect(clientBrowserMessageSchema.parse({ type: "browser.navigate", sessionId, url: "about:blank" })).toMatchObject({ url: "about:blank" });
    expect(clientBrowserMessageSchema.parse({ type: "browser.navigate", sessionId, url: "https://example.com" })).toMatchObject({ url: "https://example.com" });
  });

  it("rejects executable and file protocols", () => {
    expect(() => clientBrowserMessageSchema.parse({ type: "browser.navigate", sessionId, url: "javascript:alert(1)" })).toThrow();
    expect(() => clientBrowserMessageSchema.parse({ type: "browser.navigate", sessionId, url: "file:///etc/passwd" })).toThrow();
  });

  it("accepts only bounded profile and instance identifiers", () => {
    expect(clientBrowserMessageSchema.parse({ type: "browser.create", requestId: "create", instanceId: "shared-browser", profileKey: "research-main", initialUrl: "https://example.com/", width: 1280, height: 720 })).toMatchObject({ profileKey: "research-main" });
    expect(() => clientBrowserMessageSchema.parse({ type: "browser.create", requestId: "create", instanceId: "../../escape", profileKey: "../profile", width: 1280, height: 720 })).toThrow();
  });

  it("accepts the bounded debugging actions for owned sessions", () => {
    expect(clientBrowserMessageSchema.parse({ type: "browser.screenshot", sessionId })).toEqual({ type: "browser.screenshot", sessionId });
    expect(clientBrowserMessageSchema.parse({ type: "browser.source", sessionId })).toEqual({ type: "browser.source", sessionId });
    expect(() => clientBrowserMessageSchema.parse({ type: "browser.source", sessionId: "not-a-session" })).toThrow();
  });

  it("accepts bounded copy requests and clipboard text", () => {
    expect(clientBrowserMessageSchema.parse({ type: "browser.copy", sessionId, requestId: "copy-1" })).toEqual({ type: "browser.copy", sessionId, requestId: "copy-1" });
    expect(clientBrowserMessageSchema.parse({ type: "browser.text", sessionId, text: "ä😀\nhttps://example.test" })).toMatchObject({ type: "browser.text" });
    expect(() => clientBrowserMessageSchema.parse({ type: "browser.copy", sessionId, requestId: "" })).toThrow();
    expect(() => clientBrowserMessageSchema.parse({ type: "browser.text", sessionId, text: "😀".repeat((BROWSER_CLIPBOARD_MAX_BYTES / 4) + 1) })).toThrow();
  });
});
