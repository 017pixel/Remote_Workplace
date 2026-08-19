import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TerminalKind } from "@wrapt/contracts";
import { ChevronDownIcon, CloseIcon, ColumnsIcon, EraserIcon, FolderTreeIcon, FullscreenIcon, PlusIcon, RefreshIcon, RetryIcon, SplitIcon } from "../icons";
import { kindLabels } from "./terminal-labels";

interface TerminalToolbarProps {
  kind: TerminalKind;
  hasSplit: boolean;
  hasActivePane: boolean;
  onCreate(): void;
  onCreateSplit(): void;
  onClearSplit(): void;
  onCreateFolder?(): void;
  onExpandAll?(): void;
  onCollapseAll?(): void;
  onRestart(): void;
  onReload?(): void;
  onFullscreen?(): void;
  onClear(): void;
  onClosePane(): void;
  sessionPicker: ReactNode;
}

/** Gemeinsame Aktionszeile der Terminal-Sidebar. Es gibt bewusst keinen
 * zweiten Header im Arbeitsbereich: Verwaltung und Aktionen bleiben links. */
export function TerminalToolbar({ kind, hasSplit, hasActivePane, onCreate, onCreateSplit, onClearSplit, onCreateFolder, onExpandAll, onCollapseAll, onRestart, onReload, onFullscreen, onClear, onClosePane, sessionPicker }: TerminalToolbarProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
    };
  }, [actionsOpen]);

  const runAction = (action: () => void) => {
    setActionsOpen(false);
    action();
  };

  return (
    <div className="terminal-sidebar-controls" aria-label="Terminalaktionen">
      <button type="button" className="terminal-toolbar-action" onClick={onCreate} aria-label={`${kindLabels[kind]} öffnen`} title={`${kindLabels[kind]} öffnen`}><PlusIcon className="h-4 w-4" /></button>
      {onCreateFolder ? <button type="button" className="terminal-toolbar-action" onClick={onCreateFolder} aria-label="Neuer Ordner" title="Neuer Ordner"><FolderTreeIcon className="h-4 w-4" aria-hidden /></button> : null}
      {hasSplit ? (
        <button type="button" className="terminal-toolbar-action" onClick={onClearSplit} aria-label="Split schließen" title="Split schließen"><ColumnsIcon className="h-4 w-4" /></button>
      ) : (
        <button type="button" className="terminal-toolbar-action" onClick={onCreateSplit} disabled={!hasActivePane} aria-label="Neues Terminal rechts teilen" title="Split öffnen"><SplitIcon className="h-4 w-4" /></button>
      )}
      <div className="terminal-action-menu" ref={menuRef}>
        <button type="button" className="terminal-toolbar-action" aria-haspopup="menu" aria-expanded={actionsOpen} aria-label="Weitere Terminalaktionen" title="Aktionen" onClick={() => setActionsOpen((open) => !open)}>
          <ChevronDownIcon className={`h-4 w-4 ${actionsOpen ? "is-open" : ""}`} aria-hidden />
        </button>
        {actionsOpen ? (
          <div className="terminal-action-popover" role="menu" aria-label="Terminalaktionen">
            <button type="button" role="menuitem" onClick={() => runAction(onCreate)}><PlusIcon className="h-4 w-4" aria-hidden /><span>Neues Terminal</span></button>
            {onCreateFolder ? <button type="button" role="menuitem" onClick={() => runAction(onCreateFolder)}><FolderTreeIcon className="h-4 w-4" aria-hidden /><span>Neuer Ordner</span></button> : null}
            {onExpandAll ? <button type="button" role="menuitem" onClick={() => runAction(onExpandAll)}><ChevronDownIcon className="h-4 w-4" aria-hidden /><span>Alle Ordner aufklappen</span></button> : null}
            {onCollapseAll ? <button type="button" role="menuitem" onClick={() => runAction(onCollapseAll)}><ChevronDownIcon className="h-4 w-4 rotate-180" aria-hidden /><span>Alle Ordner zuklappen</span></button> : null}
            <button type="button" role="menuitem" onClick={() => runAction(onRestart)} disabled={!hasActivePane}><RetryIcon className="h-4 w-4" aria-hidden /><span>Neustart</span></button>
            <button type="button" role="menuitem" onClick={() => runAction(onClear)} disabled={!hasActivePane}><EraserIcon className="h-4 w-4" aria-hidden /><span>Leeren</span></button>
            <button type="button" role="menuitem" className="danger" onClick={() => runAction(onClosePane)} disabled={!hasActivePane}><CloseIcon className="h-4 w-4" aria-hidden /><span>Pane schließen</span></button>
            {onReload ? <button type="button" role="menuitem" onClick={() => runAction(onReload)}><RefreshIcon className="h-4 w-4" aria-hidden /><span>Neu laden</span></button> : null}
            {onFullscreen ? <button type="button" role="menuitem" onClick={() => runAction(onFullscreen)}><FullscreenIcon className="h-4 w-4" aria-hidden /><span>Vollbild</span></button> : null}
            {sessionPicker}
          </div>
        ) : null}
      </div>
    </div>
  );
}
