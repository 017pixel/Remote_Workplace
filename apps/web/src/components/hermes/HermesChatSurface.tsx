import { useEffect } from "react";
import type { HermesSession } from "@workbench/contracts";
import { HermesSessionSidebar } from "./HermesSessionSidebar";
import { HermesMessageList } from "./HermesMessageList";
import { HermesComposer } from "./HermesComposer";
import type { HermesChatApi } from "./useHermesChat";
import { useHermesStore } from "../../stores/hermes";

/**
 * Native Chatfläche der Workbench. Reine Darstellung — der WebSocket und der
 * Sessionzustand leben in der Shell (`useHermesChat`), damit ein Flächenwechsel
 * die laufende Verbindung nicht unterbricht.
 */
export function HermesChatSurface({ chat, onOpenSession }: { chat: HermesChatApi; onOpenSession: (sessionId: string) => void }) {
  const sidebarCollapsed = useHermesStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useHermesStore((state) => state.setSidebarCollapsed);
  const select = (session: HermesSession) => onOpenSession(session.id);

  useEffect(() => {
    // Auf schmalen Viewports startet die Sessionliste eingeklappt, damit sie
    // den Chat nicht verdeckt. Der Nutzerzustand bleibt sonst unangetastet.
    if (window.innerWidth <= 720 && !sidebarCollapsed) setSidebarCollapsed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="hermes-chat-layout">
      <HermesSessionSidebar activeSessionId={chat.session?.id ?? null} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onSelect={select} onNew={chat.newSession} />
      <div className="hermes-chat-main">
        <HermesMessageList messages={chat.messages} tools={chat.tools} thought={chat.thought} approvals={chat.approvals} onApproval={chat.respondApproval} />
        <HermesComposer instanceId={chat.instanceId} connected={chat.connected} running={chat.taskState === "running"} commands={chat.commands} onSend={chat.send} onCancel={chat.cancel} />
      </div>
    </div>
  );
}
