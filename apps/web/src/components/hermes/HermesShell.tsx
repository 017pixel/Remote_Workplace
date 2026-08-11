import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Panel } from "@workbench/contracts";
import { HermesAdminFrame, safeHermesPath } from "./HermesAdminFrame";
import { useWorkspaceStore } from "../../stores/workspace";

/** Die offizielle Hermes-Chatroute bleibt der Einstiegspunkt der SPA. */
export const DEFAULT_HERMES_PATH = "/chat";

export interface HermesShellProps {
  variant: "route" | "panel" | "orbit";
  minimal?: boolean;
  panel?: Panel;
}

export function hermesSessionPath(sessionId: string): string {
  return `/chat?resume=${encodeURIComponent(sessionId)}`;
}

/** Die einzige sichtbare Hermes-Fläche der Workbench ist die offizielle SPA. */
export function HermesShell({ variant, minimal = false, panel }: HermesShellProps) {
  const [searchParams] = useSearchParams();
  const panelId = panel?.id;
  const updateHermesPanel = useWorkspaceStore((state) => state.updateHermesPanel);

  const urlSessionId = searchParams.get("session");
  const urlAdminPath = searchParams.get("path");
  const requestedAdminPath = safeHermesPath(
    urlAdminPath ?? (urlSessionId ? hermesSessionPath(urlSessionId) : null) ?? panel?.hermesAdminPath ?? DEFAULT_HERMES_PATH,
  );
  const [adminPath, setAdminPath] = useState(requestedAdminPath);
  useEffect(() => { setAdminPath(requestedAdminPath); }, [requestedAdminPath]);
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
      <HermesAdminFrame path={adminPath} onPathChange={setAdminPathValue} />
    </section>
  );
}
