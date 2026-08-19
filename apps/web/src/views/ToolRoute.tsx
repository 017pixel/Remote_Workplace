import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useWorkspaceStore } from "../stores/workspace";
import { wraptQueries } from "../lib/queryOptions";
import { ToolPanel } from "../components/ToolPanel";
import { EmptyState } from "../components/EmptyState";
import type { Panel, Project } from "@wrapt/contracts";
import { useRouteActivity } from "../lib/routeActivity";
import { PreviewHub } from "./PreviewHub";

type ProjectPanelType = "t3-code" | "code-server" | "preview" | "opencode";

function supportsTool(project: Project, type: ProjectPanelType) {
  if (type === "t3-code") return project.links.t3Code !== null;
  if (type === "code-server") return project.links.codeServer !== null;
  if (type === "opencode") return project.availability === "available";
  return project.previews.length > 0;
}

function SingleTool({ type }: { type: ProjectPanelType }) {
  const routeActive = useRouteActivity();
  const [searchParams] = useSearchParams();
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const { data, isLoading } = useQuery({ ...wraptQueries.projects(), enabled: routeActive });
  const services = useQuery({ ...wraptQueries.services(), enabled: routeActive });
  const projects = data?.projects ?? [];
  const selected = projects.find((project) => project.id === selectedProjectId);
  const availableProjects = projects.filter((candidate) => type === "preview" ? candidate.availability === "available" : supportsTool(candidate, type));
  const requestedPreviewId = searchParams.get("preview");
  const requestedPreviewProject = type === "preview" && requestedPreviewId
    ? projects.find((candidate) => candidate.previews.some((preview) => preview.id === requestedPreviewId))
    : undefined;
  const project = type === "opencode"
    ? undefined
    : requestedPreviewProject ?? (selected && (type === "preview" || supportsTool(selected, type)) ? selected : availableProjects[0]);
  const codeServerMode = services.data?.services.find((service) => service.id === "code-server")?.mode ?? "external";
  const previewId = type === "preview" && requestedPreviewId ? (project?.previews.find((preview) => preview.id === requestedPreviewId)?.id ?? null) : null;
  // Tiefenlink aus einer Benachrichtigung: `/t3-code?thread=…&env=…` öffnet
  // das T3-Panel mit genau diesem Thread statt der Proxy-Vollseite. Die
  // T3-Thread-Route liegt am Root (`/$environmentId/$threadId`).
  const t3Thread = type === "t3-code" ? searchParams.get("thread") : null;
  const t3Env = type === "t3-code" ? searchParams.get("env") : null;
  const t3Path = useMemo(() => {
    if (type !== "t3-code" || !t3Thread || !t3Env) return undefined;
    return `/${encodeURIComponent(t3Env)}/${encodeURIComponent(t3Thread)}`;
  }, [t3Env, t3Thread, type]);
  // Zielordner für die eigenständige Code-Server-Seite, gesetzt vom T3-„Open"-
  // Button: `/code-editor/?folder=…` öffnet genau diesen Ordner.
  const codeServerFolder = type === "code-server" ? searchParams.get("folder") : null;

  useEffect(() => {
    if (!routeActive || type !== "t3-code" || !t3Path) return;
    // Ein in der Workbench bereits offenes T3-Panel wechselt auf den Ziel-Thread.
    const existing = useWorkspaceStore.getState().panels.find((panel) => panel.type === "t3-code");
    if (existing) useWorkspaceStore.getState().navigateT3Panel(existing.id, t3Path);
  }, [routeActive, t3Path, type]);

  if (isLoading) return <div className="flex h-full items-center justify-center text-sm text-muted">Lädt…</div>;
  if (!project && type !== "preview" && type !== "opencode") {
    return <EmptyState title="Kein passendes Projekt" description="Für dieses Werkzeug ist momentan kein verfügbares Projekt konfiguriert." />;
  }

  const panel: Panel = {
    id: `standalone-${type}`,
    type,
    projectId: project?.id ?? null,
    previewId,
    reloadKey: 0,
    ...(t3Path ? { t3Path } : {}),
    ...(type === "code-server" && codeServerFolder ? { codeServerFolder } : {}),
  };

  return (
    <div className="standalone-tool-page">
      <div className="standalone-tool-content">
        <ToolPanel panel={panel} project={project} codeServerMode={codeServerMode} isFocused standalone actionPlacement={type === "t3-code" || type === "code-server" || type === "opencode" ? "topbar" : "overlay"} />
      </div>
    </div>
  );
}

export function T3Code() { return <SingleTool type="t3-code" />; }
export function OpenCodeWeb() { return <SingleTool type="opencode" />; }
export function CodeEditor() { return <SingleTool type="code-server" />; }
export function Previews() { return <PreviewHub />; }
export function Browser() {
  const panel: Panel = { id: "standalone-browser", type: "browser", projectId: null, previewId: null, reloadKey: 0 };
  return <div className="standalone-tool-page"><div className="standalone-tool-content"><ToolPanel panel={panel} project={undefined} isFocused standalone /></div></div>;
}
