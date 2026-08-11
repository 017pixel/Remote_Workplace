import { WORKBENCH_LIMITS, type Workspace } from "@workbench/contracts";
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

  it("behält bekannte Panels, wenn ein zurückgebauter Typ in localStorage liegt", () => {
    const parsed = parseStoredWorkspace({
      ...twoPanelWorkspace,
      panels: [
        ...twoPanelWorkspace.panels,
        { id: "retired-hermes", type: "hermes-agent", projectId: null, previewId: null, reloadKey: 0 },
      ],
      workspaces: [{
        ...twoPanelWorkspace.workspaces[0]!,
        groups: [
          { ...twoPanelWorkspace.workspaces[0]!.groups[0]!, panelIds: ["left", "retired-hermes"] },
          twoPanelWorkspace.workspaces[0]!.groups[1]!,
        ],
      }],
    });

    expect(parsed.panels.map((panel) => panel.id)).toEqual(["left", "right"]);
    expect(parsed.workspaces[0]?.groups[0]?.panelIds).toEqual(["left"]);
  });

  it("überführt eine alte Hermes-Sitzung in den offiziellen SPA-Pfad", () => {
    const parsed = parseStoredWorkspace({
      ...twoPanelWorkspace,
      panels: [
        ...twoPanelWorkspace.panels,
        {
          id: "legacy-hermes",
          type: "hermes",
          projectId: null,
          previewId: null,
          reloadKey: 0,
          hermesSurface: "chat",
          hermesSessionId: "session-from-storage",
        },
      ],
      workspaces: [{
        ...twoPanelWorkspace.workspaces[0]!,
        groups: [{
          ...twoPanelWorkspace.workspaces[0]!.groups[0]!,
          panelIds: ["left", "legacy-hermes"],
          activePanelId: "legacy-hermes",
        }, twoPanelWorkspace.workspaces[0]!.groups[1]!],
      }],
    });

    expect(parsed.panels.find((panel) => panel.id === "legacy-hermes")).toMatchObject({
      type: "hermes",
      hermesAdminPath: "/chat?resume=session-from-storage",
    });
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

  it("wandelt einen gespeicherten v2-Stand ohne Datenverlust in v3 um", () => {
    const parsed = parseStoredWorkspace({
      ...twoPanelWorkspace,
      version: 2,
    });

    expect(parsed.version).toBe(3);
    expect(parsed.panels).toHaveLength(2);
    expect(parsed.workspaces[0]?.groups[0]?.panelIds).toEqual(["left"]);
    expect(parsed.selectedProjectId).toBe("chappie");
  });

  it("behält die Arbeitsflächen-Struktur, wenn alle Panels unbekannt sind", () => {
    const parsed = parseStoredWorkspace({
      version: 3,
      selectedProjectId: null,
      panels: [
        { id: "unbekannt-1", type: "future-tool", projectId: null, previewId: null, reloadKey: 0 },
      ],
      workspaces: [{
        id: "workspace",
        name: "Entwicklung",
        groups: [{ id: "group", panelIds: ["unbekannt-1"], activePanelId: "unbekannt-1" }],
        focusedGroupId: "group",
        layout: "single",
        layoutSizes: {},
      }],
      activeWorkspaceId: "workspace",
      maximizedPanelId: null,
      focusedPanelId: null,
    });

    expect(parsed.panels).toEqual([]);
    expect(parsed.workspaces[0]?.name).toBe("Entwicklung");
    expect(parsed.workspaces[0]?.groups[0]?.panelIds).toEqual([]);
    expect(parsed.activeWorkspaceId).toBe("workspace");
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

  it("übergibt eine angeforderte Browser-Adresse an das bestehende Werkzeug", () => {
    const firstId = useWorkspaceStore.getState().openPanel({ type: "browser", projectId: "chappie" });
    const repeatedId = useWorkspaceStore.getState().openPanel({
      type: "browser",
      projectId: "chappie",
      browserUrl: "http://127.0.0.1:4173/demo",
    });

    expect(repeatedId).toBe(firstId);
    expect(useWorkspaceStore.getState().panels[0]).toMatchObject({
      browserUrl: "http://127.0.0.1:4173/demo",
      reloadKey: 1,
    });
  });

  it("allows independent terminal sessions in the same tab group", () => {
    useWorkspaceStore.getState().openPanel({ type: "terminal" });
    useWorkspaceStore.getState().openPanel({ type: "terminal" });
    expect(useWorkspaceStore.getState().panels.map((panel) => panel.type)).toEqual(["terminal", "terminal"]);
  });

  it("erlaubt mehrere Hermes-Panels und persistiert deren SPA-Pfad", () => {
    const firstId = useWorkspaceStore.getState().openPanel({ type: "hermes" });
    const secondId = useWorkspaceStore.getState().openPanel({ type: "hermes" });
    expect(firstId).not.toBe(secondId);
    expect(useWorkspaceStore.getState().panels).toHaveLength(2);
    useWorkspaceStore.getState().updateHermesPanel(firstId!, { hermesAdminPath: "/cron/jobs" });
    expect(useWorkspaceStore.getState().panels.find((panel) => panel.id === firstId)).toMatchObject({ hermesAdminPath: "/cron/jobs" });
  });

  it("allows multiple independent Codex and OpenCode panels", () => {
    useWorkspaceStore.getState().openPanel({ type: "codex", projectId: "chappie" });
    useWorkspaceStore.getState().openPanel({ type: "codex", projectId: "chappie" });
    useWorkspaceStore.getState().openPanel({ type: "opencode", projectId: "chappie" });
    expect(useWorkspaceStore.getState().panels.map((panel) => panel.type)).toEqual(["codex", "codex", "opencode"]);
  });

  it("deckelt gleichzeitige Laufzeiten am Limit, ohne bestehende Sitzungen zu verwerfen", () => {
    for (let index = 0; index < WORKBENCH_LIMITS.maxResidentTools; index += 1) {
      expect(useWorkspaceStore.getState().openPanel({ type: "terminal" })).not.toBeNull();
    }
    expect(useWorkspaceStore.getState().openPanel({ type: "terminal" })).toBeNull();
    expect(useWorkspaceStore.getState().panels).toHaveLength(WORKBENCH_LIMITS.maxResidentTools);
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
