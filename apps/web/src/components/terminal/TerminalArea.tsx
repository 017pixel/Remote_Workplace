import { useQuery } from "@tanstack/react-query";
import {
  Columns2,
  Eraser,
  Info,
  MonitorOff,
  Plus,
  RotateCcw,
  SplitSquareHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TerminalKind } from "@workbench/contracts";
import { workbenchQueries } from "../../lib/queryOptions";
import { useIsMobile } from "../../lib/useMediaQuery";
import { MAX_TERMINAL_TABS, useTerminalStore } from "../../stores/terminals";
import { WebTerminal, type TerminalStatus, type WebTerminalHandle } from "./WebTerminal";

interface TerminalMeta {
  status: TerminalStatus;
  cwd: string;
  error: string | null;
}

const statusLabel: Record<TerminalStatus, string> = {
  connecting: "Verbindung wird hergestellt",
  connected: "Verbunden",
  disconnected: "Verbindung getrennt",
  exited: "Prozess beendet",
  error: "Fehler",
};

interface TerminalAreaProps {
  areaId?: string;
  initialProjectId?: string | null;
  kind?: TerminalKind;
  layout?: "tabs" | "bento";
  maxTabs?: number;
  minimal?: boolean;
}

const kindLabels: Record<TerminalKind, string> = {
  shell: "Terminal",
  codex: "Codex",
  opencode: "OpenCode",
};

export function TerminalArea({
  areaId = "standalone",
  initialProjectId = null,
  kind = "shell",
  layout = "tabs",
  maxTabs = MAX_TERMINAL_TABS,
  minimal = false,
}: TerminalAreaProps) {
  const isMobile = useIsMobile();
  const bento = layout === "bento";
  const area = useTerminalStore((state) => state.areas[areaId]);
  const ensureArea = useTerminalStore((state) => state.ensureArea);
  const addTab = useTerminalStore((state) => state.addTab);
  const activateTab = useTerminalStore((state) => state.activateTab);
  const removeTab = useTerminalStore((state) => state.closeTab);
  const splitTab = useTerminalStore((state) => state.splitTab);
  const clearSplit = useTerminalStore((state) => state.clearSplit);
  const setSplitSizes = useTerminalStore((state) => state.setSplitSizes);
  const projects = useQuery(workbenchQueries.projects());
  const handles = useRef(new Map<string, WebTerminalHandle>());
  const longPress = useRef<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<Record<string, TerminalMeta>>({});
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => ensureArea(areaId, initialProjectId, kind), [areaId, ensureArea, initialProjectId, kind]);
  useEffect(() => {
    if (isMobile && area?.splitTabId) clearSplit(areaId);
  }, [area?.splitTabId, areaId, clearSplit, isMobile]);

  const activeTab = area?.tabs.find((tab) => tab.id === area.activeTabId);
  const activeMeta = activeTab ? meta[activeTab.id] : undefined;
  const projectName = (projectId: string | null) => projects.data?.projects.find((project) => project.id === projectId)?.name ?? "Standardpfad";
  const create = useCallback(
    (projectId: string | null = null) => addTab(areaId, projectId, kind),
    [addTab, areaId, kind],
  );
  const nextProjectId = bento ? initialProjectId : (activeTab?.projectId ?? initialProjectId);

  const close = (tabId: string) => {
    handles.current.get(tabId)?.close();
    try { window.sessionStorage.removeItem(`workbench-terminal-session:${tabId}`); } catch { /* ignored */ }
    removeTab(areaId, tabId);
    setMeta((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  const drop = (side: "left" | "right") => {
    if (draggingTabId && !isMobile) splitTab(areaId, draggingTabId, side);
    setDraggingTabId(null);
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canvasRef.current || !area) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = canvasRef.current.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => {
      const first = Math.max(20, Math.min(80, ((moveEvent.clientX - bounds.left) / bounds.width) * 100));
      setSplitSizes(areaId, [first, 100 - first]);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  if (!area) return <div className="terminal-area-loading">Terminal wird vorbereitet…</div>;

  return (
    <section className="terminal-area" data-split={Boolean(area.splitTabId)}>
      {minimal ? <span className="sr-only terminal-connection-status" aria-live="polite">{activeMeta ? statusLabel[activeMeta.status] : statusLabel.connecting}</span> : null}
      {!minimal ? <header className="terminal-area-toolbar">
        <div className="terminal-tabs" role="tablist" aria-label="Terminalsitzungen">
          {area.tabs.map((tab, index) => {
            const currentMeta = meta[tab.id];
            const active = tab.id === area.activeTabId;
            const split = tab.id === area.splitTabId;
            return (
              <div
                key={tab.id}
                className={`terminal-tab ${active ? "is-active" : ""} ${split ? "is-split" : ""}`}
                draggable={!isMobile && !bento}
                onDragStart={(event) => { setDraggingTabId(tab.id); event.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => setDraggingTabId(null)}
                onPointerDown={() => {
                  if (isMobile || bento) return;
                  longPress.current = window.setTimeout(() => setDraggingTabId(tab.id), 450);
                }}
                onPointerUp={() => { if (longPress.current) window.clearTimeout(longPress.current); }}
                onPointerCancel={() => { if (longPress.current) window.clearTimeout(longPress.current); }}
                title={`${kindLabels[tab.kind]} ${index + 1} · ${projectName(tab.projectId)}${currentMeta?.cwd ? ` · ${currentMeta.cwd}` : ""}`}
              >
                <button type="button" role="tab" aria-selected={active} onClick={() => activateTab(areaId, tab.id)}>
                  <span className={`terminal-state is-${currentMeta?.status ?? "connecting"}`} />
                  <span>{index + 1}</span>
                </button>
                <button type="button" className="terminal-tab-close" onClick={() => close(tab.id)} aria-label={`Terminal ${index + 1} schließen`}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="terminal-tab-add"
            onClick={() => create(nextProjectId)}
            disabled={area.tabs.length >= maxTabs}
            aria-label="Neue Terminalsitzung"
            title={area.tabs.length >= maxTabs ? `Maximal ${maxTabs} ${kindLabels[kind]}-Instanzen` : `${kindLabels[kind]} öffnen`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="terminal-actions terminal-island" aria-label="Terminalaktionen">
          <button type="button" onClick={() => create(nextProjectId)} disabled={area.tabs.length >= maxTabs} aria-label={`${kindLabels[kind]}-Instanz öffnen`} title={`${kindLabels[kind]} öffnen`}><Plus className="h-4 w-4" /><span>Neu</span></button>
          <button type="button" onClick={() => activeTab && handles.current.get(activeTab.id)?.restart()} disabled={!activeTab} aria-label="Terminal neu starten" title="Neu starten"><RotateCcw className="h-4 w-4" /><span>Neustart</span></button>
          <button type="button" onClick={() => activeTab && handles.current.get(activeTab.id)?.clear()} disabled={!activeTab} aria-label="Terminal leeren" title="Leeren"><Eraser className="h-4 w-4" /><span>Leeren</span></button>
          {!bento && !isMobile && area.tabs.length > 1 ? (
            area.splitTabId ?
              <button type="button" onClick={() => clearSplit(areaId)} aria-label="Split schließen" title="Split schließen"><Columns2 className="h-4 w-4" /><span>Einzeln</span></button> :
              <button type="button" onClick={() => activeTab && splitTab(areaId, activeTab.id, "left")} aria-label="Terminal teilen" title="Terminal teilen"><SplitSquareHorizontal className="h-4 w-4" /><span>Split</span></button>
          ) : null}
          <button type="button" onClick={() => setInfoOpen((open) => !open)} disabled={!activeTab} aria-label="Terminalinformationen" title="Informationen"><Info className="h-4 w-4" /><span className="terminal-info-label">Info</span></button>
          <button type="button" className="danger" onClick={() => activeTab && close(activeTab.id)} disabled={!activeTab} aria-label="Terminal schließen" title="Schließen"><MonitorOff className="h-4 w-4" /><span>Schließen</span></button>
        </div>
      </header> : null}

      {!minimal && infoOpen && activeTab ? (
        <div className="terminal-info-popover">
          <strong>Terminal {area.tabs.findIndex((tab) => tab.id === activeTab.id) + 1}</strong>
          <span>{projectName(activeTab.projectId)}</span>
          <code>{activeMeta?.cwd ?? "Pfad wird geladen…"}</code>
          <span>{activeMeta ? statusLabel[activeMeta.status] : statusLabel.connecting}</span>
        </div>
      ) : null}

      <div
        ref={canvasRef}
        className={`terminal-canvas ${bento ? `is-bento has-${area.tabs.length}` : ""} ${draggingTabId ? "is-dragging" : ""}`}
        style={area.splitTabId ? {
          gridTemplateColumns: `${area.splitSizes[0]}% ${area.splitSizes[1]}%`,
          "--terminal-split": `${area.splitSizes[0]}%`,
        } as CSSProperties : undefined}
      >
        {area.tabs.length === 0 ? (
          <div className="terminal-empty-state">
            <MonitorOff className="h-6 w-6" />
            <strong>Keine Terminalsitzung geöffnet</strong>
            <button type="button" className="quiet-button-primary" onClick={() => create(initialProjectId)}><Plus className="h-4 w-4" /> {kindLabels[kind]} öffnen</button>
          </div>
        ) : null}
        {area.tabs.map((tab) => {
          const left = tab.id === area.activeTabId;
          const right = tab.id === area.splitTabId;
          const visible = bento ? (!isMobile || left) : (left || right);
          return (
            <div
              key={tab.id}
              data-terminal-index={area.tabs.indexOf(tab)}
              className={`terminal-session-pane ${left ? "is-left" : ""} ${right ? "is-right" : ""} ${visible ? "is-visible" : "is-parked"}`}
              inert={!visible}
              onPointerDown={() => bento && activateTab(areaId, tab.id)}
            >
              <WebTerminal
                ref={(handle) => { if (handle) handles.current.set(tab.id, handle); else handles.current.delete(tab.id); }}
                instanceId={tab.id}
                kind={tab.kind}
                projectId={tab.projectId}
                active={visible}
                onMetaChange={(next) => setMeta((current) => current[tab.id]?.status === next.status && current[tab.id]?.cwd === next.cwd && current[tab.id]?.error === next.error ? current : { ...current, [tab.id]: next })}
              />
            </div>
          );
        })}
        {area.splitTabId ? <button type="button" className="terminal-split-handle" onPointerDown={startResize} aria-label="Terminal-Aufteilung anpassen" /> : null}
        {draggingTabId && !isMobile ? (
          <div className="terminal-drop-zones">
            <button type="button" onDragOver={(event) => event.preventDefault()} onDrop={() => drop("left")} onClick={() => drop("left")}>Links öffnen</button>
            <button type="button" onDragOver={(event) => event.preventDefault()} onDrop={() => drop("right")} onClick={() => drop("right")}>Rechts öffnen</button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
