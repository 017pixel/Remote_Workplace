// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { Panel } from "@workbench/contracts";
import { deriveViewPresence } from "./useViewPresence";

const emptyAreas = {};
const noPanels: Panel[] = [];

describe("deriveViewPresence", () => {
  it("meldet den T3-Thread auf der T3-Code-Seite", () => {
    expect(deriveViewPresence("/t3-code", "", "thread-abc", null, emptyAreas, noPanels, {}))
      .toEqual([{ source: "t3", threadId: "thread-abc" }]);
    expect(deriveViewPresence("/t3-code", "", null, null, emptyAreas, noPanels, {}))
      .toEqual([{ source: "t3", threadId: null }]);
  });

  it("meldet die Hermes-Sitzung aus Bridge oder URL", () => {
    expect(deriveViewPresence("/hermes-agent", "", null, "sitzung-1", emptyAreas, noPanels, {}))
      .toEqual([{ source: "hermes", sessionId: "sitzung-1" }]);
    expect(deriveViewPresence("/hermes-agent", "?session=sitzung-2", null, null, emptyAreas, noPanels, {}))
      .toEqual([{ source: "hermes", sessionId: "sitzung-2" }]);
    expect(deriveViewPresence("/hermes-agent", "?path=%2Fchat%3Fresume%3Dsitzung-3", null, null, emptyAreas, noPanels, {}))
      .toEqual([{ source: "hermes", sessionId: "sitzung-3" }]);
    expect(deriveViewPresence("/hermes-agent", "?session=sitzung-2", null, "sitzung-1", emptyAreas, noPanels, {}))
      .toEqual([{ source: "hermes", sessionId: "sitzung-1" }]);
  });

  it("meldet den aktiven Terminal-Tab beziehungsweise den URL-Parameter", () => {
    const areas = { "codex-standalone": { activeTabId: "laufzeit-1", tabs: [{ id: "laufzeit-1" }, { id: "laufzeit-2" }] } };
    expect(deriveViewPresence("/codex", "", null, null, areas, noPanels, {}))
      .toEqual([{ source: "codex", sessionId: "laufzeit-1" }]);
    expect(deriveViewPresence("/claude", "", null, null, emptyAreas, noPanels, {}))
      .toEqual([{ source: "claude", sessionId: null }]);
    expect(deriveViewPresence("/terminal", "", null, null, { standalone: { activeTabId: "laufzeit-9", tabs: [{ id: "laufzeit-9" }] } }, noPanels, {}))
      .toEqual([{ source: "terminal", sessionId: "laufzeit-9" }]);
    expect(deriveViewPresence("/terminal", "?kind=claude&session=sitzung-9", null, null, emptyAreas, noPanels, {}))
      .toEqual([{ source: "claude", sessionId: "sitzung-9" }]);
  });

  it("meldet in allen übrigen Ansichten ohne Panels keine Sicht", () => {
    for (const route of ["/", "/inbox", "/workbench", "/files", "/previews", "/settings", "/usage", "/projects", "/tech-tldrs", "/code-editor", "/browser", "/opencode"]) {
      expect(deriveViewPresence(route, "", null, null, emptyAreas, noPanels, {})).toEqual([]);
    }
  });

  it("meldet offene T3-Panels samt Thread zusätzlich zur Route", () => {
    const panels: Panel[] = [
      { id: "panel-t3", type: "t3-code", projectId: "p1", previewId: null, reloadKey: 0 },
      { id: "panel-t3-ohne-thread", type: "t3-code", projectId: "p2", previewId: null, reloadKey: 0 },
    ];
    const result = deriveViewPresence("/inbox", "", null, null, emptyAreas, panels, { "panel-t3": "thread-77" });
    expect(result).toEqual([{ source: "t3", threadId: "thread-77" }]);
  });

  it("meldet den aktiven Tab offener Terminal-Panels", () => {
    const panels: Panel[] = [
      { id: "panel-codex", type: "codex", projectId: null, previewId: null, reloadKey: 0 },
      { id: "panel-shell", type: "terminal", projectId: null, previewId: null, reloadKey: 0 },
    ];
    const areas = {
      "panel-codex": { activeTabId: "laufzeit-1", tabs: [{ id: "laufzeit-1" }] },
      "panel-shell": { activeTabId: "laufzeit-2", tabs: [{ id: "laufzeit-2" }] },
    };
    const result = deriveViewPresence("/workbench", "", null, null, areas, panels, {});
    expect(result).toEqual([
      { source: "codex", sessionId: "laufzeit-1" },
      { source: "terminal", sessionId: "laufzeit-2" },
    ]);
  });

  it("meldet die Hermes-Sitzung aus offenen Hermes-Panels", () => {
    const panels: Panel[] = [
      { id: "panel-hermes", type: "hermes", projectId: null, previewId: null, reloadKey: 0 },
    ];
    const result = deriveViewPresence("/workbench", "", null, "sitzung-hermes", emptyAreas, panels, {});
    expect(result).toEqual([{ source: "hermes", sessionId: "sitzung-hermes" }]);
  });
});
