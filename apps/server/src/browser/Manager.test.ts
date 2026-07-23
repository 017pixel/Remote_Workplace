import { describe, expect, it } from "vitest";
import { browserCaptureMetrics, validateBrowserClipboardText } from "./Manager.js";
import { BROWSER_CLIPBOARD_MAX_BYTES } from "./protocol.js";

const captureOptions = {
  captureMaxWidth: 2_560,
  captureMaxHeight: 1_800,
  captureMaxScale: 2,
  captureJpegQuality: 90,
  captureEveryNthFrame: 2,
};

describe("browserCaptureMetrics", () => {
  it("renders regular browser panels at two times their logical resolution", () => {
    expect(browserCaptureMetrics(720, 420, captureOptions)).toEqual({
      width: 720,
      height: 420,
      scale: 2,
      captureWidth: 1_440,
      captureHeight: 840,
    });
  });

  it("caps large captures while preserving their logical viewport", () => {
    const metrics = browserCaptureMetrics(2_400, 1_600, captureOptions);
    expect(metrics.width).toBe(2_400);
    expect(metrics.height).toBe(1_600);
    expect(metrics.captureWidth).toBeLessThanOrEqual(2_560);
    expect(metrics.captureHeight).toBeLessThanOrEqual(1_800);
    expect(metrics.scale).toBeGreaterThanOrEqual(1);
  });

  it("clamps invalidly small viewports before calculating capture density", () => {
    expect(browserCaptureMetrics(20, 40, captureOptions)).toMatchObject({ width: 320, height: 220, scale: 2 });
  });
});

describe("validateBrowserClipboardText", () => {
  it("preserves selected Unicode and multiline text", () => {
    const text = "Link: https://example.test/ä\nEmoji: 😀";
    expect(validateBrowserClipboardText(text)).toEqual({ text, error: null });
  });

  it("rejects empty, invalid and oversized selections without truncating", () => {
    expect(validateBrowserClipboardText(42).text).toBeNull();
    expect(validateBrowserClipboardText("").text).toBeNull();
    const result = validateBrowserClipboardText("😀".repeat((BROWSER_CLIPBOARD_MAX_BYTES / 4) + 1));
    expect(result.text).toBeNull();
    expect(result.error).toContain("1 MiB");
  });
});
