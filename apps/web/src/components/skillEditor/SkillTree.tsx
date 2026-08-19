import { useMemo, useState, type CSSProperties } from "react";
import type { SkillEditorFile, SkillEditorNode, SkillEditorTreeResponse } from "@wrapt/contracts";
import { ChevronRightIcon, EditIcon, FileIcon, FolderIcon, LinkIcon, NoteIcon, PlusIcon, TrashIcon, WarningIcon } from "../icons";

interface SkillTreeProps {
  tree: SkillEditorTreeResponse;
  selectedPath: string | null;
  onSelect: (file: SkillEditorFile) => void;
  onCreate: () => void;
  onRename: (skill: SkillEditorNode) => void;
  onDelete: (skill: SkillEditorNode) => void;
  /** Freitextfilter über Skill-Name, Beschreibung und Dateinamen. */
  query?: string;
}

/** Einrückung eines Eintrags innerhalb seines Skill-Ordners. */
function depthOf(skill: SkillEditorNode, file: SkillEditorFile): number {
  return file.path.slice(skill.path.length + 1).split("/").length;
}

function FileRow({ file, depth, selected, onSelect }: { file: SkillEditorFile; depth: number; selected: boolean; onSelect: (file: SkillEditorFile) => void }) {
  const disabled = file.kind === "directory" || file.broken || !file.editable;
  return (
    <div
      role="treeitem"
      aria-level={depth + 2}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      className={`skill-tree-row skill-tree-file ${selected ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
      style={{ "--skill-depth": depth } as CSSProperties}
      onClick={() => { if (!disabled) onSelect(file); }}
    >
      <span className="skill-tree-icon">
        {file.broken ? <WarningIcon className="h-3.5 w-3.5" aria-hidden />
          : file.kind === "directory" ? <FolderIcon className="h-3.5 w-3.5" aria-hidden />
            : <FileIcon className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="skill-tree-name">
        <span className="skill-tree-label" title={file.path}>{file.name}</span>
        {file.symlink ? <LinkIcon className="skill-tree-link h-3 w-3" aria-label="Verweis" /> : null}
      </span>
      {file.broken ? <span className="skill-tree-flag">defekt</span> : null}
    </div>
  );
}

function SkillBranch({ skill, selectedPath, onSelect, onRename, onDelete, forceOpen = false }: {
  skill: SkillEditorNode;
  selectedPath: string | null;
  onSelect: (file: SkillEditorFile) => void;
  onRename: (skill: SkillEditorNode) => void;
  onDelete: (skill: SkillEditorNode) => void;
  /** Bei aktiver Suche stehen die Treffer offen, sonst müsste man jeden Skill einzeln aufklappen. */
  forceOpen?: boolean;
}) {
  const containsSelection = selectedPath?.startsWith(`${skill.path}/`) ?? false;
  const [open, setOpen] = useState(containsSelection);
  const expanded = open || containsSelection || forceOpen;

  return (
    <div className="skill-tree-branch">
      <div
        role="treeitem"
        aria-level={2}
        aria-expanded={expanded}
        tabIndex={-1}
        className={`skill-tree-row skill-tree-skill ${containsSelection ? "is-current" : ""}`}
        onClick={() => setOpen(!expanded)}
      >
        <button
          type="button"
          className="skill-tree-toggle"
          aria-label={`${skill.name} ${expanded ? "einklappen" : "aufklappen"}`}
          onClick={(event) => { event.stopPropagation(); setOpen(!expanded); }}
        >
          <ChevronRightIcon className={`skill-tree-chevron ${expanded ? "is-open" : ""}`} />
        </button>
        <span className="skill-tree-skill-text">
          <span className="skill-tree-name">
            <span className="skill-tree-label" title={skill.path}>{skill.name}</span>
            {skill.symlink ? <LinkIcon className="skill-tree-link h-3 w-3" aria-label="Verweis" /> : null}
          </span>
          <span className="skill-tree-description">
            {skill.broken ? "Der Verweis zeigt ins Leere." : skill.description ?? "Ohne Beschreibung — dieser Skill wird nie geladen."}
          </span>
        </span>
        <span className="skill-tree-actions">
          <button
            type="button"
            aria-label={`${skill.name} umbenennen`}
            title="Umbenennen"
            onClick={(event) => { event.stopPropagation(); onRename(skill); }}
          >
            <EditIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`${skill.name} löschen`}
            title="Löschen"
            onClick={(event) => { event.stopPropagation(); onDelete(skill); }}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {expanded && !skill.broken ? skill.files.map((file) => (
        <FileRow key={file.path} file={file} depth={depthOf(skill, file)} selected={selectedPath === file.path} onSelect={onSelect} />
      )) : null}
      {expanded && skill.broken ? <p className="skill-tree-empty">Ziel nicht gefunden. Der Skill lässt sich nur noch löschen.</p> : null}
    </div>
  );
}

export function SkillTree({ tree, selectedPath, onSelect, onCreate, onRename, onDelete, query = "" }: SkillTreeProps) {
  const needle = query.trim().toLocaleLowerCase("de");
  const skills = useMemo(() => {
    if (!needle) return tree.skills;
    return tree.skills.filter((skill) =>
      skill.name.toLocaleLowerCase("de").includes(needle) ||
      (skill.description ?? "").toLocaleLowerCase("de").includes(needle) ||
      skill.files.some((file) => file.name.toLocaleLowerCase("de").includes(needle)),
    );
  }, [needle, tree.skills]);

  return (
    <nav className="skill-tree" role="tree" aria-label="Globale Skills und Regeln">
      {tree.agentsFile ? (
        <div
          role="treeitem"
          aria-level={1}
          aria-selected={selectedPath === tree.agentsFile.path}
          tabIndex={-1}
          className={`skill-tree-row skill-tree-agents ${selectedPath === tree.agentsFile.path ? "is-open" : ""}`}
          onClick={() => onSelect(tree.agentsFile!)}
        >
          <span className="skill-tree-icon"><NoteIcon className="h-3.5 w-3.5" aria-hidden /></span>
          <span className="skill-tree-name"><span className="skill-tree-label">Globale Agenten-Regeln</span></span>
        </div>
      ) : null}

      <div className="skill-tree-section">
        <span>Skills ({skills.length})</span>
        <button type="button" className="skill-tree-add" onClick={onCreate} aria-label="Neuen Skill anlegen" title="Neuen Skill anlegen">
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {skills.length === 0
        ? <p className="skill-tree-empty">{needle ? `Kein Skill passt auf „${query.trim()}“.` : "Noch keine Skills vorhanden."}</p>
        : skills.map((skill) => (
          <SkillBranch key={skill.path} skill={skill} selectedPath={selectedPath} onSelect={onSelect} onRename={onRename} onDelete={onDelete} forceOpen={needle.length > 0} />
        ))}
    </nav>
  );
}
