import { beforeEach, describe, expect, it } from "vitest";
import { compactAccountIdentity, visibleStatusBarProviders } from "./StatusBar";
import { registerLegacyStatusBar } from "../extensions/legacyStatusBar";
import { statusBarRegistry } from "../extensions/statusBarRegistry";

beforeEach(() => {
  registerLegacyStatusBar(statusBarRegistry);
});

describe("compactAccountIdentity", () => {
  it("shortens long email local parts while preserving the recognizable ends and domain", () => {
    expect(compactAccountIdentity("longusername2010@example.com")).toBe("long…2010@example.com");
  });

  it("keeps already compact email addresses unchanged", () => {
    expect(compactAccountIdentity("user@example.com")).toBe("user@example.com");
  });
});

describe("visibleStatusBarProviders", () => {
  it("hides a provider whose limit monitoring is disabled", () => {
    expect(visibleStatusBarProviders([
      { providerId: "codex", status: "available" },
      { providerId: "opencode", status: "partial" },
      { providerId: "claude", status: "disabled" },
    ]).map((provider) => provider.providerId)).toEqual(["codex", "opencode"]);
  });

  it("keeps all providers visible while the usage response is loading", () => {
    expect(visibleStatusBarProviders(undefined).map((provider) => provider.providerId)).toEqual(["codex", "opencode", "claude"]);
  });

  it("returns no limit entries when every provider is disabled", () => {
    expect(visibleStatusBarProviders([
      { providerId: "codex", status: "disabled" },
      { providerId: "opencode", status: "disabled" },
      { providerId: "claude", status: "disabled" },
    ])).toEqual([]);
  });
});
