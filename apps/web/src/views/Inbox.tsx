import { useMemo, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import ClaudeCodeColor from "@lobehub/icons/es/ClaudeCode/components/Color.js";
import type { Notification, NotificationCategory, NotificationSourceIcon } from "@workbench/contracts";
import { apiClient } from "../lib/apiClient";
import { writeClipboardText } from "../lib/clipboard";
import { CheckIcon, ChevronRightIcon, CloseIcon, CodexIcon, CopyIcon, HermesIcon, InboxIcon, OpenCodeIcon, RemoteWorkbenchIcon, T3CodeIcon, TerminalIcon, TrashIcon, WarningIcon } from "../components/icons";

const categories: Array<{ id: NotificationCategory; title: string; short: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "hermes", title: "Hermes", short: "Hermes", icon: HermesIcon },
  { id: "coding-agent", title: "Coding-Agents", short: "Agents", icon: T3CodeIcon },
  { id: "terminal", title: "Terminal und System", short: "Terminal", icon: TerminalIcon },
];

function SourceIcon({ source, className = "" }: { source: NotificationSourceIcon; className?: string }) {
  if (source === "t3") return <T3CodeIcon className={className} />;
  if (source === "hermes") return <HermesIcon className={className} />;
  if (source === "opencode") return <OpenCodeIcon className={className} />;
  if (source === "codex") return <CodexIcon className={className} />;
  if (source === "claude") return <span className={`notification-source-claude ${className}`}><ClaudeCodeColor width={20} height={20} /></span>;
  if (source === "terminal") return <TerminalIcon className={className} />;
  return <RemoteWorkbenchIcon className={className} />;
}

export function Inbox() {
  const query = useInfiniteQuery({
    // Eigener Key: "notifications" ist nur Präfix, damit die Präfix-Invalidierung
    // aus dem NotificationCenter weiter greift. Der Key darf nicht mit dem
    // useQuery-Cache des NotificationCenter kollidieren — useInfiniteQuery
    // schreibt { pages, pageParams }, useQuery erwartet die Rohantwort.
    queryKey: ["notifications", "inbox"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => apiClient.notifications(pageParam ? { cursor: pageParam } : {}, signal),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 15_000,
    staleTime: 2_000,
  });
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<NotificationCategory | "all">("all");
  const [showRead, setShowRead] = useState<Record<string, boolean>>({ all: false, hermes: false, "coding-agent": false, terminal: false });
  const [report, setReport] = useState<Notification | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const notifications = useMemo(() => {
    const unique = new Map<string, Notification>();
    for (const page of query.data?.pages ?? [])
      for (const item of page.notifications) if (!unique.has(item.id)) unique.set(item.id, item);
    return [...unique.values()];
  }, [query.data?.pages]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const withFeedback = async (action: () => Promise<unknown>) => {
    try {
      setActionError(null);
      await action();
    } catch {
      setActionError("Die Aktion ist fehlgeschlagen. Bitte versuche es erneut.");
    }
  };
  const markRead = (item: Notification, navigate = true) => void withFeedback(async () => {
    await apiClient.patchNotification(item.id, { read: true });
    await refresh();
    if (navigate && item.link) window.location.assign(item.link);
  });
  const dismiss = (item: Notification) => void withFeedback(async () => {
    await apiClient.deleteNotification(item.id);
    await refresh();
  });
  const markAll = (category?: NotificationCategory) => void withFeedback(async () => {
    await apiClient.markAllNotificationsRead(category);
    await refresh();
  });
  const dismissAll = () => void withFeedback(async () => {
    await apiClient.deleteAllNotifications();
    await refresh();
  });
  // Desktop wie Mobile: gelesene Einträge sind ausgeblendet, Fehler bleiben sichtbar.
  const isVisible = (item: Notification) => !item.readAt || item.severity === "error" || showRead[filter] || showRead[item.category];
  const filtered = filter === "all" ? notifications : notifications.filter((item) => item.category === filter);
  const visibleOnMobile = filtered.filter(isVisible);
  const hiddenReadOnMobile = filtered.length - visibleOnMobile.length;
  const loadMore = () => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); };

  return <div className="inbox-page">
    <header className="inbox-header">
      <div><span>Arbeitszentrale</span><h1>Inbox</h1><p>Aufgaben, Rückfragen und Fehler an einem Ort.</p></div>
      <div className="inbox-header-actions">
        <button type="button" className="quiet-button" onClick={() => void markAll()} disabled={!notifications.some((item) => !item.readAt)}><CheckIcon className="h-4 w-4" /> Alle gelesen</button>
        <button type="button" className="quiet-button inbox-delete-all" onClick={() => void dismissAll()} disabled={notifications.length === 0} aria-label="Alle Benachrichtigungen löschen" title="Alle Benachrichtigungen löschen"><TrashIcon className="h-4 w-4" /><span>Alle löschen</span></button>
      </div>
    </header>

    {actionError ? <p className="inbox-error" role="alert"><WarningIcon className="h-4 w-4" /> {actionError}</p> : null}

    <div className="inbox-mobile-filters" role="group" aria-label="Inbox filtern">
      <button type="button" aria-label="Alle" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}><InboxIcon className="h-4 w-4" /></button>
      {categories.map(({ id, short, icon: Icon }) => <button key={id} type="button" aria-label={short} className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)}><Icon className="h-4 w-4" /></button>)}
    </div>

    <div className="inbox-desktop-columns">
      {categories.map((category) => {
        const all = notifications.filter((item) => item.category === category.id);
        const visible = all.filter((item) => !item.readAt || item.severity === "error" || showRead[category.id]);
        const unread = all.filter((item) => !item.readAt).length;
        const hiddenRead = all.length - visible.length;
        return <section className="inbox-column" key={category.id}>
          <header><div><category.icon className="h-4 w-4" /><strong>{category.title}</strong>{unread > 0 ? <span>{unread}</span> : null}</div><button type="button" onClick={() => void markAll(category.id)} disabled={unread === 0}>Alles gelesen</button></header>
          <div className="inbox-list">{visible.map((item) => <NotificationRow key={item.id} item={item} onOpen={() => markRead(item)} onRead={() => markRead(item, false)} onDismiss={() => dismiss(item)} onReport={() => setReport(item)} />)}
            {visible.length === 0 ? <Empty category={category.title} /> : null}
            {hiddenRead > 0 ? <button type="button" className="inbox-show-read" onClick={() => setShowRead((current) => ({ ...current, [category.id]: true }))}>{hiddenRead} gelesene einblenden</button> : null}
          </div>
        </section>;
      })}
    </div>

    <div className="inbox-mobile-stream">{visibleOnMobile.map((item) => <NotificationRow key={item.id} item={item} onOpen={() => markRead(item)} onRead={() => markRead(item, false)} onDismiss={() => dismiss(item)} onReport={() => setReport(item)} />)}
      {visibleOnMobile.length === 0 ? <Empty category="diesem Filter" /> : null}
      {hiddenReadOnMobile > 0 ? <button type="button" className="inbox-show-read" onClick={() => setShowRead((current) => ({ ...current, [filter]: true }))}>{hiddenReadOnMobile} gelesene einblenden</button> : null}
    </div>
    {query.hasNextPage ? <button type="button" className="quiet-button inbox-load-more" onClick={loadMore} disabled={query.isFetchingNextPage}>{query.isFetchingNextPage ? "Lädt …" : "Weitere laden"}</button> : null}
    {report ? <ReportDialog notification={report} onClose={() => setReport(null)} /> : null}
  </div>;
}

function Empty({ category }: { category: string }) { return <div className="inbox-empty"><InboxIcon className="h-5 w-5" /><strong>Alles erledigt</strong><span>Keine aktiven Einträge für {category}.</span></div>; }

function NotificationRow({ item, onOpen, onRead, onDismiss, onReport }: { item: Notification; onOpen: () => void; onRead: () => void; onDismiss: () => void; onReport: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressOpen = useRef(false);
  const [offset, setOffset] = useState(0);
  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as Element).closest(".inbox-row-actions")) return;
    start.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLElement>) => { if (!start.current || Math.abs(event.clientY - start.current.y) > Math.abs(event.clientX - start.current.x)) return; setOffset(Math.max(-110, Math.min(110, event.clientX - start.current.x))); };
  const pointerUp = () => { suppressOpen.current = Math.abs(offset) >= 72; if (offset <= -72) onRead(); else if (offset >= 72) onDismiss(); setOffset(0); start.current = null; };
  return <div className="inbox-row-swipe"><div className="inbox-swipe-action is-delete"><TrashIcon className="h-4 w-4" /><span>Löschen</span></div><div className="inbox-swipe-action is-read"><CheckIcon className="h-4 w-4" /><span>Gelesen</span></div>
    <article className={`inbox-row is-${item.severity} ${item.readAt ? "is-read" : ""}`} style={{ transform: `translateX(${offset}px)` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      <button type="button" className="inbox-row-main" onClick={() => { if (suppressOpen.current) { suppressOpen.current = false; return; } onOpen(); }}>
        <span className="inbox-source"><SourceIcon source={item.sourceIcon} className="h-5 w-5" />{!item.readAt ? <i /> : null}</span>
        <span className="inbox-row-copy"><small>{new Date(item.createdAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</small><strong>{item.title}</strong><p>{item.body}</p></span>
        <ChevronRightIcon className="h-4 w-4 inbox-open-icon" />
      </button>
      <div className="inbox-row-actions">{!item.readAt ? <button type="button" onClick={onRead} aria-label="Als gelesen markieren"><CheckIcon className="h-4 w-4" /></button> : null}{item.report ? <button type="button" onClick={onReport} aria-label="Fehlerbericht öffnen"><WarningIcon className="h-4 w-4" /></button> : null}<button type="button" onClick={onDismiss} aria-label="Benachrichtigung löschen"><TrashIcon className="h-4 w-4" /></button></div>
    </article>
  </div>;
}

function ReportDialog({ notification, onClose }: { notification: Notification; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const report = notification.report;
  const text = useMemo(() => report ? [
    "Arbeitsauftrag: Analysiere und behebe den folgenden Fehler in der Remote Workplace. Prüfe die Ursache, implementiere eine dauerhafte Lösung und verifiziere sie.",
    "", `Fehler: ${report.message}`, report.stack ? `\nStacktrace:\n${report.stack}` : "",
    `\nKontext:\n${Object.entries(report.context).map(([key, value]) => `${key}: ${value}`).join("\n")}`,
    report.logs.length ? `\nLetzte Schritte und Logs:\n${report.logs.join("\n")}` : "",
    Object.keys(report.environment).length ? `\nUmgebung:\n${Object.entries(report.environment).map(([key, value]) => `${key}: ${value}`).join("\n")}` : "",
  ].join("\n") : "" , [report]);
  if (!report) return null;
  const copy = async () => { await writeClipboardText(text); setCopied(true); };
  const openT3 = async () => {
    await copy();
    // In der Workbench-SPA öffnen, nicht im T3-Proxy-Vollbild.
    window.open("/workbench/t3-code", "_blank", "noopener,noreferrer");
  };
  return <div className="notification-report-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="notification-report-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-report-title">
    <header><div><span>Diagnose</span><h2 id="notification-report-title">Fehlerbericht</h2></div><button type="button" onClick={onClose} aria-label="Dialog schließen"><CloseIcon className="h-4 w-4" /></button></header>
    <pre>{text}</pre>
    {copied ? <p className="notification-report-hint" role="status">Prompt kopiert. In T3 Code einfügen.</p> : null}
    <footer><button type="button" className="quiet-button" onClick={() => void copy()}><CopyIcon className="h-4 w-4" /> Bericht kopieren</button><button type="button" className="quiet-button-primary" onClick={() => void openT3()}><T3CodeIcon className="h-4 w-4" /> Mit T3 Code beheben</button></footer>
  </section></div>;
}
