import { useQuery } from "@tanstack/react-query";
import type { TerminalKind } from "@workbench/contracts";
import { TerminalArea } from "../components/terminal/TerminalArea";
import { workbenchQueries } from "../lib/queryOptions";
import { useWorkspaceStore } from "../stores/workspace";

function CliTerminalPage({ kind }: { kind: Exclude<TerminalKind, "shell"> }) {
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const projects = useQuery(workbenchQueries.projects());
  const availableProjects = projects.data?.projects.filter((project) => project.availability === "available") ?? [];
  const projectId = availableProjects.find((project) => project.id === selectedProjectId)?.id
    ?? availableProjects[0]?.id
    ?? null;

  if (projects.isLoading) {
    return <div className="terminal-area-loading">{kind === "codex" ? "Codex" : "OpenCode"} wird vorbereitet…</div>;
  }

  return (
    <div className="cli-terminal-route">
      <TerminalArea
        areaId={`${kind}-standalone`}
        initialProjectId={projectId}
        kind={kind}
        layout="bento"
        maxTabs={4}
      />
    </div>
  );
}

export function CodexTerminal() { return <CliTerminalPage kind="codex" />; }
export function OpenCodeTerminal() { return <CliTerminalPage kind="opencode" />; }
