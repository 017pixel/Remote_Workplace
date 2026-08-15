import { commandContributionSchema } from "@workbench/extension-contracts";
import {
  commandRegistry,
  type CommandRegistry,
  type CommandRegistration,
} from "./commandRegistry";

export interface LegacyCommandOwner {
  readonly ownerId: string;
  readonly registrations: readonly CommandRegistration[];
}

/**
 * Die ersten globalen Legacy Built-in Commands. Sie laufen über dieselben
 * entkoppelten Kanäle wie die bisherigen hart verdrahteten Aktionen — die
 * bestehenden Oberflächen bleiben bis zur Consumer-Migration unverändert.
 */

function fullscreenToggle(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen?.();
  }
}

function reloadWorkbench(): void {
  window.location.reload();
}

export const legacyCommandOwners: readonly LegacyCommandOwner[] =
  Object.freeze([
    Object.freeze({
      ownerId: "workbench.orbit",
      registrations: Object.freeze([
        Object.freeze({
          contribution: commandContributionSchema.parse({
            id: "workbench.orbit.command.project-browser",
            title: "Alle Projekte auswählen",
            description: "Serverordner nach Projekten durchsuchen",
            category: "Orbit",
          }),
          runtime: Object.freeze({
            execute: () => {
              window.dispatchEvent(new Event("orbit:project-browser"));
            },
          }),
        }),
      ]),
    }),
    Object.freeze({
      ownerId: "workbench.shell",
      registrations: Object.freeze([
        Object.freeze({
          contribution: commandContributionSchema.parse({
            id: "workbench.shell.command.fullscreen-toggle",
            title: "Vollbild umschalten",
            description: "Die Workbench im Browser-Vollbild anzeigen",
            category: "Ansicht",
          }),
          runtime: Object.freeze({ execute: fullscreenToggle }),
        }),
        Object.freeze({
          contribution: commandContributionSchema.parse({
            id: "workbench.shell.command.reload",
            title: "Workbench neu laden",
            description: "Das Frontend im Browser neu laden",
            category: "Ansicht",
          }),
          runtime: Object.freeze({ execute: reloadWorkbench }),
        }),
      ]),
    }),
  ]);

export function registerLegacyCommands(registry: CommandRegistry): void {
  for (const builtIn of legacyCommandOwners) {
    registry.replaceOwner(builtIn.ownerId, builtIn.registrations);
  }
}

let defaultRegistryBootstrapped = false;

export function bootstrapLegacyCommands(): CommandRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacyCommands(commandRegistry);
    defaultRegistryBootstrapped = true;
  }
  return commandRegistry;
}
