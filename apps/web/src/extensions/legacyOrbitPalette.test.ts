import { describe, expect, it } from "vitest";
import {
  legacyOrbitPaletteOwners,
  registerLegacyOrbitPalette,
} from "./legacyOrbitPalette";
import { OrbitPaletteRegistry } from "./orbitPaletteRegistry";

describe("legacyOrbitPalette", () => {
  it("registriert die bisherige Palette in fester Reihenfolge", () => {
    const registry = new OrbitPaletteRegistry();
    registerLegacyOrbitPalette(registry);

    const snapshot = registry.getSnapshot();
    expect(snapshot.byGroup.tools.map((item) => item.value.runtime.legacyKey)).toEqual([
      "tool:t3-code",
      "tool:hermes",
      "tool:code-server",
      "tool:terminal",
      "tool:opencode",
      "tool:codex",
      "tool:files",
      "tool:browser",
    ]);
    expect(snapshot.byGroup.blocks.map((item) => item.value.runtime.legacyKey)).toEqual([
      "block:note",
      "block:todo",
      "block:snippet",
      "block:frame",
      "block:usage-codex",
      "block:usage-opencode",
      "block:usage-claude",
    ]);
    expect(snapshot.byGroup.previews.map((item) => item.value.runtime.legacyKey)).toEqual([
      "preview:layout-1",
      "preview:layout-2",
      "preview:layout-3",
      "preview:layout-6",
    ]);
  });

  it("liefert dieselben Titel wie die bisherige Seitenpalette", () => {
    const registry = new OrbitPaletteRegistry();
    registerLegacyOrbitPalette(registry);

    const byTitle = new Map(
      registry.getSnapshot().items.map((item) => [item.value.contribution.title, item.value.runtime.legacyKey]),
    );
    expect(byTitle.get("T3 Code")).toBe("tool:t3-code");
    expect(byTitle.get("Neue Notiz")).toBe("block:note");
    expect(byTitle.get("Codex Nutzung")).toBe("block:usage-codex");
    expect(byTitle.get("Claude Code Nutzung")).toBe("block:usage-claude");
    expect(byTitle.get("6er-Gruppe (2×3)")).toBe("preview:layout-6");
  });

  it("bildet für jedes Item einen vollständigen Orbit-Payload", () => {
    const registry = new OrbitPaletteRegistry();
    registerLegacyOrbitPalette(registry);

    for (const item of registry.getSnapshot().items) {
      const payload = item.value.runtime.createPayload();
      expect(payload.title.length).toBeGreaterThan(0);
      expect(payload.type.length).toBeGreaterThan(0);
      if (payload.type === "tool") expect(payload.toolType).toBeDefined();
      if (payload.type === "usage") expect(payload.provider).toBeDefined();
      if (payload.type === "previewGroup") expect(payload.layout).toBeDefined();
    }
  });

  it("verwendet stabile Contribution-IDs im wrapt.orbit-Namespace", () => {
    for (const owner of legacyOrbitPaletteOwners) {
      expect(owner.ownerId).toBe("wrapt.orbit");
      for (const registration of owner.registrations) {
        expect(registration.id.startsWith("wrapt.orbit.palette.")).toBe(true);
        expect(registration.icon).toBeTypeOf("function");
      }
    }
  });
});
