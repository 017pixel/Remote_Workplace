import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DashboardConfig, DashboardSection } from "@workbench/contracts";

export const allDashboardSections: DashboardSection[] = [
  "quickActions",
  "server",
  "metrics",
  "services",
  "runtime",
  "diagnostics",
  "usage",
  "news",
  "commands",
];

export const dashboardSectionMeta: Record<DashboardSection, { label: string; description: string }> = {
  quickActions: { label: "Schnellaktionen", description: "T3 Code, Workbench, Terminal, Nutzung und News" },
  server: { label: "Serverstatus", description: "Status, Version, Uptime, Betriebssystem und Tailscale" },
  metrics: { label: "Systemmetriken", description: "CPU, RAM, Speicher, Last und Temperatur" },
  services: { label: "Dienste", description: "Konfigurierte Dienste und ihre Erreichbarkeit" },
  runtime: { label: "Laufzeit", description: "Projekte, Ports, Prozesse und Terminal-Sessions" },
  diagnostics: { label: "Diagnose", description: "HTTP, Event Loop, Prozessspeicher und Betriebszustand" },
  usage: { label: "Nutzung und Limits", description: "Aktuelle Codex-, OpenCode- und Claude-Limits" },
  news: { label: "News", description: "Anzahl ungelesener Tech-TLDRs und Sync-Status" },
  commands: { label: "Command Reference", description: "Konfigurierte Befehle zum Kopieren" },
};

interface DashboardPreferencesState {
  hiddenSections: Set<DashboardSection>;
  toggleSection: (section: DashboardSection) => void;
  isVisible: (section: DashboardSection) => boolean;
}

const STORAGE_KEY = "remote-workplace.dashboard-preferences.v1";

function validSections(value: unknown): Set<DashboardSection> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((item): item is DashboardSection => typeof item === "string" && allDashboardSections.includes(item as DashboardSection)));
}

export const useDashboardPreferences = create<DashboardPreferencesState>()(
  persist(
    (set, get) => ({
      hiddenSections: new Set<DashboardSection>(),
      toggleSection: (section) => set((state) => {
        const next = new Set(state.hiddenSections);
        if (next.has(section)) next.delete(section);
        else next.add(section);
        return { hiddenSections: next };
      }),
      isVisible: (section) => !get().hiddenSections.has(section),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ hiddenSections: [...state.hiddenSections] }),
      merge: (persisted, current) => {
        const raw = persisted as { hiddenSections?: unknown } | undefined;
        return { ...current, hiddenSections: validSections(raw?.hiddenSections) };
      },
    },
  ),
);

export function isDashboardSectionVisible(
  config: DashboardConfig | undefined,
  hiddenSections: ReadonlySet<DashboardSection>,
  section: DashboardSection,
): boolean {
  return (config?.sections[section] ?? true) && !hiddenSections.has(section);
}
