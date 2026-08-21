// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { attachTerminalInput, type TerminalInputContext } from "./terminal-input";

function touchEvent(type: string, points: Array<{ clientX: number; clientY: number }>): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, "touches", { value: points });
  return event;
}

function setupInput(active = true) {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const scrollByLines = vi.fn();
  const focusedRef = { current: active };
  const terminal = {
    rows: 20,
    cols: 80,
    element: mount,
    buffer: { active: { type: "normal", baseY: 0 } },
    modes: { mouseTrackingMode: "none" },
    attachCustomKeyEventHandler: vi.fn(),
    attachCustomWheelEventHandler: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    hasSelection: vi.fn(() => false),
    select: vi.fn(),
  } as unknown as Terminal;
  const context = {
    send: vi.fn(() => true),
    setError: vi.fn(),
    sessionRef: { current: "session-1" },
    snapshotReplayRef: { current: false },
    replayBufferRef: { current: [] as string[] },
    mouseTrackingRef: { current: false },
    kindRef: { current: "shell" as const },
    terminalRef: { current: terminal },
    rememberTyping: vi.fn(),
    copySelection: vi.fn(),
    receivePastedText: vi.fn(),
    scrollByLines,
    focusedRef,
  } satisfies TerminalInputContext;
  const dispose = attachTerminalInput(terminal, mount, context);
  return { mount, terminal, context, scrollByLines, focusedRef, dispose };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Terminal-Scroll-Lifecycle", () => {
  it("scrollt per Wheel ohne vorherige Textauswahl", () => {
    const { mount, scrollByLines, dispose } = setupInput();

    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, deltaMode: 0, bubbles: true, cancelable: true }));

    expect(scrollByLines).toHaveBeenCalledWith(2);
    dispose();
  });

  it("bleibt nach einer Auswahl und deren Aufhebung scrollbar", () => {
    const { mount, scrollByLines, dispose } = setupInput();

    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    mount.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    mount.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));

    expect(scrollByLines).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("scrollt ausschließlich im aktiven Pane", () => {
    const { mount, scrollByLines, focusedRef, dispose } = setupInput(false);

    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    mount.dispatchEvent(touchEvent("touchstart", [{ clientX: 10, clientY: 100 }]));
    mount.dispatchEvent(touchEvent("touchmove", [{ clientX: 10, clientY: 70 }]));
    mount.dispatchEvent(touchEvent("touchmove", [{ clientX: 10, clientY: 40 }]));
    expect(scrollByLines).not.toHaveBeenCalled();

    focusedRef.current = true;
    mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    expect(scrollByLines).toHaveBeenCalledWith(2);
    dispose();
  });

  it("setzt Handler nach Tab-/Werkzeugwechsel und Reload nicht doppelt an", () => {
    const first = setupInput();
    first.mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    expect(first.scrollByLines).toHaveBeenCalledTimes(1);
    first.dispose();

    const reloadedDispose = attachTerminalInput(first.terminal, first.mount, first.context);
    first.mount.dispatchEvent(new WheelEvent("wheel", { deltaY: 36, bubbles: true, cancelable: true }));
    expect(first.scrollByLines).toHaveBeenCalledTimes(2);
    reloadedDispose();
  });
});
