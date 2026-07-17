import { describe, expect, it } from "vitest";
import { mergeCodexPrimaryWindows } from "./codex-oauth-primary-window.js";

describe("mergeCodexPrimaryWindows", () => {
  it("adds a missing five-hour window for the matching Codex account", () => {
    const result = mergeCodexPrimaryWindows(
      [{ provider: "codex", usage: { accountEmail: "name@example.com", primary: null } }],
      [{ email: "name@example.com", usedPercent: 24, windowMinutes: 300, resetsAt: "2026-07-12T20:00:00Z" }],
    );

    expect(result[0]?.usage?.primary).toEqual({
      usedPercent: 24,
      windowMinutes: 300,
      resetsAt: "2026-07-12T20:00:00Z",
    });
  });

  it("does not replace a CodexBar primary window", () => {
    const result = mergeCodexPrimaryWindows(
      [{ provider: "codex", usage: { accountEmail: "name@example.com", primary: { usedPercent: 11 } } }],
      [{ email: "name@example.com", usedPercent: 24, windowMinutes: 300, resetsAt: "2026-07-12T20:00:00Z" }],
    );

    expect(result[0]?.usage?.primary).toEqual({ usedPercent: 11 });
  });
});
