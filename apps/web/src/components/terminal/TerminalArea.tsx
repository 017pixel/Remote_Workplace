import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ClipboardIcon, CloseIcon, ColumnsIcon, EraserIcon, ListIcon, MonitorOffIcon, PlayIcon, PlusIcon, RetryIcon, SendIcon, SplitIcon } from "../icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { TerminalKind, TerminalSession } from "@workbench/contracts";
import { apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";
import { useResponsiveShell } from "../../lib/useResponsiveShell";
import { MAX_TERMINAL_TABS, useTerminalStore } from "../../stores/terminals";
import { WebTerminal, type TerminalStatus, type WebTerminalHandle } from "./WebTerminal";
import { useRouteActivity } from "../../lib/routeActivity";

interface TerminalMeta {
  status: TerminalStatus;
  cwd: string;
  error: string | null;
  cols: number;
  rows: number;
}

/** Reihenfolge der Sondertasten in der mobilen Bedienleiste. */
const specialKeyRow = ["Esc", "Tab", "↑", "↓", "←", "→", "Pos1", "Ende"] as const;

const statusLabel: Record<TerminalStatus, string> = {
  connecting: "Verbindung wird hergestellt",
  connected: "Verbunden",
  disconnected: "Verbindung getrennt",
  interrupted: "Server wurde neu gestartet",
  exited: "Prozess beendet",
  error: "Fehler",
};

interface TerminalAreaProps {
  areaId?: string;
  initialProjectId?: string | null;
  kind?: TerminalKind;
  renderScale?: number;
  layout?: "tabs" | "bento";
  maxTabs?: number;
  minimal?: boolean;
  requestedSessionId?: string | null;
}

const kindLabels: Record<TerminalKind, string> = {
  shell: "Terminal",
  codex: "Codex",
  opencode: "OpenCode",
  claude: "Claude Code",
};

/** Kurzform für die Tab-Leiste, gesetzt in Mono wie in einem Terminal-Emulator. */
const tabKindLabels: Record<TerminalKind, string> = {
  shell: "shell",
  codex: "codex",
  opencode: "opencode",
  claude: "claude",
};

export function TerminalArea({
  areaId = "standalone",
  initialProjectId = null,
  kind = "shell",
  renderScale = 1,
  layout = "tabs",
  maxTabs = MAX_TERMINAL_TABS,
  minimal = false,
  requestedSessionId = null,
}: TerminalAreaProps) {
  const responsive = useResponsiveShell();
  const routeActive = useRouteActivity();
  const isMobile = responsive.isTouchShell;
  const singlePane = responsive.mode === "compact" || (responsive.mode === "tablet" && responsive.orientation === "portrait");
  const bento = layout === "bento";
  const area = useTerminalStore((state) => state.areas[areaId]);
  const ensureArea = useTerminalStore((state) => state.ensureArea);
  const addTab = useTerminalStore((state) => state.addTab);
  const addExistingTab = useTerminalStore((state) => state.addExistingTab);
  const activateTab = useTerminalStore((state) => state.activateTab);
  const removeTab = useTerminalStore((state) => state.closeTab);
  const splitTab = useTerminalStore((state) => state.splitTab);
  const clearSplit = useTerminalStore((state) => state.clearSplit);
  const setSplitSizes = useTerminalStore((state) => state.setSplitSizes);
  const setRuntimeCwd = useTerminalStore((state) => state.setRuntimeCwd);
  const projects = useQuery({ ...workbenchQueries.projects(), enabled: routeActive });
  const sessions = useQuery({ ...workbenchQueries.terminalSessions(), refetchInterval: false, enabled: routeActive });
  const handles = useRef(new Map<string, WebTerminalHandle>());
  const longPress = useRef<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<Record<string, TerminalMeta>>({});
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  // Die Aktionen in der Toolbar liegen hinter einem Aufklappmenü, damit die
  // Werkzeugleiste ruhig bleibt. Das Menü schließt bei Außenklick und Escape.
  const [actionsOpen, setActionsOpen] = useState(false);
  // Die Bedienleiste auf dem Handy zeigt entweder die Sondertasten oder die
  // Sitzungsaktionen. Strg und Alt rasten für genau einen Tastendruck ein.
  const [keyboardRow, setKeyboardRow] = useState<"keys" | "actions">("keys");
  const [stickyCtrl, setStickyCtrl] = useState(false);
  const [stickyAlt, setStickyAlt] = useState(false);
  const activeTab = area?.tabs.find((tab) => tab.id === area.activeTabId);
  const activeMeta = activeTab ? meta[activeTab.id] : undefined;

  useEffect(() => ensureArea(areaId, initialProjectId, kind), [areaId, ensureArea, initialProjectId, kind]);
  useEffect(() => {
    if (!actionsOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) setActionsOpen(false);
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
  useEffect(() => {
    if (!requestedSessionId || !sessions.data || !area) return;
    const session = sessions.data.sessions.find((candidate) => candidate.id === requestedSessionId || candidate.runtimeId === requestedSessionId);
    if (!session) return;
    if (!area.tabs.some((tab) => tab.id === session.runtimeId)) addExistingTab(areaId, { id: session.runtimeId, projectId: session.projectId, kind: session.kind });
    if (area.activeTabId !== session.runtimeId) activateTab(areaId, session.runtimeId);
  }, [activateTab, addExistingTab, area, areaId, requestedSessionId, sessions.data]);
  useEffect(() => {
    if (singlePane && area?.splitTabId) clearSplit(areaId);
  }, [area?.splitTabId, areaId, clearSplit, singlePane]);

  const projectName = (projectId: string | null, cwd?: string) => projects.data?.projects.find((project) => project.id === projectId)?.name
    ?? (cwd ? projects.data?.projects.find((project) => project.path === cwd)?.name : undefined)
    ?? "Standardpfad";
  const create = useCallback(
    (projectId: string | null = null) => addTab(areaId, projectId, kind),
    [addTab, areaId, kind],
  );
  const runAction = (action: () => void) => {
    setActionsOpen(false);
    action();
  };
  const nextProjectId = bento ? initialProjectId : (activeTab?.projectId ?? initialProjectId);

  const close = (tabId: string) => {
    handles.current.get(tabId)?.close();
    removeTab(areaId, tabId);
    setMeta((current) => {
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  };

  const openExisting = (session: TerminalSession) => {
    addExistingTab(areaId, { id: session.runtimeId, projectId: session.projectId, kind: session.kind });
  };

  const closeOrphan = async (session: TerminalSession) => {
    await apiClient.closeTerminalSession(session.id);
    await sessions.refetch();
  };

  const restartOrphan = async (session: TerminalSession) => {
    await apiClient.restartTerminalSession(session.id);
    await sessions.refetch();
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

  const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!area?.splitTabId) return;
    const step = event.shiftKey ? 10 : 2;
    const next = event.key === "Home" ? 20
      : event.key === "End" ? 80
        : event.key === "ArrowLeft" ? area.splitSizes[0] - step
          : event.key === "ArrowRight" ? area.splitSizes[0] + step
            : null;
    if (next === null) return;
    event.preventDefault();
    const first = Math.max(20, Math.min(80, next));
    setSplitSizes(areaId, [first, 100 - first]);
  };

  const sessionPicker = minimal ? null : (
    <details className="terminal-session-picker">
      <summary aria-label="Laufende Sessions anzeigen" title="Laufende Sessions"><ListIcon className="h-4 w-4" /><span>Sessions</span></summary>
      <div className="terminal-session-picker-menu">
        <strong>Laufende {kindLabels[kind]}-Sessions</strong>
        {(sessions.data?.sessions ?? []).filter((session) => session.kind === kind).map((session) => (
          <div key={session.id} className="terminal-session-picker-row">
            <div className="min-w-0">
              <span className="terminal-session-picker-title"><span className={`terminal-state is-${session.status === "running" ? "connected" : session.status}`} />{session.projectId ?? "Standardpfad"}</span>
              <small>{session.status === "running" ? `${session.connectedClients} Gerät${session.connectedClients === 1 ? "" : "e"}` : session.status} · {new Date(session.updatedAt).toLocaleTimeString()}</small>
            </div>
            <div className="terminal-session-picker-actions">
              {session.status !== "running" ? <button type="button" onClick={() => void restartOrphan(session)} aria-label="Session neu starten" title="Neu starten"><PlayIcon className="h-3.5 w-3.5" /></button> : null}
              {!area?.tabs.some((tab) => tab.id === session.runtimeId) ? <button type="button" onClick={() => openExisting(session)} aria-label="Session öffnen" title="Öffnen"><PlusIcon className="h-3.5 w-3.5" /></button> : null}
              <button type="button" onClick={() => void closeOrphan(session)} aria-label="Session beenden" title="Beenden"><CloseIcon className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {!(sessions.data?.sessions ?? []).some((session) => session.kind === kind) ? <span className="terminal-session-picker-empty">Keine gespeicherten Sessions</span> : null}
      </div>
    </details>
  );

  const activeHandle = () => (activeTab ? handles.current.get(activeTab.id) ?? null : null);
  const pressKey = (key: string) => {
    activeHandle()?.sendKey(key, { ctrl: stickyCtrl, alt: stickyAlt });
    setStickyCtrl(false);
    setStickyAlt(false);
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
                title={`${kindLabels[tab.kind]} ${index + 1} · ${projectName(tab.projectId, currentMeta?.cwd)}${currentMeta?.cwd ? ` · ${currentMeta.cwd}` : ""}`}
              >
                <button type="button" role="tab" aria-selected={active} onClick={() => activateTab(areaId, tab.id)}>
                  <span className={`terminal-state is-${currentMeta?.status ?? "connecting"}`} />
                  <span className="terminal-tab-index">{index + 1}</span>
                  <span className="terminal-tab-kind">{tabKindLabels[tab.kind]}</span>
                </button>
                <button type="button" className="terminal-tab-close" onClick={() => close(tab.id)} aria-label={`Terminal ${index + 1} schließen`}>
                  <CloseIcon className="h-3 w-3" />
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
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Auf dem Handy sitzen die Aktionen unten in der Bedienleiste, hier
            bleiben sie hinter dem Aktionen-Menü verborgen. */}
        <div className="terminal-actions terminal-action-bar" aria-label="Terminalaktionen" hidden={isMobile}>
          <div className="terminal-action-menu" ref={actionMenuRef}>
            <button type="button" className="terminal-action-trigger" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => setActionsOpen((open) => !open)} aria-label="Terminalaktionen">
              <ChevronDownIcon className={`h-4 w-4 ${actionsOpen ? "is-open" : ""}`} aria-hidden />
              <span>Aktionen</span>
            </button>
            {actionsOpen ? (
              <div className="terminal-action-popover" role="menu" aria-label="Terminalaktionen">
                <button type="button" role="menuitem" onClick={() => runAction(() => create(nextProjectId))} disabled={area.tabs.length >= maxTabs} aria-label={`${kindLabels[kind]}-Instanz öffnen`}><PlusIcon className="h-4 w-4" aria-hidden /><span>Neu</span></button>
                <button type="button" role="menuitem" onClick={() => runAction(() => activeTab && handles.current.get(activeTab.id)?.restart())} disabled={!activeTab} aria-label="Terminal neu starten"><RetryIcon className="h-4 w-4" aria-hidden /><span>Neustart</span></button>
                <button type="button" role="menuitem" onClick={() => runAction(() => activeTab && handles.current.get(activeTab.id)?.clear())} disabled={!activeTab} aria-label="Terminal leeren"><EraserIcon className="h-4 w-4" aria-hidden /><span>Leeren</span></button>
                {!bento && !singlePane && area.tabs.length > 1 ? (
                  area.splitTabId ?
                    <button type="button" role="menuitem" onClick={() => runAction(() => clearSplit(areaId))} aria-label="Split schließen"><ColumnsIcon className="h-4 w-4" aria-hidden /><span>Einzeln</span></button> :
                    <button type="button" role="menuitem" onClick={() => runAction(() => activeTab && splitTab(areaId, activeTab.id, "left"))} disabled={!activeTab} aria-label="Terminal teilen"><SplitIcon className="h-4 w-4" aria-hidden /><span>Split</span></button>
                ) : null}
                <button type="button" role="menuitem" className="danger" onClick={() => runAction(() => activeTab && close(activeTab.id))} disabled={!activeTab} aria-label="Terminal schließen"><MonitorOffIcon className="h-4 w-4" aria-hidden /><span>Schließen</span></button>
                {sessionPicker}
              </div>
            ) : null}
          </div>
        </div>
      </header> : null}

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
            <MonitorOffIcon className="h-6 w-6" />
            <strong>Keine Terminalsitzung geöffnet</strong>
            <button type="button" className="quiet-button-primary" onClick={() => create(initialProjectId)}><PlusIcon className="h-4 w-4" /> {kindLabels[kind]} öffnen</button>
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
                active={routeActive && visible}
                keepAlive={visible}
                renderScale={renderScale}
                onMetaChange={(next) => setMeta((current) => {
                  setRuntimeCwd(tab.id, next.cwd);
                  const previous = current[tab.id];
                  if (previous?.status === next.status && previous.cwd === next.cwd && previous.error === next.error && previous.cols === next.cols && previous.rows === next.rows) return current;
                  return { ...current, [tab.id]: next };
                })}
              />
            </div>
          );
        })}
        {area.splitTabId ? <button type="button" className="terminal-split-handle" onPointerDown={startResize} onKeyDown={resizeWithKeyboard}
          role="separator" aria-orientation="vertical" aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(area.splitSizes[0])}
          aria-label="Terminal-Aufteilung anpassen" /> : null}
        {draggingTabId && !isMobile ? (
          <div className="terminal-drop-zones">
            <button type="button" onDragOver={(event) => event.preventDefault()} onDrop={() => drop("left")} onClick={() => drop("left")}>Links öffnen</button>
            <button type="button" onDragOver={(event) => event.preventDefault()} onDrop={() => drop("right")} onClick={() => drop("right")}>Rechts öffnen</button>
          </div>
        ) : null}
      </div>

      {/* Bedienleiste am unteren Rand: auf dem Handy Sondertasten und Aktionen
          in einer Leiste, auf größeren Flächen die Statuszeile der Sitzung. */}
      {!minimal && isMobile ? (
        <div className="terminal-keybar" data-row={keyboardRow}>
          <div className="terminal-keybar-rows">
            {keyboardRow === "keys" ? (
              <div className="terminal-keybar-keys" aria-label="Terminal-Sondertasten">
                <button type="button" className={stickyCtrl ? "is-active" : ""} aria-pressed={stickyCtrl} onClick={() => setStickyCtrl(!stickyCtrl)}>ctrl</button>
                <button type="button" className={stickyAlt ? "is-active" : ""} aria-pressed={stickyAlt} onClick={() => setStickyAlt(!stickyAlt)}>alt</button>
                {specialKeyRow.map((key) => (
                  <button type="button" key={key} onClick={() => pressKey(key)}>{key.toLowerCase()}</button>
                ))}
                <button type="button" onClick={() => pressKey("c")} title="Strg-C senden">^c</button>
                <button type="button" onClick={() => activeHandle()?.pasteFromClipboard()} aria-label="Aus Zwischenablage einfügen"><ClipboardIcon className="h-4 w-4" /></button>
                <button type="button" onClick={() => activeHandle()?.focus()} aria-label="Tastatur öffnen"><SendIcon className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="terminal-keybar-actions" aria-label="Terminalaktionen">
                <button type="button" onClick={() => create(nextProjectId)} disabled={area.tabs.length >= maxTabs}><PlusIcon className="h-4 w-4" /><span>Neu</span></button>
                <button type="button" onClick={() => activeHandle()?.restart()} disabled={!activeTab}><RetryIcon className="h-4 w-4" /><span>Neustart</span></button>
                <button type="button" onClick={() => activeHandle()?.clear()} disabled={!activeTab}><EraserIcon className="h-4 w-4" /><span>Leeren</span></button>
                {sessionPicker}
                <button type="button" className="danger" onClick={() => activeTab && close(activeTab.id)} disabled={!activeTab}><MonitorOffIcon className="h-4 w-4" /><span>Schließen</span></button>
              </div>
            )}
          </div>
          <div className="terminal-keybar-switch" role="tablist" aria-label="Bedienleiste umschalten">
            <button type="button" role="tab" aria-selected={keyboardRow === "keys"} className={keyboardRow === "keys" ? "is-active" : ""} onClick={() => setKeyboardRow("keys")}>Tasten</button>
            <button type="button" role="tab" aria-selected={keyboardRow === "actions"} className={keyboardRow === "actions" ? "is-active" : ""} onClick={() => setKeyboardRow("actions")}>Aktionen</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
