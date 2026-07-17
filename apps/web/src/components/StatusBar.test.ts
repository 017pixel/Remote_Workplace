import { describe, expect, it } from "vitest";
import { compactAccountIdentity } from "./StatusBar";

describe("compactAccountIdentity", () => {
  it("shortens long email local parts while preserving the recognizable ends and domain", () => {
    expect(compactAccountIdentity("beckerbenjamin2010@gmail.com")).toBe("beck…2010@gmail.com");
  });

  it("keeps already compact email addresses unchanged", () => {
    expect(compactAccountIdentity("b.becker@aisci.de")).toBe("b.becker@aisci.de");
  });
});
