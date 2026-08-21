// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";

class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() { FakeWebSocket.instances.push(this); }

  send(message: string) {
    this.sent.push(message);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("teilt eine Runtime-Subscription zwischen Renderer und Preview", async () => {
  vi.stubGlobal("WebSocket", FakeWebSocket);
  const { terminalTransport } = await import("./TerminalTransport");
  const rendererMessages: string[] = [];
  const previewMessages: string[] = [];
  const renderer = terminalTransport.subscribe("runtime-1");
  const preview = terminalTransport.subscribe("runtime-1");
  renderer.onMessage((message) => rendererMessages.push(message.type));
  preview.onMessage((message) => previewMessages.push(message.type));

  const socket = FakeWebSocket.instances[0];
  expect(socket).toBeDefined();
  expect(socket!.onmessage).toBeTypeOf("function");
  socket!.open();
  expect(renderer.send({ type: "terminal.subscribe", runtimeId: "runtime-1" })).toBe(true);
  socket!.emit({
    type: "terminal.snapshot",
    sessionId: "session-1",
    runtimeId: "runtime-1",
    kind: "shell",
    status: "running",
    projectId: null,
    cwd: "/tmp",
    epoch: 1,
    sequence: 0,
    cols: 80,
    rows: 24,
    ownsGeometry: true,
    alternate: false,
    mouseTracking: false,
    serialized: "Hallo",
  });
  expect(rendererMessages).toEqual(["terminal.snapshot"]);
  expect(previewMessages).toEqual(["terminal.snapshot"]);
  preview.dispose();
  expect(socket!.sent.map((value) => JSON.parse(value).type)).not.toContain("terminal.unsubscribe");
  renderer.dispose();
  expect(socket!.sent.map((value) => JSON.parse(value).type)).toContain("terminal.unsubscribe");
});
