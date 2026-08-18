import { useQuery } from "@tanstack/react-query";
import { MonitorOffIcon, PlusIcon } from "../icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalKind, TerminalSession } from "@workbench/contracts";
import { Group, Panel, Separator, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import { apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";
import { useResponsiveShell } from "../../lib/useResponsiveShell";
import { useRouteActivity } from "../../lib/routeActivity";
import { MAX_TERMINAL_TABS, useTerminalStore } from "../../stores/terminals";
import { WebTerminal, type WebTerminalHandle } from "./WebTerminal";
import { TerminalToolbar } from "./terminal-toolbar";
import { TerminalKeybar } from "./terminal-keybar";
import { TerminalSessionPicker } from "./terminal-session-picker";
import { kindLabels, statusLabel } from "./terminal-labels";
import type { TerminalMeta } from "./terminal-types";

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
  const openSplit = useTerminalStore((state) => state.openSplit);
  const splitTab = useTerminalStore((state) => state.splitTab);
  const clearSplit = useTerminalStore((state) => state.clearSplit);
  const setSplitSizes = useTerminalStore((state) => state.setSplitSizes);
  const setRuntimeCwd = useTerminalStore((state) => state.setRuntimeCwd);
  const projects = useQuery({ ...workbenchQueries.projects(), enabled: routeActive });
  const sessions = useQuery({ ...workbenchQueries.terminalSessions(), refetchInterval: false, enabled: routeActive });
  const handles = useRef(new Map<string, WebTerminalHandle>());
  const longPress = useRef<number | null>(null);
  const splitSaveFrame = useRef<number | null>(null);
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
    if (!routeActive || !requestedSessionId || !sessions.data || !area) return;
    const session = sessions.data.sessions.find((candidate) => candidate.id === requestedSessionId || candidate.runtimeId === requestedSessionId);
    if (!session) return;
    if (!area.tabs.some((tab) => tab.id === session.runtimeId)) addExistingTab(areaId, { id: session.runtimeId, projectId: session.projectId, kind: session.kind, initialCwd: session.cwd });
    if (area.activeTabId !== session.runtimeId) activateTab(areaId, session.runtimeId);
  }, [activateTab, addExistingTab, area, areaId, requestedSessionId, routeActive, sessions.data]);

  const projectName = (projectId: string | null, cwd?: string) => projects.data?.projects.find((project) => project.id === projectId)?.name
    ?? (cwd ? projects.data?.projects.find((project) => project.path === cwd)?.name : undefined)
    ?? "Standardpfad";
  const create = useCallback(
    (projectId: string | null = null) => {
      // Ohne Projektkontext startet das neue Terminal dort, wo das letzte
      // aufgehört hat. Mit Projektkontext (Picker, Projektseite) öffnet der
      // Server den Projektordner.
      const lastCwd = activeTab ? (meta[activeTab.id]?.cwd.startsWith("/") ? meta[activeTab.id]!.cwd : null) : null;
      const effectiveProjectId = projectId ?? (lastCwd ? null : (activeTab?.projectId ?? null));
      addTab(areaId, effectiveProjectId, kind, effectiveProjectId ? null : lastCwd);
    },
    [addTab, activeTab, areaId, kind, meta],
  );
  const runAction = (action: () => void) => {
    setActionsOpen(false);
    action();
  };
  // Im Tab-Layout startet ein neues Terminal ohne Projektkontext im letzten
  // Arbeitsverzeichnis statt im statisch gespeicherten Projekt des Tabs.
  const nextProjectId = bento ? initialProjectId : (activeTab ? null : initialProjectId);

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
    addExistingTab(areaId, { id: session.runtimeId, projectId: session.projectId, kind: session.kind, initialCwd: session.cwd });
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

  const createSplit = () => {
    if (!activeTab) return;
    const currentCwd = activeMeta?.cwd.startsWith("/") ? activeMeta.cwd : activeTab.initialCwd;
    openSplit(areaId, activeTab.projectId, activeTab.kind, currentCwd);
  };

  const saveSplitLayout = (layout: Layout, details: LayoutChangedMeta) => {
    if (!details.isUserInteraction) return;
    if (!area?.splitTabIds) return;
    const firstRaw = layout[area.splitTabIds[0]];
    const secondRaw = layout[area.splitTabIds[1]];
    if (firstRaw === undefined || secondRaw === undefined || firstRaw + secondRaw <= 0) return;
    const first = Math.max(20, Math.min(80, (firstRaw / (firstRaw + secondRaw)) * 100));
    if (splitSaveFrame.current !== null) window.cancelAnimationFrame(splitSaveFrame.current);
    splitSaveFrame.current = window.requestAnimationFrame(() => {
      splitSaveFrame.current = null;
      setSplitSizes(areaId, [first, 100 - first]);
    });
  };

  useEffect(() => () => {
    if (splitSaveFrame.current !== null) window.cancelAnimationFrame(splitSaveFrame.current);
  }, []);

  const sessionPicker = minimal ? null : (
    <TerminalSessionPicker
      kind={kind}
      sessions={sessions.data?.sessions ?? []}
      openTabIds={area?.tabs.map((tab) => tab.id) ?? []}
      onOpen={openExisting}
      onRestart={restartOrphan}
      onClose={closeOrphan}
    />
  );

  const activeHandle = () => (activeTab ? handles.current.get(activeTab.id) ?? null : null);
  const pressKey = (key: string) => {
    activeHandle()?.sendKey(key, { ctrl: stickyCtrl, alt: stickyAlt });
    setStickyCtrl(false);
    setStickyAlt(false);
  };

  if (!area) return <div className="terminal-area-loading">Terminal wird vorbereitet…</div>;

  return (
    <section className="terminal-area" data-split={Boolean(area.splitTabIds)}>
      {minimal ? <span className="sr-only terminal-connection-status" aria-live="polite">{activeMeta ? statusLabel[activeMeta.status] : statusLabel.connecting}</span> : null}
      {!minimal ? (
        <TerminalToolbar
          tabs={area.tabs}
          activeTabId={area.activeTabId}
          splitTabIds={area.splitTabIds}
          meta={meta}
          kind={kind}
          maxTabs={maxTabs}
          isMobile={isMobile}
          bento={bento}
          singlePane={singlePane}
          actionsOpen={actionsOpen}
          activeTab={activeTab}
          handles={handles.current}
          actionMenuRef={actionMenuRef}
          longPress={longPress}
          projectName={projectName}
          onActivateTab={(tabId) => activateTab(areaId, tabId)}
          onClose={close}
          onCreate={() => create(nextProjectId)}
          onClearSplit={() => clearSplit(areaId)}
          onCreateSplit={createSplit}
          onRunAction={runAction}
          onSetActionsOpen={setActionsOpen}
          onSetDraggingTabId={setDraggingTabId}
          sessionPicker={sessionPicker}
        />
      ) : null}

      <div className={`terminal-canvas ${bento ? `is-bento has-${area.tabs.length}` : ""} ${draggingTabId ? "is-dragging" : ""}`}>
        {area.tabs.length === 0 ? (
          <div className="terminal-empty-state">
            <MonitorOffIcon className="h-6 w-6" />
            <strong>Keine Terminalsitzung geöffnet</strong>
            <button type="button" className="quiet-button-primary" onClick={() => create(initialProjectId)}><PlusIcon className="h-4 w-4" /> {kindLabels[kind]} öffnen</button>
          </div>
        ) : null}
        {(() => {
          const renderPane = (tab: typeof area.tabs[number], visible: boolean, position?: "left" | "right") => (
            <div
              key={tab.id}
              data-terminal-index={area.tabs.indexOf(tab)}
              data-pane-position={position}
              className={`terminal-session-pane ${tab.id === area.activeTabId ? "is-focused" : ""} ${visible ? "is-visible" : "is-parked"}`}
              inert={!visible}
              onPointerDown={() => visible && activateTab(areaId, tab.id)}
            >
              <WebTerminal
                ref={(handle) => { if (handle) handles.current.set(tab.id, handle); else handles.current.delete(tab.id); }}
                instanceId={tab.id}
                kind={tab.kind}
                projectId={tab.projectId}
                initialCwd={tab.initialCwd}
                active={routeActive && visible}
                // Hintergrund-Tabs und geparkte Routen bleiben verbunden: Ihre
                // Ausgabe läuft in den Puffer, die Statuskugel bleibt grün und
                // beim Zurückwechseln ist der Inhalt sofort da.
                keepAlive
                renderScale={renderScale}
                onMetaChange={(next) => {
                  setRuntimeCwd(tab.id, next.cwd);
                  setMeta((current) => {
                    const previous = current[tab.id];
                    if (previous?.status === next.status && previous.cwd === next.cwd && previous.error === next.error && previous.cols === next.cols && previous.rows === next.rows) return current;
                    return { ...current, [tab.id]: next };
                  });
                }}
              />
            </div>
          );
          if (bento) return area.tabs.map((tab) => renderPane(tab, !isMobile || tab.id === area.activeTabId));
          const splitTabs = !singlePane && area.splitTabIds
            ? area.splitTabIds.map((tabId) => area.tabs.find((tab) => tab.id === tabId)).filter((tab): tab is typeof area.tabs[number] => Boolean(tab))
            : [];
          const visibleIds = new Set(splitTabs.length === 2 ? splitTabs.map((tab) => tab.id) : area.activeTabId ? [area.activeTabId] : []);
          return (
            <>
              {splitTabs.length === 2 ? (
                <Group
                  key={splitTabs.map((tab) => tab.id).join(":")}
                  id={`terminal-split-${areaId}`}
                  className="terminal-split-group"
                  orientation="horizontal"
                  defaultLayout={{ [splitTabs[0]!.id]: area.splitSizes[0], [splitTabs[1]!.id]: area.splitSizes[1] }}
                  onLayoutChanged={saveSplitLayout}
                  resizeTargetMinimumSize={{ coarse: 44, fine: 20 }}
                >
                  <Panel id={splitTabs[0]!.id} minSize="20%" defaultSize={`${area.splitSizes[0]}%`}>{renderPane(splitTabs[0]!, true, "left")}</Panel>
                  <Separator className="terminal-split-handle" aria-label="Terminal-Aufteilung anpassen" />
                  <Panel id={splitTabs[1]!.id} minSize="20%" defaultSize={`${area.splitSizes[1]}%`}>{renderPane(splitTabs[1]!, true, "right")}</Panel>
                </Group>
              ) : area.activeTabId ? (() => {
                const tab = area.tabs.find((candidate) => candidate.id === area.activeTabId);
                return tab ? renderPane(tab, true) : null;
              })() : null}
              {area.tabs.filter((tab) => !visibleIds.has(tab.id)).map((tab) => renderPane(tab, false))}
            </>
          );
        })()}
        {draggingTabId && !isMobile ? (
          <div className="terminal-drop-zones">
            <button type="button" onDragOver={(event) => event.preventDefault()} onDrop={() => drop("left")} onClick={() => drop("left")}>Links öffnen</button>
            <button type="button" onDragOver={(event) => event.preventDefault()} onDrop={() => drop("right")} onClick={() => drop("right")}>Rechts öffnen</button>
          </div>
        ) : null}
      </div>

      {!minimal && isMobile ? (
        <TerminalKeybar
          keyboardRow={keyboardRow}
          stickyCtrl={stickyCtrl}
          stickyAlt={stickyAlt}
          hasActiveTab={Boolean(activeTab)}
          tabsFull={area.tabs.length >= maxTabs}
          sessionPicker={sessionPicker}
          onSendKey={pressKey}
          onPaste={() => activeHandle()?.pasteFromClipboard()}
          onFocus={() => activeHandle()?.focus()}
          onCreate={() => create(nextProjectId)}
          onRestart={() => activeHandle()?.restart()}
          onClear={() => activeHandle()?.clear()}
          onClose={() => activeTab && close(activeTab.id)}
          onToggleCtrl={() => setStickyCtrl(!stickyCtrl)}
          onToggleAlt={() => setStickyAlt(!stickyAlt)}
          onSetKeyboardRow={setKeyboardRow}
        />
      ) : null}
    </section>
  );
}
