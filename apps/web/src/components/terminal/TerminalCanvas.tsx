import { Fragment, type ReactNode } from "react";
import { Group, Panel, Separator, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import type { TerminalPaneLayout } from "@wrapt/contracts";

export interface TerminalCanvasPane {
  id: string;
  runtimeId: string;
}

interface TerminalCanvasProps {
  areaId: string;
  bento: boolean;
  isMobile: boolean;
  showSingleMobilePane: boolean;
  focusedRuntimeId: string | null;
  paneLayout: TerminalPaneLayout | null;
  panes: TerminalCanvasPane[];
  parkedPanes: TerminalCanvasPane[];
  emptyState: ReactNode;
  dropZone: ReactNode;
  renderPane(pane: TerminalCanvasPane, visible: boolean, position?: "left" | "right", index?: number): ReactNode;
  onLayoutChanged(layout: Layout, details: LayoutChangedMeta): void;
}

/** Rendert die sichtbare Terminalfläche unabhängig von Sidebar und Session-Logik. */
export function TerminalCanvas({ areaId, bento, isMobile, showSingleMobilePane, focusedRuntimeId, paneLayout, panes, parkedPanes, emptyState, dropZone, renderPane, onLayoutChanged }: TerminalCanvasProps) {
  if (panes.length === 0) {
    return <div className="terminal-canvas"><div className="terminal-empty-state">{emptyState}</div>{dropZone}</div>;
  }

  if (bento) {
    return <div className={`terminal-canvas is-bento has-${Math.min(panes.length, 4)}`}>
      {panes.slice(0, 4).map((pane, index) => renderPane(pane, !isMobile || pane.runtimeId === focusedRuntimeId, index === 0 ? "left" : index === 1 ? "right" : undefined, index))}
      {parkedPanes.map((pane) => renderPane(pane, false))}
      {dropZone}
    </div>;
  }

  if (paneLayout?.type === "split") {
    if (showSingleMobilePane) {
      const focusedPane = panes.find((pane) => pane.runtimeId === focusedRuntimeId) ?? panes[0]!;
      return <div className="terminal-canvas is-mobile-single-pane">{renderPane(focusedPane, true)}</div>;
    }
    return (
      <div className="terminal-canvas">
        <Group
          key={panes.map((pane) => pane.id).join(":")}
          id={`terminal-split-${areaId}`}
          className="terminal-split-group"
          orientation="horizontal"
          defaultLayout={Object.fromEntries(panes.map((pane, index) => [pane.id, paneLayout.sizes[index] ?? (100 / panes.length)])) as Layout}
          onLayoutChanged={onLayoutChanged}
          resizeTargetMinimumSize={{ coarse: 44, fine: 20 }}
        >
          {panes.map((pane, index) => (
            <Fragment key={pane.id}>
              <Panel id={pane.id} minSize="20%" defaultSize={`${paneLayout.sizes[index] ?? (100 / panes.length)}%`}>
                {renderPane(pane, true, index === 0 ? "left" : index === panes.length - 1 ? "right" : undefined, index)}
              </Panel>
              {index < panes.length - 1 ? <Separator className="terminal-split-handle" aria-label="Terminal-Aufteilung anpassen" /> : null}
            </Fragment>
          ))}
        </Group>
        {parkedPanes.map((pane) => renderPane(pane, false))}
        {dropZone}
      </div>
    );
  }

  return <div className="terminal-canvas">{renderPane(panes[0]!, true, undefined, 0)}{parkedPanes.map((pane) => renderPane(pane, false))}{dropZone}</div>;
}
