import { topbarContributionSchema } from "@wrapt/extension-contracts";
import { FullscreenIcon, RefreshIcon } from "../components/icons";
import {
  topbarRegistry,
  type TopbarRegistry,
  type TopbarRuntimeBinding,
} from "./topbarRegistry";

export interface LegacyTopbarOwner {
  readonly ownerId: string;
  readonly registrations: readonly {
    contribution: ReturnType<typeof topbarContributionSchema.parse>;
    runtime: TopbarRuntimeBinding;
  }[];
}

/**
 * Legacy Built-in Topbar Aktionen für die Dateien-Route: Vollbild und
 * Neuladen entsprechen den bisherigen Aktionen des Werkzeugmenüs und
 * referenzieren die globalen Shell-Commands.
 */
export const legacyTopbarOwners: readonly LegacyTopbarOwner[] = Object.freeze([
  Object.freeze({
    ownerId: "wrapt.shell",
    registrations: Object.freeze([
      Object.freeze({
        contribution: topbarContributionSchema.parse({
          id: "wrapt.shell.topbar.fullscreen-toggle",
          kind: "action",
          routeId: "wrapt.files.route.main",
          commandId: "wrapt.shell.command.fullscreen-toggle",
          icon: "extension",
          placement: "secondary",
          order: 10,
          priority: 50,
          presentation: "icon",
          compact: "overflow",
        }),
        runtime: Object.freeze({ icon: FullscreenIcon }),
      }),
      Object.freeze({
        contribution: topbarContributionSchema.parse({
          id: "wrapt.shell.topbar.reload",
          kind: "action",
          routeId: "wrapt.files.route.main",
          commandId: "wrapt.shell.command.reload",
          icon: "extension",
          placement: "secondary",
          order: 20,
          priority: 50,
          presentation: "icon",
          compact: "overflow",
        }),
        runtime: Object.freeze({ icon: RefreshIcon }),
      }),
    ]),
  }),
]);

export function registerLegacyTopbar(registry: TopbarRegistry): void {
  for (const builtIn of legacyTopbarOwners) {
    registry.replaceOwner(builtIn.ownerId, builtIn.registrations);
  }
}

let defaultRegistryBootstrapped = false;

export function bootstrapLegacyTopbar(): TopbarRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacyTopbar(topbarRegistry);
    defaultRegistryBootstrapped = true;
  }
  return topbarRegistry;
}
