import { useQuery } from "@tanstack/react-query";
import { TerminalArea } from "../components/terminal/TerminalArea";
import { workbenchQueries } from "../lib/queryOptions";
import { useWorkspaceStore } from "../stores/workspace";

export function TerminalView() {
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const projects = useQuery(workbenchQueries.projects());
  const projectId = projects.data?.projects.find((project) => project.id === selectedProjectId)?.id
    ?? projects.data?.projects.find((project) => project.availability === "available")?.id
    ?? null;

  if (projects.isLoading) return <div className="terminal-area-loading">Terminal wird vorbereitet…</div>;
  return <div className="terminal-route"><TerminalArea areaId="standalone" initialProjectId={projectId} /></div>;
}
