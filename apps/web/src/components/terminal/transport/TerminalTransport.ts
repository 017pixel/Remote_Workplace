import type { ClientMessage, ServerMessage } from "../terminal-types";

export interface TerminalSubscription {
  runtimeId: string;
  sessionId: string | null;
  /** Sendet eine Nachricht über den gemeinsamen Socket. */
  send(message: ClientMessage): boolean;
  /** Registriert einen Nachrichten-Listener; gibt die Abmeldung zurück. */
  onMessage(listener: (message: ServerMessage) => void): () => void;
  onStatus(listener: (connected: boolean) => void): () => void;
  dispose(): void;
}

interface SubscriptionState {
  runtimeId: string;
  sessionId: string | null;
  listeners: Set<(message: ServerMessage) => void>;
  statusListeners: Set<(connected: boolean) => void>;
}

/**
 * Multiplexter Terminal-Transport: Ein Browser-Tab hält genau einen WebSocket
 * und verwaltet darüber beliebig viele Runtime-Subscriptions (Split View,
 * mehrere Panes, geparkte Renderer). Der Server bleibt autoritativ; dieser
 * Client ordnet eingehende Nachrichten über die Runtime-ID zu.
 */
class TerminalTransport {
  private socket: WebSocket | null = null;
  private readonly subscriptions = new Map<string, SubscriptionState>();
  private readonly sessionToRuntime = new Map<string, string>();
  private reconnectTimer: number | null = null;
  private retries = 0;
  private heartbeat: number | null = null;

  subscribe(runtimeId: string, initial: { sessionId?: string } = {}): TerminalSubscription {
    const state: SubscriptionState = {
      runtimeId,
      sessionId: initial.sessionId ?? null,
      listeners: new Set(),
      statusListeners: new Set(),
    };
    this.subscriptions.set(runtimeId, state);
    if (initial.sessionId) this.sessionToRuntime.set(initial.sessionId, runtimeId);
    this.ensureSocket();
    let disposed = false;
    return {
      runtimeId,
      sessionId: state.sessionId,
      send: (message) => this.send(message),
      onMessage: (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      onStatus: (listener) => {
        state.statusListeners.add(listener);
        return () => state.statusListeners.delete(listener);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.send({ type: "terminal.unsubscribe", runtimeId });
        this.subscriptions.delete(runtimeId);
        if (this.subscriptions.size === 0) this.closeSocket();
      },
    };
  }

  private send(message: ClientMessage): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  private ensureSocket(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.openSocket();
  }

  private openSocket(): void {
    const url = new URL("/api/v1/terminal", window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url.toString());
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.retries = 0;
      this.emitStatus(true);
      this.heartbeat = window.setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) this.send({ type: "terminal.ping" });
      }, 25_000);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      this.route(message);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.emitStatus(false);
      if (this.subscriptions.size === 0) return;
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.openSocket();
      }, Math.min(10_000, 500 * (2 ** this.retries++)));
    };
    socket.onerror = () => socket.close();
  }

  private closeSocket(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.sessionToRuntime.clear();
  }

  private route(message: ServerMessage): void {
    if (message.type === "terminal.created") {
      this.sessionToRuntime.set(message.sessionId, message.runtimeId);
    }
    // Fehler tragen nach Möglichkeit eine Runtime-ID (Server); sonst wird über
    // die Session-ID geroutet. Nachrichten ohne beides (Pong) werden verworfen.
    const runtimeId = "runtimeId" in message && typeof (message as { runtimeId?: string }).runtimeId === "string"
      ? (message as { runtimeId: string }).runtimeId
      : "sessionId" in message && typeof message.sessionId === "string"
        ? this.sessionToRuntime.get(message.sessionId)
        : undefined;
    if (!runtimeId) return;
    const state = this.subscriptions.get(runtimeId);
    if (!state) return;
    if ("sessionId" in message && typeof message.sessionId === "string") state.sessionId = message.sessionId;
    for (const listener of state.listeners) listener(message);
  }

  private emitStatus(connected: boolean): void {
    for (const state of this.subscriptions.values()) {
      for (const listener of state.statusListeners) listener(connected);
    }
  }
}

/** Eine gemeinsame Transport-Instanz pro Browserseite. */
export const terminalTransport = new TerminalTransport();
