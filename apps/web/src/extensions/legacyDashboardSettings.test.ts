import { describe, expect, it } from "vitest";
import { DashboardSectionRegistry } from "./dashboardRegistry";
import {
  legacyDashboardSectionOwners,
  registerLegacyDashboardSections,
} from "./legacyDashboardSections";
import { legacySettingsCards, registerLegacySettingsCards } from "./legacySettingsCards";
import { SettingsCardRegistry } from "./settingsCardRegistry";

describe("legacyDashboardSections", () => {
  it("registriert die neun Bereiche in fester Reihenfolge mit Legacy-Aliasen", () => {
    const registry = new DashboardSectionRegistry();
    registerLegacyDashboardSections(registry);

    const snapshot = registry.getSnapshot();
    expect(snapshot.sections).toHaveLength(9);
    expect(snapshot.sections.map((section) => section.value.runtime.legacySectionId)).toEqual([
      "quickActions",
      "server",
      "metrics",
      "services",
      "runtime",
      "diagnostics",
      "usage",
      "news",
      "commands",
    ]);
    expect(snapshot.sections[0]?.value.contribution.title).toBe("Schnellaktionen");
    expect(snapshot.sections[8]?.value.contribution.title).toBe("Command Reference");
  });

  it("verwendet stabile Contribution-IDs im Owner-Namespace", () => {
    for (const owner of legacyDashboardSectionOwners) {
      for (const registration of owner.registrations) {
        expect(registration.contribution.id).toBe(
          `${owner.ownerId}.section.${registration.runtime.legacySectionId.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        );
      }
    }
  });
});

describe("legacySettingsCards", () => {
  it("registriert die elf bisherigen Settings-Bereiche mit Host-Schutz", () => {
    const registry = new SettingsCardRegistry();
    registerLegacySettingsCards(registry);

    const snapshot = registry.getSnapshot();
    expect(snapshot.cards).toHaveLength(11);
    expect(snapshot.cards.map((card) => card.value.title)).toEqual([
      "Version",
      "Dienst neu starten",
      "T3 Code Kanal",
      "Limitüberwachung",
      "Workspace",
      "Dashboard",
      "Benachrichtigungen",
      "App installieren",
      "Orbit-Sidebar",
      "Seiten-Sichtbarkeit",
      "Sicherheit",
    ]);
    const hostOnly = snapshot.cards.filter((card) => card.value.hostOnly).map((card) => card.value.title);
    expect(hostOnly).toEqual(["Version", "Dienst neu starten", "App installieren", "Sicherheit"]);
  });

  it("verwendet ausschließlich stabile IDs im workbench.settings-Namespace", () => {
    for (const card of legacySettingsCards) {
      expect(card.id.startsWith("workbench.settings.card.")).toBe(true);
      expect(card.order).toBeGreaterThan(0);
    }
  });
});
