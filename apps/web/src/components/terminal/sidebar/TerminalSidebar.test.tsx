// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    entries: [],
    folders: [],
    areaLayouts: {},
  };
}

function renderSidebar() {
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
  };
  useTerminalWorkspaceStore.getState().replaceRemote(workspace(), 0);
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
});
