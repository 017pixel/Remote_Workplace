import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import type { FilesystemEntry } from "@wrapt/contracts";
import { ChevronRightIcon, FolderIcon, FolderOpenIcon, FolderSearchIcon, FileIcon, LinkIcon, UnknownFileIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { parentPath } from "../../lib/fileManager";
import { useFileManagerStore } from "../../stores/fileManager";
import { useResponsiveShell } from "../../lib/useResponsiveShell";

interface FmTreeProps {
  root: string;
  currentPath: string;
}

function entryIcon(entry: FilesystemEntry, expanded: boolean) {
  if (entry.kind === "directory") return expanded ? <FolderOpenIcon className="h-3.5 w-3.5" aria-hidden /> : <FolderIcon className="h-3.5 w-3.5" aria-hidden />;
  if (entry.kind === "symlink") return <LinkIcon className="h-3.5 w-3.5" aria-hidden />;
  if (entry.kind === "file") return <FileIcon className="h-3.5 w-3.5" aria-hidden />;
  return <UnknownFileIcon className="h-3.5 w-3.5" aria-hidden />;
}

function TreeBranch({ directory, depth, expanded, currentPath, onToggle, onOpen }: {
  directory: string;
  depth: number;
  expanded: ReadonlySet<string>;
  currentPath: string;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  const tree = useQuery({
    queryKey: ["filesystem", "tree", directory],
    queryFn: ({ signal }) => apiClient.filesystemTreeAll(directory, signal),
    staleTime: 30_000,
  });
  const entries = tree.data?.entries ?? [];
  const loading = tree.isLoading || tree.isFetching;
  const children = entries.filter((entry) => entry.kind === "directory" && entry.readable);

  if (loading && entries.length === 0) {
    return <div className="file-manager-tree-skeleton"><span /><span /><span /><span /></div>;
  }
  if (tree.isError && entries.length === 0) {
    return <p className="file-manager-tree-error">Der Ordner konnte nicht geladen werden.</p>;
  }

  return <>
    {children.map((entry) => {
      const isExpanded = expanded.has(entry.path);
      const isOpen = currentPath === entry.path;
      return <div key={entry.path}>
        <div
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={isExpanded}
          aria-selected={isOpen}
          data-fm-tree-row
          data-path={entry.path}
          tabIndex={-1}
          className={`file-manager-tree-row ${isOpen ? "is-open" : ""}`}
          style={{ "--fm-depth": depth } as CSSProperties}
          onClick={() => onOpen(entry.path)}
        >
          <button
            type="button"
            className="file-manager-tree-toggle"
            aria-label={`${entry.name} ${isExpanded ? "einklappen" : "aufklappen"}`}
            onClick={(event) => { event.stopPropagation(); onToggle(entry.path); }}
          >
            <ChevronRightIcon className={`file-manager-tree-chevron ${isExpanded ? "is-open" : ""}`} />
          </button>
          <span className="file-manager-tree-icon">{entryIcon(entry, isExpanded)}</span>
          <span className="file-manager-tree-name" title={entry.name}>{entry.name}</span>
        </div>
        {isExpanded ? <TreeBranch directory={entry.path} depth={depth + 1} expanded={expanded} currentPath={currentPath} onToggle={onToggle} onOpen={onOpen} /> : null}
      </div>;
    })}
  </>;
}

export function FmTree({ root, currentPath }: FmTreeProps) {
  const responsive = useResponsiveShell();
  const expanded = useFileManagerStore((state) => state.ui.expanded);
  const setExpanded = useFileManagerStore((state) => state.setExpanded);
  const navigateTo = useFileManagerStore((state) => state.navigateTo);
  const select = useFileManagerStore((state) => state.select);
  const setPreview = useFileManagerStore((state) => state.setPreview);
  const setDetailOpen = useFileManagerStore((state) => state.setDetailOpen);
  const setTreeOpen = useFileManagerStore((state) => state.setTreeOpen);

  const onToggle = useCallback((path: string) => {
    setExpanded(path, !expanded.has(path));
  }, [expanded, setExpanded]);

  const onOpen = useCallback((path: string) => {
    navigateTo(path, true);
    select(null);
    setPreview(false);
    setDetailOpen(false);
    if (responsive.isTouchShell) setTreeOpen(false);
  }, [navigateTo, responsive.isTouchShell, select, setDetailOpen, setPreview, setTreeOpen]);

  const isAtRoot = currentPath === root;

  // Der aktuelle Pfad und alle Vorfahren bleiben aufgeklappt, damit der Baum
  // die aktuelle Position sichtbar macht (auch nach Remote-Sync).
  const ancestors = useMemo(() => {
    const result: string[] = [];
    let current = currentPath;
    while (current.startsWith(`${root}/`)) {
      result.push(current);
      if (current === root) break;
      current = parentPath(current);
    }
    return new Set(result);
  }, [currentPath, root]);

  const visibleExpanded = useMemo(() => {
    const next = new Set(expanded);
    for (const path of ancestors) next.add(path);
    return next;
  }, [ancestors, expanded]);

  return <nav className="file-manager-tree" role="tree" aria-label="Server-Dateibaum">
    <div
      role="treeitem"
      aria-level={1}
      aria-selected={isAtRoot}
      data-fm-tree-row
      data-path={root}
      tabIndex={-1}
      className={`file-manager-tree-row file-manager-tree-home-row ${isAtRoot ? "is-open" : ""}`}
      style={{ "--fm-depth": 0 } as CSSProperties}
      onClick={() => onOpen(root)}
    >
      <span className="file-manager-tree-toggle file-manager-tree-toggle-spacer" aria-hidden="true" />
      <span className="file-manager-tree-icon"><FolderSearchIcon className="h-3.5 w-3.5" aria-hidden /></span>
      <span className="file-manager-tree-name">Home</span>
    </div>
    <TreeBranch directory={root} depth={1} expanded={visibleExpanded} currentPath={currentPath} onToggle={onToggle} onOpen={onOpen} />
  </nav>;
}
