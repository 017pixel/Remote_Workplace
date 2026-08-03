import { useCallback, useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FilesystemEntry, FilesystemTreeResponse, ProjectsResponse } from "@workbench/contracts";
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon, FolderSearchIcon, LinkIcon, SearchIcon, UnknownFileIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { ModalFrame } from "../ModalDialog";
import { requestOrbitNode } from "../../lib/orbitPalette";

interface BranchState {
  entries: FilesystemEntry[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
}

interface OrbitProjectBrowserDialogProps {
  open: boolean;
  onClose: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Der Serverordner konnte nicht geladen werden.";
}

function branchFrom(response: FilesystemTreeResponse): BranchState {
  return { entries: response.entries, nextCursor: response.nextCursor, loading: false, error: null };
}

function parentPath(path: string): string {
  const end = path.lastIndexOf("/");
  return end <= 0 ? "/" : path.slice(0, end);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function entryIcon(entry: FilesystemEntry, expanded: boolean) {
  if (entry.kind === "directory") return expanded ? <FolderOpenIcon aria-hidden /> : <FolderIcon aria-hidden />;
  if (entry.kind === "symlink") return <LinkIcon aria-hidden />;
  if (entry.kind === "file") return <FileIcon aria-hidden />;
  return <UnknownFileIcon aria-hidden />;
}

interface TreeRowsProps {
  directory: string;
  depth: number;
  branches: Record<string, BranchState>;
  expanded: ReadonlySet<string>;
  selectedPath: string | null;
  onSelect: (entry: FilesystemEntry) => void;
  onToggle: (entry: FilesystemEntry) => void;
  onLoadMore: (path: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, entry: FilesystemEntry) => void;
}

function TreeRows({ directory, depth, branches, expanded, selectedPath, onSelect, onToggle, onLoadMore, onKeyDown }: TreeRowsProps) {
  const branch = branches[directory];
  if (!branch) return null;
  return <>
    {branch.entries.map((entry) => {
      const isDirectory = entry.kind === "directory";
      const isExpanded = isDirectory && expanded.has(entry.path);
      const isSelected = isDirectory && selectedPath === entry.path;
      return <div key={entry.path} className="orbit-server-tree-item">
        <div
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={isDirectory ? isExpanded : undefined}
          aria-selected={isSelected}
          aria-disabled={!entry.readable || !isDirectory ? true : undefined}
          tabIndex={isSelected || (selectedPath === null && depth === 0 && branch.entries[0]?.path === entry.path) ? 0 : -1}
          data-orbit-tree-row
          data-path={entry.path}
          className={`orbit-server-tree-row ${isSelected ? "is-selected" : ""} ${entry.readable ? "" : "is-disabled"}`}
          style={{ "--tree-depth": depth } as CSSProperties}
          onClick={() => { if (isDirectory && entry.readable) onSelect(entry); }}
          onKeyDown={(event) => onKeyDown(event, entry)}
        >
          {isDirectory ? <button
            type="button"
            className="orbit-server-tree-toggle"
            onClick={(event) => { event.stopPropagation(); if (entry.readable) onToggle(entry); }}
            disabled={!entry.readable}
            aria-label={`${entry.name} ${isExpanded ? "einklappen" : "aufklappen"}`}
            tabIndex={-1}
          ><ChevronRightIcon className={isExpanded ? "is-open" : ""} /></button> : <span className="orbit-server-tree-spacer" />}
          <span className="orbit-server-tree-icon">{entryIcon(entry, isExpanded)}</span>
          <span className="orbit-server-tree-name">{entry.name}</span>
          <span className="orbit-server-tree-kind">{entry.kind === "directory" ? "Ordner" : entry.kind === "file" ? formatBytes(entry.sizeBytes) : entry.kind === "symlink" ? "Verweis" : "Datei"}</span>
          <time>{entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""}</time>
        </div>
        {isDirectory && isExpanded ? <div role="group">
          {branches[entry.path]?.loading ? <div className="orbit-server-tree-skeleton" style={{ "--tree-depth": depth + 1 } as CSSProperties}><span /><span /><span /></div> : null}
          {branches[entry.path]?.error ? <p className="orbit-server-tree-error" style={{ "--tree-depth": depth + 1 } as CSSProperties}>{branches[entry.path]?.error}</p> : null}
          <TreeRows directory={entry.path} depth={depth + 1} branches={branches} expanded={expanded} selectedPath={selectedPath} onSelect={onSelect} onToggle={onToggle} onLoadMore={onLoadMore} onKeyDown={onKeyDown} />
        </div> : null}
      </div>;
    })}
    {branch.nextCursor ? <button type="button" className="orbit-server-tree-more" style={{ "--tree-depth": depth } as CSSProperties} onClick={() => onLoadMore(directory)} disabled={branch.loading}>{branch.loading ? "Wird geladen" : "Weitere laden"}</button> : null}
  </>;
}

export function OrbitProjectBrowserDialog({ open, onClose }: OrbitProjectBrowserDialogProps) {
  const queryClient = useQueryClient();
  const [root, setRoot] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [navigationPath, setNavigationPath] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [branches, setBranches] = useState<Record<string, BranchState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const storeResponses = useCallback((responses: FilesystemTreeResponse[]) => {
    setBranches((current) => {
      const next = { ...current };
      for (const response of responses) next[response.path] = branchFrom(response);
      return next;
    });
  }, []);

  const navigateTo = useCallback(async (path?: string, selectTarget = true) => {
    setNavigating(true);
    setNavigationError(null);
    try {
      const target = await apiClient.filesystemTree(path);
      const relativeTarget = target.path === target.root ? "" : target.path.slice(target.root.length + 1);
      const segments = relativeTarget ? relativeTarget.split("/") : [];
      const ancestorPaths = [target.root];
      for (const segment of segments) ancestorPaths.push(`${ancestorPaths.at(-1)}/${segment}`);
      const responses: FilesystemTreeResponse[] = [];
      for (const [index, ancestor] of ancestorPaths.entries()) {
        if (ancestor === target.path) {
          responses.push(target);
          continue;
        }
        const childPath = ancestorPaths[index + 1];
        let response = await apiClient.filesystemTree(ancestor);
        const entries = [...response.entries];
        while (childPath && !entries.some((entry) => entry.path === childPath) && response.nextCursor) {
          response = await apiClient.filesystemTree(ancestor, response.nextCursor);
          entries.push(...response.entries);
        }
        responses.push({ ...response, entries });
      }
      storeResponses(responses);
      setRoot(target.root);
      setNavigationPath(target.path);
      setPathInput(target.path);
      setExpanded(new Set(ancestorPaths));
      setSelectedPath(selectTarget && target.path !== target.root ? target.path : null);
      window.setTimeout(() => {
        const rows = document.querySelectorAll<HTMLElement>("[data-orbit-tree-row]");
        [...rows].find((row) => row.dataset.path === target.path)?.scrollIntoView({ block: "center" });
      }, 0);
    } catch (error) {
      setNavigationError(errorMessage(error));
    } finally {
      setNavigating(false);
    }
  }, [storeResponses]);

  useEffect(() => {
    if (!open) return;
    setRoot("");
    setPathInput("");
    setNavigationPath("");
    setSelectedPath(null);
    setBranches({});
    setExpanded(new Set());
    setNavigationError(null);
    setSubmitError(null);
    void navigateTo(undefined, false);
  }, [navigateTo, open]);

  const loadDirectory = useCallback(async (path: string, append = false) => {
    const cursor = append ? branches[path]?.nextCursor ?? undefined : undefined;
    setBranches((current) => ({
      ...current,
      [path]: { entries: append ? current[path]?.entries ?? [] : [], nextCursor: current[path]?.nextCursor ?? null, loading: true, error: null },
    }));
    try {
      const response = await apiClient.filesystemTree(path, cursor);
      setBranches((current) => ({
        ...current,
        [path]: {
          entries: append ? [...(current[path]?.entries ?? []), ...response.entries] : response.entries,
          nextCursor: response.nextCursor,
          loading: false,
          error: null,
        },
      }));
    } catch (error) {
      setBranches((current) => ({
        ...current,
        [path]: { entries: current[path]?.entries ?? [], nextCursor: current[path]?.nextCursor ?? null, loading: false, error: errorMessage(error) },
      }));
    }
  }, [branches]);

  const toggleDirectory = useCallback((entry: FilesystemEntry) => {
    const nextExpanded = new Set(expanded);
    if (nextExpanded.has(entry.path)) nextExpanded.delete(entry.path);
    else {
      nextExpanded.add(entry.path);
      if (!branches[entry.path]) void loadDirectory(entry.path);
    }
    setExpanded(nextExpanded);
  }, [branches, expanded, loadDirectory]);

  const focusPath = (path: string) => {
    const rows = document.querySelectorAll<HTMLElement>("[data-orbit-tree-row]");
    [...rows].find((row) => row.dataset.path === path)?.focus();
  };

  const handleTreeKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, entry: FilesystemEntry) => {
    const rows = [...document.querySelectorAll<HTMLElement>("[data-orbit-tree-row]")];
    const index = rows.indexOf(event.currentTarget);
    if (event.key === "ArrowDown") { event.preventDefault(); rows[index + 1]?.focus(); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); rows[index - 1]?.focus(); return; }
    if (event.key === "ArrowRight" && entry.kind === "directory" && entry.readable) {
      event.preventDefault();
      if (!expanded.has(entry.path)) toggleDirectory(entry);
      else rows[index + 1]?.focus();
      return;
    }
    if (event.key === "ArrowLeft" && entry.kind === "directory") {
      event.preventDefault();
      if (expanded.has(entry.path)) toggleDirectory(entry);
      else focusPath(parentPath(entry.path));
      return;
    }
    if (event.key === "Enter" && entry.kind === "directory" && entry.readable) {
      event.preventDefault();
      setSelectedPath(entry.path);
    }
  }, [expanded, toggleDirectory]);

  const selectedName = selectedPath?.split("/").at(-1) ?? null;
  const breadcrumbs = useMemo(() => {
    if (!root || !navigationPath) return [];
    const relativePath = navigationPath === root ? "" : navigationPath.slice(root.length + 1);
    const result = [{ label: "Home", path: root }];
    let current = root;
    for (const segment of relativePath ? relativePath.split("/") : []) {
      current = `${current}/${segment}`;
      result.push({ label: segment, path: current });
    }
    return result;
  }, [navigationPath, root]);

  const registerProject = async (requestClose: () => void) => {
    if (!selectedPath) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await apiClient.registerProject({ path: selectedPath });
      if (!result) throw new Error("Das Projekt konnte nicht registriert werden.");
      queryClient.setQueryData<ProjectsResponse>(["projects"], (current) => {
        if (!current) return { projects: [result.project], recentLimit: 8 };
        const exists = current.projects.some((project) => project.id === result.project.id);
        return { ...current, projects: exists ? current.projects.map((project) => project.id === result.project.id ? result.project : project) : [...current.projects, result.project] };
      });
      requestOrbitNode({ type: "project", title: result.project.name, projectId: result.project.id });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      requestClose();
    } catch (error) {
      setSubmitError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return <ModalFrame open={open} title="Serverprojekt öffnen" description={root ? `Browser-Root ${root}` : "Serverstruktur wird geladen"} className="orbit-project-browser" backdropClassName="orbit-project-browser-backdrop" onClose={onClose}>{(requestClose) => <>
    <form className="orbit-project-browser-path" onSubmit={(event) => { event.preventDefault(); void navigateTo(pathInput); }}>
      <SearchIcon aria-hidden />
      <label className="sr-only" htmlFor="orbit-project-path">Serverpfad</label>
      <input id="orbit-project-path" autoFocus value={pathInput} onChange={(event) => setPathInput(event.target.value)} placeholder="~/projects oder vollständigen Pfad eingeben" spellCheck={false} autoCapitalize="none" />
      <button type="submit" disabled={navigating || !pathInput.trim()}>{navigating ? "Lädt" : "Öffnen"}</button>
    </form>
    <nav className="orbit-project-browser-breadcrumbs" aria-label="Aktueller Serverpfad">
      {breadcrumbs.map((item, index) => <span key={item.path} className={index > 0 && index < breadcrumbs.length - 1 ? "is-middle" : ""}>{index > 0 ? <ChevronRightIcon aria-hidden /> : null}<button type="button" onClick={() => void navigateTo(item.path, item.path !== root)}>{item.label}</button></span>)}
    </nav>
    {navigationError ? <div className="orbit-project-browser-alert" role="alert">{navigationError}</div> : null}
    <div className="orbit-project-browser-body">
      <section className="orbit-project-browser-tree-panel" aria-label="Serverdateien">
        {!root || branches[root]?.loading ? <div className="orbit-server-tree-skeleton"><span /><span /><span /><span /></div> : null}
        {root ? <div className="orbit-server-tree" role="tree" aria-label={`Dateibaum unter ${root}`}>
          <TreeRows directory={root} depth={0} branches={branches} expanded={expanded} selectedPath={selectedPath} onSelect={(entry) => setSelectedPath(entry.path)} onToggle={toggleDirectory} onLoadMore={(path) => void loadDirectory(path, true)} onKeyDown={handleTreeKeyDown} />
        </div> : null}
      </section>
      <aside className="orbit-project-browser-selection">
        <span className="orbit-project-browser-selection-icon"><FolderSearchIcon aria-hidden /></span>
        <small>Ausgewählter Projektordner</small>
        <strong>{selectedName ?? "Noch keinen Ordner gewählt"}</strong>
        <p>{selectedPath ?? "Ordnerzeile markieren. Dateien bleiben nur zur Orientierung sichtbar."}</p>
        <ul><li>Projekt-Hub entsteht im aktiven Orbit.</li><li>Terminal und Entwicklungswerkzeuge nutzen diesen Pfad.</li><li>Dateien werden hier nicht verändert.</li></ul>
      </aside>
    </div>
    {submitError ? <div className="orbit-project-browser-alert is-submit" role="alert">{submitError}</div> : null}
    <footer className="orbit-project-browser-actions">
      <div><small>Projektpfad</small><span>{selectedPath ?? "Ordner auswählen"}</span></div>
      <button type="button" className="quiet-button" onClick={requestClose}>Abbrechen</button>
      <button type="button" className="quiet-button-primary" disabled={!selectedPath || submitting} onClick={() => void registerProject(requestClose)}>{submitting ? "Wird geöffnet" : "Im Orbit öffnen"}</button>
    </footer>
  </>}</ModalFrame>;
}
