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

  it("keeps terminal clipboard shortcuts separate from Ctrl+C", () => {
    expect(terminalClipboardAction(event({ ctrlKey: true, shiftKey: true }), false)).toBe("copy");
    expect(terminalClipboardAction(event({ key: "v", ctrlKey: true, shiftKey: true }), false)).toBe("paste");
    expect(terminalClipboardAction(event({ ctrlKey: true }), false)).toBeNull();
    expect(terminalClipboardAction(event({ key: "v", ctrlKey: true }), false)).toBeNull();
    expect(terminalClipboardAction(event({ metaKey: true }), true)).toBe("copy");
    expect(terminalClipboardAction(event({ key: "v", metaKey: true }), true)).toBe("paste");
    expect(terminalClipboardAction(event({ metaKey: true, shiftKey: true }), true)).toBeNull();
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
  });

  it("uses normal copy and paste shortcuts on browser-style surfaces", () => {
    expect(browserClipboardAction(event({ ctrlKey: true }), false)).toBe("copy");
    expect(browserClipboardAction(event({ key: "v", ctrlKey: true }), false)).toBe("paste");
    expect(browserClipboardAction(event({ ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(browserClipboardAction(event({ key: "v", ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(browserClipboardAction(event({ metaKey: true }), true)).toBe("copy");
    expect(browserClipboardAction(event({ key: "v", metaKey: true }), true)).toBe("paste");
    expect(browserClipboardAction(event({ metaKey: true, shiftKey: true }), true)).toBeNull();
  });

  it("copies the explicit terminal selection instead of a stale document URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    const staleUrl = document.createElement("textarea");
    staleUrl.value = "https://remote-workplace.example/workbench";
    document.body.append(staleUrl);
    staleUrl.select();

    await writeClipboardText("https://github.com/login/device?code=ABCD-EFGH");

    expect(writeText).toHaveBeenCalledWith("https://github.com/login/device?code=ABCD-EFGH");
    expect(execCommand).not.toHaveBeenCalled();
    staleUrl.remove();
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
