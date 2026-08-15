import { contributionIdSchema } from "@workbench/extension-contracts";
import type { SettingsCardMetadata } from "./settingsCardRegistry";
import {
  settingsCardRegistry,
  type SettingsCardRegistry,
} from "./settingsCardRegistry";

/**
 * Die elf bisherigen Settings-Bereiche als Legacy Built-ins. Security,
 * Version, Recovery und Installationsverwaltung bleiben hostOnly und sind
 * nicht durch Extensions ersetzbar.
 */
export const legacySettingsCards: readonly SettingsCardMetadata[] =
  Object.freeze([
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.version"), title: "Version", description: "Wird aus der Health-Antwort gelesen", order: 10, hostOnly: true }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.restart"), title: "Dienst neu starten", description: "Nach Code-Änderungen neu bauen und laden – ohne Datenverlust", order: 20, hostOnly: true }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.t3-channel"), title: "T3 Code Kanal", description: "Stable oder Nightly – gilt für alle T3-Flächen", order: 30, hostOnly: false }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.usage-monitoring"), title: "Limitüberwachung", description: "Limits je Werkzeug erfassen oder pauschal deaktivieren", order: 40, hostOnly: false }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.workspace"), title: "Workspace", description: "Lokaler, persistenter Zustand", order: 50, hostOnly: false }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.dashboard"), title: "Dashboard", description: "Bereiche lokal ein- und ausblenden", order: 60, hostOnly: false }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.notifications"), title: "Benachrichtigungen", description: "Toasts und System-Benachrichtigungen pro Quelle", order: 70, hostOnly: false }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.install"), title: "App installieren", description: "Für einen schnellen Zugriff vom Homescreen oder Desktop", order: 80, hostOnly: true }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.orbit-sidebar"), title: "Orbit-Sidebar", description: "Elemente im Infinite Canvas ein- oder ausblenden", order: 90, hostOnly: false }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.page-visibility"), title: "Seiten-Sichtbarkeit", description: "Navigationselemente global steuern (Sidebar, Dashboard, Mobile)", order: 100, hostOnly: false }),
    Object.freeze({ id: contributionIdSchema.parse("workbench.settings.card.security"), title: "Sicherheit", description: "Keine eigene Anmeldung", order: 110, hostOnly: true }),
  ]);

export function registerLegacySettingsCards(registry: SettingsCardRegistry): void {
  registry.replaceOwner("workbench.settings", legacySettingsCards);
}

let defaultRegistryBootstrapped = false;

export function bootstrapLegacySettingsCards(): SettingsCardRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacySettingsCards(settingsCardRegistry);
    defaultRegistryBootstrapped = true;
  }
  return settingsCardRegistry;
}
