import type { ComponentType } from "react";
import { ClockIcon, HermesIcon, LayoutPanelIcon, ListIcon, PlayIcon } from "../icons";
import type { HermesSurface } from "../../lib/hermesPresentation";

const surfaces: Array<{ value: HermesSurface; label: string; icon: ComponentType<{ className?: string }> }> = [
  { value: "chat", label: "Chat", icon: HermesIcon },
  { value: "tasks", label: "Aufgaben", icon: PlayIcon },
  { value: "history", label: "Verlauf", icon: ListIcon },
  { value: "cron", label: "Cron", icon: ClockIcon },
  { value: "admin", label: "Verwaltung", icon: LayoutPanelIcon },
];

/**
 * Flächenwahl für den Hermes-Bereich. Links die nativen Workbench-Flächen
 * (Chat, Aufgaben, Verlauf, Cron), rechts abgetrennt die offizielle
 * Hermes-Verwaltung, die als Fallback für Expertenfunktionen erhalten bleibt.
 */
export function HermesSurfaceNav({ surface, onSelect }: { surface: HermesSurface; onSelect: (surface: HermesSurface) => void }) {
  return (
    <nav className="hermes-surface-nav" aria-label="Hermes-Bereiche">
      {surfaces.map((entry) => {
        const Icon = entry.icon;
        const active = surface === entry.value;
        return (
          <button
            key={entry.value}
            type="button"
            className={`hermes-surface-tab ${entry.value === "admin" ? "is-admin" : ""} ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(entry.value)}
          >
            <Icon className="h-4 w-4" />
            <span>{entry.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
