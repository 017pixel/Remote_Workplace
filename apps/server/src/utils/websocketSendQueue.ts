export interface BufferedWebSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface WebSocketSendQueueOptions<T> {
  socket: BufferedWebSocket;
  highWaterMarkBytes?: number;
  maxQueueBytes?: number;
  retryMilliseconds?: number;
  coalesceKey?: (message: T) => string | null;
}

export interface WebSocketSendQueue<T> {
  send(message: T): boolean;
  dispose(): void;
}

const OPEN = 1;

/**
 * Hält serverseitige WebSocket-Schreiber unter Druck kleiner als der
 * Produktionspuffer. Normale Nachrichten werden nie verworfen. Nur bewusst
 * markierte Zustandsbilder, etwa Browser-Screencast-Frames, dürfen sich im
 * noch nicht gesendeten Teil der Queue gegenseitig ersetzen.
 */
export function createWebSocketSendQueue<T>({
  socket,
  highWaterMarkBytes = 512 * 1024,
  maxQueueBytes = 4 * 1024 * 1024,
  retryMilliseconds = 16,
  coalesceKey,
}: WebSocketSendQueueOptions<T>): WebSocketSendQueue<T> {
  let disposed = false;
  let timer: NodeJS.Timeout | undefined;
  let queuedBytes = 0;
  const queue: Array<{ payload: string; bytes: number; key: string | null }> = [];

  const schedule = () => {
    if (disposed || timer || queue.length === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      flush();
    }, retryMilliseconds);
    timer.unref?.();
  };

  const closeForBackpressure = () => {
    if (disposed) return;
    disposed = true;
    queue.length = 0;
    queuedBytes = 0;
    if (timer) clearTimeout(timer);
    timer = undefined;
    try { socket.close(1013, "Die Verbindung ist zu langsam."); } catch { /* Die Gegenstelle kann bereits geschlossen haben. */ }
  };

  function flush() {
    if (disposed || socket.readyState !== OPEN) return;
    while (queue.length > 0 && socket.bufferedAmount <= highWaterMarkBytes) {
      const entry = queue.shift()!;
      queuedBytes -= entry.bytes;
      try {
        socket.send(entry.payload);
      } catch {
        closeForBackpressure();
        return;
      }
    }
    if (queue.length > 0) schedule();
  }

  return {
    send(message) {
      if (disposed || socket.readyState !== OPEN) return false;
      let payload: string;
      try { payload = JSON.stringify(message); } catch { return false; }
      const bytes = Buffer.byteLength(payload, "utf8");
      const key = coalesceKey?.(message) ?? null;

      if (queue.length === 0 && socket.bufferedAmount <= highWaterMarkBytes) {
        try {
          socket.send(payload);
          return true;
        } catch {
          closeForBackpressure();
          return false;
        }
      }

      if (key !== null) {
        const previousIndex = queue.findIndex((entry) => entry.key === key);
        if (previousIndex >= 0) {
          const previous = queue[previousIndex]!;
          queuedBytes += bytes - previous.bytes;
          queue[previousIndex] = { payload, bytes, key };
        } else {
          queue.push({ payload, bytes, key });
          queuedBytes += bytes;
        }
      } else {
        queue.push({ payload, bytes, key });
        queuedBytes += bytes;
      }
      if (queuedBytes > maxQueueBytes) {
        closeForBackpressure();
        return false;
      }
      schedule();
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      queue.length = 0;
      queuedBytes = 0;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
