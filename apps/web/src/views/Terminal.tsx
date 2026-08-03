import { useQuery } from "@tanstack/react-query";
import { TerminalArea } from "../components/terminal/TerminalArea";
import { workbenchQueries } from "../lib/queryOptions";
import { useWorkspaceStore } from "../stores/workspace";
import { useRouteActivity } from "../lib/routeActivity";
import { useSearchParams } from "react-router";

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
