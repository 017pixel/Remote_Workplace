import type { ComponentType } from "react";
import {
  contributionBelongsToExtension,
  navigationContributionSchema,
  type ContributionId,
  type ExtensionId,
  type NavigationContribution,
  type NavigationGroup,
} from "@wrapt/extension-contracts";
import {
  FrontendContributionRegistry,
  type FrontendRegistrySnapshot,
  type OwnedFrontendContribution,
} from "./registryCore";
import {
  pageRouteRegistry,
  type PageRouteRegistry,
} from "./pageRouteRegistry";

export interface NavigationRuntimeBinding {
  readonly icon?: ComponentType<{ className?: string }>;
  /**
   * Legacy-Alias auf die bestehende Page-Sichtbarkeitspräferenz
   * (`PageRouteId` aus Persist v2). Bleibt lesbar, bis serverseitige
   * Nutzerpräferenzen die LocalStorage-Quelle in Phase 3 ablösen.
   */
  readonly legacyVisibilityKey?: string;
}

export interface NavigationRegistration {
  readonly contribution: NavigationContribution;
  readonly runtime: NavigationRuntimeBinding;
}

export interface ResolvedNavigationRoute {
  readonly routeId: ContributionId;
  readonly pageId: ContributionId;
  readonly path: string;
  readonly prefetch: "idle" | "none";
  readonly prefetchPathPrefix?: string;
  readonly mobileNavigation: boolean;
}

export interface NavigationRegistryValue {
  readonly contribution: NavigationContribution;
  readonly runtime: NavigationRuntimeBinding;
  readonly route: ResolvedNavigationRoute;
}

export type OwnedNavigationItem = OwnedFrontendContribution<
  NavigationRegistryValue
>;

export interface NavigationRegistrySnapshot {
  readonly revision: number;
  readonly items: readonly OwnedNavigationItem[];
  readonly byGroup: Readonly<
    Record<NavigationGroup, readonly OwnedNavigationItem[]>
  >;
}

export const navigationRegistryErrorCodes = [
  "invalid-navigation",
  "invalid-navigation-runtime",
  "missing-route",
  "foreign-route",
  "missing-icon",
  "foreign-icon-reference",
] as const;
export type NavigationRegistryErrorCode =
  (typeof navigationRegistryErrorCodes)[number];

export class NavigationRegistryError extends Error {
  readonly code: NavigationRegistryErrorCode;
  readonly ownerId: string;
  readonly contributionId: string | undefined;

  constructor(
    code: NavigationRegistryErrorCode,
    message: string,
    ownerId: string,
    contributionId?: string,
  ) {
    super(message);
    this.name = "NavigationRegistryError";
    this.code = code;
    this.ownerId = ownerId;
    this.contributionId = contributionId;
  }
}

function isValidRuntime(runtime: NavigationRuntimeBinding): boolean {
  return (
    typeof runtime === "object" &&
    runtime !== null &&
    (runtime.icon === undefined || typeof runtime.icon === "function") &&
    (runtime.legacyVisibilityKey === undefined ||
      (typeof runtime.legacyVisibilityKey === "string" &&
        runtime.legacyVisibilityKey.length > 0))
  );
}

const groupOrder: readonly NavigationGroup[] = [
  "workspace",
  "tools",
  "extensions",
  "account",
  "system",
];

function compareNavigationItems(
  left: OwnedFrontendContribution<NavigationRegistryValue>,
  right: OwnedFrontendContribution<NavigationRegistryValue>,
): number {
  const groupDelta =
    groupOrder.indexOf(left.value.contribution.group) -
    groupOrder.indexOf(right.value.contribution.group);
  if (groupDelta !== 0) return groupDelta;
  const orderDelta =
    left.value.contribution.order - right.value.contribution.order;
  if (orderDelta !== 0) return orderDelta;
  return left.contributionId < right.contributionId
    ? -1
    : left.contributionId > right.contributionId
      ? 1
      : 0;
}

const emptyGroups = (): Readonly<
  Record<NavigationGroup, readonly OwnedNavigationItem[]>
> =>
  Object.freeze({
    workspace: Object.freeze([]),
    tools: Object.freeze([]),
    extensions: Object.freeze([]),
    account: Object.freeze([]),
    system: Object.freeze([]),
  });

/**
 * Typisierte Runtime-Grenze für Navigation Contributions. Ein Item referenziert
 * eine Route desselben Owners und friert deren Pfad-, Prefetch- und
 * Mobile-Metadaten zum Commit-Zeitpunkt ein. Die Route bleibt damit die einzige
 * Quelle für Pfad und Prefetch; die Navigation kopiert sie nicht.
 */
export class NavigationRegistry {
  private readonly pageRoutes: PageRouteRegistry;
  private readonly registry =
    new FrontendContributionRegistry<NavigationRegistryValue>();
  // Stabilisiert Value-Referenzen für identische Eingaben, damit der
  // Kern-Snapshot unverändert bleibt und Subscriber nicht unnötig feuern.
  private readonly valueCache = new Map<
    ContributionId,
    { contribution: unknown; runtime: unknown; value: NavigationRegistryValue }
  >();
  private derivedSnapshot: NavigationRegistrySnapshot = Object.freeze({
    revision: 0,
    items: Object.freeze([]),
    byGroup: emptyGroups(),
  });

  constructor(pageRoutes: PageRouteRegistry = pageRouteRegistry) {
    this.pageRoutes = pageRoutes;
  }

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): NavigationRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  replaceOwner(
    ownerId: string,
    registrations: readonly NavigationRegistration[],
  ): NavigationRegistrySnapshot {
    const values = registrations.map((registration) => {
      const cached = this.valueCache.get(
        registration.contribution.id as ContributionId,
      );
      if (
        cached !== undefined &&
        cached.contribution === registration.contribution &&
        cached.runtime === registration.runtime
      ) {
        return cached.value;
      }

      const parsed = navigationContributionSchema.safeParse(
        registration.contribution,
      );
      if (!parsed.success) {
        throw new NavigationRegistryError(
          "invalid-navigation",
          "Eine gültige Navigation Contribution wird erwartet.",
          ownerId,
          registration.contribution.id,
        );
      }
      if (!isValidRuntime(registration.runtime)) {
        throw new NavigationRegistryError(
          "invalid-navigation-runtime",
          "Die Navigation benötigt eine kontrollierte Runtime-Bindung.",
          ownerId,
          parsed.data.id,
        );
      }

      const iconReference = parsed.data.icon;
      if (iconReference === "extension" && registration.runtime.icon === undefined) {
        throw new NavigationRegistryError(
          "missing-icon",
          "Eine Manifest-Icon-Referenz benötigt eine Runtime-Icon-Komponente.",
          ownerId,
          parsed.data.id,
        );
      }
      if (
        iconReference !== undefined &&
        iconReference !== "extension" &&
        !contributionBelongsToExtension(ownerId, iconReference)
      ) {
        throw new NavigationRegistryError(
          "foreign-icon-reference",
          "Eine Icon-Referenz darf nur Contributions des eigenen Owners adressieren.",
          ownerId,
          parsed.data.id,
        );
      }

      const route = this.pageRoutes.getRoute(parsed.data.routeId);
      if (route === undefined) {
        throw new NavigationRegistryError(
          "missing-route",
          "Eine Navigation Contribution muss eine registrierte Route referenzieren.",
          ownerId,
          parsed.data.id,
        );
      }
      if (route.ownerId !== ownerId) {
        throw new NavigationRegistryError(
          "foreign-route",
          "Eine Navigation Contribution darf nur eine Route ihres eigenen Owners referenzieren.",
          ownerId,
          parsed.data.id,
        );
      }

      const value = Object.freeze({
        contribution: parsed.data,
        runtime: registration.runtime,
        route: Object.freeze({
          routeId: route.value.contribution.id,
          pageId: route.value.contribution.pageId,
          path: route.value.contribution.path,
          prefetch: route.value.contribution.prefetch,
          ...(route.value.runtime.prefetchPathPrefix === undefined
            ? {}
            : { prefetchPathPrefix: route.value.runtime.prefetchPathPrefix }),
          mobileNavigation: route.value.contribution.mobileNavigation,
        }),
      });
      this.valueCache.set(parsed.data.id, {
        contribution: registration.contribution,
        runtime: registration.runtime,
        value,
      });
      return value;
    });

    for (const [id] of this.valueCache) {
      const contributionId = id as ContributionId;
      if (
        contributionBelongsToExtension(ownerId, contributionId) &&
        !values.some((value) => value.contribution.id === contributionId)
      ) {
        this.valueCache.delete(id);
      }
    }

    this.registry.replaceOwner(
      ownerId,
      values.map((value) => ({
        id: value.contribution.id,
        value,
      })),
    );
    return this.getSnapshot();
  }

  removeOwner(ownerId: string): boolean {
    const removed = this.registry.removeOwner(ownerId);
    if (removed) {
      for (const id of this.valueCache.keys()) {
        if (contributionBelongsToExtension(ownerId, id)) {
          this.valueCache.delete(id);
        }
      }
    }
    return removed;
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<NavigationRegistryValue>,
  ): NavigationRegistrySnapshot {
    const items = Object.freeze(
      [...snapshot.contributions].sort(compareNavigationItems),
    );
    const byGroup: Record<NavigationGroup, OwnedNavigationItem[]> = {
      workspace: [],
      tools: [],
      extensions: [],
      account: [],
      system: [],
    };
    for (const item of items) {
      byGroup[item.value.contribution.group].push(item);
    }
    return Object.freeze({
      revision: snapshot.revision,
      items,
      byGroup: Object.freeze({
        workspace: Object.freeze(byGroup.workspace),
        tools: Object.freeze(byGroup.tools),
        extensions: Object.freeze(byGroup.extensions),
        account: Object.freeze(byGroup.account),
        system: Object.freeze(byGroup.system),
      }),
    });
  }
}

export const navigationRegistry = new NavigationRegistry();

export type { ContributionId, ExtensionId };
