import { beforeEach, describe, expect, it } from "vitest";
import { CLI_INSTANCE_LIMITS, MAX_TERMINAL_TABS, useTerminalStore } from "./terminals";

describe("terminal areas", () => {
  beforeEach(() => useTerminalStore.setState({ areas: {}, hydrated: true, revision: 0, dirty: false, saving: false, syncError: null }));

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

  it("activates an existing project tab instead of creating a duplicate", () => {
    useTerminalStore.getState().ensureArea("standalone", "first-project", "shell");
    const first = useTerminalStore.getState().areas.standalone!.activeTabId!;
    const second = useTerminalStore.getState().addTab("standalone", "second-project", "shell");

    expect(useTerminalStore.getState().activateProject("standalone", "first-project", "shell")).toBeTruthy();
    expect(useTerminalStore.getState().areas.standalone!.activeTabId).toBe(first);
    expect(useTerminalStore.getState().areas.standalone!.activeTabId).not.toBe(second);
    expect(useTerminalStore.getState().areas.standalone!.tabs).toHaveLength(2);
  });

  it("caps CLI areas at the server-abgestimmten Instanzgrenzen", () => {
    useTerminalStore.getState().ensureArea("opencode-standalone", null, "opencode");
    for (let index = 1; index < CLI_INSTANCE_LIMITS.opencode; index += 1) {
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

  it("ordnet zwei Tabs festen Split-Panes zu und fokussiert sie ohne Tausch", () => {
    useTerminalStore.getState().ensureArea("panel");
    const first = useTerminalStore.getState().areas.panel!.activeTabId!;
    const second = useTerminalStore.getState().addTab("panel", "remote-workplace")!;
    useTerminalStore.getState().splitTab("panel", first, "left");
    expect(useTerminalStore.getState().areas.panel).toMatchObject({ activeTabId: first, splitTabIds: [first, second] });
    useTerminalStore.getState().activateTab("panel", second);
    expect(useTerminalStore.getState().areas.panel).toMatchObject({ activeTabId: second, splitTabIds: [first, second] });
  });

  it("öffnet einen neuen Split im aktuellen Arbeitsordner", () => {
    useTerminalStore.getState().ensureArea("panel", "remote-workplace");
    const first = useTerminalStore.getState().areas.panel!.activeTabId!;
    const second = useTerminalStore.getState().openSplit("panel", "remote-workplace", "shell", "/home/user/projects/Remote_Workplace/src")!;
    expect(useTerminalStore.getState().areas.panel).toMatchObject({
      activeTabId: second,
      splitTabIds: [first, second],
      tabs: [
        expect.objectContaining({ id: first }),
        expect.objectContaining({ id: second, initialCwd: "/home/user/projects/Remote_Workplace/src" }),
      ],
    });
  });

  it("ersetzt im Split nur das fokussierte Pane und klappt beim Schließen sauber zusammen", () => {
    useTerminalStore.getState().ensureArea("panel");
    const first = useTerminalStore.getState().areas.panel!.activeTabId!;
    const second = useTerminalStore.getState().openSplit("panel")!;
    useTerminalStore.getState().activateTab("panel", first);
    const third = useTerminalStore.getState().addTab("panel", "sample")!;
    expect(useTerminalStore.getState().areas.panel).toMatchObject({ activeTabId: third, splitTabIds: [third, second] });
    useTerminalStore.getState().closeTab("panel", second);
    expect(useTerminalStore.getState().areas.panel).toMatchObject({ activeTabId: third, splitTabIds: null });
  });
});
