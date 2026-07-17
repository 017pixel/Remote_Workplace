import { Check, ChevronDown, FolderKanban, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Project } from "@workbench/contracts";

interface ProjectPickerProps {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string) => void;
  compact?: boolean;
  label?: string;
}

export function ProjectPicker({ projects, value, onChange, compact = false, label = "Projekt" }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const selected = projects.find((project) => project.id === value) ?? projects[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return needle
      ? projects.filter((project) => `${project.name} ${project.path}`.toLocaleLowerCase("de").includes(needle))
      : projects;
  }, [projects, query]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => setHighlighted(0), [query]);

  const choose = (project: Project) => {
    onChange(project.id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setHighlighted((index) => Math.min(filtered.length - 1, index + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setHighlighted((index) => Math.max(0, index - 1)); }
    if (event.key === "Enter" && filtered[highlighted]) { event.preventDefault(); choose(filtered[highlighted]); }
  };

  if (projects.length === 0) return null;

  return (
    <div ref={rootRef} className={`project-picker ${compact ? "is-compact" : ""}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="project-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="project-picker-label">{label}</span>
        <FolderKanban className="project-picker-icon" aria-hidden />
        <span className="project-picker-value">{selected?.name ?? "Auswählen"}</span>
        <ChevronDown className={`project-picker-chevron ${open ? "is-open" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="project-picker-popover">
          <div className="project-picker-popover-head">
            <div>
              <strong>Projekt auswählen</strong>
              <span>{projects.length} lokale Arbeitsbereiche</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Projektwahl schließen"><X className="h-4 w-4" /></button>
          </div>
          {projects.length > 7 ? (
            <label className="project-picker-search">
              <Search className="h-4 w-4" aria-hidden />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Projekt suchen…" aria-label="Projekt suchen" />
            </label>
          ) : null}
          <div id={menuId} className="project-picker-list" role="listbox" aria-label="Projekte">
            {filtered.map((project, index) => (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={project.id === selected?.id}
                className={`${project.id === selected?.id ? "is-selected" : ""} ${index === highlighted ? "is-highlighted" : ""}`}
                onPointerMove={() => setHighlighted(index)}
                onClick={() => choose(project)}
              >
                <span className={`project-availability is-${project.availability}`} />
                <span className="project-picker-option-copy">
                  <strong>{project.name}</strong>
                  <small>{project.path}</small>
                </span>
                {project.id === selected?.id ? <Check className="h-4 w-4" aria-hidden /> : null}
              </button>
            ))}
            {filtered.length === 0 ? <p className="project-picker-empty">Kein passendes Projekt gefunden.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
