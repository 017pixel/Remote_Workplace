import { beforeEach, describe, expect, it } from "vitest";
import type { TerminalWorkspaceV2 } from "@wrapt/contracts";
import { applyWorkspaceOperations } from "../components/terminal/workspace/terminalWorkspaceModel";
import { terminalAreaView, useTerminalWorkspaceStore } from "./terminalWorkspace";

function document(): TerminalWorkspaceV2 {
  return {
    version: 2,
    entries: [],
    folders: [{ id: "default", parentFolderId: null, name: "Terminal", sortOrder: 0, collapsed: false }],
    areaLayouts: {},
  };
}

beforeEach(() => {
  useTerminalWorkspaceStore.setState({
    document: document(),
    revision: 0,
    hydrated: true,
    dirty: false,
    saving: false,
    syncError: null,
    pendingOps: [],
    runtimeCwds: {},
  });
});

describe("TerminalWorkspaceStore", () => {
  it("addTab erstellt eine Entry, öffnet sie in der Fläche und liefert die Runtime-ID", () => {
    const store = useTerminalWorkspaceStore.getState();
    const runtimeId = store.addTab("standalone", "projekt-a", "shell");
    expect(runtimeId).toBeTruthy();
    const state = useTerminalWorkspaceStore.getState();
    expect(state.document!.entries).toHaveLength(1);
    expect(state.document!.entries[0]).toMatchObject({ runtimeId, projectId: "projekt-a", kind: "shell" });
    expect(state.document!.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId });
    expect(state.dirty).toBe(true);
    expect(state.pendingOps.length).toBeGreaterThan(0);
  });

  it("activateProject aktiviert eine bestehende Entry und legt sonst keine neue an", () => {
    const store = useTerminalWorkspaceStore.getState();
    const first = store.addTab("standalone", "projekt-a", "shell");
    const second = store.addTab("standalone", "projekt-b", "shell");
    useTerminalWorkspaceStore.setState({ dirty: false, pendingOps: [], revision: 5 });
    const store2 = useTerminalWorkspaceStore.getState();
    const activated = store2.activateProject("standalone", "projekt-a", "shell");
    expect(activated).toBe(first);
    const state = useTerminalWorkspaceStore.getState();
    expect(state.document!.entries).toHaveLength(2);
    expect(state.document!.areaLayouts.standalone!.focusedPaneId).toBe(`pane-${first}`);
    expect(second).not.toBe(first);
    expect(state.document!.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId: first });
  });

  it("applyRemote überschreibt nur, wenn keine lokalen Änderungen offen sind", () => {
    const remote = document();
    useTerminalWorkspaceStore.getState().addTab("standalone", null, "shell");
    useTerminalWorkspaceStore.getState().applyRemote(remote, 9);
    expect(useTerminalWorkspaceStore.getState().document!.entries).toHaveLength(1);
    useTerminalWorkspaceStore.setState({ dirty: false, pendingOps: [], revision: 9 });
    useTerminalWorkspaceStore.getState().applyRemote(remote, 10);
    expect(useTerminalWorkspaceStore.getState().document!.entries).toHaveLength(0);
  });

  it("replaceRemote verwirft lokale Ops und übernimmt den Serverstand", () => {
    useTerminalWorkspaceStore.getState().addTab("standalone", null, "shell");
    const remote = document();
    useTerminalWorkspaceStore.getState().replaceRemote(remote, 12);
    const state = useTerminalWorkspaceStore.getState();
    expect(state.document!.entries).toHaveLength(0);
    expect(state.dirty).toBe(false);
    expect(state.pendingOps).toEqual([]);
  });

  it("rebased lokale Ops nach einem Workspace-Konflikt statt sie zu verwerfen", () => {
    const store = useTerminalWorkspaceStore.getState();
    store.addTab("standalone", null, "shell");
    const pending = [...useTerminalWorkspaceStore.getState().pendingOps];
    useTerminalWorkspaceStore.getState().rebaseRemote(document(), 18, pending);
    const state = useTerminalWorkspaceStore.getState();
    expect(state.document!.entries).toHaveLength(1);
    expect(state.revision).toBe(18);
    expect(state.pendingOps).toEqual(pending);
    expect(state.dirty).toBe(true);
  });

  it("behält neuere lokale Ops, wenn ein älterer Save erfolgreich war", () => {
    const store = useTerminalWorkspaceStore.getState();
    store.addTab("standalone", null, "shell");
    const savedOps = [...useTerminalWorkspaceStore.getState().pendingOps];
    store.addTab("standalone", null, "shell");
    const currentOps = useTerminalWorkspaceStore.getState().pendingOps;
    const serverDocument = applyWorkspaceOperations(document(), savedOps);
    useTerminalWorkspaceStore.getState().reconcileSaved(serverDocument, 19, savedOps);
    const state = useTerminalWorkspaceStore.getState();
    expect(state.document!.entries).toHaveLength(2);
    expect(state.pendingOps).toEqual(currentOps.slice(savedOps.length));
    expect(state.dirty).toBe(true);
  });

  it("queueOps sammelt Ops für den Offline-Puffer", () => {
    useTerminalWorkspaceStore.getState().queueOps([
      { type: "createFolder", folder: { id: "f1", parentFolderId: null, name: "Ordner", sortOrder: 1, collapsed: false } },
    ]);
    const state = useTerminalWorkspaceStore.getState();
    expect(state.document!.folders).toHaveLength(2);
    expect(state.pendingOps).toHaveLength(1);
    expect(state.dirty).toBe(true);
  });
});

describe("terminalAreaView", () => {
  it("liefert die aktive Runtime und alle gestarteten Entries", () => {
    const store = useTerminalWorkspaceStore.getState();
    const runtimeId = store.addTab("standalone", "projekt-a", "shell");
    const view = terminalAreaView(useTerminalWorkspaceStore.getState(), "standalone");
    expect(view.activeTabId).toBe(runtimeId);
    expect(view.tabs).toEqual([{ id: runtimeId, projectId: "projekt-a", kind: "shell", initialCwd: null }]);
  });

  it("liefert für unbekannte Flächen eine leere Sicht", () => {
    const view = terminalAreaView(useTerminalWorkspaceStore.getState(), "panel-fremd");
    expect(view).toEqual({ activeTabId: null, tabs: [] });
  });

  it("bleibt referenzstabil bei unverändertem Dokument (Schutz vor React-Fehler #185)", () => {
    const store = useTerminalWorkspaceStore.getState();
    store.addTab("standalone", "projekt-a", "shell");
    const state = useTerminalWorkspaceStore.getState();
    const first = terminalAreaView(state, "standalone");
    const second = terminalAreaView(state, "standalone");
    expect(second).toBe(first);
    expect(second.tabs).toBe(first.tabs);
  });
});
