import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { NotificationPresenceItem, Panel, Workspace } from "@workbench/contracts";
import { apiClient } from "./apiClient";
import { useTerminalStore } from "../stores/terminals";
import { useWorkspaceStore, visiblePanels } from "../stores/workspace";
import { usePanelPresenceStore } from "../stores/panelPresence";
import { useResponsiveShell } from "./useResponsiveShell";
import { t3ThreadIdFromPath } from "./t3Thread";

/**
 * Meldet dem Server, welche Quelle und welcher Chat gerade sichtbar sind:
 * die aktive Route (T3-Thread, Hermes-Sitzung, CLI-Terminal) plus alle offenen
 * T3-/Hermes-/Terminal-Panels der Arbeitsfläche. Der Server markiert passende
 * Benachrichtigungen als gelesen (kein Inbox-Eintrag für offene Chats) und
 * unterdrückt Push, solange die Workbench aktiv genutzt wird. Der Toast
 * erscheint in beiden Fällen.
 *
 * Die Referenzen kommen aus drei Quellen:
 *  - T3: Route-Bridge des T3-Proxys (`remote-workplace-t3`), meldet den
 *    geöffneten Thread per postMessage aus dem iframe.
 *  - Hermes: Route-Bridge der Hermes-SPA (`remote-workplace-hermes`), meldet
 *    den Pfad samt `resume`-Sitzung.
 *  - Terminals: der aktive Tab des Terminal-Stores (seine id ist die
 *    `runtimeId` der Server-Sitzung), ersatzweise der `session`-URL-Parameter.
 *
 * Jede Meldung ist zugleich Aktiv-Heartbeat: Der Server sieht die Workbench
 * als aktiv genutzt, solange ein sichtbares Fenster regelmäßig meldet.
 */
export function deriveViewPresence(
  pathname: string,
  search: string,
  t3ThreadId: string | null,
  hermesSessionId: string | null,
  terminalAreas: Record<string, { activeTabId: string | null; tabs: Array<{ id: string }> }>,
  visiblePanelsList: Panel[],
  panelT3Threads: Record<string, string | null>,
): NotificationPresenceItem[] {
  const items: NotificationPresenceItem[] = [];
  const params = new URLSearchParams(search);
  if (pathname === "/t3-code") items.push({ source: "t3", threadId: t3ThreadId });
  if (pathname === "/hermes-agent") {
    const legacySessionId = params.get("session");
    const officialPath = params.get("path");
    const resume = officialPath?.includes("?") ? new URLSearchParams(officialPath.slice(officialPath.indexOf("?") + 1)).get("resume") : null;
    items.push({ source: "hermes", sessionId: hermesSessionId ?? legacySessionId ?? resume });
  }
  if (pathname === "/terminal") {
    const source = params.get("kind") === "claude" ? "claude" : "terminal";
    const area = terminalAreas.standalone;
    const activeTab = area?.tabs.find((tab) => tab.id === area.activeTabId) ?? null;
    items.push({ source, sessionId: activeTab?.id ?? params.get("session") });
  }
  if (pathname === "/codex" || pathname === "/opencode" || pathname === "/claude") {
    const source = pathname === "/codex" ? "codex" : pathname === "/opencode" ? "opencode" : "claude";
    const area = terminalAreas[`${source}-standalone`];
    const activeTab = area?.tabs.find((tab) => tab.id === area.activeTabId) ?? null;
    items.push({ source, sessionId: activeTab?.id ?? params.get("session") });
  }
  for (const panel of visiblePanelsList) {
    if (panel.type === "t3-code") {
      const threadId = panelT3Threads[panel.id] ?? null;
      if (threadId) items.push({ source: "t3", threadId });
    } else if (panel.type === "terminal" || panel.type === "codex" || panel.type === "opencode") {
      const area = terminalAreas[panel.id];
      const activeTab = area?.tabs.find((tab) => tab.id === area.activeTabId) ?? null;
      if (activeTab) items.push({ source: panel.type === "codex" ? "codex" : panel.type === "opencode" ? "opencode" : "terminal", sessionId: activeTab.id });
    } else if (panel.type === "hermes" && hermesSessionId) {
      // Die Hermes-Bridge meldet ihre Sitzung ohne Panel-Zuordnung; die
      // zuletzt gemeldete Sitzung gilt als die sichtbare.
      items.push({ source: "hermes", sessionId: hermesSessionId });
    }
  }
  return items;
}

const DEBOUNCE_MS = 250;
/** Muss unter der serverseitigen Presence-TTL (90 s) liegen. */
const HEARTBEAT_MS = 60_000;

export function useViewPresence() {
  const location = useLocation();
  const responsive = useResponsiveShell();
  const terminalAreas = useTerminalStore((state) => state.areas);
  const workspacePanels = useWorkspaceStore((state) => state.panels);
  const workspacePage = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const maximizedPanelId = useWorkspaceStore((state) => state.maximizedPanelId);
  const focusedPanelId = useWorkspaceStore((state) => state.focusedPanelId);
  const visiblePanelsList = useMemo(() => visiblePanels({
    panels: workspacePanels,
    workspaces: workspacePage,
    activeWorkspaceId,
    maximizedPanelId,
    focusedPanelId,
  } as Workspace, responsive.isTouchShell), [activeWorkspaceId, focusedPanelId, maximizedPanelId, responsive.isTouchShell, workspacePage, workspacePanels]);
  const panelT3Threads = usePanelPresenceStore((state) => state.t3Threads);
  const [t3ThreadId, setT3ThreadId] = useState<string | null>(null);
  const [hermesSessionId, setHermesSessionId] = useState<string | null>(null);
  const presenceRef = useRef<NotificationPresenceItem[] | null>(null);
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { source?: unknown; version?: unknown; type?: unknown; path?: unknown } | null;
      if (!data || data.version !== 1 || data.type !== "route.changed" || typeof data.path !== "string") return;
      if (data.source === "remote-workplace-t3") {
        setT3ThreadId(t3ThreadIdFromPath(data.path));
      }
      if (data.source === "remote-workplace-hermes") {
        const path = data.path.startsWith("/hermes") ? data.path.slice("/hermes".length) : data.path;
        setHermesSessionId(new URLSearchParams(path.split("?")[1] ?? "").get("resume"));
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const presence = useMemo(
    () => deriveViewPresence(location.pathname, location.search, t3ThreadId, hermesSessionId, terminalAreas, visiblePanelsList, panelT3Threads),
    [hermesSessionId, location.pathname, location.search, panelT3Threads, t3ThreadId, terminalAreas, visiblePanelsList],
  );
  presenceRef.current = presence;

  const report = useCallback((force = false) => {
    const serialized = JSON.stringify(presenceRef.current);
    if (!force && serialized === sentRef.current) return;
    sentRef.current = serialized;
    void apiClient.updatePresence(presenceRef.current).catch(() => {
      // Presence ist Best Effort. Der nächste Heartbeat oder Ansichtswechsel meldet erneut.
      sentRef.current = null;
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => report(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [presence, report]);

  useEffect(() => {
    const onFocus = () => report(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [report]);

  // Aktiv-Heartbeat: hält die Workbench serverseitig als „genutzt" frisch,
  // solange ein Fenster sichtbar ist. Im Hintergrund meldet der Ticker nicht
  // weiter, damit die TTL nach dem Verlassen des Tabs ausläuft und Push wieder
  // an die Geräte geht.
  useEffect(() => {
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") report(true);
    }, HEARTBEAT_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") report(true); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [report]);

  return presence;
}
