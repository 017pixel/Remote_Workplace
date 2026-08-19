import type {
  ContributionId,
  ExtensionId,
} from "@wrapt/extension-contracts";
import {
  FrontendContributionRegistry,
  type FrontendRegistrySnapshot,
  type OwnedFrontendContribution,
} from "./registryCore";

export interface SettingsCardMetadata {
  readonly id: ContributionId;
  readonly title: string;
  readonly description?: string;
  readonly order: number;
  readonly hostOnly: boolean;
}

export type OwnedSettingsCard = OwnedFrontendContribution<SettingsCardMetadata>;

export interface SettingsCardRegistrySnapshot {
  readonly revision: number;
  readonly cards: readonly OwnedSettingsCard[];
}

function compareCards(
  left: OwnedFrontendContribution<SettingsCardMetadata>,
  right: OwnedFrontendContribution<SettingsCardMetadata>,
): number {
  const orderDelta = left.value.order - right.value.order;
  if (orderDelta !== 0) return orderDelta;
  return left.contributionId < right.contributionId
    ? -1
    : left.contributionId > right.contributionId
      ? 1
      : 0;
}

/**
 * Host-Registry für die Settings-Bereiche der Kern-Workbench. Security,
 * Version, Recovery und Installationsverwaltung bleiben als `hostOnly`
 * markiert und sind nicht durch Extensions ersetzbar.
 */
export class SettingsCardRegistry {
  private readonly registry =
    new FrontendContributionRegistry<SettingsCardMetadata>();
  private derivedSnapshot: SettingsCardRegistrySnapshot = Object.freeze({
    revision: 0,
    cards: Object.freeze([]),
  });

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): SettingsCardRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  replaceOwner(
    ownerId: string,
    cards: readonly SettingsCardMetadata[],
  ): SettingsCardRegistrySnapshot {
    this.registry.replaceOwner(
      ownerId,
      cards.map((card) => ({
        id: card.id,
        value: Object.freeze(card),
      })),
    );
    return this.getSnapshot();
  }

  removeOwner(ownerId: string): boolean {
    return this.registry.removeOwner(ownerId);
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<SettingsCardMetadata>,
  ): SettingsCardRegistrySnapshot {
    return Object.freeze({
      revision: snapshot.revision,
      cards: Object.freeze([...snapshot.contributions].sort(compareCards)),
    });
  }
}

export const settingsCardRegistry = new SettingsCardRegistry();

export type { ContributionId, ExtensionId };
