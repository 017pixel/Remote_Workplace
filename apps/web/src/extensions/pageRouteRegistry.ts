import {
  contributionBelongsToExtension,
  pageContributionSchema,
  routeContributionSchema,
  routePathCollisionKey,
  type ContributionId,
  type ExtensionId,
  type PageContribution,
  type RouteContribution,
} from "@workbench/extension-contracts";
import {
  FrontendContributionRegistry,
  type FrontendRegistrySnapshot,
  type OwnedFrontendContribution,
} from "./registryCore";

export type PageModuleLoader = () => Promise<unknown>;

export interface PageRuntimeBinding {
  readonly chunkId: string;
  readonly exportName: string;
  readonly loading: "eager" | "lazy";
  readonly recovery: "none" | "stale-chunk";
  readonly load: PageModuleLoader;
}

export interface RouteRuntimeBinding {
  readonly boundary: "deferred-route";
  readonly aliasBehavior: "render" | "redirect-to-canonical";
  readonly prefetchPathPrefix?: string;
}

export interface PageRegistration {
  readonly contribution: PageContribution;
  readonly runtime: PageRuntimeBinding;
}

export interface RouteRegistration {
  readonly contribution: RouteContribution;
  readonly runtime: RouteRuntimeBinding;
}

export interface PageRouteOwnerBatch {
  readonly pages: readonly PageRegistration[];
  readonly routes: readonly RouteRegistration[];
}

export type PageRouteRegistryValue =
  | Readonly<{ kind: "page"; contribution: PageContribution; runtime: PageRuntimeBinding }>
  | Readonly<{ kind: "route"; contribution: RouteContribution; runtime: RouteRuntimeBinding }>;

export type OwnedPageRegistration = OwnedFrontendContribution<
  Extract<PageRouteRegistryValue, { kind: "page" }>
>;
export type OwnedRouteRegistration = OwnedFrontendContribution<
  Extract<PageRouteRegistryValue, { kind: "route" }>
>;

export interface PageRouteRegistrySnapshot {
  readonly revision: number;
  readonly pages: readonly OwnedPageRegistration[];
  readonly routes: readonly OwnedRouteRegistration[];
}

export const pageRouteRegistryErrorCodes = [
  "invalid-page",
  "invalid-page-runtime",
  "invalid-route",
  "invalid-route-runtime",
  "missing-page",
  "foreign-page-reference",
  "route-path-collision",
] as const;
export type PageRouteRegistryErrorCode =
  (typeof pageRouteRegistryErrorCodes)[number];

export class PageRouteRegistryError extends Error {
  readonly code: PageRouteRegistryErrorCode;
  readonly ownerId: string;
  readonly contributionId: string | undefined;

  constructor(
    code: PageRouteRegistryErrorCode,
    message: string,
    ownerId: string,
    contributionId?: string,
  ) {
    super(message);
    this.name = "PageRouteRegistryError";
    this.code = code;
    this.ownerId = ownerId;
    this.contributionId = contributionId;
  }
}

export interface RouteMatch {
  readonly route: OwnedRouteRegistration;
  readonly matchedPath: string;
  readonly alias: boolean;
}

function isValidPageRuntime(runtime: PageRuntimeBinding): boolean {
  return (
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(runtime.chunkId) &&
    /^[A-Z][A-Za-z0-9]*$/.test(runtime.exportName) &&
    typeof runtime.load === "function" &&
    ((runtime.loading === "eager" && runtime.recovery === "none") ||
      (runtime.loading === "lazy" && runtime.recovery === "stale-chunk"))
  );
}

function isValidRouteRuntime(runtime: RouteRuntimeBinding): boolean {
  return (
    runtime.boundary === "deferred-route" &&
    (runtime.aliasBehavior === "render" ||
      runtime.aliasBehavior === "redirect-to-canonical") &&
    (runtime.prefetchPathPrefix === undefined ||
      /^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/.test(
        runtime.prefetchPathPrefix,
      ))
  );
}

function pathMatchesPattern(pathname: string, pattern: string): boolean {
  if (pathname === "/" || pattern === "/") return pathname === pattern;
  const pathSegments = pathname.split("/").filter(Boolean);
  const patternSegments = pattern.split("/").filter(Boolean);
  if (pathSegments.length !== patternSegments.length) return false;
  return patternSegments.every(
    (segment, index) =>
      segment.startsWith(":") || segment === pathSegments[index],
  );
}

function pageValue(
  contribution: PageContribution,
  runtime: PageRuntimeBinding,
): PageRouteRegistryValue {
  return Object.freeze({ kind: "page", contribution, runtime });
}

function routeValue(
  contribution: RouteContribution,
  runtime: RouteRuntimeBinding,
): PageRouteRegistryValue {
  return Object.freeze({ kind: "route", contribution, runtime });
}

function isPageEntry(
  entry: OwnedFrontendContribution<PageRouteRegistryValue>,
): entry is OwnedPageRegistration {
  return entry.value.kind === "page";
}

function isRouteEntry(
  entry: OwnedFrontendContribution<PageRouteRegistryValue>,
): entry is OwnedRouteRegistration {
  return entry.value.kind === "route";
}

/**
 * Typisierte Runtime-Grenze für Pages und Routes. Ein Owner-Batch enthält beide
 * Contribution-Arten, damit Page-Referenzen und URL-Kollisionen vor dem Commit
 * vollständig geprüft werden.
 */
export class PageRouteRegistry {
  private readonly registry =
    new FrontendContributionRegistry<PageRouteRegistryValue>();
  private derivedSnapshot: PageRouteRegistrySnapshot = Object.freeze({
    revision: 0,
    pages: Object.freeze([]),
    routes: Object.freeze([]),
  });

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): PageRouteRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  getPage(contributionId: string): OwnedPageRegistration | undefined {
    const entry = this.registry.get(contributionId);
    return entry !== undefined && isPageEntry(entry) ? entry : undefined;
  }

  getRoute(contributionId: string): OwnedRouteRegistration | undefined {
    const entry = this.registry.get(contributionId);
    return entry !== undefined && isRouteEntry(entry) ? entry : undefined;
  }

  matchRoute(pathname: string): RouteMatch | undefined {
    if (!pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#")) {
      return undefined;
    }
    for (const route of this.getSnapshot().routes) {
      const paths = [
        route.value.contribution.path,
        ...(route.value.contribution.aliases ?? []),
      ];
      for (const [index, path] of paths.entries()) {
        if (!pathMatchesPattern(pathname, path)) continue;
        return Object.freeze({ route, matchedPath: path, alias: index > 0 });
      }
    }
    return undefined;
  }

  replaceOwner(ownerId: string, batch: PageRouteOwnerBatch): PageRouteRegistrySnapshot {
    const pages = batch.pages.map((registration) => {
      const parsed = pageContributionSchema.safeParse(registration.contribution);
      if (!parsed.success) {
        throw new PageRouteRegistryError(
          "invalid-page",
          "Eine gültige Page Contribution wird erwartet.",
          ownerId,
          registration.contribution.id,
        );
      }
      if (!isValidPageRuntime(registration.runtime)) {
        throw new PageRouteRegistryError(
          "invalid-page-runtime",
          "Die Page benötigt einen gültigen Loader und eine eindeutige Export-Bindung.",
          ownerId,
          parsed.data.id,
        );
      }
      return { contribution: parsed.data, runtime: registration.runtime };
    });

    const routes = batch.routes.map((registration) => {
      const parsed = routeContributionSchema.safeParse(registration.contribution);
      if (!parsed.success) {
        throw new PageRouteRegistryError(
          "invalid-route",
          "Eine gültige Route Contribution wird erwartet.",
          ownerId,
          registration.contribution.id,
        );
      }
      if (!isValidRouteRuntime(registration.runtime)) {
        throw new PageRouteRegistryError(
          "invalid-route-runtime",
          "Die Route benötigt eine kontrollierte Boundary- und Prefetch-Bindung.",
          ownerId,
          parsed.data.id,
        );
      }
      return { contribution: parsed.data, runtime: registration.runtime };
    });

    const pageIds = new Set(pages.map((page) => page.contribution.id));
    for (const route of routes) {
      if (!contributionBelongsToExtension(ownerId, route.contribution.pageId)) {
        throw new PageRouteRegistryError(
          "foreign-page-reference",
          "Eine Route darf nur eine Page ihres eigenen Owners referenzieren.",
          ownerId,
          route.contribution.id,
        );
      }
      if (!pageIds.has(route.contribution.pageId)) {
        throw new PageRouteRegistryError(
          "missing-page",
          "Eine Route muss eine Page aus demselben Owner-Batch referenzieren.",
          ownerId,
          route.contribution.id,
        );
      }
    }

    this.assertPathCollisions(ownerId, routes);
    this.registry.replaceOwner(ownerId, [
      ...pages.map((page) => ({
        id: page.contribution.id,
        value: pageValue(page.contribution, page.runtime),
      })),
      ...routes.map((route) => ({
        id: route.contribution.id,
        value: routeValue(route.contribution, route.runtime),
      })),
    ]);
    return this.getSnapshot();
  }

  removeOwner(ownerId: string): boolean {
    return this.registry.removeOwner(ownerId);
  }

  private assertPathCollisions(
    ownerId: string,
    nextRoutes: readonly RouteRegistration[],
  ): void {
    const seen = new Map<string, ContributionId>();
    const currentRoutes = this.getSnapshot().routes.filter(
      (route) => route.ownerId !== ownerId,
    );
    const candidates = [
      ...currentRoutes.map((route) => route.value.contribution),
      ...nextRoutes.map((route) => route.contribution),
    ];

    for (const route of candidates) {
      for (const path of [route.path, ...(route.aliases ?? [])]) {
        const key = routePathCollisionKey(path);
        if (key === null) continue;
        const collision = seen.get(key);
        if (collision !== undefined) {
          throw new PageRouteRegistryError(
            "route-path-collision",
            `Das URL-Muster ${path} kollidiert mit ${collision}.`,
            ownerId,
            route.id,
          );
        }
        seen.set(key, route.id);
      }
    }
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<PageRouteRegistryValue>,
  ): PageRouteRegistrySnapshot {
    return Object.freeze({
      revision: snapshot.revision,
      pages: Object.freeze(snapshot.contributions.filter(isPageEntry)),
      routes: Object.freeze(snapshot.contributions.filter(isRouteEntry)),
    });
  }
}

export const pageRouteRegistry = new PageRouteRegistry();

export type { ContributionId, ExtensionId };
