import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification, NotificationEvent } from "@wrapt/contracts";
import { notificationEventSchema } from "@wrapt/contracts";
import { CloseIcon } from "./icons";
import { apiClient } from "../lib/apiClient";
import { wraptQueries } from "../lib/queryOptions";
import { subscribeUiToasts, type UiToast } from "../lib/uiToasts";

const important = (item: Notification) => item.severity === "error" || item.kind === "agent.input-required" || item.kind === "agent.plan-ready" || item.kind === "agent.completed" || item.kind === "terminal.failed";
const TOAST_LIFETIME = 2_600;
const TOAST_EXIT_DURATION = 320;
/** Dedup-Gedächtnis: nur die letzten IDs zählen, damit das Set nicht unbegrenzt wächst (F04-08). */
const SEEN_RETENTION = 50;
type ToastEntry = { notification: Notification; leaving: boolean };
type UiToastEntry = { toast: UiToast; leaving: boolean };

/** Wegwischen nach rechts schließt den Toast; die Geste ist für beide
 *  Toast-Arten dieselbe (F04-09). */
function useToastSwipe(onDismiss: () => void) {
  const start = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => { start.current = event.clientX; };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (start.current === null) return;
    const nextOffset = Math.max(0, event.clientX - start.current);
    if (nextOffset > 4 && !event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    setOffset(nextOffset);
  };
  const pointerUp = () => { if (start.current === null) return; if (offset > 70) onDismiss(); else setOffset(0); start.current = null; };
  return { offset, pointerDown, pointerMove, pointerUp };
}

export function NotificationCenter() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [uiToasts, setUiToasts] = useState<UiToastEntry[]>([]);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const leaving = useRef(new Set<string>());
  const lifecycleTimers = useRef(new Map<string, number>());
  const uiLeaving = useRef(new Set<string>());
  const uiLifecycleTimers = useRef(new Map<string, number>());
  const queryClient = useQueryClient();
  const query = useQuery(wraptQueries.notifications());
  const settings = useQuery(wraptQueries.notificationSettings());

  const clearLifecycleTimer = useCallback((id: string) => {
    const timer = lifecycleTimers.current.get(id);
    if (timer !== undefined) { window.clearTimeout(timer); lifecycleTimers.current.delete(id); }
  }, []);
  const removeToast = useCallback((id: string) => {
    clearLifecycleTimer(id);
    leaving.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.notification.id !== id));
  }, [clearLifecycleTimer]);
  const dismissToast = useCallback((id: string) => {
    if (leaving.current.has(id)) return;
    clearLifecycleTimer(id);
    leaving.current.add(id);
    setToasts((current) => current.map((toast) => toast.notification.id === id ? { ...toast, leaving: true } : toast));
    const timer = window.setTimeout(() => removeToast(id), TOAST_EXIT_DURATION);
    lifecycleTimers.current.set(id, timer);
  }, [clearLifecycleTimer, removeToast]);

  useEffect(() => () => {
    lifecycleTimers.current.forEach((timer) => window.clearTimeout(timer));
    lifecycleTimers.current.clear();
    uiLifecycleTimers.current.forEach((timer) => window.clearTimeout(timer));
    uiLifecycleTimers.current.clear();
  }, []);

  const showToast = useCallback((item: Notification) => {
    // WebSocket-Ereignisse während des ersten Abrufs gehören zum Bestand.
    // Sie werden nach dem erfolgreichen Abruf nicht erneut als Start-Toast gezeigt.
    if (!initialized.current) return;
    const preferences = settings.data?.preferences;
    if (!preferences?.toastsEnabled || !(preferences.sources[item.source] ?? preferences.sources.wrapt).toast || !important(item) || seen.current.has(item.id)) return;
    seen.current.add(item.id);
    if (seen.current.size > SEEN_RETENTION) {
      seen.current = new Set([...seen.current].slice(-SEEN_RETENTION));
    }
    setToasts((current) => [...current.filter((toast) => toast.notification.id !== item.id), { notification: item, leaving: false }].slice(-3));
    const timer = window.setTimeout(() => { lifecycleTimers.current.delete(item.id); dismissToast(item.id); }, TOAST_LIFETIME);
    lifecycleTimers.current.set(item.id, timer);
  }, [dismissToast, settings.data?.preferences]);

  const removeUiToast = useCallback((id: string) => {
    const timer = uiLifecycleTimers.current.get(id);
    if (timer !== undefined) { window.clearTimeout(timer); uiLifecycleTimers.current.delete(id); }
    uiLeaving.current.delete(id);
    setUiToasts((current) => current.filter((entry) => entry.toast.id !== id));
  }, []);

  const dismissUiToast = useCallback((id: string) => {
    if (uiLeaving.current.has(id)) return;
    const timer = uiLifecycleTimers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    uiLeaving.current.add(id);
    setUiToasts((current) => current.map((entry) => entry.toast.id === id ? { ...entry, leaving: true } : entry));
    const exitTimer = window.setTimeout(() => removeUiToast(id), TOAST_EXIT_DURATION);
    uiLifecycleTimers.current.set(id, exitTimer);
  }, [removeUiToast]);

  useEffect(() => subscribeUiToasts((toast) => {
    setUiToasts((current) => [...current.filter((entry) => entry.toast.id !== toast.id), { toast, leaving: false }].slice(-3));
    const timer = window.setTimeout(() => { uiLifecycleTimers.current.delete(toast.id); dismissUiToast(toast.id); }, TOAST_LIFETIME);
    uiLifecycleTimers.current.set(toast.id, timer);
  }), [dismissUiToast]);

  useEffect(() => {
    // Der erste erfolgreiche Abruf ist nur der Bestand. Erst danach gelten
    // neue Einträge aus Polling oder WebSocket als Toast-Kandidaten.
    if (!query.isSuccess || !query.data) return;
    const notifications = query.data.notifications ?? [];
    if (!initialized.current) { notifications.forEach((item) => seen.current.add(item.id)); initialized.current = true; return; }
    notifications.forEach(showToast);
  }, [query.data, query.isSuccess, showToast]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    let closed = false;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/notifications/ws`);
      socket.onopen = () => { retry = 0; };
      socket.onmessage = (event) => {
        const parsed = notificationEventSchema.safeParse(JSON.parse(String(event.data)));
        if (!parsed.success) return;
        const message: NotificationEvent = parsed.data;
        if (message.type === "notification.created") showToast(message.notification);
        if (message.type === "notification.removed") dismissToast(message.id);
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      };
      socket.onclose = () => { if (!closed) timer = window.setTimeout(connect, Math.min(15_000, 1_000 * 2 ** retry++)); };
    };
    connect();
    return () => { closed = true; window.clearTimeout(timer); socket?.close(); };
  }, [dismissToast, queryClient, showToast]);

  const open = async (notification: Notification) => {
    dismissToast(notification.id);
    await apiClient.patchNotification(notification.id, { read: true });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    if (notification.link) window.location.assign(notification.link);
  };
  return <>
    <div className="notification-toasts" aria-live="polite">
      {toasts.map(({ notification, leaving: isLeaving }) => <Toast key={notification.id} notification={notification} leaving={isLeaving} onOpen={() => void open(notification)} onDismiss={() => dismissToast(notification.id)} />)}
      {uiToasts.map(({ toast, leaving: isLeaving }) => <UiToastItem key={toast.id} toast={toast} leaving={isLeaving} onDismiss={() => dismissUiToast(toast.id)} />)}
    </div>
  </>;
}

function Toast({ notification, leaving, onOpen, onDismiss }: { notification: Notification; leaving: boolean; onOpen: () => void; onDismiss: () => void }) {
  const swipe = useToastSwipe(onDismiss);
  return <article className={`notification-toast is-${notification.severity}${leaving ? " is-leaving" : ""}`} role={notification.severity === "error" ? "alert" : undefined}
    onPointerDown={swipe.pointerDown} onPointerMove={swipe.pointerMove} onPointerUp={swipe.pointerUp} onPointerCancel={swipe.pointerUp}>
    <div className="notification-toast-surface" style={{ transform: `translateX(${swipe.offset}px)`, opacity: Math.max(.25, 1 - swipe.offset / 180) }}>
      <button type="button" className="notification-toast-main" onClick={onOpen}><strong>{notification.title}</strong><p>{notification.body}</p></button>
      <button type="button" className="notification-toast-close" onClick={onDismiss} aria-label="Benachrichtigung schließen"><CloseIcon className="h-3.5 w-3.5" /></button>
    </div>
  </article>;
}

function UiToastItem({ toast, leaving, onDismiss }: { toast: UiToast; leaving: boolean; onDismiss: () => void }) {
  const swipe = useToastSwipe(onDismiss);
  return <article className={`notification-toast is-${toast.severity}${leaving ? " is-leaving" : ""}`}
    onPointerDown={swipe.pointerDown} onPointerMove={swipe.pointerMove} onPointerUp={swipe.pointerUp} onPointerCancel={swipe.pointerUp}>
    <div className="notification-toast-surface" style={{ transform: `translateX(${swipe.offset}px)`, opacity: Math.max(.25, 1 - swipe.offset / 180) }}>
      <button type="button" className="notification-toast-main" onClick={onDismiss}><strong>{toast.title}</strong>{toast.body ? <p>{toast.body}</p> : null}</button>
      <button type="button" className="notification-toast-close" onClick={onDismiss} aria-label="Hinweis schließen"><CloseIcon className="h-3.5 w-3.5" /></button>
    </div>
  </article>;
}
