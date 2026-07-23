import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useWorkspaceStore } from "../stores/workspace";
import { workbenchQueries } from "../lib/queryOptions";
import { ToolPanel } from "../components/ToolPanel";
import { EmptyState } from "../components/EmptyState";
import type { Panel, Project } from "@workbench/contracts";

type ProjectPanelType = "t3-code" | "code-server" | "preview";

function supportsTool(project: Project, type: ProjectPanelType) {
  if (type === "t3-code") return project.links.t3Code !== null;
  if (type === "code-server") return project.links.codeServer !== null;
  return project.previews.length > 0;
}

function SingleTool({ type }: { type: ProjectPanelType }) {
  const [searchParams] = useSearchParams();
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const { data, isLoading } = useQuery(workbenchQueries.projects());
  const services = useQuery(workbenchQueries.services());
  const projects = data?.projects ?? [];
  const selected = projects.find((project) => project.id === selectedProjectId);
  const availableProjects = projects.filter((candidate) => type === "preview" ? candidate.availability === "available" : supportsTool(candidate, type));
  const requestedPreviewId = searchParams.get("preview");
  const requestedPreviewProject = type === "preview" && requestedPreviewId
    ? projects.find((candidate) => candidate.previews.some((preview) => preview.id === requestedPreviewId))
    : undefined;
  const project = requestedPreviewProject ?? (selected && (type === "preview" || supportsTool(selected, type)) ? selected : availableProjects[0]);
  const codeServerMode = services.data?.services.find((service) => service.id === "code-server")?.mode ?? "external";
  const previewId = type === "preview" && requestedPreviewId ? (project?.previews.find((preview) => preview.id === requestedPreviewId)?.id ?? null) : null;

  if (isLoading) return <div className="flex h-full items-center justify-center text-sm text-muted">Lädt…</div>;
  if (!project && type !== "preview") {
    return <EmptyState title="Kein passendes Projekt" description="Für dieses Werkzeug ist momentan kein verfügbares Projekt konfiguriert." />;
  }

  const panel: Panel = {
    id: `standalone-${type}`,
    type,
    projectId: project?.id ?? null,
    previewId,
    reloadKey: 0,
  };

  return (
    <div className="standalone-tool-page">
      <div className="standalone-tool-content">
        <ToolPanel panel={panel} project={project} codeServerMode={codeServerMode} isFocused standalone actionPlacement={type === "t3-code" ? "topbar" : "overlay"} />
      </div>
    </div>
  );
}

export function T3Code() { return <SingleTool type="t3-code" />; }
export function CodeEditor() { return <SingleTool type="code-server" />; }
export function Previews() { return <SingleTool type="preview" />; }
export function Browser() {
  const panel: Panel = { id: "standalone-browser", type: "browser", projectId: null, previewId: null, reloadKey: 0 };
  return <div className="standalone-tool-page"><div className="standalone-tool-content"><ToolPanel panel={panel} project={undefined} isFocused standalone /></div></div>;
}
