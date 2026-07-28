// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { browserClipboardAction, isApplePlatform, splitTerminalInput, terminalClipboardAction, utf8ByteLength, writeClipboardText } from "./clipboard";

const event = (patch: Partial<Parameters<typeof terminalClipboardAction>[0]> = {}) => ({
  key: "c", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...patch,
});

describe("clipboard helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });

  it("recognizes platform-native terminal shortcuts without stealing Ctrl+C", () => {
    expect(terminalClipboardAction(event({ ctrlKey: true, shiftKey: true }), false)).toBe("copy");
    expect(terminalClipboardAction(event({ key: "v", ctrlKey: true, shiftKey: true }), false)).toBe("paste");
    expect(terminalClipboardAction(event({ ctrlKey: true }), false)).toBeNull();
    expect(terminalClipboardAction(event({ metaKey: true }), true)).toBe("copy");
    expect(terminalClipboardAction(event({ key: "v", metaKey: true }), true)).toBe("paste");
    expect(terminalClipboardAction(event({ metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
  });

  it("recognizes browser copy and regular or plain-text paste shortcuts", () => {
    expect(browserClipboardAction(event({ ctrlKey: true }), false)).toBe("copy");
    expect(browserClipboardAction(event({ ctrlKey: true, shiftKey: true }), false)).toBe("copy");
    expect(browserClipboardAction(event({ key: "v", ctrlKey: true }), false)).toBe("paste");
    expect(browserClipboardAction(event({ key: "v", ctrlKey: true, shiftKey: true }), false)).toBe("paste");
    expect(browserClipboardAction(event({ metaKey: true }), true)).toBe("copy");
    expect(browserClipboardAction(event({ metaKey: true, shiftKey: true }), true)).toBe("copy");
  });

  it("uses the asynchronous Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await writeClipboardText("https://example.test/ä");
    expect(writeText).toHaveBeenCalledWith("https://example.test/ä");
  });

  it("falls back to a temporary text selection", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    await writeClipboardText("fallback");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea[aria-hidden=true]")).toBeNull();
  });

  it("reports a failure when no clipboard path succeeds", async () => {
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn().mockReturnValue(false) });
    await expect(writeClipboardText("unchanged")).rejects.toThrow("Kopieren wurde vom Browser nicht erlaubt.");
  });

  it("chunks large input without splitting surrogate pairs", () => {
    const value = `${"a".repeat(9)}😀${"b".repeat(14)}\r\nhttps://example.test`;
    const chunks = splitTerminalInput(value, 10);
    expect(chunks.join("")).toBe(value);
    expect(chunks.every((chunk) => utf8ByteLength(chunk) <= 10)).toBe(true);
    expect(chunks.some((chunk) => chunk.endsWith("\uD83D"))).toBe(false);
  });
});
