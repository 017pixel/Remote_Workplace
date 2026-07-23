import { describe, expect, it } from "vitest";
import { compactAccountIdentity } from "./StatusBar";

describe("compactAccountIdentity", () => {
  it("shortens long email local parts while preserving the recognizable ends and domain", () => {
    expect(compactAccountIdentity("longusername2010@example.com")).toBe("long…2010@example.com");
  });

  it("keeps already compact email addresses unchanged", () => {
    expect(compactAccountIdentity("user@example.com")).toBe("user@example.com");
  });
});
