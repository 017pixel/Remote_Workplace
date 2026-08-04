import { describe, expect, it } from "vitest";
import type { UsageMonitoring, UsageResponse } from "@workbench/contracts";
import { createCodexbarUsageService } from "./codexbar-cache.js";
import type { CodexbarClient } from "./codexbar-client.js";
import type { CodexbarPayload } from "./codexbar-schemas.js";

const allEnabled: UsageMonitoring = { codex: true, opencode: true, claude: true };

function usagePayload(provider: string): CodexbarPayload {
  return {
    provider,
    usage: { primary: { usedPercent: 40, windowMinutes: 300, resetsAt: "2026-07-22T10:00:00Z" } },
  };
}

function client(called: string[]): CodexbarClient {
  return {
    getUsage: async (provider: "codex" | "opencodego" | "claude") => {
      called.push(provider);
      if (provider === "codex" || provider === "opencodego") return [usagePayload(provider)];
      return [usagePayload("claude")];
    },
  } as unknown as CodexbarClient;
}

function summarize(response: UsageResponse) {
  return Object.fromEntries(response.providers.map((provider) => [provider.providerId, provider.status]));
}

describe("CodexbarUsageService mit Limitüberwachung", () => {
  it("fragt einen deaktivierten Anbieter nicht ab und meldet ihn als disabled", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({
      ttlMilliseconds: 60_000,
      client: client(called),
      monitoring: () => ({ ...allEnabled, claude: false }),
    });
    const response = await service.getUsage();
    expect(called).not.toContain("claude");
    expect(called).toContain("codex");
    expect(called).toContain("opencodego");
    expect(summarize(response)).toEqual({ codex: "available", opencode: "available", claude: "disabled" });
    expect(response.providers.find((provider) => provider.providerId === "claude")?.error?.code).toBe("MONITORING_DISABLED");
  });

  it("meldet alle Anbieter deaktiviert, ohne einen CodexBar-Fehler zu werfen", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({
      ttlMilliseconds: 60_000,
      client: client(called),
      monitoring: () => ({ codex: false, opencode: false, claude: false }),
    });
    const response = await service.getUsage();
    expect(called).toEqual([]);
    expect(summarize(response)).toEqual({ codex: "disabled", opencode: "disabled", claude: "disabled" });
  });

  it("fragt ohne Monitoring-Angabe alle Anbieter ab", async () => {
    const called: string[] = [];
    const service = createCodexbarUsageService({ ttlMilliseconds: 60_000, client: client(called) });
    const response = await service.getUsage();
    expect(called.sort()).toEqual(["claude", "codex", "opencodego"]);
    expect(summarize(response)).toEqual({ codex: "available", opencode: "available", claude: "available" });
  });
});
