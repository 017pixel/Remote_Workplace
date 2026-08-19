import type { DashboardSection } from "@wrapt/contracts";
import { contributionIdSchema } from "@wrapt/extension-contracts";
import {
  dashboardSectionRegistry,
  type DashboardSectionMetadata,
  type DashboardSectionRegistry,
} from "./dashboardRegistry";

interface LegacyDashboardSectionDefinition {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly order: number;
  readonly legacySectionId: DashboardSection;
}

export interface LegacyDashboardSectionOwner {
  readonly ownerId: string;
  readonly registrations: readonly {
    contribution: DashboardSectionMetadata;
    runtime: { legacySectionId: DashboardSection };
  }[];
}

/**
 * Die neun bisherigen Dashboard-Bereiche als Legacy Built-ins. Reihenfolge,
 * Titel und Beschreibungen entsprechen exakt der bisherigen statischen
 * Quelle; Sichtbarkeit läuft über den Legacy-Alias auf Config und
 * LocalStorage unverändert weiter.
 */
const legacyDashboardSectionDefinitions: readonly LegacyDashboardSectionDefinition[] =
  Object.freeze([
    { id: "wrapt.dashboard.section.quick-actions", title: "Schnellaktionen", description: "T3 Code, Workbench, Terminal, Nutzung und News", order: 10, legacySectionId: "quickActions" },
    { id: "wrapt.dashboard.section.server", title: "Serverstatus", description: "Status, Version, Uptime, Betriebssystem und Tailscale", order: 20, legacySectionId: "server" },
    { id: "wrapt.dashboard.section.metrics", title: "Systemmetriken", description: "CPU, RAM, Speicher, Last und Temperatur", order: 30, legacySectionId: "metrics" },
    { id: "wrapt.dashboard.section.services", title: "Dienste", description: "Konfigurierte Dienste und ihre Erreichbarkeit", order: 40, legacySectionId: "services" },
    { id: "wrapt.dashboard.section.runtime", title: "Laufzeit", description: "Projekte, Ports, Prozesse und Terminal-Sessions", order: 50, legacySectionId: "runtime" },
    { id: "wrapt.dashboard.section.diagnostics", title: "Diagnose", description: "HTTP, Event Loop, Prozessspeicher und Betriebszustand", order: 60, legacySectionId: "diagnostics" },
    { id: "wrapt.dashboard.section.usage", title: "Nutzung und Limits", description: "Aktuelle Codex-, OpenCode- und Claude-Limits", order: 70, legacySectionId: "usage" },
    { id: "wrapt.dashboard.section.news", title: "News", description: "Anzahl ungelesener Tech-TLDRs und Sync-Status", order: 80, legacySectionId: "news" },
    { id: "wrapt.dashboard.section.commands", title: "Command Reference", description: "Konfigurierte Befehle zum Kopieren", order: 90, legacySectionId: "commands" },
  ]);

export const legacyDashboardSectionOwners: readonly LegacyDashboardSectionOwner[] =
  Object.freeze([
    Object.freeze({
      ownerId: "wrapt.dashboard",
      registrations: Object.freeze(
        legacyDashboardSectionDefinitions.map((definition) =>
          Object.freeze({
            contribution: Object.freeze({
              id: contributionIdSchema.parse(definition.id),
              title: definition.title,
              ...(definition.description === undefined
                ? {}
                : { description: definition.description }),
              order: definition.order,
              visibleByDefault: true,
            }),
            runtime: Object.freeze({
              legacySectionId: definition.legacySectionId,
            }),
          }),
        ),
      ),
    }),
  ]);

export function registerLegacyDashboardSections(registry: DashboardSectionRegistry): void {
  for (const builtIn of legacyDashboardSectionOwners) {
    registry.replaceOwner(builtIn.ownerId, builtIn.registrations);
  }
}

let defaultRegistryBootstrapped = false;

export function bootstrapLegacyDashboardSections(): DashboardSectionRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacyDashboardSections(dashboardSectionRegistry);
    defaultRegistryBootstrapped = true;
  }
  return dashboardSectionRegistry;
}
