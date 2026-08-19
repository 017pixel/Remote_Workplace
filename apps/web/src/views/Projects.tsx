import { useQuery } from "@tanstack/react-query";
import { FolderCodeIcon } from "../components/icons";
import type { Project } from "@wrapt/contracts";
import { wraptQueries } from "../lib/queryOptions";
import { QueryBoundary } from "../components/QueryBoundary";
import { ProjectCard } from "../components/ProjectCard";
import { EmptyState } from "../components/EmptyState";
import { useRouteActivity } from "../lib/routeActivity";

function ProjectGroup({ title, description, projects }: { title: string; description: string; projects: Project[] }) {
  if (projects.length === 0) return null;
  return (
    <section className="document-section">
      <div className="section-heading">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">{description}</p>
        </div>
        <span className="status-pill bg-ink-800">{projects.length}</span>
      </div>
      <div className="border-t border-line">
        {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
    </section>
  );
}

export function Projects() {
  const routeActive = useRouteActivity();
  const projects = useQuery({ ...wraptQueries.projects(), enabled: routeActive });

  return (
    <div className="page-scroll">
      <div className="page-frame projects-page">
        <div className="page-heading">
          <h1>Projekte</h1>
          <p>Alle lokalen Arbeitsbereiche aus dem Projektordner und ihre verfügbaren Werkzeuge.</p>
        </div>
        <QueryBoundary {...projects} loadingLabel="Projekte laden…">
          {(data) =>
            data.projects.length === 0 ? (
              <EmptyState icon={<FolderCodeIcon className="h-6 w-6" />} title="Keine Projekte" description="Im Projektordner wurden keine Arbeitsbereiche gefunden." />
            ) : (
              <>
                <ProjectGroup
                  title="Verfügbar"
                  description="Diese Arbeitsordner können direkt geöffnet werden."
                  projects={data.projects.filter((project) => project.availability === "available")}
                />
                <ProjectGroup
                  title="Benötigt Aufmerksamkeit"
                  description="Diese Konfigurationen sind fehlend, nicht zugänglich oder verweisen auf einen Symlink."
                  projects={data.projects.filter((project) => project.availability !== "available")}
                />
              </>
            )
          }
        </QueryBoundary>
      </div>
    </div>
  );
}
