import { contextMenuContributionSchema } from "@workbench/extension-contracts";
import {
  contextMenuRegistry,
  type ContextMenuRegistry,
  type ContextMenuRuntimeBinding,
} from "./contextMenuRegistry";

export interface LegacyContextMenuOwner {
  readonly ownerId: string;
  readonly registrations: readonly {
    contribution: ReturnType<typeof contextMenuContributionSchema.parse>;
    runtime: ContextMenuRuntimeBinding;
  }[];
}

/**
 * Legacy Built-in Context Menu Items. Der Projektbrowser-Eintrag ergänzt die
 * Orbit-Fläche additiv über denselben Command, den die Sidebar verwendet.
 */
export const legacyContextMenuOwners: readonly LegacyContextMenuOwner[] =
  Object.freeze([
    Object.freeze({
      ownerId: "workbench.orbit",
      registrations: Object.freeze([
        Object.freeze({
          contribution: contextMenuContributionSchema.parse({
            id: "workbench.orbit.menu.project-browser",
            surface: "host.context-menu.orbit-pane",
            commandId: "workbench.orbit.command.project-browser",
            group: "open",
            order: 10,
          }),
          runtime: Object.freeze({}),
        }),
      ]),
    }),
  ]);

export function registerLegacyContextMenus(registry: ContextMenuRegistry): void {
  for (const builtIn of legacyContextMenuOwners) {
    registry.replaceOwner(builtIn.ownerId, builtIn.registrations);
  }
}

let defaultRegistryBootstrapped = false;

export function bootstrapLegacyContextMenus(): ContextMenuRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacyContextMenus(contextMenuRegistry);
    defaultRegistryBootstrapped = true;
  }
  return contextMenuRegistry;
}
