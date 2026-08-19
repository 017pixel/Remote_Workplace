import { useQuery } from "@tanstack/react-query";
import type { TerminalKind } from "@wrapt/contracts";
import { TerminalArea } from "../components/terminal/TerminalArea";
import { wraptQueries } from "../lib/queryOptions";
import { useWorkspaceStore } from "../stores/workspace";
import { useRouteActivity } from "../lib/routeActivity";
import { useSearchParams } from "react-router";

function CliTerminalPage({ kind }: { kind: Exclude<TerminalKind, "shell"> }) {
  const routeActive = useRouteActivity();
  const [search] = useSearchParams();
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const projects = useQuery({ ...wraptQueries.projects(), enabled: routeActive });
  const availableProjects = projects.data?.projects.filter((project) => project.availability === "available") ?? [];
  const projectId = availableProjects.find((project) => project.id === selectedProjectId)?.id
    ?? availableProjects[0]?.id
    ?? null;

  if (projects.isLoading) {
    const label = kind === "codex" ? "Codex" : "Claude Code";
    return <div className="terminal-area-loading">{label} wird vorbereitet…</div>;
  }

  return (
    <div className="cli-terminal-route">
      <TerminalArea
        areaId={`${kind}-standalone`}
        initialProjectId={projectId}
        kind={kind}
        layout="bento"
        requestedSessionId={search.get("session")}
      />
    </div>
  );
}

export function CodexTerminal() { return <CliTerminalPage kind="codex" />; }
export function ClaudeCodeTerminal() { return <CliTerminalPage kind="claude" />; }
