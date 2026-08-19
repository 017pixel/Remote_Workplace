import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Group, Panel, Separator, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import type { TerminalKind, TerminalPaneLayout, TerminalSession } from "@wrapt/contracts";
import { ChevronRightIcon, MenuIcon, MonitorOffIcon, PlusIcon, TerminalIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { useResponsiveShell } from "../../lib/useResponsiveShell";
import { usePaneWidth } from "../../lib/usePaneWidth";
import { useRouteActivity } from "../../lib/routeActivity";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";
import { kindLabels, statusLabel } from "./terminal-labels";
import { TerminalKeybar } from "./terminal-keybar";
import { TerminalSessionPicker } from "./terminal-session-picker";
import { TerminalSidebar } from "./sidebar/TerminalSidebar";
import { WebTerminal, type WebTerminalHandle } from "./WebTerminal";
import type { TerminalMeta } from "./terminal-types";
import {
  createTerminalOps,
  layoutRuntimeIds,
  openEntryOps,
  paneForRuntime,
  removeRuntimeFromLayout,
} from "./workspace/terminalWorkspaceModel";

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

interface VisiblePane { id: string; runtimeId: string; }

function layoutPanes(layout: TerminalPaneLayout | null): VisiblePane[] {
  if (!layout) return [];
  return layout.type === "pane" ? [{ id: layout.id, runtimeId: layout.runtimeId }] : layout.children;
}

export function TerminalArea({
  areaId = "standalone",
  initialProjectId = null,
  kind = "shell",
  renderScale = 1,
  layout = "tabs",
  minimal = false,
  requestedSessionId = null,
}: TerminalAreaProps) {
  const responsive = useResponsiveShell();
  const routeActive = useRouteActivity();
  const isMobile = responsive.isTouchShell;
  const bento = layout === "bento";
  const terminalSidebar = usePaneWidth({ storageKey: "wrapt.terminal-sidebar.v1", initial: 256, min: 220, max: 420 });
  const document = useTerminalWorkspaceStore((state) => state.document);
  const queueOps = useTerminalWorkspaceStore((state) => state.queueOps);
  const setRuntimeCwd = useTerminalWorkspaceStore((state) => state.setRuntimeCwd);
  const runtimeCwds = useTerminalWorkspaceStore((state) => state.runtimeCwds);
  const sessions = useQuery({ ...wraptQueries.terminalSessions(), refetchInterval: false, enabled: routeActive });
  const health = useQuery(wraptQueries.health());
  const handles = useRef(new Map<string, WebTerminalHandle>());
  const splitSaveFrame = useRef<number | null>(null);
  const requestedHandledRef = useRef(false);
  const [meta, setMeta] = useState<Record<string, TerminalMeta>>({});
  const [sidebarVisible, setSidebarVisible] = useState(!isMobile);
  const [keyboardRow, setKeyboardRow] = useState<"keys" | "actions">("keys");
  const [stickyCtrl, setStickyCtrl] = useState(false);
  const [stickyAlt, setStickyAlt] = useState(false);

  useEffect(() => {
    globalThis.document.documentElement.style.setProperty("--terminal-sidebar-width", `${terminalSidebar.width}px`);
  }, [terminalSidebar.width]);

  const toggleNativeFullscreen = useCallback(() => {
    if (globalThis.document.fullscreenElement) void globalThis.document.exitFullscreen();
    else void globalThis.document.documentElement.requestFullscreen?.();
  }, []);

  const areaLayout = document?.areaLayouts[areaId] ?? null;
  const paneLayout = areaLayout?.paneLayout ?? null;
  const focusedPaneId = areaLayout?.focusedPaneId ?? null;
  const panes = layoutPanes(paneLayout);
  const focusedRuntimeId = (() => {
    if (!paneLayout) return null;
    if (paneLayout.type === "pane") return paneLayout.runtimeId;
    return paneLayout.children.find((pane) => pane.id === focusedPaneId)?.runtimeId ?? paneLayout.children[0]!.runtimeId;
  })();
  const activeMeta = focusedRuntimeId ? meta[focusedRuntimeId] : undefined;
  const hasActivePane = panes.length > 0;
  const hasSplit = paneLayout?.type === "split";
  const showSingleMobilePane = isMobile && responsive.orientation === "portrait";

  const openEntry = useCallback((runtimeId: string) => {
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return;
    queueOps(openEntryOps(state.document, areaId, runtimeId));
  }, [areaId, queueOps]);

  const openInSplit = useCallback((runtimeId: string) => {
    const state = useTerminalWorkspaceStore.getState();
    const doc = state.document;
    if (!doc) return;
    const current = doc.areaLayouts[areaId]?.paneLayout ?? null;
    const currentPanes = layoutPanes(current);
    const targetPane = paneForRuntime(runtimeId);
    let next: TerminalPaneLayout;
    if (currentPanes.length === 0) next = targetPane;
    else if (current?.type === "pane") {
      next = { type: "split", id: `split-${Date.now()}`, orientation: "horizontal", sizes: [50, 50], children: [current, targetPane] };
    } else if (current) {
      const focusIndex = Math.max(0, current.children.findIndex((pane) => pane.id === focusedPaneId));
      const otherIndex = focusIndex === 0 ? 1 : 0;
      const children = current.children.map((pane, index) => index === otherIndex ? targetPane : pane);
      next = { ...current, children };
    } else {
      next = targetPane;
    }
    queueOps([
      { type: "setPaneLayout", areaId, layout: next },
      { type: "setFocusedPane", areaId, paneId: targetPane.id },
    ]);
  }, [areaId, focusedPaneId, queueOps]);

  const create = useCallback((folderId: string | null = null, projectId: string | null = initialProjectId) => {
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return null;
    const count = state.document.entries.filter((entry) => entry.kind === kind).length + 1;
    const { ops, runtimeId } = createTerminalOps(state.document, areaId, {
      kind,
      projectId,
      name: `${kindLabels[kind]} ${count}`,
      ...(folderId !== null ? { parentFolderId: folderId } : {}),
    });
    queueOps(ops);
    return runtimeId;
  }, [areaId, initialProjectId, kind, queueOps]);

  const createSplit = useCallback(() => {
    const state = useTerminalWorkspaceStore.getState();
    const doc = state.document;
    if (!doc) return;
    const count = doc.entries.filter((entry) => entry.kind === kind).length + 1;
    const { ops, runtimeId } = createTerminalOps(doc, areaId, { kind, name: `${kindLabels[kind]} ${count}` });
    if (!hasActivePane) { state.queueOps(ops); return; }
    const current = doc.areaLayouts[areaId]?.paneLayout ?? null;
    const targetPane = paneForRuntime(runtimeId);
    let next: TerminalPaneLayout;
    if (current === null || current.type === "pane") {
      const source = current ?? paneForRuntime(focusedRuntimeId ?? layoutRuntimeIds(current ?? null)[0] ?? "");
      next = { type: "split", id: `split-${Date.now()}`, orientation: "horizontal", sizes: [50, 50], children: [source, targetPane] };
    } else {
      const focusIndex = Math.max(0, current.children.findIndex((pane) => pane.id === focusedPaneId));
      const otherIndex = focusIndex === 0 ? 1 : 0;
      next = { ...current, children: current.children.map((pane, index) => index === otherIndex ? targetPane : pane) };
    }
    state.queueOps([...ops, { type: "setPaneLayout", areaId, layout: next }, { type: "setFocusedPane", areaId, paneId: targetPane.id }]);
  }, [areaId, focusedPaneId, focusedRuntimeId, hasActivePane, kind]);

  const closePane = useCallback((runtimeId: string) => {
    const state = useTerminalWorkspaceStore.getState();
    const doc = state.document;
    if (!doc) return;
    const current = doc.areaLayouts[areaId]?.paneLayout ?? null;
    const next = removeRuntimeFromLayout(current, runtimeId);
    queueOps([{ type: "setPaneLayout", areaId, layout: next }]);
  }, [areaId, queueOps]);

  const clearSplit = useCallback(() => {
    if (!focusedRuntimeId) return;
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return;
    queueOps([
      { type: "setPaneLayout", areaId, layout: paneForRuntime(focusedRuntimeId) },
      { type: "setFocusedPane", areaId, paneId: paneForRuntime(focusedRuntimeId).id },
    ]);
  }, [areaId, focusedRuntimeId, queueOps]);

  const saveSplitLayout = useCallback((layoutData: Layout, details: LayoutChangedMeta) => {
    if (!details.isUserInteraction || paneLayout?.type !== "split") return;
    const children = paneLayout.children;
    const firstRaw = layoutData[children[0]!.id];
    const secondRaw = layoutData[children[1]!.id];
    if (firstRaw === undefined || secondRaw === undefined || firstRaw + secondRaw <= 0) return;
    const first = Math.max(20, Math.min(80, (firstRaw / (firstRaw + secondRaw)) * 100));
    if (splitSaveFrame.current !== null) window.cancelAnimationFrame(splitSaveFrame.current);
    splitSaveFrame.current = window.requestAnimationFrame(() => {
      splitSaveFrame.current = null;
      const state = useTerminalWorkspaceStore.getState();
      if (!state.document) return;
      const current = state.document.areaLayouts[areaId]?.paneLayout;
      if (current?.type === "split") {
        queueOps([{ type: "setPaneLayout", areaId, layout: { ...current, sizes: [first, 100 - first] } }]);
      }
    });
  }, [areaId, paneLayout, queueOps]);

  useEffect(() => () => {
    if (splitSaveFrame.current !== null) window.cancelAnimationFrame(splitSaveFrame.current);
  }, []);

  // Tiefenlink: eine laufende Session in dieser Fläche öffnen.
  useEffect(() => {
    if (!routeActive || !requestedSessionId || requestedHandledRef.current || !document || !sessions.data) return;
    const session = sessions.data.sessions.find((candidate) => candidate.id === requestedSessionId || candidate.runtimeId === requestedSessionId);
    if (!session) return;
    requestedHandledRef.current = true;
    const existing = document.entries.find((entry) => entry.runtimeId === session.runtimeId);
    const state = useTerminalWorkspaceStore.getState();
    if (existing) state.queueOps(openEntryOps(document, areaId, session.runtimeId));
    else {
      const count = document.entries.filter((entry) => entry.kind === session.kind).length + 1;
      state.queueOps([
        { type: "createEntry", entry: { id: `entry-${session.runtimeId}`, runtimeId: session.runtimeId, name: `${kindLabels[session.kind]} ${count}`, parentFolderId: null, sortOrder: document.entries.length, pinned: false, persistent: false, kind: session.kind, projectId: session.projectId, initialCwd: session.cwd } },
        ...openEntryOps(document, areaId, session.runtimeId),
      ]);
    }
  }, [areaId, document, requestedSessionId, routeActive, sessions.data]);

  const sessionPicker = minimal ? null : (
    <TerminalSessionPicker
      kind={kind}
      sessions={sessions.data?.sessions ?? []}
      openTabIds={panes.map((pane) => pane.runtimeId)}
      onOpen={(session) => openEntry(session.runtimeId)}
      onRestart={async (session: TerminalSession) => { await apiClient.restartTerminalSession(session.id); void sessions.refetch(); }}
      onClose={async (session: TerminalSession) => { await apiClient.closeTerminalSession(session.id); void sessions.refetch(); }}
    />
  );

  const activeHandle = () => (focusedRuntimeId ? handles.current.get(focusedRuntimeId) ?? null : null);
  const pressKey = (key: string) => {
    activeHandle()?.sendKey(key, { ctrl: stickyCtrl, alt: stickyAlt });
    setStickyCtrl(false);
    setStickyAlt(false);
  };

  if (!document) return <div className="terminal-area-loading">Terminal wird vorbereitet…</div>;

  const renderPane = (pane: VisiblePane, visible: boolean, position?: "left" | "right") => (
    <div
      key={pane.id}
      data-pane-id={pane.id}
      data-pane-position={position}
      className={`terminal-session-pane ${focusedRuntimeId === pane.runtimeId ? "is-focused" : ""} ${visible ? "is-visible" : "is-parked"}`}
      inert={!visible}
      onPointerDown={() => visible && pane.runtimeId !== focusedRuntimeId && queueOps([{ type: "setFocusedPane", areaId, paneId: pane.id }])}
    >
      <WebTerminal
        ref={(handle) => { if (handle) handles.current.set(pane.runtimeId, handle); else handles.current.delete(pane.runtimeId); }}
        instanceId={pane.runtimeId}
        kind={kind}
        active={routeActive && visible}
        renderScale={renderScale}
        onMetaChange={(next) => {
          setRuntimeCwd(pane.runtimeId, next.cwd);
          setMeta((current) => {
            const previous = current[pane.runtimeId];
            if (previous?.status === next.status && previous.cwd === next.cwd && previous.error === next.error && previous.cols === next.cols && previous.rows === next.rows) return current;
            return { ...current, [pane.runtimeId]: next };
          });
        }}
      />
    </div>
  );

  const renderWorkspace = () => {
    if (panes.length === 0) {
      return (
        <div className="terminal-empty-state">
          <MonitorOffIcon className="h-6 w-6" />
          <strong>Kein Terminal geöffnet</strong>
          <button type="button" className="quiet-button-primary" onClick={() => create(null, initialProjectId)}><PlusIcon className="h-4 w-4" /> {kindLabels[kind]} öffnen</button>
        </div>
      );
    }
    if (bento) {
      return <div className={`terminal-canvas is-bento has-${Math.min(panes.length, 4)}`}>{panes.slice(0, 4).map((pane, index) => renderPane(pane, !isMobile || pane.runtimeId === focusedRuntimeId, index === 0 ? "left" : index === 1 ? "right" : undefined))}</div>;
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
            defaultLayout={{
              [panes[0]!.id]: paneLayout.sizes[0] ?? 50,
              [panes[1]!.id]: paneLayout.sizes[1] ?? 50,
            } as Layout}
            onLayoutChanged={saveSplitLayout}
            resizeTargetMinimumSize={{ coarse: 44, fine: 20 }}
          >
            <Panel id={panes[0]!.id} minSize="20%" defaultSize={`${paneLayout.sizes[0]}%`}>{renderPane(panes[0]!, true, "left")}</Panel>
            <Separator className="terminal-split-handle" aria-label="Terminal-Aufteilung anpassen" />
            <Panel id={panes[1]!.id} minSize="20%" defaultSize={`${paneLayout.sizes[1]}%`}>{renderPane(panes[1]!, true, "right")}</Panel>
          </Group>
        </div>
      );
    }
    return <div className="terminal-canvas">{renderPane(panes[0]!, true)}</div>;
  };

  return (
    <section className="terminal-area" data-split={hasSplit ? "true" : undefined}>
      {minimal ? <span className="sr-only terminal-connection-status" aria-live="polite">{activeMeta ? statusLabel[activeMeta.status] : statusLabel.connecting}</span> : null}
      <div className={`terminal-area-body ${sidebarVisible ? "has-sidebar" : ""}`}>
        {!minimal ? (
          <TerminalSidebar
            areaId={areaId}
            kind={kind}
            meta={meta}
            sessions={sessions.data?.sessions ?? []}
            cwds={runtimeCwds}
            isMobile={isMobile}
            open={sidebarVisible}
            activeRuntimeId={focusedRuntimeId}
            hasSplit={hasSplit}
            hasActivePane={hasActivePane}
            onClose={() => setSidebarVisible(false)}
            onNewTerminal={() => create(null, initialProjectId)}
            onNewTerminalInFolder={(folderId) => create(folderId, initialProjectId)}
            onOpenEntry={openEntry}
            onOpenInSplit={openInSplit}
            onResync={(runtimeId) => handles.current.get(runtimeId)?.resync()}
            onRestart={(runtimeId) => handles.current.get(runtimeId)?.restart()}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
            onCreateSplit={createSplit}
            onClearSplit={clearSplit}
            onClear={() => activeHandle()?.clear()}
            onClosePane={() => focusedRuntimeId && closePane(focusedRuntimeId)}
            sessionPicker={sessionPicker}
            sidebarWidth={terminalSidebar.width}
            onResizeStart={terminalSidebar.startResize}
            onResizeKeyboard={terminalSidebar.resizeWithKeyboard}
            version={health.data?.version ?? null}
            onReload={() => globalThis.window.location.reload()}
            onFullscreen={toggleNativeFullscreen}
          />
        ) : null}
        <div className="terminal-area-main">
          {!minimal && !sidebarVisible ? (
            <button type="button" className="terminal-sidebar-reopen" onClick={() => setSidebarVisible(true)} aria-label="Terminal-Sidebar einblenden" title="Terminal-Sidebar einblenden">
              <TerminalIcon className="h-4 w-4" />
              <MenuIcon className="h-4 w-4" aria-hidden />
              <span>Terminals</span>
              <ChevronRightIcon className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {renderWorkspace()}
          {!minimal && isMobile ? (
            <TerminalKeybar
              keyboardRow={keyboardRow}
              stickyCtrl={stickyCtrl}
              stickyAlt={stickyAlt}
              hasActiveTab={hasActivePane}
              tabsFull={false}
              sessionPicker={sessionPicker}
              onSendKey={pressKey}
              onPaste={() => activeHandle()?.pasteFromClipboard()}
              onFocus={() => activeHandle()?.focus()}
              onCreate={() => create(null, initialProjectId)}
              onRestart={() => activeHandle()?.restart()}
              onClear={() => activeHandle()?.clear()}
              onClose={() => focusedRuntimeId && closePane(focusedRuntimeId)}
              onToggleCtrl={() => setStickyCtrl(!stickyCtrl)}
              onToggleAlt={() => setStickyAlt(!stickyAlt)}
              onSetKeyboardRow={setKeyboardRow}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
