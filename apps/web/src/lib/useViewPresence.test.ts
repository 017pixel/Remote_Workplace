// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { deriveViewPresence } from "./useViewPresence";

const emptyAreas = {};

describe("deriveViewPresence", () => {
  it("meldet den T3-Thread auf der T3-Code-Seite", () => {
    expect(deriveViewPresence("/t3-code", "", "thread-abc", null, emptyAreas))
      .toEqual({ source: "t3", threadId: "thread-abc" });
    expect(deriveViewPresence("/t3-code", "", null, null, emptyAreas))
      .toEqual({ source: "t3", threadId: null });
  });

  it("meldet die Hermes-Sitzung aus Bridge oder URL", () => {
    expect(deriveViewPresence("/hermes-agent", "", null, "sitzung-1", emptyAreas))
      .toEqual({ source: "hermes", sessionId: "sitzung-1" });
    expect(deriveViewPresence("/hermes-agent", "?session=sitzung-2", null, null, emptyAreas))
      .toEqual({ source: "hermes", sessionId: "sitzung-2" });
    expect(deriveViewPresence("/hermes-agent", "?session=sitzung-2", null, "sitzung-1", emptyAreas))
      .toEqual({ source: "hermes", sessionId: "sitzung-1" });
  });

  it("meldet den aktiven Terminal-Tab beziehungsweise den URL-Parameter", () => {
    const areas = { "codex-standalone": { activeTabId: "laufzeit-1", tabs: [{ id: "laufzeit-1" }, { id: "laufzeit-2" }] } };
    expect(deriveViewPresence("/codex", "", null, null, areas))
      .toEqual({ source: "codex", sessionId: "laufzeit-1" });
    expect(deriveViewPresence("/opencode", "?session=alt", null, null, emptyAreas))
      .toEqual({ source: "opencode", sessionId: "alt" });
    expect(deriveViewPresence("/claude", "", null, null, emptyAreas))
      .toEqual({ source: "claude", sessionId: null });
    expect(deriveViewPresence("/terminal", "", null, null, { standalone: { activeTabId: "laufzeit-9", tabs: [{ id: "laufzeit-9" }] } }))
      .toEqual({ source: "terminal", sessionId: "laufzeit-9" });
    expect(deriveViewPresence("/terminal", "?kind=claude&session=sitzung-9", null, null, emptyAreas))
      .toEqual({ source: "claude", sessionId: "sitzung-9" });
  });

  it("meldet in allen übrigen Ansichten keine Sicht", () => {
    for (const route of ["/", "/inbox", "/workbench", "/files", "/previews", "/settings", "/usage", "/projects", "/tech-tldrs", "/code-editor", "/browser"]) {
      expect(deriveViewPresence(route, "", null, null, emptyAreas)).toBeNull();
    }
  });
});
