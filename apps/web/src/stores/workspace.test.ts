import type { Workspace } from "@workbench/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyWorkspace, migrateLegacyWorkspace, parseStoredWorkspace, useWorkspaceStore, visiblePanels } from "./workspace";

const twoPanelWorkspace: Workspace = {
  version: 3,
  selectedProjectId: "chappie",
  panels: [
    { id: "left", type: "t3-code", projectId: "chappie", previewId: null, reloadKey: 0 },
    { id: "right", type: "code-server", projectId: "chappie", previewId: null, reloadKey: 0 },
  ],
  workspaces: [{
    id: "workspace",
    name: "Entwicklung",
    groups: [
      { id: "left-group", panelIds: ["left"], activePanelId: "left" },
      { id: "right-group", panelIds: ["right"], activePanelId: "right" },
    ],
    focusedGroupId: "right-group",
    layout: "columns",
    layoutSizes: { root: [50, 50] },
  }],
  activeWorkspaceId: "workspace",
  maximizedPanelId: null,
  focusedPanelId: "right",
};

describe("workspace persistence", () => {
  beforeEach(() => useWorkspaceStore.getState().resetWorkspace());

  it("falls back to an empty workspace when persisted data is invalid", () => {
    expect(parseStoredWorkspace({ version: 2, panels: [{ id: "broken" }] })).toEqual(emptyWorkspace);
  });

  it("migrates the former two-panel workspace without discarding tools", () => {
    const migrated = migrateLegacyWorkspace({
      version: 1,
      selectedProjectId: "chappie",
      panels: twoPanelWorkspace.panels,
      layout: "horizontal",
      panelSizes: [60, 40],
      maximizedPanelId: null,
      focusedPanelId: "right",
    });

    expect(migrated?.version).toBe(3);
    expect(migrated?.panels).toHaveLength(2);
    expect(migrated?.workspaces[0]?.groups).toHaveLength(2);
    expect(migrated?.workspaces[0]?.layoutSizes.root).toEqual([60, 40]);
  });

  it("shows only the focused group on mobile", () => {
    expect(visiblePanels(twoPanelWorkspace, true).map((panel) => panel.id)).toEqual(["right"]);
  });

  it("shows the active tab of every group on desktop", () => {
    expect(visiblePanels(twoPanelWorkspace, false).map((panel) => panel.id)).toEqual(["left", "right"]);
  });

  it("shows only a maximized panel", () => {
    expect(visiblePanels({ ...twoPanelWorkspace, maximizedPanelId: "left" }, false).map((panel) => panel.id)).toEqual(["left"]);
  });

  it("focuses an existing matching tool instead of loading it twice", () => {
    const firstId = useWorkspaceStore.getState().openPanel({ type: "t3-code", projectId: "chappie" });
    const repeatedId = useWorkspaceStore.getState().openPanel({ type: "t3-code", projectId: "chappie" });

    expect(repeatedId).toBe(firstId);
    expect(useWorkspaceStore.getState().panels).toHaveLength(1);
    expect(useWorkspaceStore.getState().focusedPanelId).toBe(firstId);
  });

  it("allows independent terminal sessions in the same tab group", () => {
    useWorkspaceStore.getState().openPanel({ type: "terminal" });
    useWorkspaceStore.getState().openPanel({ type: "terminal" });
    expect(useWorkspaceStore.getState().panels.map((panel) => panel.type)).toEqual(["terminal", "terminal"]);
  });

  it("allows multiple independent Codex and OpenCode panels", () => {
    useWorkspaceStore.getState().openPanel({ type: "codex", projectId: "chappie" });
    useWorkspaceStore.getState().openPanel({ type: "codex", projectId: "chappie" });
    useWorkspaceStore.getState().openPanel({ type: "opencode", projectId: "chappie" });
    expect(useWorkspaceStore.getState().panels.map((panel) => panel.type)).toEqual(["codex", "codex", "opencode"]);
  });

  it("caps resident runtimes at eight without discarding existing sessions", () => {
    for (let index = 0; index < 8; index += 1) {
      expect(useWorkspaceStore.getState().openPanel({ type: "terminal" })).not.toBeNull();
    }
    expect(useWorkspaceStore.getState().openPanel({ type: "terminal" })).toBeNull();
    expect(useWorkspaceStore.getState().panels).toHaveLength(8);
  });

  it("keeps up to eight independently named workspaces", () => {
    for (let index = 2; index <= 8; index += 1) {
      expect(useWorkspaceStore.getState().addWorkspace(`Fläche ${index}`)).not.toBeNull();
    }
    expect(useWorkspaceStore.getState().addWorkspace("Zu viel")).toBeNull();
    expect(useWorkspaceStore.getState().workspaces.map((workspace) => workspace.name)).toHaveLength(8);
  });

  it("keeps tools alive when a group is dissolved by moving its tabs", () => {
    const first = useWorkspaceStore.getState().openPanel({ type: "terminal" })!;
    const secondGroup = useWorkspaceStore.getState().addGroup()!;
    const second = useWorkspaceStore.getState().openPanel({ type: "terminal", groupId: secondGroup })!;
    useWorkspaceStore.getState().removeGroup(secondGroup);

    const state = useWorkspaceStore.getState();
    expect(state.panels.map((panel) => panel.id)).toEqual([first, second]);
    expect(state.workspaces[0]?.groups).toHaveLength(1);
    expect(state.workspaces[0]?.groups[0]?.panelIds).toEqual([first, second]);
  });
});
