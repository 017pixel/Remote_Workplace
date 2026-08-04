import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { NotificationPresence } from "@workbench/contracts";
import { apiClient } from "./apiClient";
import { useTerminalStore } from "../stores/terminals";

/**
 * Meldet dem Server, welche Quelle und welcher Chat gerade sichtbar sind
 * (T3-Thread, Hermes-Sitzung, CLI-Terminal). Der Server markiert passende
 * Benachrichtigungen als gelesen: Sie verschwinden aus der Inbox, sobald der
 * Nutzer den Chat ansieht, in dem sie entstanden sind. Der Toast erscheint
 * trotzdem.
 *
 * Die Referenz kommt aus drei Quellen:
 *  - T3: Route-Bridge des T3-Proxys (`remote-workplace-t3`), meldet den
 *    geöffneten Thread per postMessage aus dem iframe.
 *  - Hermes: Route-Bridge der Hermes-SPA (`remote-workplace-hermes`), meldet
 *    den Pfad samt `resume`-Sitzung.
 *  - Terminals: der aktive Tab des Terminal-Stores (seine id ist die
 *    `runtimeId` der Server-Sitzung), ersatzweise der `session`-URL-Parameter.
 */
export function deriveViewPresence(
  pathname: string,
  search: string,
  t3ThreadId: string | null,
  hermesSessionId: string | null,
  terminalAreas: Record<string, { activeTabId: string | null; tabs: Array<{ id: string }> }>,
): NotificationPresence | null {
  const params = new URLSearchParams(search);
  if (pathname === "/t3-code") return { source: "t3", threadId: t3ThreadId };
  if (pathname === "/hermes-agent") return { source: "hermes", sessionId: hermesSessionId ?? params.get("session") };
  if (pathname === "/terminal") {
    const source = params.get("kind") === "claude" ? "claude" : "terminal";
    const area = terminalAreas.standalone;
    const activeTab = area?.tabs.find((tab) => tab.id === area.activeTabId) ?? null;
    return { source, sessionId: activeTab?.id ?? params.get("session") };
  }
  if (pathname === "/codex" || pathname === "/opencode" || pathname === "/claude") {
    const source = pathname === "/codex" ? "codex" : pathname === "/opencode" ? "opencode" : "claude";
    const area = terminalAreas[`${source}-standalone`];
    const activeTab = area?.tabs.find((tab) => tab.id === area.activeTabId) ?? null;
    return { source, sessionId: activeTab?.id ?? params.get("session") };
  }
  return null;
}

const DEBOUNCE_MS = 250;

export function useViewPresence() {
  const location = useLocation();
  const terminalAreas = useTerminalStore((state) => state.areas);
  const [t3ThreadId, setT3ThreadId] = useState<string | null>(null);
  const [hermesSessionId, setHermesSessionId] = useState<string | null>(null);
  const presenceRef = useRef<NotificationPresence | null>(null);
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { source?: unknown; version?: unknown; type?: unknown; path?: unknown } | null;
      if (!data || data.version !== 1 || data.type !== "route.changed" || typeof data.path !== "string") return;
      if (data.source === "remote-workplace-t3") {
        const segments = (data.path.split("?")[0] ?? "").split("/").filter(Boolean);
        setT3ThreadId(segments.length >= 2 ? segments[1] ?? null : null);
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
    () => deriveViewPresence(location.pathname, location.search, t3ThreadId, hermesSessionId, terminalAreas),
    [hermesSessionId, location.pathname, location.search, t3ThreadId, terminalAreas],
  );
  presenceRef.current = presence;

  const report = useCallback(() => {
    const serialized = JSON.stringify(presenceRef.current);
    if (serialized === sentRef.current) return;
    sentRef.current = serialized;
    void apiClient.updatePresence(presenceRef.current).catch(() => {
      // Presence ist Best Effort. Der nächste Fokus oder Ansichtswechsel meldet erneut.
      sentRef.current = null;
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(report, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [presence, report]);

  useEffect(() => {
    window.addEventListener("focus", report);
    return () => window.removeEventListener("focus", report);
  }, [report]);

  return presence;
}
