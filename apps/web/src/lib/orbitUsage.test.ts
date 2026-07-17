import { describe, expect, it } from "vitest";
import { orbitProviderWindows } from "./orbitUsage";

describe("orbitProviderWindows", () => {
  it("keeps the limits of every authenticated Codex account visible in the Canvas", () => {
    const windows = orbitProviderWindows({
      providerId: "codex",
      providerName: "Codex",
      status: "available",
      updatedAt: "2026-07-16T16:00:00Z",
      error: null,
      accounts: [
        { id: "main", label: "Main", email: "main@example.com", plan: "plus", windows: [{ id: "primary", label: "5-Stunden-Limit", usedPercent: 20, remainingPercent: 80, windowMinutes: 300, resetsAt: null }] },
        { id: "work", label: "Work", email: "work@example.com", plan: "team", windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 35, remainingPercent: 65, windowMinutes: 10_080, resetsAt: null }] },
      ],
    });

    expect(windows).toEqual([
      { id: "main-primary", label: "main@example.com · 5-Stunden-Limit", remaining: 80 },
      { id: "work-secondary", label: "work@example.com · Wochenlimit", remaining: 65 },
    ]);
  });
});
