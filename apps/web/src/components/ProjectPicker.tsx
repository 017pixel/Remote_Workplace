import { Combobox } from "@base-ui/react/combobox";
import type { Project } from "@workbench/contracts";
import { CheckIcon, ChevronDownIcon, FolderCodeIcon } from "./icons";

interface ProjectPickerProps {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string) => void;
  compact?: boolean;
  label?: string;
  allowEmptyValue?: boolean;
}

interface ProjectOption {
  value: string;
  label: string;
  path: string;
  availability: Project["availability"];
}

export function ProjectPicker({ projects, value, onChange, compact = false, label = "Projekt", allowEmptyValue = false }: ProjectPickerProps) {
  if (projects.length === 0) return null;
  const options: ProjectOption[] = projects.map((project) => ({ value: project.id, label: project.name, path: project.path, availability: project.availability }));
  const selected = value === null && allowEmptyValue ? null : options.find((project) => project.value === value) ?? options[0] ?? null;

  return (
    <Combobox.Root
      items={options}
      value={selected}
      onValueChange={(project) => { if (project) onChange(project.value); }}
      isItemEqualToValue={(project, current) => project.value === current.value}
      itemToStringLabel={(project) => project.label}
      itemToStringValue={(project) => project.value}
      filter={(project, query) => `${project.label} ${project.path}`.toLocaleLowerCase("de").includes(query.trim().toLocaleLowerCase("de"))}
      autoHighlight
    >
      <div className={`project-picker ${compact ? "is-compact" : ""}`}>
        <Combobox.InputGroup className="project-picker-trigger">
          {!compact ? <span className="project-picker-label">{label}</span> : null}
          <FolderCodeIcon className="project-picker-icon" aria-hidden />
          <Combobox.Input className="project-picker-value" aria-label={label} placeholder={allowEmptyValue ? "Standardpfad" : "Projekt auswählen"} />
          <Combobox.Trigger className="project-picker-combobox-trigger" aria-label="Projektliste öffnen"><ChevronDownIcon className="project-picker-chevron" aria-hidden /></Combobox.Trigger>
        </Combobox.InputGroup>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner className="project-picker-positioner" sideOffset={6} align="end">
          <Combobox.Popup className="project-picker-popover is-portal">
            <div className="project-picker-popover-head"><div><strong>Projekt auswählen</strong><span>{projects.length} lokale Arbeitsbereiche</span></div></div>
            <Combobox.Empty className="project-picker-empty">Kein passendes Projekt gefunden.</Combobox.Empty>
            <Combobox.List className="project-picker-list">
              {(project: ProjectOption) => (
                <Combobox.Item key={project.value} value={project} className="project-picker-option">
                  <span className={`project-availability is-${project.availability}`} />
                  <span className="project-picker-option-copy"><strong>{project.label}</strong><small>{project.path}</small></span>
                  <Combobox.ItemIndicator><CheckIcon className="h-4 w-4" aria-hidden /></Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
