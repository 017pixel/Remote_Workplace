import { statusBarContributionSchema } from "@workbench/extension-contracts";
import {
  statusBarRegistry,
  type StatusBarRegistry,
  type StatusBarRuntimeBinding,
} from "./statusBarRegistry";

export interface LegacyStatusBarOwner {
  readonly ownerId: string;
  readonly registrations: readonly {
    contribution: ReturnType<typeof statusBarContributionSchema.parse>;
    runtime: StatusBarRuntimeBinding;
  }[];
}

/**
 * Die drei bisherigen Usage Provider der Statusleiste als Legacy Built-ins.
 * Reihenfolge, Labels und Anzeigename entsprechen exakt der bisherigen
 * statischen Quelle; die Werte bleiben über `usageProviderId` an die
 * bestehende Usage-Query gebunden.
 */
export const legacyStatusBarOwners: readonly LegacyStatusBarOwner[] =
  Object.freeze([
    Object.freeze({
      ownerId: "workbench.usage",
      registrations: Object.freeze([
        Object.freeze({
          contribution: statusBarContributionSchema.parse({
            id: "workbench.usage.statusbar.codex",
            title: "Codex",
            kind: "text",
            provider: "workbench.usage.statusbar.provider.codex",
            alignment: "right",
            order: 10,
            priority: 50,
            compact: "value",
          }),
          runtime: Object.freeze({ usageProviderId: "codex", usageProviderTitle: "Codex" }),
        }),
        Object.freeze({
          contribution: statusBarContributionSchema.parse({
            id: "workbench.usage.statusbar.opencode",
            title: "OpenCode",
            kind: "text",
            provider: "workbench.usage.statusbar.provider.opencode",
            alignment: "right",
            order: 20,
            priority: 50,
            compact: "value",
          }),
          runtime: Object.freeze({ usageProviderId: "opencode", usageProviderTitle: "OpenCode" }),
        }),
        Object.freeze({
          contribution: statusBarContributionSchema.parse({
            id: "workbench.usage.statusbar.claude",
            title: "Claude",
            kind: "text",
            provider: "workbench.usage.statusbar.provider.claude",
            alignment: "right",
            order: 30,
            priority: 50,
            compact: "value",
          }),
          runtime: Object.freeze({ usageProviderId: "claude", usageProviderTitle: "Claude Code" }),
        }),
      ]),
    }),
  ]);

export function registerLegacyStatusBar(registry: StatusBarRegistry): void {
  for (const builtIn of legacyStatusBarOwners) {
    registry.replaceOwner(builtIn.ownerId, builtIn.registrations);
  }
}

let defaultRegistryBootstrapped = false;

export function bootstrapLegacyStatusBar(): StatusBarRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacyStatusBar(statusBarRegistry);
    defaultRegistryBootstrapped = true;
  }
  return statusBarRegistry;
}
