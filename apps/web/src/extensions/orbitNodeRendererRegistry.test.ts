import { describe, expect, it } from "vitest";
import {
  OrbitNodeRendererError,
  OrbitNodeRendererRegistry,
} from "./orbitNodeRendererRegistry";

function renderer(): { render: () => null } {
  return { render: () => null };
}

describe("OrbitNodeRendererRegistry", () => {
  it("registriert genau einen Renderer pro Contribution ID", () => {
    const registry = new OrbitNodeRendererRegistry();
    const first = renderer();
    registry.registerRenderer("workbench.test.orbit.main", first);
    expect(registry.getRenderer("workbench.test.orbit.main")).toBe(first);
  });

  it("überschreibt einen bestehenden Renderer nie still", () => {
    const registry = new OrbitNodeRendererRegistry();
    registry.registerRenderer("workbench.test.orbit.main", renderer());
    try {
      registry.registerRenderer("workbench.test.orbit.main", renderer());
      throw new Error("Der erwartete Kollisionsfehler blieb aus.");
    } catch (error) {
      expect(error).toBeInstanceOf(OrbitNodeRendererError);
      expect((error as OrbitNodeRendererError).code).toBe("renderer-collision");
    }
  });

  it("entfernt Renderer beim Unregister", () => {
    const registry = new OrbitNodeRendererRegistry();
    registry.registerRenderer("workbench.test.orbit.main", renderer());
    expect(registry.unregisterRenderer("workbench.test.orbit.main")).toBe(true);
    expect(registry.getRenderer("workbench.test.orbit.main")).toBeUndefined();
  });

  it("meldet unbekannte oder fehlende Contribution-IDs als nicht verfügbar", () => {
    const registry = new OrbitNodeRendererRegistry();
    expect(registry.getRenderer(null)).toBeUndefined();
    expect(registry.getRenderer("workbench.test.orbit.fehlt")).toBeUndefined();
    try {
      registry.registerRenderer("kein-namespace", renderer());
      throw new Error("Der erwartete ID-Fehler blieb aus.");
    } catch (error) {
      expect(error).toBeInstanceOf(OrbitNodeRendererError);
      expect((error as OrbitNodeRendererError).code).toBe("invalid-contribution-id");
    }
  });
});
