import type { ComponentType } from "react";
import type {
  ContributionId,
  ExtensionId,
} from "@workbench/extension-contracts";
import type { OrbitPaletteItem } from "../stores/sidebarPreferences";
import type { OrbitPalettePayload } from "../lib/orbitPalette";
import {
  FrontendContributionRegistry,
  type FrontendRegistrySnapshot,
  type OwnedFrontendContribution,
} from "./registryCore";

export const orbitPaletteGroups = ["tools", "blocks", "previews"] as const;
export type OrbitPaletteGroup = (typeof orbitPaletteGroups)[number];

export interface OrbitPaletteMetadata {
  readonly id: ContributionId;
  readonly title: string;
  readonly order: number;
}

export interface OrbitPaletteRuntimeBinding {
  /** Legacy-Alias auf die bestehende LocalStorage-Sichtbarkeit. */
  readonly legacyKey: OrbitPaletteItem;
  readonly icon: ComponentType<{ className?: string }>;
  readonly createPayload: () => OrbitPalettePayload;
}

export interface OrbitPaletteRegistryValue {
  readonly contribution: OrbitPaletteMetadata;
  readonly runtime: OrbitPaletteRuntimeBinding;
  readonly group: OrbitPaletteGroup;
}

export type OwnedOrbitPaletteItem = OwnedFrontendContribution<
  OrbitPaletteRegistryValue
>;

export interface OrbitPaletteRegistrySnapshot {
  readonly revision: number;
  readonly items: readonly OwnedOrbitPaletteItem[];
  readonly byGroup: Readonly<
    Record<OrbitPaletteGroup, readonly OwnedOrbitPaletteItem[]>
  >;
}

function comparePaletteItems(
  left: OwnedFrontendContribution<OrbitPaletteRegistryValue>,
  right: OwnedFrontendContribution<OrbitPaletteRegistryValue>,
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
 * Host-Registry für die Orbit-Seitenpalette. Dokumentversion, geschlossene
 * Knotentypen und `panelTypeSchema` bleiben unverändert; die Palette wird
 * lediglich über stabile Contribution-IDs mit Legacy-Aliasen geführt, damit
 * Phase 4 verifizierte Runtime-Bindings vorfindet.
 */
export class OrbitPaletteRegistry {
  private readonly registry =
    new FrontendContributionRegistry<OrbitPaletteRegistryValue>();
  private derivedSnapshot: OrbitPaletteRegistrySnapshot = Object.freeze({
    revision: 0,
    items: Object.freeze([]),
    byGroup: Object.freeze({
      tools: Object.freeze([]),
      blocks: Object.freeze([]),
      previews: Object.freeze([]),
    }),
  });

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): OrbitPaletteRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  replaceOwner(
    ownerId: string,
    registrations: readonly {
      contribution: OrbitPaletteMetadata;
      runtime: OrbitPaletteRuntimeBinding;
      group: OrbitPaletteGroup;
    }[],
  ): OrbitPaletteRegistrySnapshot {
    this.registry.replaceOwner(
      ownerId,
      registrations.map((registration) => ({
        id: registration.contribution.id,
        value: Object.freeze({
          contribution: Object.freeze(registration.contribution),
          runtime: Object.freeze(registration.runtime),
          group: registration.group,
        }),
      })),
    );
    return this.getSnapshot();
  }

  removeOwner(ownerId: string): boolean {
    return this.registry.removeOwner(ownerId);
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<OrbitPaletteRegistryValue>,
  ): OrbitPaletteRegistrySnapshot {
    const items = Object.freeze(
      [...snapshot.contributions].sort(comparePaletteItems),
    );
    const byGroup: Record<OrbitPaletteGroup, OwnedOrbitPaletteItem[]> = {
      tools: [],
      blocks: [],
      previews: [],
    };
    for (const item of items) {
      byGroup[item.value.group].push(item);
    }
    return Object.freeze({
      revision: snapshot.revision,
      items,
      byGroup: Object.freeze({
        tools: Object.freeze(byGroup.tools),
        blocks: Object.freeze(byGroup.blocks),
        previews: Object.freeze(byGroup.previews),
      }),
    });
  }
}

export const orbitPaletteRegistry = new OrbitPaletteRegistry();

export type { ContributionId, ExtensionId };
