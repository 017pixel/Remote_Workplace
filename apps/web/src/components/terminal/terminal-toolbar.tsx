import type { RefObject, ReactNode } from "react";
import type { TerminalKind } from "@workbench/contracts";
import { ChevronDownIcon, CloseIcon, ColumnsIcon, EraserIcon, MonitorOffIcon, PlusIcon, RetryIcon, SplitIcon } from "../icons";
import type { TerminalTabState } from "../../stores/terminals";
import type { TerminalMeta, WebTerminalHandle } from "./terminal-types";
import { kindLabels, tabKindLabels } from "./terminal-labels";

interface TerminalToolbarProps {
  tabs: TerminalTabState[];
  activeTabId: string | null;
  splitTabIds: [string, string] | null;
  meta: Record<string, TerminalMeta>;
  kind: TerminalKind;
  maxTabs: number;
  isMobile: boolean;
  bento: boolean;
  singlePane: boolean;
  actionsOpen: boolean;
  activeTab: TerminalTabState | undefined;
  handles: Map<string, WebTerminalHandle>;
  actionMenuRef: RefObject<HTMLDivElement | null>;
  longPress: RefObject<number | null>;
  projectName(projectId: string | null, cwd?: string): string;
  onActivateTab(tabId: string): void;
  onClose(tabId: string): void;
  onCreate(): void;
  onClearSplit(): void;
  onCreateSplit(): void;
  onRunAction(action: () => void): void;
  onSetActionsOpen(open: boolean): void;
  onSetDraggingTabId(tabId: string | null): void;
  sessionPicker: ReactNode;
}

/** Tab-Leiste und Aktionen-Menü der Terminalfläche. Die Tabs sind per Drag
 *  in ein Split-Pane ziehbar; auf Touch-Geräten entfällt das Drag. */
export function TerminalToolbar(props: TerminalToolbarProps) {
  const {
    tabs, activeTabId, splitTabIds, meta, kind, maxTabs, isMobile, bento, singlePane,
    actionsOpen, activeTab, handles, actionMenuRef, longPress, projectName,
    onActivateTab, onClose, onCreate, onClearSplit, onCreateSplit, onRunAction,
    onSetActionsOpen, onSetDraggingTabId, sessionPicker,
  } = props;

  return (
    <header className="terminal-area-toolbar">
      <div className="terminal-tabs" role="tablist" aria-label="Terminalsitzungen">
        {tabs.map((tab, index) => {
          const currentMeta = meta[tab.id];
          const active = tab.id === activeTabId;
          const split = splitTabIds?.includes(tab.id) ?? false;
          return (
            <div
              key={tab.id}
              className={`terminal-tab ${active ? "is-active" : ""} ${split ? "is-split" : ""}`}
              draggable={!isMobile && !bento}
              onDragStart={(event) => { onSetDraggingTabId(tab.id); event.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => onSetDraggingTabId(null)}
              onPointerDown={() => {
                if (isMobile || bento) return;
                longPress.current = window.setTimeout(() => onSetDraggingTabId(tab.id), 450);
              }}
              onPointerUp={() => { if (longPress.current) window.clearTimeout(longPress.current); }}
              onPointerCancel={() => { if (longPress.current) window.clearTimeout(longPress.current); }}
              title={`${kindLabels[tab.kind]} ${index + 1} · ${projectName(tab.projectId, currentMeta?.cwd)}${currentMeta?.cwd ? ` · ${currentMeta.cwd}` : ""}`}
            >
              <button type="button" role="tab" aria-selected={active} onClick={() => onActivateTab(tab.id)}>
                <span className={`terminal-state is-${currentMeta?.status ?? "connecting"}`} />
                <span className="terminal-tab-index">{index + 1}</span>
                <span className="terminal-tab-kind">{tabKindLabels[tab.kind]}</span>
              </button>
              <button type="button" className="terminal-tab-close" onClick={() => onClose(tab.id)} aria-label={`Terminal ${index + 1} schließen`}>
                <CloseIcon className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="terminal-tab-add"
          onClick={() => onCreate()}
          disabled={tabs.length >= maxTabs}
          aria-label="Neue Terminalsitzung"
          title={tabs.length >= maxTabs ? `Maximal ${maxTabs} ${kindLabels[kind]}-Instanzen` : `${kindLabels[kind]} öffnen`}
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Auf dem Handy sitzen die Aktionen unten in der Bedienleiste, hier
          bleiben sie hinter dem Aktionen-Menü verborgen. */}
      <div className="terminal-actions terminal-action-bar" aria-label="Terminalaktionen" hidden={isMobile}>
        <div className="terminal-action-menu" ref={actionMenuRef}>
          <button type="button" className="terminal-action-trigger" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => onSetActionsOpen(!actionsOpen)} aria-label="Terminalaktionen">
            <ChevronDownIcon className={`h-4 w-4 ${actionsOpen ? "is-open" : ""}`} aria-hidden />
            <span>Aktionen</span>
          </button>
          {actionsOpen ? (
            <div className="terminal-action-popover" role="menu" aria-label="Terminalaktionen">
              <button type="button" role="menuitem" onClick={() => onRunAction(() => onCreate())} disabled={tabs.length >= maxTabs} aria-label={`${kindLabels[kind]}-Instanz öffnen`}><PlusIcon className="h-4 w-4" aria-hidden /><span>Neu</span></button>
              <button type="button" role="menuitem" onClick={() => onRunAction(() => activeTab && handles.get(activeTab.id)?.restart())} disabled={!activeTab} aria-label="Terminal neu starten"><RetryIcon className="h-4 w-4" aria-hidden /><span>Neustart</span></button>
              <button type="button" role="menuitem" onClick={() => onRunAction(() => activeTab && handles.get(activeTab.id)?.clear())} disabled={!activeTab} aria-label="Terminal leeren"><EraserIcon className="h-4 w-4" aria-hidden /><span>Leeren</span></button>
              {!bento && !singlePane ? (
                splitTabIds ?
                  <button type="button" role="menuitem" onClick={() => onRunAction(() => onClearSplit())} aria-label="Split schließen"><ColumnsIcon className="h-4 w-4" aria-hidden /><span>Einzeln</span></button> :
                  <button type="button" role="menuitem" onClick={() => onRunAction(() => onCreateSplit())} disabled={!activeTab || tabs.length >= maxTabs} aria-label="Neues Terminal rechts teilen"><SplitIcon className="h-4 w-4" aria-hidden /><span>Split</span></button>
              ) : null}
              <button type="button" role="menuitem" className="danger" onClick={() => onRunAction(() => activeTab && onClose(activeTab.id))} disabled={!activeTab} aria-label="Terminal schließen"><MonitorOffIcon className="h-4 w-4" aria-hidden /><span>Schließen</span></button>
              {sessionPicker}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
