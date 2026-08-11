import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { Panel } from "@workbench/contracts";
import { HermesAdminFrame, safeHermesPath } from "./HermesAdminFrame";
import { HermesSurfaceNav } from "./HermesSurfaceNav";
import { HermesChatSurface } from "./HermesChatSurface";
import { HermesTasksSurface } from "./HermesTasksSurface";
import { HermesHistorySurface } from "./HermesHistorySurface";
import { HermesCronSurface } from "./HermesCronSurface";
import { HermesDiagnosticsDialog } from "./HermesDiagnosticsDialog";
import { HermesHeader } from "./HermesHeader";
import { useHermesChat } from "./useHermesChat";
import { useHermesStore } from "../../stores/hermes";
import { useWorkspaceStore } from "../../stores/workspace";
import { workbenchQueries } from "../../lib/queryOptions";
import { resolveHermesSurface, type HermesSurface } from "../../lib/hermesPresentation";

/** Die offizielle Hermes-Chatroute bleibt der Einstiegspunkt der SPA. */
export const DEFAULT_HERMES_PATH = "/chat";

export interface HermesShellProps {
  /** Bleibt Teil der öffentlichen Komponentenschnittstelle für gespeicherte Panels. */
  instanceId: string;
  variant: "route" | "panel" | "orbit";
  minimal?: boolean;
  panel?: Panel;
}

export function hermesSessionPath(sessionId: string): string {
  return `/chat?resume=${encodeURIComponent(sessionId)}`;
}

/**
 * Die zentrale Hermes-Fläche der Workbench. Standard ist der native Chat mit
 * Aufgaben, Verlauf und Cron als eigenen Flächen; die offizielle Hermes-SPA
 * bleibt als „Verwaltung“ für Expertenfunktionen erreichbar.
 */
export function HermesShell({ instanceId, variant, minimal = false, panel }: HermesShellProps) {
  const [searchParams] = useSearchParams();
  const panelId = panel?.id;
  const client = useQueryClient();
  const updateHermesPanel = useWorkspaceStore((state) => state.updateHermesPanel);
  const storedSurface = useHermesStore((state) => state.surface);
  const setStoredSurface = useHermesStore((state) => state.setSurface);
  const storedAdminPath = useHermesStore((state) => state.adminPath);
  const setStoredAdminPath = useHermesStore((state) => state.setAdminPath);
  const status = useQuery(workbenchQueries.hermesStatus());

  const urlSessionId = searchParams.get("session");
  const urlAdminPath = searchParams.get("path");
  // Session-Deep-Links haben Vorrang und öffnen immer den nativen Chat.
  const requestedSurface = resolveHermesSurface({
    urlSurface: searchParams.get("surface") ?? (urlAdminPath ? "admin" : null),
    sessionId: urlSessionId,
    panelSurface: panel?.hermesSurface,
    storedSurface,
  });
  const [surface, setSurface] = useState<HermesSurface>(requestedSurface);
  useEffect(() => { setSurface(requestedSurface); }, [requestedSurface]);

  const requestedSessionId = urlSessionId || (requestedSurface === "chat" ? panel?.hermesSessionId : null) || null;
  // Projektbindung für neue Sessions (im Header wählbar).
  const [projectId, setProjectId] = useState<string | null>(null);

  const chat = useHermesChat(instanceId, requestedSessionId, projectId);
  const attachSession = chat.attach;
  const resetChat = chat.newSession;

  const selectSurface = useCallback((next: HermesSurface) => {
    setSurface(next);
    setStoredSurface(next);
    if (panelId) updateHermesPanel(panelId, { hermesSurface: next });
  }, [panelId, setStoredSurface, updateHermesPanel]);

  const openSession = useCallback((sessionId: string) => {
    attachSession(sessionId);
    selectSurface("chat");
    if (panelId) updateHermesPanel(panelId, { hermesSurface: "chat", hermesSessionId: sessionId });
  }, [attachSession, panelId, selectSurface, updateHermesPanel]);

  const newSession = useCallback(() => {
    resetChat();
    if (panelId) updateHermesPanel(panelId, { hermesSessionId: null });
  }, [panelId, resetChat, updateHermesPanel]);

  useEffect(() => {
    if (!requestedSessionId) return;
    attachSession(requestedSessionId);
    setSurface("chat");
    setStoredSurface("chat");
    if (panelId) updateHermesPanel(panelId, { hermesSurface: "chat", hermesSessionId: requestedSessionId });
  }, [attachSession, panelId, requestedSessionId, setStoredSurface, updateHermesPanel]);

  const requestedAdminPath = safeHermesPath(urlAdminPath ?? panel?.hermesAdminPath ?? storedAdminPath);
  const [adminPath, setAdminPath] = useState(requestedAdminPath);
  useEffect(() => { setAdminPath(requestedAdminPath); }, [requestedAdminPath]);
  const setAdminPathValue = useCallback((value: string) => {
    const next = safeHermesPath(value);
    setAdminPath(next);
    setStoredAdminPath(next);
    if (panelId) updateHermesPanel(panelId, { hermesAdminPath: next });
  }, [panelId, setStoredAdminPath, updateHermesPanel]);

  const openAdmin = useCallback((path: string) => {
    setAdminPathValue(path);
    selectSurface("admin");
  }, [selectSurface, setAdminPathValue]);

  // Die schwere Hermes-SPA wird erst beim ersten Öffnen geladen, bleibt danach
  // aber montiert, damit ihr interner Zustand bei Flächenwechseln erhalten bleibt.
  const [adminMounted, setAdminMounted] = useState(surface === "admin");
  useEffect(() => { if (surface === "admin") setAdminMounted(true); }, [surface]);

  const requestedDiagnostics = searchParams.get("diagnostics") === "1";
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(requestedDiagnostics);
  useEffect(() => { if (requestedDiagnostics) setDiagnosticsOpen(true); }, [requestedDiagnostics]);
  const retry = () => void client.invalidateQueries({ queryKey: ["hermes", "status"] });

  return (
    <section
      className={`hermes-shell hermes-variant-${variant} ${minimal ? "is-minimal" : ""}`}
      data-surface={surface}
      data-hermes-ui="native"
    >
      <HermesHeader
        status={status.data}
        connected={chat.connected}
        running={chat.taskState === "running"}
        sessionTitle={chat.session?.title ?? null}
        hasSession={Boolean(chat.session)}
        projectId={projectId}
        onProjectChange={setProjectId}
        onNewSession={newSession}
        onModelChange={(model) => void chat.setModel(model)}
        onCancel={chat.cancel}
        onDiagnostics={() => setDiagnosticsOpen(true)}
        onRetry={retry}
      />
      <HermesSurfaceNav surface={surface} onSelect={selectSurface} />
      <div className="hermes-body">
        <div className="hermes-surface-pane" hidden={surface !== "chat"}>
          <HermesChatSurface chat={chat} active={surface === "chat"} onOpenSession={openSession} onNewSession={newSession} />
        </div>
        {surface === "tasks" ? <HermesTasksSurface onOpenSession={openSession} /> : null}
        {surface === "history" ? <HermesHistorySurface onOpenSession={openSession} /> : null}
        {surface === "cron" ? <HermesCronSurface onOpenAdmin={openAdmin} /> : null}
        {adminMounted ? <div className="hermes-surface-pane" hidden={surface !== "admin"}><HermesAdminFrame path={adminPath} onPathChange={setAdminPathValue} /></div> : null}
      </div>
      <HermesDiagnosticsDialog open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
    </section>
  );
}
