import { CheckIcon, ChevronDownIcon, CloseIcon, FolderCodeIcon, FolderOpenIcon, SearchIcon } from "./icons";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@wrapt/contracts";
import { useAnchoredOverlay } from "../lib/useAnchoredOverlay";
import { elementContainsEventTarget } from "../lib/domEvents";

interface ProjectPickerProps {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string) => void;
  compact?: boolean;
  label?: string;
  allowEmptyValue?: boolean;
  projectsRoot?: string;
  onOpenPath?: (path: string) => Promise<void>;
}

function isDirectChild(path: string, root: string): boolean {
  const normalizedRoot = root.endsWith("/") ? root.slice(0, -1) : root;
  if (!path.startsWith(`${normalizedRoot}/`)) return false;
  return !path.slice(normalizedRoot.length + 1).includes("/");
}

export function ProjectPicker({ projects, value, onChange, compact = false, label = "Projekt", allowEmptyValue = false, projectsRoot, onOpenPath }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [pathInput, setPathInput] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [openingPath, setOpeningPath] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const menuStyle = useAnchoredOverlay(open, triggerRef, { width: 560, stretchBelowBreakpoint: 1180 });
  const selected = value === null && allowEmptyValue ? undefined : projects.find((project) => project.id === value) ?? projects[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return needle
      ? projects.filter((project) => `${project.name} ${project.path}`.toLocaleLowerCase("de").includes(needle))
      : projects;
  }, [projects, query]);
  const rootProjects = projectsRoot ? filtered.filter((project) => isDirectChild(project.path, projectsRoot)) : filtered;
  const customProjects = projectsRoot ? filtered.filter((project) => !isDirectChild(project.path, projectsRoot)) : [];

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!elementContainsEventTarget(rootRef.current, event.target) && !elementContainsEventTarget(menuRef.current, event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => setHighlighted(0), [query]);

  const choose = (project: Project) => {
    onChange(project.id);
    setOpen(false);
    setQuery("");
  };

  const openPath = async () => {
    const path = pathInput.trim();
    if (!path || !onOpenPath) return;
    setOpeningPath(true);
    setPathError(null);
    try {
      await onOpenPath(path);
      setOpen(false);
      setQuery("");
      setPathInput("");
    } catch (error) {
      setPathError(error instanceof Error ? error.message : "Der Projektordner konnte nicht geöffnet werden.");
    } finally {
      setOpeningPath(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if ((event.target as HTMLElement).closest(".project-picker-path-form")) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setHighlighted((index) => Math.min(Math.max(0, filtered.length - 1), index + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setHighlighted((index) => Math.max(0, index - 1)); }
    if (event.key === "Enter" && filtered[highlighted]) { event.preventDefault(); choose(filtered[highlighted]); }
  };

  return (
    <div ref={rootRef} className={`project-picker ${compact ? "is-compact" : ""}`} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="project-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => { setPathError(null); setOpen((current) => !current); }}
      >
        {!compact ? <span className="project-picker-label">{label}</span> : null}
        <span className="project-picker-value">{selected?.name ?? (allowEmptyValue && value === null ? "Standardpfad" : "Auswählen")}</span>
        <ChevronDownIcon className={`project-picker-chevron ${open ? "is-open" : ""}`} aria-hidden />
      </button>
      {open ? createPortal(
        <div ref={menuRef} className="project-picker-popover is-portal" style={menuStyle} onKeyDown={onKeyDown}>
          <div className="project-picker-popover-head">
            <div>
              <strong>Projekt auswählen</strong>
              <span>{projects.length} Ordner und eigene Pfade</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Projektwahl schließen"><CloseIcon className="h-4 w-4" /></button>
          </div>
          <label className="project-picker-search">
            <SearchIcon className="h-4 w-4" aria-hidden />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Projekt oder Pfad suchen…" aria-label="Projekt suchen" />
          </label>
          <div id={menuId} className="project-picker-list" role="listbox" aria-label="Projekte">
            {rootProjects.length > 0 ? <section className="project-picker-group" role="group" aria-label={`Projekte in ${projectsRoot ?? "Projects"}`}>
              <div className="project-picker-group-head">
                <FolderOpenIcon aria-hidden />
                <span><strong>{projectsRoot?.split("/").filter(Boolean).at(-1) ?? "Projects"}</strong><small>{projectsRoot}</small></span>
                <small>{rootProjects.length}</small>
              </div>
              <div className="project-picker-tree-children">
              {rootProjects.map((project) => {
                const index = filtered.indexOf(project);
                return (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={project.id === selected?.id}
                className={`project-picker-option ${project.id === selected?.id ? "is-selected" : ""} ${index === highlighted ? "is-highlighted" : ""}`}
                onPointerMove={() => setHighlighted(index)}
                onClick={() => choose(project)}
              >
                <span className={`project-availability is-${project.availability}`} />
                <span className="project-picker-option-copy">
                  <strong>{project.name}</strong>
                  <small>{project.path}</small>
                </span>
                {project.id === selected?.id ? <CheckIcon className="h-4 w-4" aria-hidden /> : null}
              </button>
                );
              })}
              </div>
            </section> : null}
            {customProjects.length > 0 ? <section className="project-picker-group" role="group" aria-label="Eigene Projektpfade">
              <div className="project-picker-group-head">
                <FolderCodeIcon aria-hidden />
                <span><strong>Eigene Pfade</strong><small>Außerhalb des Projects-Ordners</small></span>
                <small>{customProjects.length}</small>
              </div>
              <div className="project-picker-tree-children">
              {customProjects.map((project) => {
                const index = filtered.indexOf(project);
                return <button key={project.id} type="button" role="option" aria-selected={project.id === selected?.id} className={`project-picker-option ${project.id === selected?.id ? "is-selected" : ""} ${index === highlighted ? "is-highlighted" : ""}`} onPointerMove={() => setHighlighted(index)} onClick={() => choose(project)}>
                  <span className={`project-availability is-${project.availability}`} />
                  <span className="project-picker-option-copy"><strong>{project.name}</strong><small>{project.path}</small></span>
                  {project.id === selected?.id ? <CheckIcon className="h-4 w-4" aria-hidden /> : null}
                </button>;
              })}
              </div>
            </section> : null}
            {filtered.length === 0 ? <p className="project-picker-empty">Kein passendes Projekt gefunden.</p> : null}
          </div>
          {onOpenPath ? <form className="project-picker-path-form" onSubmit={(event) => { event.preventDefault(); void openPath(); }}>
            <label htmlFor={`${menuId}-path`}>Anderen Ordner öffnen</label>
            <div>
              <input id={`${menuId}-path`} value={pathInput} onChange={(event) => setPathInput(event.target.value)} placeholder="/home/bbecker/…" spellCheck={false} autoCapitalize="none" />
              <button type="submit" disabled={!pathInput.trim() || openingPath}>{openingPath ? "Öffnet" : "Öffnen"}</button>
            </div>
            {pathError ? <p role="alert">{pathError}</p> : null}
          </form> : null}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
