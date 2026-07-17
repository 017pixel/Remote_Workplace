import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import { primaryNavItems, toolRouteItems, footerNavItems, type NavItem } from "./Sidebar";
import { prefetchRoute } from "../lib/routeModules";

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

const navSections: { kicker: string; items: NavItem[] }[] = [
  { kicker: "Workspace", items: primaryNavItems },
  { kicker: "Werkzeuge", items: toolRouteItems },
  { kicker: "Account und System", items: footerNavItems },
];

export function MobileNav({ open, onClose }: MobileNavProps) {
  const location = useLocation();

  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mobile-navigation-page" role="dialog" aria-modal="true" aria-label="Seiten auswählen">
      <header className="mobile-navigation-header">
        <div>
          <p className="mobile-navigation-kicker">Dev Workbench</p>
          <h2>Seiten</h2>
          <p>Wähle einen Bereich für deine Arbeit.</p>
        </div>
        <button type="button" onClick={onClose} className="icon-button" aria-label="Navigation schließen">
          <X className="h-[18px] w-[18px]" />
        </button>
      </header>

      <nav className="mobile-navigation-list" aria-label="Hauptnavigation">
        {navSections.map((section) => (
          <div key={section.kicker} className="mobile-navigation-section">
            <p className="mobile-navigation-section-kicker">{section.kicker}</p>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `mobile-navigation-item ${isActive ? "is-active" : ""}`}
                onPointerEnter={() => prefetchRoute(item.to)}
                onFocus={() => prefetchRoute(item.to)}
              >
                <item.icon className="mobile-navigation-icon" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="mobile-navigation-label">{item.label}</span>
                  <span className="mobile-navigation-description">{item.description}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
