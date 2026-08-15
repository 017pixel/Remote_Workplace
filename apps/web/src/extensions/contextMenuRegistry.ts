import type { ComponentType } from "react";
import {
  contextExpressionKeys,
  contextKeyBelongsToExtension,
  contextMenuContributionSchema,
  contextMenuSurfaceBelongsToExtension,
  type ContextExpression,
  type ContextMenuContribution,
  type ContextMenuSurface,
  type ContributionId,
  type ExtensionId,
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

export interface ContextMenuRuntimeBinding {
  readonly icon?: ComponentType<{ className?: string }>;
}

export interface ContextMenuRegistryValue {
  readonly contribution: ContextMenuContribution;
  readonly runtime: ContextMenuRuntimeBinding;
}

export type OwnedContextMenuItem = OwnedFrontendContribution<
  ContextMenuRegistryValue
>;

export interface ContextMenuRegistrySnapshot {
  readonly revision: number;
  readonly items: readonly OwnedContextMenuItem[];
  readonly bySurface: ReadonlyMap<
    ContextMenuSurface,
    readonly OwnedContextMenuItem[]
  >;
}

export const contextMenuRegistryErrorCodes = [
  "invalid-context-menu",
  "invalid-context-menu-runtime",
  "missing-command",
  "foreign-command",
  "foreign-surface",
  "missing-icon",
  "foreign-context-key",
] as const;
export type ContextMenuRegistryErrorCode =
  (typeof contextMenuRegistryErrorCodes)[number];

export class ContextMenuRegistryError extends Error {
  readonly code: ContextMenuRegistryErrorCode;
  readonly ownerId: string;
  readonly contributionId: string | undefined;

  constructor(
    code: ContextMenuRegistryErrorCode,
    message: string,
    ownerId: string,
    contributionId?: string,
  ) {
    super(message);
    this.name = "ContextMenuRegistryError";
    this.code = code;
    this.ownerId = ownerId;
    this.contributionId = contributionId;
  }
}

const groupOrder = [
  "navigation",
  "open",
  "create",
  "edit",
  "run",
  "view",
  "share",
  "danger",
] as const;

function compareContextMenuItems(
  left: OwnedFrontendContribution<ContextMenuRegistryValue>,
  right: OwnedFrontendContribution<ContextMenuRegistryValue>,
): number {
  const groupDelta =
    groupOrder.indexOf(left.value.contribution.group) -
    groupOrder.indexOf(right.value.contribution.group);
  if (groupDelta !== 0) return groupDelta;
  const orderDelta = left.value.contribution.order - right.value.contribution.order;
  if (orderDelta !== 0) return orderDelta;
  return left.contributionId < right.contributionId
    ? -1
    : left.contributionId > right.contributionId
      ? 1
      : 0;
}

/**
 * Typisierte Runtime-Grenze für Context Menu Contributions. Items sind
 * additive Command-Sichten auf stabilen Host- oder Extension-Surfaces;
 * Host-Items bleiben geschützt und werden von dieser Registry nicht
 * überschrieben.
 */
export class ContextMenuRegistry {
  private readonly commands: CommandRegistry;
  private readonly registry =
    new FrontendContributionRegistry<ContextMenuRegistryValue>();
  private derivedSnapshot: ContextMenuRegistrySnapshot = Object.freeze({
    revision: 0,
    items: Object.freeze([]),
    bySurface: new Map(),
  });

  constructor(commands: CommandRegistry = commandRegistry) {
    this.commands = commands;
  }

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): ContextMenuRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  replaceOwner(
    ownerId: string,
    registrations: readonly {
      contribution: ContextMenuContribution;
      runtime: ContextMenuRuntimeBinding;
    }[],
  ): ContextMenuRegistrySnapshot {
    const values = registrations.map((registration) => {
      const parsed = contextMenuContributionSchema.safeParse(
        registration.contribution,
      );
      if (!parsed.success) {
        throw new ContextMenuRegistryError(
          "invalid-context-menu",
          "Eine gültige Context Menu Contribution wird erwartet.",
          ownerId,
          registration.contribution.id,
        );
      }
      const runtime = registration.runtime;
      if (
        typeof runtime !== "object" ||
        runtime === null ||
        (runtime.icon !== undefined && typeof runtime.icon !== "function")
      ) {
        throw new ContextMenuRegistryError(
          "invalid-context-menu-runtime",
          "Die Context Menu Contribution benötigt eine kontrollierte Runtime-Bindung.",
          ownerId,
          parsed.data.id,
        );
      }

      if (!contextMenuSurfaceBelongsToExtension(ownerId, parsed.data.surface)) {
        throw new ContextMenuRegistryError(
          "foreign-surface",
          "Context Menu Surfaces müssen Host-Surfaces oder Contributions des eigenen Owners sein.",
          ownerId,
          parsed.data.id,
        );
      }

      if (parsed.data.icon === "extension" && runtime.icon === undefined) {
        throw new ContextMenuRegistryError(
          "missing-icon",
          "Eine Manifest-Icon-Referenz benötigt eine Runtime-Icon-Komponente.",
          ownerId,
          parsed.data.id,
        );
      }

      const command = this.commands.get(parsed.data.commandId);
      if (command === undefined) {
        throw new ContextMenuRegistryError(
          "missing-command",
          "Ein Context Menu Item muss einen registrierten Command referenzieren.",
          ownerId,
          parsed.data.id,
        );
      }
      if (command.ownerId !== ownerId) {
        throw new ContextMenuRegistryError(
          "foreign-command",
          "Ein Context Menu Item darf nur einen Command seines eigenen Owners referenzieren.",
          ownerId,
          parsed.data.id,
        );
      }

      if (parsed.data.when !== undefined) {
        for (const key of contextExpressionKeys(parsed.data.when)) {
          if (!contextKeyBelongsToExtension(ownerId, key)) {
            throw new ContextMenuRegistryError(
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

  visibleIn(item: OwnedContextMenuItem, values: ShortcutContextValues): boolean {
    const when: ContextExpression | undefined = item.value.contribution.when;
    return when === undefined || evaluateContextExpression(when, values);
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<ContextMenuRegistryValue>,
  ): ContextMenuRegistrySnapshot {
    const items = Object.freeze(
      [...snapshot.contributions].sort(compareContextMenuItems),
    );
    const bySurface = new Map<ContextMenuSurface, OwnedContextMenuItem[]>();
    for (const item of items) {
      const list = bySurface.get(item.value.contribution.surface) ?? [];
      list.push(item);
      bySurface.set(item.value.contribution.surface, list);
    }
    const frozenBySurface = new Map<ContextMenuSurface, readonly OwnedContextMenuItem[]>();
    for (const [surface, list] of bySurface) {
      frozenBySurface.set(surface, Object.freeze(list));
    }
    return Object.freeze({
      revision: snapshot.revision,
      items,
      bySurface: frozenBySurface,
    });
  }
}

export const contextMenuRegistry = new ContextMenuRegistry();

export type { ContributionId, ExtensionId };
