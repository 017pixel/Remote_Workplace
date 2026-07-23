import { describe, expect, it } from "vitest";
import { resolveOrbitProjectId } from "./orbitProjectBinding";

describe("resolveOrbitProjectId", () => {
  it("keeps an explicitly supplied project binding", () => {
    expect(resolveOrbitProjectId("explicit", "focused", "selected", "nearby")).toBe("explicit");
  });

  it("prefers the focused Orbit project for newly dropped tools", () => {
    expect(resolveOrbitProjectId(undefined, "focused", "selected", "nearby")).toBe("focused");
  });

  it("falls back to the selected project and then the nearby project", () => {
    expect(resolveOrbitProjectId(undefined, null, "selected", "nearby")).toBe("selected");
    expect(resolveOrbitProjectId(undefined, null, null, "nearby")).toBe("nearby");
    expect(resolveOrbitProjectId(undefined, null, null, null)).toBeNull();
  });
});
