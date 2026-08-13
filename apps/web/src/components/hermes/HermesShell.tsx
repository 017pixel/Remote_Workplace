import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Panel } from "@workbench/contracts";
import { HermesAdminFrame, safeHermesPath } from "./HermesAdminFrame";
import { useWorkspaceStore } from "../../stores/workspace";
import { useRouteActivity } from "../../lib/routeActivity";

/** Die offizielle Hermes-Chatroute bleibt der Einstiegspunkt der SPA. */
export const DEFAULT_HERMES_PATH = "/chat";

export interface HermesShellProps {
  variant: "route" | "panel" | "orbit";
  minimal?: boolean;
  panel?: Panel;
  active?: boolean;
}

export function hermesSessionPath(sessionId: string): string {
  return `/chat?resume=${encodeURIComponent(sessionId)}`;
}

/** Die einzige sichtbare Hermes-Fläche der Workbench ist die offizielle SPA. */
export function HermesShell({ variant, minimal = false, panel, active }: HermesShellProps) {
  const [searchParams] = useSearchParams();
  const routeActive = useRouteActivity();
  const frameActive = active ?? routeActive;
  const panelId = panel?.id;
  const updateHermesPanel = useWorkspaceStore((state) => state.updateHermesPanel);

  const urlSessionId = searchParams.get("session");
  const urlAdminPath = searchParams.get("path");
  const explicitUrlPath = urlAdminPath ?? (urlSessionId ? hermesSessionPath(urlSessionId) : null);
  const requestedAdminPath = safeHermesPath(explicitUrlPath ?? panel?.hermesAdminPath ?? DEFAULT_HERMES_PATH);
  const [adminPath, setAdminPath] = useState(requestedAdminPath);
  // Eine geparkte Route sieht weiterhin die URL der gerade aktiven Seite. Sie
  // darf deshalb ihren gemerkten Hermes-Pfad nicht auf `/chat` zurücksetzen.
  useEffect(() => {
    if (!frameActive || explicitUrlPath === null) return;
    setAdminPath(safeHermesPath(explicitUrlPath));
  }, [explicitUrlPath, frameActive]);
  const setAdminPathValue = useCallback((value: string) => {
    const next = safeHermesPath(value);
    setAdminPath(next);
    if (panelId) updateHermesPanel(panelId, { hermesAdminPath: next });
  }, [panelId, updateHermesPanel]);

  return (
    <section
      className={`hermes-shell hermes-variant-${variant} ${minimal ? "is-minimal" : ""}`}
      data-surface="admin"
      data-hermes-ui="official"
    >
      <HermesAdminFrame path={adminPath} active={frameActive} onPathChange={setAdminPathValue} />
    </section>
  );
}
