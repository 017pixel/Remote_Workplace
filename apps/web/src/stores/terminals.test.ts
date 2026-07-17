import { beforeEach, describe, expect, it } from "vitest";
import { MAX_CLI_INSTANCES, MAX_TERMINAL_TABS, useTerminalStore } from "./terminals";

describe("terminal areas", () => {
  beforeEach(() => useTerminalStore.setState({ areas: {} }));

  it("creates independent tabs without replacing a running session", () => {
    useTerminalStore.getState().ensureArea("standalone", "first-project");
    const first = useTerminalStore.getState().areas.standalone!.activeTabId;
    const second = useTerminalStore.getState().addTab("standalone", "second-project");
    const area = useTerminalStore.getState().areas.standalone!;
    expect(area.tabs).toHaveLength(2);
    expect(area.tabs[0]).toMatchObject({ id: first, projectId: "first-project" });
    expect(area.tabs[1]).toMatchObject({ id: second, projectId: "second-project" });
    expect(area.activeTabId).toBe(second);
  });

  it("keeps the CLI kind on every independent agent instance", () => {
    useTerminalStore.getState().ensureArea("codex-standalone", "first-project", "codex");
    useTerminalStore.getState().addTab("codex-standalone", "second-project", "codex");
    expect(useTerminalStore.getState().areas["codex-standalone"]!.tabs).toEqual([
      expect.objectContaining({ projectId: "first-project", kind: "codex" }),
      expect.objectContaining({ projectId: "second-project", kind: "codex" }),
    ]);
  });

  it("caps Codex and OpenCode areas at four instances", () => {
    useTerminalStore.getState().ensureArea("opencode-standalone", null, "opencode");
    for (let index = 1; index < MAX_CLI_INSTANCES; index += 1) {
      expect(useTerminalStore.getState().addTab("opencode-standalone", null, "opencode")).not.toBeNull();
    }
    expect(useTerminalStore.getState().addTab("opencode-standalone", null, "opencode")).toBeNull();
  });

  it("caps an area at five tabs and removes a closed tab completely", () => {
    useTerminalStore.getState().ensureArea("panel");
    for (let index = 1; index < MAX_TERMINAL_TABS; index += 1) {
      expect(useTerminalStore.getState().addTab("panel", null)).not.toBeNull();
    }
    expect(useTerminalStore.getState().addTab("panel", null)).toBeNull();
    const area = useTerminalStore.getState().areas.panel!;
    const closed = area.tabs[2]!.id;
    useTerminalStore.getState().closeTab("panel", closed);
    expect(useTerminalStore.getState().areas.panel!.tabs.some((tab) => tab.id === closed)).toBe(false);
  });

  it("assigns two tabs to a split and collapses it when the split tab closes", () => {
    useTerminalStore.getState().ensureArea("panel");
    const first = useTerminalStore.getState().areas.panel!.activeTabId!;
    const second = useTerminalStore.getState().addTab("panel", "remote-workplace")!;
    useTerminalStore.getState().splitTab("panel", first, "left");
    expect(useTerminalStore.getState().areas.panel).toMatchObject({ activeTabId: first, splitTabId: second });
    useTerminalStore.getState().closeTab("panel", second);
    expect(useTerminalStore.getState().areas.panel!.splitTabId).toBeNull();
  });
});
