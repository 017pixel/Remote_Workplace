import { useQuery } from "@tanstack/react-query";
import { TerminalArea } from "../components/terminal/TerminalArea";
import { workbenchQueries } from "../lib/queryOptions";
import { useWorkspaceStore } from "../stores/workspace";
import { useRouteActivity } from "../lib/routeActivity";
import { useParams, useSearchParams } from "react-router";
import { WebTerminal } from "../components/terminal/WebTerminal";

export function TerminalView() {
  const routeActive = useRouteActivity();
  const [search] = useSearchParams();
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const projects = useQuery({ ...workbenchQueries.projects(), enabled: routeActive });
  const projectId = projects.data?.projects.find((project) => project.id === selectedProjectId)?.id
    ?? projects.data?.projects.find((project) => project.availability === "available")?.id
    ?? null;

  if (projects.isLoading) return <div className="terminal-area-loading">Terminal wird vorbereitet…</div>;
  const kind = search.get("kind") === "claude" ? "claude" as const : "shell" as const;
  return <div className="terminal-route"><TerminalArea areaId="standalone" initialProjectId={projectId} kind={kind} requestedSessionId={search.get("session")} /></div>;
}

/** Eigenständiges Browserfenster für genau eine bereits laufende Sitzung. */
export function TerminalWindowRoute() {
  const { runtimeId = "" } = useParams();
  const sessions = useQuery(workbenchQueries.terminalSessions());
  const session = sessions.data?.sessions.find((candidate) => candidate.runtimeId === runtimeId);

  if (sessions.isLoading) return <main className="terminal-window-route"><div className="terminal-area-loading">Terminal wird verbunden…</div></main>;
  if (!session) return <main className="terminal-window-route"><div className="terminal-window-error" role="alert">Diese Terminalsitzung ist nicht mehr verfügbar.</div></main>;

  return (
    <main className="terminal-window-route" aria-label={`${session.kind} Terminal`}>
      <WebTerminal instanceId={session.runtimeId} kind={session.kind} projectId={session.projectId} initialCwd={session.cwd} active keepAlive />
    </main>
  );
}
