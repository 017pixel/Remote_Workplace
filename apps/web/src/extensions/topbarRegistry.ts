import type { ComponentType } from "react";
import {
  contextExpressionKeys,
  contextKeyBelongsToExtension,
  topbarContributionSchema,
  type ContextExpression,
  type ContributionId,
  type ExtensionId,
  type TopbarContribution,
} from "@workbench/extension-contracts";
import {
  commandRegistry,
  type CommandRegistry,
} from "./commandRegistry";
import { evaluateContextExpression, type ShortcutContextValues } from "./contextExpression";
import {
  FrontendContributionRegistry,
  type FrontendRegistrySnapshot,
  type OwnedFrontendContribution,
} from "./registryCore";

export interface TopbarSelectorOptions {
  readonly options: readonly { id: string; label: string }[];
  readonly selectedId?: string;
}

export interface TopbarRuntimeBinding {
  readonly icon?: ComponentType<{ className?: string }>;
  readonly getOptions?: () =>
    | TopbarSelectorOptions
    | Promise<TopbarSelectorOptions>;
}

export interface TopbarRegistryValue {
  readonly contribution: TopbarContribution;
  readonly runtime: TopbarRuntimeBinding;
}

export type OwnedTopbarItem = OwnedFrontendContribution<TopbarRegistryValue>;

export interface TopbarRegistrySnapshot {
  readonly revision: number;
  readonly items: readonly OwnedTopbarItem[];
  readonly primary: readonly OwnedTopbarItem[];
  readonly secondary: readonly OwnedTopbarItem[];
  readonly overflow: readonly OwnedTopbarItem[];
}

export const topbarRegistryErrorCodes = [
  "invalid-topbar",
  "invalid-topbar-runtime",
  "missing-command",
  "foreign-command",
  "foreign-provider",
  "missing-icon",
  "foreign-context-key",
] as const;
export type TopbarRegistryErrorCode = (typeof topbarRegistryErrorCodes)[number];

export class TopbarRegistryError extends Error {
  readonly code: TopbarRegistryErrorCode;
  readonly ownerId: string;
  readonly contributionId: string | undefined;

  constructor(
    code: TopbarRegistryErrorCode,
    message: string,
    ownerId: string,
    contributionId?: string,
  ) {
    super(message);
    this.name = "TopbarRegistryError";
    this.code = code;
    this.ownerId = ownerId;
    this.contributionId = contributionId;
  }
}

const placementOrder = { primary: 0, secondary: 1, overflow: 2 } as const;

function compareTopbarItems(
  left: OwnedFrontendContribution<TopbarRegistryValue>,
  right: OwnedFrontendContribution<TopbarRegistryValue>,
): number {
  const placementDelta =
    placementOrder[left.value.contribution.placement] -
    placementOrder[right.value.contribution.placement];
  if (placementDelta !== 0) return placementDelta;
  const orderDelta = left.value.contribution.order - right.value.contribution.order;
  if (orderDelta !== 0) return orderDelta;
  return left.contributionId < right.contributionId
    ? -1
    : left.contributionId > right.contributionId
      ? 1
      : 0;
}

/**
 * Typisierte Runtime-Grenze für Topbar Contributions. Aktionen referenzieren
 * Commands, Selectoren zusätzlich einen namespaced Provider; die Darstellung
 * bleibt vollständig hostgerendert.
 */
export class TopbarRegistry {
  private readonly commands: CommandRegistry;
  private readonly registry =
    new FrontendContributionRegistry<TopbarRegistryValue>();
  private derivedSnapshot: TopbarRegistrySnapshot = Object.freeze({
    revision: 0,
    items: Object.freeze([]),
    primary: Object.freeze([]),
    secondary: Object.freeze([]),
    overflow: Object.freeze([]),
  });

  constructor(commands: CommandRegistry = commandRegistry) {
    this.commands = commands;
  }

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): TopbarRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  replaceOwner(
    ownerId: string,
    registrations: readonly {
      contribution: TopbarContribution;
      runtime: TopbarRuntimeBinding;
    }[],
  ): TopbarRegistrySnapshot {
    const values = registrations.map((registration) => {
      const parsed = topbarContributionSchema.safeParse(
        registration.contribution,
      );
      if (!parsed.success) {
        throw new TopbarRegistryError(
          "invalid-topbar",
          "Eine gültige Topbar Contribution wird erwartet.",
          ownerId,
          registration.contribution.id,
        );
      }
      const runtime = registration.runtime;
      if (
        typeof runtime !== "object" ||
        runtime === null ||
        (runtime.icon !== undefined && typeof runtime.icon !== "function") ||
        (runtime.getOptions !== undefined && typeof runtime.getOptions !== "function")
      ) {
        throw new TopbarRegistryError(
          "invalid-topbar-runtime",
          "Die Topbar Contribution benötigt eine kontrollierte Runtime-Bindung.",
          ownerId,
          parsed.data.id,
        );
      }

      if (parsed.data.icon === "extension" && runtime.icon === undefined) {
        throw new TopbarRegistryError(
          "missing-icon",
          "Eine Manifest-Icon-Referenz benötigt eine Runtime-Icon-Komponente.",
          ownerId,
          parsed.data.id,
        );
      }

      const command = this.commands.get(parsed.data.commandId);
      if (command === undefined) {
        throw new TopbarRegistryError(
          "missing-command",
          "Eine Topbar Contribution muss einen registrierten Command referenzieren.",
          ownerId,
          parsed.data.id,
        );
      }
      if (command.ownerId !== ownerId) {
        throw new TopbarRegistryError(
          "foreign-command",
          "Eine Topbar Contribution darf nur einen Command ihres eigenen Owners referenzieren.",
          ownerId,
          parsed.data.id,
        );
      }

      if (
        parsed.data.kind === "selector" &&
        !parsed.data.provider.startsWith(`${ownerId}.`)
      ) {
        throw new TopbarRegistryError(
          "foreign-provider",
          "Ein Topbar Selector Provider muss im Namespace des Owners liegen.",
          ownerId,
          parsed.data.id,
        );
      }

      if (parsed.data.when !== undefined) {
        for (const key of contextExpressionKeys(parsed.data.when)) {
          if (!contextKeyBelongsToExtension(ownerId, key)) {
            throw new TopbarRegistryError(
              "foreign-context-key",
              "Context Keys müssen Host-Keys oder Contributions des eigenen Owners sein.",
              ownerId,
              parsed.data.id,
            );
          }
        }
      }
      return Object.freeze({ contribution: parsed.data, runtime });
    });

    this.registry.replaceOwner(
      ownerId,
      values.map((value) => ({ id: value.contribution.id, value })),
    );
    return this.getSnapshot();
  }

  removeOwner(ownerId: string): boolean {
    return this.registry.removeOwner(ownerId);
  }

  visibleIn(item: OwnedTopbarItem, values: ShortcutContextValues): boolean {
    const when: ContextExpression | undefined = item.value.contribution.when;
    return when === undefined || evaluateContextExpression(when, values);
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<TopbarRegistryValue>,
  ): TopbarRegistrySnapshot {
    const items = Object.freeze(
      [...snapshot.contributions].sort(compareTopbarItems),
    );
    return Object.freeze({
      revision: snapshot.revision,
      items,
      primary: Object.freeze(
        items.filter((item) => item.value.contribution.placement === "primary"),
      ),
      secondary: Object.freeze(
        items.filter((item) => item.value.contribution.placement === "secondary"),
      ),
      overflow: Object.freeze(
        items.filter((item) => item.value.contribution.placement === "overflow"),
      ),
    });
  }
}

export const topbarRegistry = new TopbarRegistry();

export type { ContributionId, ExtensionId };
