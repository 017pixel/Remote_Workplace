import { describe, expect, it } from "vitest";
import { previewPathSchema } from "@wrapt/contracts";
import { normalizePreviewTarget, previewSlotUrl } from "./previewTargets";

describe("Preview-Ziele", () => {
  it("normalisiert Ports und lokale URLs", () => {
    expect(normalizePreviewTarget("5173/admin?rolle=trainer")).toEqual({
      kind: "local",
      port: 5173,
      path: "/admin?rolle=trainer",
    });
    expect(normalizePreviewTarget("http://127.0.0.1:4173/")).toMatchObject({ kind: "local", port: 4173 });
  });

  it("lässt Pfade den Slot-Origin nicht verlassen", () => {
    expect(() => previewPathSchema.parse("//evil.example/path")).toThrow();
    expect(() => previewPathSchema.parse("/\\evil.example/path")).toThrow();
    expect(previewSlotUrl("https://server.test:8451/", "//evil.example/path")).toBe("https://server.test:8451/evil.example/path");
    expect(normalizePreviewTarget("http://localhost")).toBeNull();
  });
});
