// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebTerminal } from "./WebTerminal";

const focus = vi.fn();

vi.mock("./engine/useTerminalRenderer", () => ({
  useTerminalRenderer: () => ({
    error: null,
    restartBanner: null,
    lastCommand: "",
    terminalIsDead: false,
    pendingPaste: null,
    resolvePendingPaste: vi.fn(),
    mountRef: { current: null },
    focus,
    action: vi.fn(),
    restart: vi.fn(),
    resync: vi.fn(),
    sendKey: vi.fn(),
    pasteFromClipboard: vi.fn(),
    setRestartBanner: vi.fn(),
    setError: vi.fn(),
  }),
}));

vi.mock("../ModalDialog", () => ({ ConfirmDialog: () => null }));

afterEach(() => {
  cleanup();
  focus.mockClear();
});

describe("WebTerminal-Fokus", () => {
  it("fokussiert die Terminalfläche bereits beim PointerDown ohne Auswahl", () => {
    const { container } = render(<WebTerminal instanceId="runtime-1" />);
    const viewport = container.querySelector<HTMLElement>(".terminal-viewport");

    expect(viewport).toBeTruthy();
    fireEvent.pointerDown(viewport!);

    expect(focus).toHaveBeenCalledOnce();
  });

  it("aktiviert Fokus auch bei einem Touch-Pointer vor dem ersten Wisch", () => {
    const { container } = render(<WebTerminal instanceId="runtime-1" />);
    const viewport = container.querySelector<HTMLElement>(".terminal-viewport");

    fireEvent.pointerDown(viewport!, { pointerType: "touch" });

    expect(focus).toHaveBeenCalledOnce();
  });
});
