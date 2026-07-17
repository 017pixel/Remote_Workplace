import { describe, expect, it } from "vitest";
import { normalizeProviderUsage } from "./normalize-usage.js";

describe("normalizeProviderUsage", () => {
  it("keeps the configured account email and stable limit fields", () => {
    const usage = normalizeProviderUsage("codex", [
      {
        provider: "codex",
        account: "name@example.com",
        source: "oauth",
        usage: {
          accountEmail: "name@example.com",
          loginMethod: "plus",
          updatedAt: "2026-07-12T14:00:00Z",
          primary: { usedPercent: 61, windowMinutes: 300, resetsAt: "2026-07-12T15:00:00Z" },
          secondary: { usedPercent: 12, windowMinutes: 10080, resetsAt: "2026-07-18T15:00:00Z" },
        },
      },
    ]);

    expect(usage).toMatchObject({
      providerId: "codex",
      status: "available",
      accounts: [{ label: "Account", email: "name@example.com", plan: "plus" }],
    });
    expect(usage.accounts[0]?.windows).toEqual([
      expect.objectContaining({ id: "primary", usedPercent: 61, remainingPercent: 39 }),
      expect.objectContaining({ id: "secondary", usedPercent: 12, remainingPercent: 88 }),
    ]);
    expect(JSON.stringify(usage)).toContain("name@example.com");
  });

  it("does not invent OpenCode Go data when CodexBar returns no usage", () => {
    const usage = normalizeProviderUsage("opencode", [
      { provider: "opencodego", source: "local", error: { code: 1, message: "No data" } },
    ]);

    expect(usage).toEqual({
      providerId: "opencode",
      providerName: "OpenCode Go",
      status: "unavailable",
      updatedAt: null,
      accounts: [],
      error: { code: "PROVIDER_UNAVAILABLE", message: "Für diesen Anbieter konnten keine Nutzungsdaten geladen werden." },
    });
  });

  it("labels the OpenCode Go 30-day window as a monthly limit", () => {
    const usage = normalizeProviderUsage("opencode", [
      {
        provider: "opencodego",
        source: "local",
        usage: {
          tertiary: { usedPercent: 37, windowMinutes: 43_200, resetsAt: "2026-08-02T08:24:29Z" },
        },
      },
    ]);

    expect(usage.accounts[0]?.windows).toEqual([
      expect.objectContaining({ label: "Monatslimit", remainingPercent: 63 }),
    ]);
  });

  it("keeps the usable account when CodexBar also returns a duplicate failed profile", () => {
    const usage = normalizeProviderUsage("codex", [
      { provider: "codex", source: "oauth", account: "name@example.com", usage: { accountEmail: "name@example.com", secondary: { usedPercent: 28, windowMinutes: 10_080 } } },
      { provider: "codex", source: "auto", account: "name@example.com", usage: { accountEmail: "name@example.com" }, error: { code: 1, message: "token invalidated" } },
    ]);
    expect(usage.accounts).toEqual([expect.objectContaining({ email: "name@example.com", windows: [expect.objectContaining({ remainingPercent: 72 })] })]);
  });

  it("keeps independently authenticated Codex accounts and their limits", () => {
    const usage = normalizeProviderUsage("codex", [
      { provider: "codex", source: "oauth", account: "main@example.com", usage: { accountEmail: "main@example.com", primary: { usedPercent: 20, windowMinutes: 300 } } },
      { provider: "codex", source: "oauth", account: "work@example.com", usage: { accountEmail: "work@example.com", secondary: { usedPercent: 35, windowMinutes: 10_080 } } },
    ]);

    expect(usage.accounts).toEqual([
      expect.objectContaining({ email: "main@example.com", windows: [expect.objectContaining({ remainingPercent: 80 })] }),
      expect.objectContaining({ email: "work@example.com", windows: [expect.objectContaining({ remainingPercent: 65 })] }),
    ]);
  });
});
