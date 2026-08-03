import { describe, expect, it } from "vitest";
import { createWebSocketSendQueue, type BufferedWebSocket } from "./websocketSendQueue.js";

class TestSocket implements BufferedWebSocket {
  readyState = 1;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;

  send(data: string) { this.sent.push(data); }
  close(code?: number, reason?: string) {
    this.closed = { ...(code === undefined ? {} : { code }), ...(reason === undefined ? {} : { reason }) };
    this.readyState = 3;
  }
}

describe("WebSocket-Ausgabequeue", () => {
  it("sendet normale Nachrichten vollständig und in Reihenfolge", () => {
    const socket = new TestSocket();
    const queue = createWebSocketSendQueue<{ id: number }>({ socket, highWaterMarkBytes: 0 });
    expect(queue.send({ id: 1 })).toBe(true);
    expect(queue.send({ id: 2 })).toBe(true);
    expect(socket.sent.map((value) => JSON.parse(value))).toEqual([{ id: 1 }, { id: 2 }]);
    queue.dispose();
  });

  it("ersetzt nur ausdrücklich zusammenfassbare Frames", async () => {
    const socket = new TestSocket();
    socket.bufferedAmount = 100;
    const queue = createWebSocketSendQueue<{ type: string; value: number }>({
      socket,
      highWaterMarkBytes: 0,
      coalesceKey: (message) => message.type === "frame" ? "frame" : null,
      retryMilliseconds: 1,
    });
    queue.send({ type: "frame", value: 1 });
    queue.send({ type: "frame", value: 2 });
    queue.send({ type: "state", value: 3 });
    socket.bufferedAmount = 0;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(socket.sent.map((value) => JSON.parse(value))).toEqual([
      { type: "frame", value: 2 },
      { type: "state", value: 3 },
    ]);
    queue.dispose();
  });

  it("schließt bei dauerhaftem Rückstau statt Daten still zu verwerfen", () => {
    const socket = new TestSocket();
    socket.bufferedAmount = 100;
    const queue = createWebSocketSendQueue<{ value: string }>({ socket, maxQueueBytes: 10, highWaterMarkBytes: 0 });
    expect(queue.send({ value: "zu groß" })).toBe(false);
    expect(socket.closed?.code).toBe(1013);
  });
});
