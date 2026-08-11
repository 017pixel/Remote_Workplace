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
import { useHermesStore, type HermesSurface } from "../../stores/hermes";
import { useWorkspaceStore } from "../../stores/workspace";
import { workbenchQueries } from "../../lib/queryOptions";

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

function normalizeSurface(value: string | null | undefined): HermesSurface {
  if (value === "chat" || value === "tasks" || value === "history" || value === "cron" || value === "admin") return value;
  return "chat";
}

/**
 * Die zentrale Hermes-Fläche der Workbench. Standard ist der native Chat mit
 * Aufgaben, Verlauf und Cron als eigenen Flächen; die offizielle Hermes-SPA
 * bleibt als „Verwaltung“ für Expertenfunktionen erreichbar.
 */
export function HermesShell({ variant, minimal = false, panel }: HermesShellProps) {
  const instanceId = panel?.id ?? "route-hermes";
  const [searchParams] = useSearchParams();
  const client = useQueryClient();
  const updateHermesPanel = useWorkspaceStore((state) => state.updateHermesPanel);
  const storedSurface = useHermesStore((state) => state.surface);
  const setStoredSurface = useHermesStore((state) => state.setSurface);
  const storedAdminPath = useHermesStore((state) => state.adminPath);
  const setStoredAdminPath = useHermesStore((state) => state.setAdminPath);
  const status = useQuery(workbenchQueries.hermesStatus());

  // Fläche: URL-Parameter (Deep-Link) > Panel-Zustand > gespeicherte Wahl.
  const requestedSurface = normalizeSurface(searchParams.get("surface") ?? panel?.hermesSurface ?? storedSurface);
  const [surface, setSurface] = useState<HermesSurface>(requestedSurface);
  useEffect(() => { setSurface(requestedSurface); }, [requestedSurface]);

  // Session-Tiefenlink: ?session=… öffnet den Chat und bindet die Session.
  const requestedSession = searchParams.get("session") || (surface === "chat" ? panel?.hermesSessionId : null) || null;
  const [initialSessionId, setInitialSessionId] = useState<string | null>(requestedSession);
  useEffect(() => { if (requestedSession) setInitialSessionId(requestedSession); }, [requestedSession]);

  // Session aus Verlauf/Aufgaben im Chat öffnen: attach-Request an den Hook.
  const [attachRequest, setAttachRequest] = useState<{ sessionId: string; token: number } | null>(null);
  // „Neuer Chat“ aus dem Header: Signal an den Hook, die Session zu verwerfen.
  const [resetSignal, setResetSignal] = useState(0);
  // Projektbindung für neue Sessions (im Header wählbar).
  const [projectId, setProjectId] = useState<string | null>(null);

  const chat = useHermesChat(instanceId, initialSessionId, projectId);

  useEffect(() => {
    if (!attachRequest) return;
    chat.attach(attachRequest.sessionId);
    // `attach` ist über useCallback stabil — nur der Request ist neu relevant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachRequest?.token]);

  useEffect(() => {
    if (resetSignal > 0) chat.newSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const selectSurface = useCallback((next: HermesSurface) => {
    setSurface(next);
    setStoredSurface(next);
    if (panel) updateHermesPanel(panel.id, { hermesSurface: next });
  }, [panel, setStoredSurface, updateHermesPanel]);

  const openSession = useCallback((sessionId: string) => {
    setInitialSessionId(sessionId);
    setAttachRequest({ sessionId, token: Date.now() });
    selectSurface("chat");
  }, [selectSurface]);

  const newSession = useCallback(() => {
    setAttachRequest(null);
    setInitialSessionId(null);
    setResetSignal((signal) => signal + 1);
  }, []);

  const [adminPath, setAdminPath] = useState(safeHermesPath(searchParams.get("path") ?? storedAdminPath));
  const setAdminPathValue = useCallback((value: string) => {
    const next = safeHermesPath(value);
    setAdminPath(next);
    setStoredAdminPath(next);
    if (panel) updateHermesPanel(panel.id, { hermesAdminPath: next });
  }, [panel, setStoredAdminPath, updateHermesPanel]);

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
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
          <HermesChatSurface chat={chat} onOpenSession={openSession} />
        </div>
        <div className="hermes-surface-pane" hidden={surface !== "tasks"}>
          <HermesTasksSurface onOpenSession={openSession} />
        </div>
        <div className="hermes-surface-pane" hidden={surface !== "history"}>
          <HermesHistorySurface onOpenSession={openSession} />
        </div>
        <div className="hermes-surface-pane" hidden={surface !== "cron"}>
          <HermesCronSurface onOpenAdmin={() => selectSurface("admin")} />
        </div>
        <div className="hermes-surface-pane" hidden={surface !== "admin"}>
          <HermesAdminFrame path={adminPath} onPathChange={setAdminPathValue} />
        </div>
      </div>
      {diagnosticsOpen ? <HermesDiagnosticsDialog onClose={() => setDiagnosticsOpen(false)} /> : null}
    </section>
  );
}
