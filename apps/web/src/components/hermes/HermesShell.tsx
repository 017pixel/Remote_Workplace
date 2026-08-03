import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { Panel } from "@workbench/contracts";
import { HermesAdminFrame, safeHermesPath } from "./HermesAdminFrame";
import { useHermesStore } from "../../stores/hermes";
import { useWorkspaceStore } from "../../stores/workspace";

/** Die offizielle Hermes-Chatroute ist der Einstiegspunkt der Workbench. */
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
 * Ermittelt die offizielle Hermes-Route aus Deep-Link, Panelzustand oder dem
 * zuletzt geöffneten Hermes-Bereich. Alte `/`-Werte zeigen bewusst direkt den
 * offiziellen Terminal-Chat statt der früheren Workbench-Chatfläche.
 */
export function resolveHermesPath(
  searchParams: URLSearchParams,
  panelPath: string | undefined,
  storedPath: string,
  panelSessionId: string | null | undefined,
): string {
  const requestedSession = searchParams.get("session");
  if (requestedSession) return hermesSessionPath(requestedSession);

  const candidate = safeHermesPath(searchParams.get("path") ?? panelPath ?? storedPath);
  if (candidate === "/" && panelSessionId) return hermesSessionPath(panelSessionId);
  return candidate === "/" ? DEFAULT_HERMES_PATH : candidate;
}

export function HermesShell({ variant, minimal = false, panel }: HermesShellProps) {
  const [searchParams] = useSearchParams();
  const updateHermesPanel = useWorkspaceStore((state) => state.updateHermesPanel);
  const storedAdminPath = useHermesStore((state) => state.adminPath);
  const setStoredAdminPath = useHermesStore((state) => state.setAdminPath);
  const requestedPath = useMemo(
    () => resolveHermesPath(searchParams, panel?.hermesAdminPath, storedAdminPath, panel?.hermesSessionId),
    [panel?.hermesAdminPath, panel?.hermesSessionId, searchParams, storedAdminPath],
  );
  const [adminPath, setAdminPath] = useState(requestedPath);

  useEffect(() => {
    setAdminPath(requestedPath);
  }, [requestedPath]);

  const setAdminPathValue = useCallback((value: string) => {
    const next = safeHermesPath(value);
    setAdminPath(next);
    setStoredAdminPath(next);
    if (panel) {
      updateHermesPanel(panel.id, { hermesSurface: "admin", hermesAdminPath: next });
    }
  }, [panel, setStoredAdminPath, updateHermesPanel]);

  useEffect(() => {
    if (panel?.hermesSurface === "admin") return;
    if (panel) updateHermesPanel(panel.id, { hermesSurface: "admin" });
  }, [panel, updateHermesPanel]);

  return (
    <section
      className={`hermes-shell hermes-variant-${variant} ${minimal ? "is-minimal" : ""}`}
      data-surface="admin"
      data-hermes-ui="official"
    >
      <HermesAdminFrame path={adminPath} onPathChange={setAdminPathValue} />
    </section>
  );
}
