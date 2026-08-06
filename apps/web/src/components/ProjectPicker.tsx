import { CheckIcon, ChevronDownIcon, CloseIcon, FolderCodeIcon, SearchIcon } from "./icons";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@workbench/contracts";
import { useAnchoredOverlay } from "../lib/useAnchoredOverlay";
import { elementContainsEventTarget } from "../lib/domEvents";

interface ProjectPickerProps {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string) => void;
  compact?: boolean;
  label?: string;
  allowEmptyValue?: boolean;
}

export function ProjectPicker({ projects, value, onChange, compact = false, label = "Projekt", allowEmptyValue = false }: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const menuStyle = useAnchoredOverlay(open, triggerRef, { width: 390, stretchBelowBreakpoint: 1180 });
  const selected = value === null && allowEmptyValue ? undefined : projects.find((project) => project.id === value) ?? projects[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return needle
      ? projects.filter((project) => `${project.name} ${project.path}`.toLocaleLowerCase("de").includes(needle))
      : projects;
  }, [projects, query]);

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
        ref={triggerRef}
        type="button"
        className="project-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="project-picker-label">{label}</span>
        <FolderCodeIcon className="project-picker-icon" aria-hidden />
        <span className="project-picker-value">{selected?.name ?? (allowEmptyValue && value === null ? "Standardpfad" : "Auswählen")}</span>
        <ChevronDownIcon className={`project-picker-chevron ${open ? "is-open" : ""}`} aria-hidden />
      </button>
      {open ? createPortal(
        <div ref={menuRef} className="project-picker-popover is-portal" style={menuStyle} onKeyDown={onKeyDown}>
          <div className="project-picker-popover-head">
            <div>
              <strong>Projekt auswählen</strong>
              <span>{projects.length} lokale Arbeitsbereiche</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Projektwahl schließen"><CloseIcon className="h-4 w-4" /></button>
          </div>
          {projects.length > 7 ? (
            <label className="project-picker-search">
              <SearchIcon className="h-4 w-4" aria-hidden />
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
                {project.id === selected?.id ? <CheckIcon className="h-4 w-4" aria-hidden /> : null}
              </button>
            ))}
            {filtered.length === 0 ? <p className="project-picker-empty">Kein passendes Projekt gefunden.</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
