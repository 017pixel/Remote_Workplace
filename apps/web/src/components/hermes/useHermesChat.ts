import { useCallback, useEffect, useRef, useState } from "react";
import { hermesServerMessageSchema, type HermesApproval, type HermesClientMessage, type HermesMessage, type HermesServerMessage, type HermesSession, type HermesSlashCommand, type HermesToolCall, type HermesUsage } from "@workbench/contracts";
import { useHermesStore } from "../../stores/hermes";

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/hermes/chat`;
}

function newMessageId() {
  return crypto.randomUUID();
}

export function useHermesChat(instanceId: string, initialSessionId: string | null, projectId: string | null) {
  const setActiveSession = useHermesStore((state) => state.setActiveSession);
  const [session, setSession] = useState<HermesSession | null>(null);
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [tools, setTools] = useState<HermesToolCall[]>([]);
  const [approvals, setApprovals] = useState<HermesApproval[]>([]);
  const [thought, setThought] = useState("");
  const [commands, setCommands] = useState<HermesSlashCommand[]>([]);
  const [usage, setUsage] = useState<HermesUsage | null>(null);
  const [taskState, setTaskState] = useState<"idle" | "running" | "cancelling">("idle");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectAttempt = useRef(0);
  const connectRef = useRef<() => void>(() => undefined);
  const pendingCreate = useRef<{ content: string; clientMessageId: string } | null>(null);
  const attachedSession = useRef<string | null>(initialSessionId);
  const initialSessionRef = useRef(initialSessionId);

  const sendRaw = useCallback((message: HermesClientMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const onServerMessage = useCallback((message: HermesServerMessage) => {
    if (message.type === "session.ready") {
      setSession(message.session);
      attachedSession.current = message.session.id;
      setActiveSession(instanceId, message.session.id);
      setError(null);
      const pending = pendingCreate.current;
      if (pending) {
        pendingCreate.current = null;
        sendRaw({ v: 1, type: "message.send", sessionId: message.session.id, clientMessageId: pending.clientMessageId, content: pending.content });
      }
      return;
    }
    if (message.type === "message.appended") {
      setMessages((current) => current.some((item) => item.id === message.message.id) ? current : [...current, message.message]);
      return;
    }
    if (message.type === "message.delta") {
      setMessages((current) => {
        const index = current.findIndex((item) => item.id === message.messageId);
        if (index === -1) return [...current, { id: message.messageId, role: "assistant", content: message.delta, toolCalls: [], createdAt: new Date().toISOString(), truncated: false }];
        const next = [...current];
        next[index] = { ...next[index]!, content: `${next[index]!.content}${message.delta}` };
        return next;
      });
      return;
    }
    if (message.type === "message.complete") {
      setMessages((current) => {
        const index = current.findIndex((item) => item.id === message.message.id);
        if (index === -1) return [...current, message.message];
        const next = [...current];
        next[index] = message.message;
        return next;
      });
      setTools(message.message.toolCalls);
      setThought("");
      return;
    }
    if (message.type === "thought.delta") { setThought((current) => `${current}${message.delta}`); return; }
    if (message.type === "tool.update") { setTools((current) => [...current.filter((tool) => tool.id !== message.toolCall.id), message.toolCall]); return; }
    if (message.type === "approval.requested") { setApprovals((current) => [...current.filter((item) => item.requestId !== message.request.requestId), message.request]); return; }
    if (message.type === "approval.resolved") { setApprovals((current) => current.filter((item) => item.requestId !== message.requestId)); return; }
    if (message.type === "commands.available") { setCommands(message.commands); return; }
    if (message.type === "usage") { setUsage(message.usage); return; }
    if (message.type === "task.state") { setTaskState(message.state); return; }
    if (message.type === "error") { setError(message.message); if (message.code === "ACP_CRASHED") setConnected(false); }
  }, [instanceId, sendRaw, setActiveSession]);

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) return;
    const socket = new WebSocket(socketUrl());
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      reconnectAttempt.current = 0;
      setConnected(true);
      setError(null);
      const sessionId = attachedSession.current ?? initialSessionRef.current;
      if (sessionId) {
        // ACP spielt beim Reconnect die Historie erneut zurück. Die lokale
        // Ansicht wird vorher geleert, damit Replay-Updates keine doppelten
        // Nachrichten erzeugen.
        setMessages([]);
        setTools([]);
        setApprovals([]);
        setThought("");
        sendRaw({ v: 1, type: "session.attach", sessionId });
      }
    });
    socket.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as unknown;
        const result = hermesServerMessageSchema.safeParse(parsed);
        if (result.success) onServerMessage(result.data);
      } catch { setError("Hermes hat eine ungültige Nachricht gesendet."); }
    });
    socket.addEventListener("close", () => {
      setConnected(false);
      socketRef.current = null;
      if (reconnectTimer.current !== null) return;
      const delay = Math.min(10_000, 500 * 2 ** reconnectAttempt.current) + Math.round(Math.random() * 300);
      reconnectAttempt.current += 1;
      reconnectTimer.current = window.setTimeout(() => { reconnectTimer.current = null; connectRef.current(); }, delay);
    });
    socket.addEventListener("error", () => setError("Die Verbindung zum Hermes-Chat ist unterbrochen."));
  }, [onServerMessage, sendRaw]);

  useEffect(() => {
    connectRef.current = connect;
    connect();
    const heartbeat = window.setInterval(() => { sendRaw({ v: 1, type: "ping" }); }, 30_000);
    return () => {
      window.clearInterval(heartbeat);
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect, sendRaw]);

  const send = useCallback((content: string) => {
    const text = content.trim();
    if (!text) return false;
    const clientMessageId = newMessageId();
    const sessionId = attachedSession.current;
    if (!sessionId) {
      pendingCreate.current = { content: text, clientMessageId };
      return sendRaw({ v: 1, type: "session.create", projectId });
    }
    return sendRaw({ v: 1, type: "message.send", sessionId, clientMessageId, content: text });
  }, [projectId, sendRaw]);

  const newSession = useCallback(() => {
    sendRaw({ v: 1, type: "session.detach" });
    attachedSession.current = null;
    initialSessionRef.current = null;
    pendingCreate.current = null;
    setSession(null); setMessages([]); setTools([]); setApprovals([]); setThought(""); setTaskState("idle");
    setError(null);
    setActiveSession(instanceId, null);
  }, [instanceId, sendRaw, setActiveSession]);
  const attach = useCallback((sessionId: string) => {
    if (attachedSession.current === sessionId) return true;
    attachedSession.current = sessionId;
    initialSessionRef.current = sessionId;
    setMessages([]); setTools([]); setApprovals([]); setThought("");
    setError(null);
    return sendRaw({ v: 1, type: "session.attach", sessionId });
  }, [sendRaw]);
  const cancel = useCallback(() => attachedSession.current ? sendRaw({ v: 1, type: "task.cancel", sessionId: attachedSession.current }) : false, [sendRaw]);
  const respondApproval = useCallback((requestId: string, option: "allow_once" | "allow_session" | "deny") => sendRaw({ v: 1, type: "approval.respond", requestId, option }), [sendRaw]);
  const setModel = useCallback((model: string) => attachedSession.current ? sendRaw({ v: 1, type: "model.set", sessionId: attachedSession.current, model }) : false, [sendRaw]);

  return { instanceId, session, messages, tools, approvals, thought, commands, usage, taskState, connected, error, send, newSession, attach, cancel, respondApproval, setModel };
}

export type HermesChatApi = ReturnType<typeof useHermesChat>;
