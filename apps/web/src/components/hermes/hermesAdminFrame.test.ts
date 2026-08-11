import { describe, expect, it } from "vitest";
import { safeHermesPath } from "./HermesAdminFrame";

describe("safeHermesPath", () => {
  it("lässt gültige interne Pfade durch", () => {
    expect(safeHermesPath("/cron")).toBe("/cron");
    expect(safeHermesPath("/logs?level=error")).toBe("/logs?level=error");
    expect(safeHermesPath("/")).toBe("/");
  });

  it("fängt Traversal, protokollrelative Ziele und Unsinn ab", () => {
    expect(safeHermesPath("/../etc/passwd")).toBe("/");
    expect(safeHermesPath("//example.com/phish")).toBe("/");
    expect(safeHermesPath("cron")).toBe("/");
    expect(safeHermesPath(null)).toBe("/");
    expect(safeHermesPath(undefined)).toBe("/");
    expect(safeHermesPath("")).toBe("/");
  });
});
