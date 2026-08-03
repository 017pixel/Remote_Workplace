import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, HermesIcon } from "../icons";
import { findHermesPage, hermesSurfacePages } from "./hermesSurfaces";

/**
 * Flächenwahl für den Hermes-Bereich.
 *
 * Links der native Chat, rechts die Seiten der offiziellen Hermes-Oberfläche.
 * Die Leiste zeigt die sechs wichtigsten direkt — darunter genau die, die im
 * Betrieb zählen: System, Cron, Logs und Auswertung. Der Rest liegt unter
 * „Mehr“, ist aber zusätzlich über die Hermes-eigene Navigation im Iframe
 * erreichbar, die absichtlich sichtbar bleibt.
 */
export function HermesSurfaceNav({
  surface,
  adminPath,
  onSelectChat,
  onSelectPage,
}: {
  surface: "chat" | "admin";
  adminPath: string;
  onSelectChat: () => void;
  onSelectPage: (path: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const activePage = surface === "admin" ? findHermesPage(adminPath) : undefined;
  const primary = hermesSurfacePages.filter((page) => page.primary);
  const secondary = hermesSurfacePages.filter((page) => !page.primary);
  const activeIsSecondary = Boolean(activePage && !activePage.primary);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [moreOpen]);

  return (
    <nav className="hermes-surface-nav" aria-label="Hermes-Bereiche">
      <div className="hermes-surface-scroll">
        <button
          type="button"
          className={`hermes-surface-tab ${surface === "chat" ? "is-active" : ""}`}
          aria-current={surface === "chat" ? "page" : undefined}
          onClick={onSelectChat}
        >
          <HermesIcon className="h-4 w-4" />
          <span>Chat</span>
        </button>
        <span className="hermes-surface-divider" aria-hidden />
        {primary.map((page) => {
          const active = activePage?.path === page.path;
          const Icon = page.icon;
          return (
            <button
              key={page.path}
              type="button"
              className={`hermes-surface-tab ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelectPage(page.path)}
            >
              <Icon className="h-4 w-4" />
              <span>{page.label}</span>
            </button>
          );
        })}
      </div>
      {/* Bewusst außerhalb von `.hermes-surface-scroll`: Der Scrollcontainer
          würde das Aufklappmenü abschneiden, und so bleibt „Mehr“ auch dann
          sichtbar, wenn die Leiste auf schmalen Geräten scrollt. */}
      <div className="hermes-surface-more" ref={moreRef}>
        <button
          type="button"
          className={`hermes-surface-tab ${activeIsSecondary ? "is-active" : ""}`}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span>{activeIsSecondary ? activePage?.label : "Mehr"}</span>
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </button>
        {moreOpen ? (
          <div className="hermes-surface-more-panel" role="menu">
            {secondary.map((page) => {
              const Icon = page.icon;
              return (
                <button
                  key={page.path}
                  type="button"
                  role="menuitem"
                  className={activePage?.path === page.path ? "is-active" : ""}
                  onClick={() => {
                    setMoreOpen(false);
                    onSelectPage(page.path);
                  }}
                >
                  <Icon className="h-4 w-4" />
                  <span>{page.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
