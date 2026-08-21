// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalWorkspaceV2 } from "@wrapt/contracts";
import { useTerminalWorkspaceStore } from "../../../stores/terminalWorkspace";
import { TerminalSidebar } from "./TerminalSidebar";

afterEach(() => {
  cleanup();
  useTerminalWorkspaceStore.setState({ document: null, pendingOps: [], dirty: false });
});

function workspace(): TerminalWorkspaceV2 {
  return {
    version: 2,
    entries: [{ id: "entry-shell", runtimeId: "runtime-shell", name: "Shell", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null }],
    folders: [],
    areaLayouts: {},
  };
}

function renderSidebar(value = workspace()) {
  const callbacks = {
    onToggleSidebar: vi.fn(),
    onNewTerminal: vi.fn(),
    onNewTerminalInFolder: vi.fn(),
    onOpenEntry: vi.fn(),
    onOpenInSplit: vi.fn(),
    onResync: vi.fn(),
    onRestart: vi.fn(),
    onClose: vi.fn(),
    onCreateSplit: vi.fn(),
    onClearSplit: vi.fn(),
    onClear: vi.fn(),
    onClosePane: vi.fn(),
    onHoverStart: vi.fn(),
    onHoverEnd: vi.fn(),
  };
  useTerminalWorkspaceStore.getState().replaceRemote(value, 0);
  render(
    <TerminalSidebar
      areaId="standalone"
      kind="shell"
      meta={{}}
      sessions={[]}
      cwds={{}}
      isMobile={false}
      open
      activeRuntimeId={null}
      hasSplit={false}
      hasActivePane={false}
      sessionPicker={<span>Sessions</span>}
      {...callbacks}
    />,
  );
  return callbacks;
}

describe("TerminalSidebar", () => {
  it("verbindet Titel und Pfeil zu einem funktionierenden Sidebar-Schalter", () => {
    const callbacks = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Terminal-Sidebar ausblenden" }));
    expect(callbacks.onToggleSidebar).toHaveBeenCalledOnce();
  });

  it("öffnet per Rechtsklick auf freie Sidebar-Fläche das Kontextmenü", () => {
    const callbacks = renderSidebar();
    fireEvent.contextMenu(screen.getByRole("complementary", { name: "Terminal-Sidebar" }), { clientX: 40, clientY: 60 });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Neues Terminal" }));
    expect(callbacks.onNewTerminal).toHaveBeenCalledOnce();
  });

  it("benennt ein Terminal über Rechtsklick und Umbenennen um", () => {
    renderSidebar();
    fireEvent.contextMenu(screen.getByText("Shell"), { clientX: 40, clientY: 60 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Umbenennen" }));
    const input = screen.getByDisplayValue("Shell");
    fireEvent.change(input, { target: { value: "Backend" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useTerminalWorkspaceStore.getState().document?.entries[0]?.name).toBe("Backend");
  });

  it("schließt über die freie Fläche nur normale Terminals", async () => {
    const value = workspace();
    value.entries.push(
      { id: "entry-pinned", runtimeId: "runtime-pinned", name: "Gepinnt", parentFolderId: null, sortOrder: 1, pinned: true, persistent: false, kind: "shell", projectId: null, initialCwd: null },
      { id: "entry-persistent", runtimeId: "runtime-persistent", name: "Persistent", parentFolderId: null, sortOrder: 2, pinned: false, persistent: true, kind: "shell", projectId: null, initialCwd: null },
    );
    renderSidebar(value);
    fireEvent.contextMenu(screen.getByRole("complementary", { name: "Terminal-Sidebar" }), { clientX: 40, clientY: 60 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Alle normalen Terminals schließen" }));
    expect(screen.getByRole("dialog").textContent).toContain("1 normale Terminals");
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(useTerminalWorkspaceStore.getState().document?.entries.map((entry) => entry.name)).toEqual(["Gepinnt", "Persistent"]));
  });
});
