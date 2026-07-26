import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Search, X } from "lucide-react";
import { navSections, type NavItem } from "../routes/navigation";
import { prefetchRoute } from "../lib/routeModules";
import { isPageVisibleIn, useSidebarPreferences, type PageRouteId } from "../stores/sidebarPreferences";

const pathToRouteId = (path: string): PageRouteId | null => {
  const map: Record<string, PageRouteId> = {
    "/": "dashboard", "/workbench": "workbench", "/tech-tldrs": "tech-tldrs", "/projects": "projects",
    "/t3-code": "t3-code", "/codex": "codex", "/opencode": "opencode", "/code-editor": "code-editor",
    "/previews": "previews", "/browser": "browser", "/terminal": "terminal", "/gallery": "gallery",
    "/usage": "usage", "/settings": "settings",
  };
  return map[path] ?? null;
};

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export function MobileNav({ open, onClose, triggerRef }: MobileNavProps) {
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openedPath = useRef(location.pathname);
  // Abonniert statt einmalig gelesen — Änderungen in den Einstellungen greifen sofort.
  const hiddenPages = useSidebarPreferences((state) => state.hiddenPages);
  const [query, setQuery] = useState("");
  // Vierzehn Ziele sind zu viele zum Scannen — die Suche filtert sie live.
  const filteredSections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return navSections.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const routeId = pathToRouteId(item.to);
        if (routeId && !isPageVisibleIn(hiddenPages, routeId)) return false;
        return needle === "" || item.label.toLowerCase().includes(needle);
      }),
    })).filter((section) => section.items.length > 0);
  }, [hiddenPages, query]);

  useEffect(() => {
    if (open) onClose();
  }, [location.pathname, onClose]);

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
      if (window.location.pathname === openedPath.current) window.setTimeout(() => triggerRef?.current?.focus(), 0);
    };
  }, [open, onClose, triggerRef]);

  const requestClose = () => {
    if ((window.history.state as Record<string, unknown> | null)?.workbenchNavigation) window.history.back();
    else onClose();
  };

  if (!open) return null;

  return (
    <div ref={dialogRef} className="mobile-navigation-page" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title">
      <header className="mobile-navigation-header">
        <div>
          <h2 id="mobile-navigation-title">Navigation</h2>
        </div>
        <button type="button" onClick={requestClose} className="icon-button mobile-navigation-close" aria-label="Navigation schließen">
          <X className="h-[18px] w-[18px]" />
        </button>
      </header>

      <div className="mobile-navigation-search-wrap">
        <div className="mobile-navigation-search">
          <Search className="h-[17px] w-[17px] shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Seite suchen …"
            aria-label="Navigation durchsuchen"
            autoComplete="off"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Suche zurücksetzen">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="mobile-navigation-list" aria-label="Hauptnavigation">
        {filteredSections.length === 0 ? (
          <div className="mobile-navigation-empty">
            <strong>Keine Seite gefunden</strong>
            <span>Für „{query}“ gibt es keinen Treffer.</span>
          </div>
        ) : null}
        {filteredSections.map((section) => (
          <div key={section.kicker} className="mobile-navigation-section">
            <p className="mobile-navigation-section-kicker">{section.kicker}</p>
            <div className="mobile-navigation-grid">
              {section.items.map((item) => <NavigationLink key={item.to} item={item} />)}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

function NavigationLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) => `mobile-navigation-item ${isActive ? "is-active" : ""}`}
      onPointerEnter={() => prefetchRoute(item.to)}
      onFocus={() => prefetchRoute(item.to)}
    >
      <item.icon className="mobile-navigation-icon" aria-hidden />
      <span className="mobile-navigation-label">{item.label}</span>
    </NavLink>
  );
}
