import { describe, expect, it } from "vitest";
import type { UsageForecast, UsageResponse } from "@wrapt/contracts";
import { enrichAndDeduplicateForecasts } from "./usage-service.js";

describe("usage forecast presentation", () => {
  it("merges historical account keys that resolve to the same live account", () => {
    const live: UsageResponse = {
      providers: [{
        providerId: "codex", providerName: "Codex", status: "available", updatedAt: "2026-07-15T10:00:00Z", error: null,
        accounts: [{ id: "current", label: "Codex", email: "current@example.com", plan: null, windows: [{ id: "secondary", label: "Wochenlimit", usedPercent: 50, remainingPercent: 50, windowMinutes: 10_080, resetsAt: "2026-07-22T10:00:00Z" }] }],
      }],
      fetchedAt: "2026-07-15T10:00:00Z", lastSuccessfulFetchAt: "2026-07-15T10:00:00Z", cached: false,
    };
    const base = { providerId: "codex", windowId: "secondary", windowLabel: "Längerer Zeitraum", predictedUsedPercentAtReset: 70, reachesLimitAt: null, confidence: "high", message: "Prognose" } satisfies Omit<UsageForecast, "accountId" | "accountLabel" | "resetsAt" | "sampleCount">;
    const forecasts: UsageForecast[] = [
      { ...base, accountId: "old@example.com", accountLabel: "Alt", resetsAt: "2026-07-22T09:00:00Z", sampleCount: 100 },
      { ...base, accountId: "current@example.com", accountLabel: "Aktuell", resetsAt: "2026-07-22T10:00:00Z", sampleCount: 20 },
    ];

    expect(enrichAndDeduplicateForecasts(forecasts, live)).toEqual([
      expect.objectContaining({ accountId: "current@example.com", accountLabel: "current@example.com", windowLabel: "Wochenlimit" }),
    ]);
  });
});
