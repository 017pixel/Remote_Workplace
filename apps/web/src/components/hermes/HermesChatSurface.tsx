import { useCallback, useEffect, useRef, useState } from "react";
import type { HermesSession } from "@workbench/contracts";
import { HermesSessionSidebar } from "./HermesSessionSidebar";
import { HermesMessageList } from "./HermesMessageList";
import { HermesComposer } from "./HermesComposer";
import type { HermesChatApi } from "./useHermesChat";
import { useHermesStore } from "../../stores/hermes";
import { useModalFocus } from "../../lib/useModalFocus";

/**
 * Native Chatfläche der Workbench. Reine Darstellung — der WebSocket und der
 * Sessionzustand leben in der Shell (`useHermesChat`), damit ein Flächenwechsel
 * die laufende Verbindung nicht unterbricht.
 */
export function HermesChatSurface({ chat, active, onOpenSession, onNewSession }: { chat: HermesChatApi; active: boolean; onOpenSession: (sessionId: string) => void; onNewSession: () => void }) {
  const sidebarCollapsed = useHermesStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useHermesStore((state) => state.setSidebarCollapsed);
  const layoutRef = useRef<HTMLDivElement>(null);
  const drawerLayerRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [sidebarModalOpen, setSidebarModalOpen] = useState(false);

  const closeDrawer = useCallback(() => {
    setSidebarCollapsed(true);
    window.setTimeout(() => layoutRef.current?.querySelector<HTMLButtonElement>('[aria-label="Sessionliste öffnen"]')?.focus(), 0);
  }, [setSidebarCollapsed]);
  useModalFocus(drawerLayerRef, active && narrow && !sidebarCollapsed && !sidebarModalOpen, closeDrawer);

  const select = (session: HermesSession) => {
    onOpenSession(session.id);
    if (narrow) closeDrawer();
  };
  const newChat = () => {
    onNewSession();
    if (narrow) closeDrawer();
  };

  useEffect(() => {
    const layout = layoutRef.current;
    if (!active || !layout) return;
    const collapseWhenNarrow = (width: number) => {
      if (width <= 0) return;
      const nextNarrow = width <= 720;
      setNarrow(nextNarrow);
      if (nextNarrow) setSidebarCollapsed(true);
    };
    collapseWhenNarrow(layout.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) collapseWhenNarrow(entry.contentRect.width);
    });
    observer.observe(layout);
    return () => observer.disconnect();
  }, [active, setSidebarCollapsed]);

  const toggleSidebar = () => {
    if (!sidebarCollapsed && narrow) closeDrawer();
    else setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div ref={layoutRef} className="hermes-chat-layout">
      <div ref={drawerLayerRef} className="hermes-drawer-layer">
        {narrow && !sidebarCollapsed ? <div className="hermes-drawer-scrim" role="presentation" onPointerDown={closeDrawer} /> : null}
        <HermesSessionSidebar active={active} activeSessionId={chat.session?.id ?? null} collapsed={sidebarCollapsed} drawer={narrow && !sidebarCollapsed} onModalOpenChange={setSidebarModalOpen} onToggle={toggleSidebar} onSelect={select} onNew={newChat} />
      </div>
      <div className="hermes-chat-main">
        <HermesMessageList messages={chat.messages} tools={chat.tools} thought={chat.thought} approvals={chat.approvals} onApproval={chat.respondApproval} />
        <HermesComposer instanceId={chat.instanceId} connected={chat.connected} running={chat.taskState === "running"} commands={chat.commands} onSend={chat.send} onCancel={chat.cancel} />
      </div>
    </div>
  );
}
