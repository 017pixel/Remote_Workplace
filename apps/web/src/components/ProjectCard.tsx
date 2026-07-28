import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Eye } from "lucide-react";
import { CodeServerIcon, T3CodeIcon } from "./ToolIcons";
import type { Project } from "@workbench/contracts";
import { Badge } from "./primitives";
import { openPreviewForProject, openProjectDefault, openToolForProject } from "../lib/workbenchActions";

const availabilityTone: Record<Project["availability"], "ok" | "bad" | "warn"> = {
  available: "ok",
  missing: "bad",
  inaccessible: "bad",
  symlink: "warn",
};

const availabilityLabel: Record<Project["availability"], string> = {
  available: "verfügbar",
  missing: "fehlend",
  inaccessible: "gesperrt",
  symlink: "Symlink",
};

export function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();
  const openPrimary = () => {
    if (project.availability !== "available") return;
    if (project.links.t3Code) {
      openToolForProject(project, "t3-code");
      navigate("/t3-code");
      return;
    }
    openProjectDefault(project); navigate("/workbench");
  };

  return (
    <article className="project-card group border-b border-line-soft py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-text">
            <Link to={`/projects/${project.id}`} className="project-title-link hover:underline">
              {project.name}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted">{project.description}</p>
        </div>
        <Badge tone={availabilityTone[project.availability]}>{availabilityLabel[project.availability]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-faint">
        {project.links.t3Code ? <Badge tone="accent">T3 verfügbar</Badge> : null}
        {project.links.codeServer ? <Badge>Editor verfügbar</Badge> : null}
        {project.previews.map((p) => (
          <Badge key={p.id}>{p.name}</Badge>
        ))}
        {project.links.t3Code === null && project.links.codeServer === null && project.previews.length === 0 ? (
          <span className="text-faint">keine Werkzeuge</span>
        ) : null}
      </div>

      <div className="project-actions mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openPrimary}
          disabled={project.availability !== "available"}
          className="quiet-button-primary max-md:basis-full"
        >
          <T3CodeIcon className="h-3.5 w-3.5" /> {project.links.t3Code ? "T3 öffnen" : "Workbench öffnen"}
        </button>
        <div className="project-desktop-actions contents"><button
          type="button"
          disabled={project.links.codeServer === null}
          onClick={() => {
            openToolForProject(project, "code-server");
            navigate("/code-editor");
          }}
          className="quiet-button"
          title={project.links.codeServer === null ? "code-server nicht installiert" : undefined}
        >
          <CodeServerIcon className="h-3.5 w-3.5" /> Editor
        </button>
        {project.previews.length > 0 ? (
          project.previews.map((preview) => (
            <button
              key={preview.id}
              type="button"
              onClick={() => {
                openPreviewForProject(project, preview.id);
                navigate(`/previews?preview=${encodeURIComponent(preview.id)}`);
              }}
              className="quiet-button"
            >
              <Eye className="h-3.5 w-3.5" /> {preview.name}
            </button>
          ))
        ) : null}</div>
        {project.links.codeServer || project.previews.length > 0 ? <details className="project-touch-actions">
          <summary><span>Weitere Werkzeuge</span><ChevronDown className="h-4 w-4" /></summary>
          <div>
            {project.links.codeServer ? <button type="button" onClick={() => { openToolForProject(project, "code-server"); navigate("/code-editor"); }}><CodeServerIcon className="h-4 w-4" /> Editor öffnen</button> : null}
            {project.previews.map((preview) => <button key={preview.id} type="button" onClick={() => { openPreviewForProject(project, preview.id); navigate(`/previews?preview=${encodeURIComponent(preview.id)}`); }}><Eye className="h-4 w-4" /> {preview.name}</button>)}
          </div>
        </details> : null}
      </div>
      {project.availability !== "available" ? <p className="project-attention-hint">Projektpfad prüfen, bevor Werkzeuge geöffnet werden können.</p> : null}
    </article>
  );
}
