import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router";
import { CloseIcon } from "./icons";
import { navSections, type NavItem } from "../routes/navigation";
import { prefetchRouteTarget } from "../lib/routePrefetch";
import { workbenchQueries } from "../lib/queryOptions";
import { isPageVisibleIn, useSidebarPreferences, type PageRouteId } from "../stores/sidebarPreferences";

const pathToRouteId = (path: string): PageRouteId | null => {
  const map: Record<string, PageRouteId> = {
    "/": "dashboard", "/inbox": "inbox", "/workbench": "workbench", "/tech-tldrs": "tech-tldrs", "/projects": "projects",
    "/t3-code": "t3-code", "/hermes-agent": "hermes-agent", "/codex": "codex", "/opencode": "opencode", "/claude": "claude", "/code-editor": "code-editor",
    "/previews": "previews", "/browser": "browser", "/terminal": "terminal", "/files": "files", "/ki-skills": "ki-skills",
    "/usage": "usage", "/settings": "settings",
  };
  return map[path] ?? null;
};

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

// Muss zur Dauer von `navigation-page-exit` in index.css passen: Solange läuft
// die Seite nach links aus dem Bild, erst danach verlässt sie den Baum.
const NAVIGATION_EXIT_MS = 240;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function MobileNav({ open, onClose, triggerRef }: MobileNavProps) {
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusTrigger = useRef<() => void>(() => undefined);
  focusTrigger.current = () => triggerRef?.current?.focus();
  const openedPath = useRef(location.pathname);
  const previousPath = useRef(location.pathname);
  // Beim Schließen bleibt die Seite noch kurz im Baum, damit sie nicht
  // verschwindet, sondern nach links hinausgleitet, während die gewählte
  // Ansicht von rechts nachrückt.
  const [phase, setPhase] = useState<"closed" | "open" | "closing">(open ? "open" : "closed");
  // Abonniert statt einmalig gelesen — Änderungen in den Einstellungen greifen sofort.
  const hiddenPages = useSidebarPreferences((state) => state.hiddenPages);
  const notifications = useQuery(workbenchQueries.notifications());
  const filteredSections = useMemo(() => navSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      const routeId = pathToRouteId(item.to);
      return routeId === null || isPageVisibleIn(hiddenPages, routeId);
    }),
  })).filter((section) => section.items.length > 0), [hiddenPages]);

  useEffect(() => {
    const changed = previousPath.current !== location.pathname;
    previousPath.current = location.pathname;
    if (open && changed) onClose();
  }, [location.pathname, onClose, open]);

  useEffect(() => {
    if (open) {
      setPhase("open");
      return;
    }
    if (prefersReducedMotion()) {
      setPhase("closed");
      return;
    }
    setPhase((current) => (current === "open" ? "closing" : current));
    const timer = window.setTimeout(() => setPhase("closed"), NAVIGATION_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    openedPath.current = window.location.pathname;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const previousHistoryState = window.history.state as Record<string, unknown> | null;
    const overlayState = { ...(previousHistoryState ?? {}), workbenchNavigation: true };
    window.history.pushState(overlayState, "", window.location.href);
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    // Fokus auf den Schließen-Knopf (erstes fokussierbares Element im Header) —
    // so landet die Tastatur im Dialog, ohne einen Navigationseintrag auszuwählen.
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("a, button")?.focus(), 0);

    const closeFromHistory = () => onClose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if ((window.history.state as Record<string, unknown> | null)?.workbenchNavigation) window.history.back();
        else onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("popstate", closeFromHistory);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", closeFromHistory);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      if (window.location.pathname === openedPath.current) {
        // Erst nach dem kurzen Exit-Übergang fokussieren: Bis dahin kann der
        // Trigger durch den Render des schließenden Layers noch nicht wieder
        // interaktiv sein.
        window.setTimeout(() => focusTrigger.current(), NAVIGATION_EXIT_MS + 20);
      }
    };
  }, [open, onClose, triggerRef]);

  const requestClose = () => {
    if ((window.history.state as Record<string, unknown> | null)?.workbenchNavigation) window.history.back();
    else onClose();
  };

  if (phase === "closed") return null;

  const closing = phase === "closing";

  return (
    <div
      ref={dialogRef}
      className={`mobile-navigation-page ${closing ? "is-closing" : "is-opening"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-navigation-title"
      aria-hidden={closing || undefined}
      inert={closing || undefined}
    >
      <header className="mobile-navigation-header">
        <div>
          <p className="mobile-navigation-kicker">Menü</p>
          <h2 id="mobile-navigation-title">Navigation</h2>
        </div>
        <button type="button" onClick={requestClose} className="icon-button mobile-navigation-close" aria-label="Navigation schließen">
          <CloseIcon className="h-[18px] w-[18px]" />
        </button>
      </header>

      <nav className="mobile-navigation-list" aria-label="Hauptnavigation">
        {filteredSections.length === 0 ? (
          <div className="mobile-navigation-empty">
            <strong>Keine Seite sichtbar</strong>
            <span>In den Einstellungen sind alle Seiten ausgeblendet.</span>
          </div>
        ) : null}
        {filteredSections.map((section) => (
          <div key={section.kicker} className="mobile-navigation-section">
            <p className="mobile-navigation-section-kicker">{section.kicker}</p>
            <div className="mobile-navigation-grid">
              {section.items.map((item) => <NavigationLink key={item.to} item={item} badge={item.to === "/inbox" ? notifications.data?.unreadCount ?? 0 : 0} />)}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

function NavigationLink({ item, badge = 0 }: { item: NavItem; badge?: number }) {
  const client = useQueryClient();
  const prefetch = () => prefetchRouteTarget(client, item.to);
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) => `mobile-navigation-item ${isActive ? "is-active" : ""}`}
      onPointerEnter={prefetch}
      // Auf dem Handy ist `pointerdown` der früheste sichere Zeitpunkt.
      onPointerDown={prefetch}
      onFocus={prefetch}
    >
      <span className="mobile-navigation-icon-slot">
        <item.icon className="mobile-navigation-icon" aria-hidden />
      </span>
      <span className="mobile-navigation-highlight">
        <span className="mobile-navigation-label">{item.label}</span>
        {badge > 0 ? <span className="mobile-navigation-badge" aria-label={`${badge} ungelesen`}>{badge > 99 ? "99+" : badge}</span> : null}
      </span>
    </NavLink>
  );
}
