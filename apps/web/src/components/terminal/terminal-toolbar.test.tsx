// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalToolbar } from "./terminal-toolbar";

afterEach(cleanup);

describe("TerminalToolbar", () => {
  it("zeigt Split und weitere Aktionen gemeinsam in der Sidebar-Aktionszeile", () => {
    const onCreateSplit = vi.fn();
    const onRestart = vi.fn();
    render(
      <TerminalToolbar
        kind="shell"
        hasSplit={false}
        hasActivePane
        onCreate={vi.fn()}
        onCreateSplit={onCreateSplit}
        onClearSplit={vi.fn()}
        onRestart={onRestart}
        onClear={vi.fn()}
        onClosePane={vi.fn()}
        sessionPicker={<span>Sessions</span>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Neues Terminal rechts teilen" }));
    expect(onCreateSplit).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Weitere Terminalaktionen" }));
    expect(screen.getByRole("menu", { name: "Terminalaktionen" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Neustart" }));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it("zeigt das Aktionsmenü auch auf Touch-Flächen an", () => {
    render(
      <TerminalToolbar
        kind="shell"
        hasSplit
        hasActivePane
        onCreate={vi.fn()}
        onCreateSplit={vi.fn()}
        onClearSplit={vi.fn()}
        onRestart={vi.fn()}
        onClear={vi.fn()}
        onClosePane={vi.fn()}
        sessionPicker={<span>Sessions</span>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Weitere Terminalaktionen" }));
    expect(screen.getByRole("menuitem", { name: "Leeren" })).toBeTruthy();
    expect(screen.getByText("Sessions")).toBeTruthy();
  });
});
