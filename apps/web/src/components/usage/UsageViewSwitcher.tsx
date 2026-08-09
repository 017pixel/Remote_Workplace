import type { UsagePreferences } from "../../stores/usagePreferences";
import { useUsagePreferences } from "../../stores/usagePreferences";

export function UsageViewSwitcher({ value }: { value: UsagePreferences["limitsView"] }) {
  const set = useUsagePreferences((state) => state.set);
  return (
    <div className="usage-view-switcher" role="group" aria-label="Limitansicht">
      {(["list", "timeline", "both"] as const).map((view) => (
        <button key={view} type="button" aria-pressed={value === view} onClick={() => set({ limitsView: view })}>
          {view === "list" ? "Liste" : view === "timeline" ? "Timeline" : "Beides"}
        </button>
      ))}
    </div>
  );
}
