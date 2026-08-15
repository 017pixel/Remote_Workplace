import type { ComponentType } from "react";
import {
  contextExpressionKeys,
  contextKeyBelongsToExtension,
  statusBarContributionSchema,
  type ContextExpression,
  type ContributionId,
  type ExtensionId,
  type StatusBarContribution,
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

export interface StatusBarPayload {
  readonly label?: string;
  readonly value?: string;
}

export interface StatusBarRuntimeBinding {
  readonly getValue?: () => StatusBarPayload | Promise<StatusBarPayload>;
  readonly icon?: ComponentType<{ className?: string }>;
}

export interface StatusBarRegistryValue {
  readonly contribution: StatusBarContribution;
  readonly runtime: StatusBarRuntimeBinding;
}

export type OwnedStatusBarItem = OwnedFrontendContribution<
  StatusBarRegistryValue
>;

export interface StatusBarRegistrySnapshot {
  readonly revision: number;
  readonly items: readonly OwnedStatusBarItem[];
  readonly left: readonly OwnedStatusBarItem[];
  readonly right: readonly OwnedStatusBarItem[];
}

export const statusBarRegistryErrorCodes = [
  "invalid-status-bar",
  "invalid-status-bar-runtime",
  "missing-command",
  "foreign-command",
  "foreign-provider",
  "missing-icon",
  "foreign-context-key",
] as const;
export type StatusBarRegistryErrorCode =
  (typeof statusBarRegistryErrorCodes)[number];

export class StatusBarRegistryError extends Error {
  readonly code: StatusBarRegistryErrorCode;
  readonly ownerId: string;
  readonly contributionId: string | undefined;

  constructor(
    code: StatusBarRegistryErrorCode,
    message: string,
    ownerId: string,
    contributionId?: string,
  ) {
    super(message);
    this.name = "StatusBarRegistryError";
    this.code = code;
    this.ownerId = ownerId;
    this.contributionId = contributionId;
  }
}

function compareStatusBarItems(
  left: OwnedFrontendContribution<StatusBarRegistryValue>,
  right: OwnedFrontendContribution<StatusBarRegistryValue>,
): number {
  if (left.value.contribution.alignment !== right.value.contribution.alignment) {
    return left.value.contribution.alignment === "left" ? -1 : 1;
  }
  const orderDelta =
    left.value.contribution.order - right.value.contribution.order;
  if (orderDelta !== 0) return orderDelta;
  return left.contributionId < right.contributionId
    ? -1
    : left.contributionId > right.contributionId
      ? 1
      : 0;
}

/**
 * Typisierte Runtime-Grenze für Status Bar Contributions. Provider-basierte
 * Typen liefern hostgerenderte Payloads über eine Runtime-Bindung; Aktionen
 * referenzieren Commands der Command Registry. Kernel Health und Recovery
 * bleiben hostgeschützt und sind nicht als Contribution registrierbar.
 */
export class StatusBarRegistry {
  private readonly commands: CommandRegistry;
  private readonly registry =
    new FrontendContributionRegistry<StatusBarRegistryValue>();
  private derivedSnapshot: StatusBarRegistrySnapshot = Object.freeze({
    revision: 0,
    items: Object.freeze([]),
    left: Object.freeze([]),
    right: Object.freeze([]),
  });

  constructor(commands: CommandRegistry = commandRegistry) {
    this.commands = commands;
  }

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): StatusBarRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  replaceOwner(
    ownerId: string,
    registrations: readonly {
      contribution: StatusBarContribution;
      runtime: StatusBarRuntimeBinding;
    }[],
  ): StatusBarRegistrySnapshot {
    const values = registrations.map((registration) => {
      const parsed = statusBarContributionSchema.safeParse(
        registration.contribution,
      );
      if (!parsed.success) {
        throw new StatusBarRegistryError(
          "invalid-status-bar",
          "Eine gültige Status Bar Contribution wird erwartet.",
          ownerId,
          registration.contribution.id,
        );
      }
      const runtime = registration.runtime;
      if (
        typeof runtime !== "object" ||
        runtime === null ||
        (runtime.getValue !== undefined && typeof runtime.getValue !== "function") ||
        (runtime.icon !== undefined && typeof runtime.icon !== "function")
      ) {
        throw new StatusBarRegistryError(
          "invalid-status-bar-runtime",
          "Die Status Bar Contribution benötigt eine kontrollierte Runtime-Bindung.",
          ownerId,
          parsed.data.id,
        );
      }

      if (parsed.data.icon === "extension" && runtime.icon === undefined) {
        throw new StatusBarRegistryError(
          "missing-icon",
          "Eine Manifest-Icon-Referenz benötigt eine Runtime-Icon-Komponente.",
          ownerId,
          parsed.data.id,
        );
      }

      if (parsed.data.kind === "action") {
        this.assertCommand(ownerId, parsed.data.commandId, parsed.data.id);
      } else {
        if (!parsed.data.provider.startsWith(`${ownerId}.`)) {
          throw new StatusBarRegistryError(
            "foreign-provider",
            "Ein Status Bar Provider muss im Namespace des Owners liegen.",
            ownerId,
            parsed.data.id,
          );
        }
        if (parsed.data.commandId !== undefined) {
          this.assertCommand(ownerId, parsed.data.commandId, parsed.data.id);
        }
      }

      this.assertContextKeys(ownerId, parsed.data.id, parsed.data.when);
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

  visibleIn(
    item: OwnedStatusBarItem,
    values: ShortcutContextValues,
  ): boolean {
    const when: ContextExpression | undefined = item.value.contribution.when;
    return when === undefined || evaluateContextExpression(when, values);
  }

  private assertCommand(
    ownerId: string,
    commandId: string,
    contributionId: ContributionId,
  ): void {
    const command = this.commands.get(commandId);
    if (command === undefined) {
      throw new StatusBarRegistryError(
        "missing-command",
        "Eine Status Bar Contribution muss einen registrierten Command referenzieren.",
        ownerId,
        contributionId,
      );
    }
    if (command.ownerId !== ownerId) {
      throw new StatusBarRegistryError(
        "foreign-command",
        "Eine Status Bar Contribution darf nur einen Command ihres eigenen Owners referenzieren.",
        ownerId,
        contributionId,
      );
    }
  }

  private assertContextKeys(
    ownerId: string,
    contributionId: ContributionId,
    when: ContextExpression | undefined,
  ): void {
    if (when === undefined) return;
    for (const key of contextExpressionKeys(when)) {
      if (!contextKeyBelongsToExtension(ownerId, key)) {
        throw new StatusBarRegistryError(
          "foreign-context-key",
          "Context Keys müssen Host-Keys oder Contributions des eigenen Owners sein.",
          ownerId,
          contributionId,
        );
      }
    }
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<StatusBarRegistryValue>,
  ): StatusBarRegistrySnapshot {
    const items = Object.freeze(
      [...snapshot.contributions].sort(compareStatusBarItems),
    );
    return Object.freeze({
      revision: snapshot.revision,
      items,
      left: Object.freeze(
        items.filter((item) => item.value.contribution.alignment === "left"),
      ),
      right: Object.freeze(
        items.filter((item) => item.value.contribution.alignment === "right"),
      ),
    });
  }
}

export const statusBarRegistry = new StatusBarRegistry();

export type { ContributionId, ExtensionId };
