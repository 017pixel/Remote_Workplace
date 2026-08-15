import type {
  ContributionId,
  ExtensionId,
} from "@workbench/extension-contracts";
import type { DashboardSection } from "@workbench/contracts";
import {
  FrontendContributionRegistry,
  type FrontendRegistrySnapshot,
  type OwnedFrontendContribution,
} from "./registryCore";

export interface DashboardSectionMetadata {
  readonly id: ContributionId;
  readonly title: string;
  readonly description?: string;
  readonly order: number;
  readonly visibleByDefault: boolean;
}

export interface DashboardSectionRuntimeBinding {
  /** Legacy-Alias auf die bestehende Config- und LocalStorage-Quelle. */
  readonly legacySectionId: DashboardSection;
  readonly hostOnly?: boolean;
}

export interface DashboardSectionRegistryValue {
  readonly contribution: DashboardSectionMetadata;
  readonly runtime: DashboardSectionRuntimeBinding;
}

export type OwnedDashboardSection = OwnedFrontendContribution<
  DashboardSectionRegistryValue
>;

export interface DashboardSectionRegistrySnapshot {
  readonly revision: number;
  readonly sections: readonly OwnedDashboardSection[];
}

function compareSections(
  left: OwnedFrontendContribution<DashboardSectionRegistryValue>,
  right: OwnedFrontendContribution<DashboardSectionRegistryValue>,
): number {
  const orderDelta = left.value.contribution.order - right.value.contribution.order;
  if (orderDelta !== 0) return orderDelta;
  return left.contributionId < right.contributionId
    ? -1
    : left.contributionId > right.contributionId
      ? 1
      : 0;
}

/**
 * Host-Section-Registry für die Dashboard-Bereiche. Sie trägt die stabilen
 * Section-IDs, Titel und Reihenfolge und liest Sichtbarkeit weiterhin über
 * den Legacy-Alias aus Config und LocalStorage. Die öffentlichen
 * Dashboard-Contribution-Typen (Metric, Card, …) bleiben der Vertrag für
 * künftige Extension-Flächen.
 */
export class DashboardSectionRegistry {
  private readonly registry =
    new FrontendContributionRegistry<DashboardSectionRegistryValue>();
  private derivedSnapshot: DashboardSectionRegistrySnapshot = Object.freeze({
    revision: 0,
    sections: Object.freeze([]),
  });

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): DashboardSectionRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  replaceOwner(
    ownerId: string,
    registrations: readonly {
      contribution: DashboardSectionMetadata;
      runtime: DashboardSectionRuntimeBinding;
    }[],
  ): DashboardSectionRegistrySnapshot {
    this.registry.replaceOwner(
      ownerId,
      registrations.map((registration) => ({
        id: registration.contribution.id,
        value: Object.freeze({
          contribution: Object.freeze(registration.contribution),
          runtime: Object.freeze(registration.runtime),
        }),
      })),
    );
    return this.getSnapshot();
  }

  removeOwner(ownerId: string): boolean {
    return this.registry.removeOwner(ownerId);
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<DashboardSectionRegistryValue>,
  ): DashboardSectionRegistrySnapshot {
    return Object.freeze({
      revision: snapshot.revision,
      sections: Object.freeze(
        [...snapshot.contributions].sort(compareSections),
      ),
    });
  }
}

export const dashboardSectionRegistry = new DashboardSectionRegistry();

export type { ContributionId, ExtensionId };
