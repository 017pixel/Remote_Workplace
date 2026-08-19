import {
  commandContributionSchema,
  extensionIdSchema,
  type ExtensionId,
} from "@wrapt/extension-contracts";
import type { CommandRegistration } from "../commandRegistry";

export interface BuiltinCommandOwner {
  readonly extensionId: ExtensionId;
  readonly registrations: readonly CommandRegistration[];
}

function owner(
  extensionId: string,
  registrations: readonly CommandRegistration[],
): BuiltinCommandOwner {
  return Object.freeze({
    extensionId: extensionIdSchema.parse(extensionId),
    registrations: Object.freeze(registrations),
  });
}

export const builtinCommandOwners: readonly BuiltinCommandOwner[] = Object.freeze([
  owner("wrapt.orbit", [
    Object.freeze({
      contribution: commandContributionSchema.parse({
        id: "wrapt.orbit.command.project-browser",
        title: "Projektbrowser öffnen",
        description: "Öffnet die Projekt-Auswahl für den Orbit.",
        category: "Orbit",
      }),
      runtime: Object.freeze({
        execute: () => {
          window.dispatchEvent(new CustomEvent("orbit:project-browser"));
        },
      }),
    }),
  ]),
  owner("wrapt.files", [
    Object.freeze({
      contribution: commandContributionSchema.parse({
        id: "wrapt.files.command.fullscreen-toggle",
        title: "Vollbild umschalten",
        description: "Schaltet die Workbench zwischen Fenster und Vollbild um.",
        category: "Dateien",
      }),
      runtime: Object.freeze({
        execute: async () => {
          if (document.fullscreenElement) await document.exitFullscreen();
          else await document.documentElement.requestFullscreen?.();
        },
      }),
    }),
    Object.freeze({
      contribution: commandContributionSchema.parse({
        id: "wrapt.files.command.reload",
        title: "Ansicht neu laden",
        description: "Lädt die aktuelle Workbench-Ansicht neu.",
        category: "Dateien",
      }),
      runtime: Object.freeze({ execute: () => window.location.reload() }),
    }),
  ]),
]);
