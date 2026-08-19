import { Link, useNavigate } from "react-router";
import { ChevronDownIcon, T3CodeIcon } from "./icons";
import type { Project } from "@wrapt/contracts";
import { Badge } from "./primitives";
import { openProjectDefault, openProjectToolStandalone, openToolForProject } from "../lib/wraptActions";
import { projectToolOptions } from "../lib/projectTools";

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
  const tools = projectToolOptions(project);
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
        {project.availability === "available" ? <Badge>Preview-Laufzeit</Badge> : null}
        {project.previews.map((p) => (
          <Badge key={p.id}>{p.name}</Badge>
        ))}
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
        <details className="project-tools-menu">
          <summary aria-label="Weitere Werkzeuge öffnen" title="Weitere Werkzeuge"><ChevronDownIcon className="h-4 w-4" /><span>Weitere</span><span className="project-tools-count">{tools.length}</span></summary>
          <div role="menu">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitem"
                  disabled={project.availability !== "available"}
                  onClick={() => {
                    navigate(openProjectToolStandalone(project, tool));
                  }}
                >
                  <Icon className="h-4 w-4" /> {tool.label} öffnen
                </button>
              );
            })}
          </div>
        </details>
      </div>
      {project.availability !== "available" ? <p className="project-attention-hint">Projektpfad prüfen, bevor Werkzeuge geöffnet werden können.</p> : null}
    </article>
  );
}
