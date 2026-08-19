import {
  pageContributionSchema,
  routeContributionSchema,
} from "@wrapt/extension-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  PageRouteRegistry,
  PageRouteRegistryError,
  type PageRouteOwnerBatch,
} from "./pageRouteRegistry";

const pageRuntime = Object.freeze({
  chunkId: "test",
  exportName: "TestPage",
  loading: "lazy" as const,
  recovery: "stale-chunk" as const,
  load: () => Promise.resolve({ TestPage: () => null }),
});

const routeRuntime = Object.freeze({
  boundary: "deferred-route" as const,
  aliasBehavior: "render" as const,
  prefetchPathPrefix: "/test",
});

function batch(
  ownerId: string,
  path = "/test",
  parameter = "itemId",
): PageRouteOwnerBatch {
  const pageId = `${ownerId}.page.main`;
  return {
    pages: [
      {
        contribution: pageContributionSchema.parse({
          id: pageId,
          title: "Testseite",
        }),
        runtime: pageRuntime,
      },
    ],
    routes: [
      {
        contribution: routeContributionSchema.parse({
          id: `${ownerId}.route.main`,
          pageId,
          path: path === "/dynamic" ? `/dynamic/:${parameter}` : path,
          persistent: true,
        }),
        runtime: routeRuntime,
      },
    ],
  };
}

function expectSurfaceError(
  action: () => unknown,
  code: PageRouteRegistryError["code"],
): void {
  try {
    action();
    throw new Error("Der erwartete Page-/Route-Registry-Fehler blieb aus.");
  } catch (error) {
    expect(error).toBeInstanceOf(PageRouteRegistryError);
    expect((error as PageRouteRegistryError).code).toBe(code);
  }
}

describe("PageRouteRegistry", () => {
  it("committet Page und Route als einen ownergebundenen Snapshot", () => {
    const registry = new PageRouteRegistry();
    const snapshot = registry.replaceOwner(
      "workbench.test",
      batch("workbench.test"),
    );

    expect(snapshot.revision).toBe(1);
    expect(snapshot.pages).toHaveLength(1);
    expect(snapshot.routes).toHaveLength(1);
    expect(registry.getPage("workbench.test.page.main")?.ownerId).toBe(
      "workbench.test",
    );
    expect(registry.getRoute("workbench.test.route.main")?.value.kind).toBe(
      "route",
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.pages)).toBe(true);
    expect(Object.isFrozen(snapshot.routes)).toBe(true);
  });

  it("weist eine fehlende Page vor dem Commit zurück", () => {
    const registry = new PageRouteRegistry();
    const invalid = batch("workbench.test");
    const before = registry.getSnapshot();

    expectSurfaceError(
      () => registry.replaceOwner("workbench.test", { ...invalid, pages: [] }),
      "missing-page",
    );
    expect(registry.getSnapshot()).toBe(before);
  });

  it("weist fremde Page-Referenzen vor dem Commit zurück", () => {
    const registry = new PageRouteRegistry();
    const invalid = batch("workbench.other");

    expectSurfaceError(
      () => registry.replaceOwner("workbench.test", invalid),
      "foreign-page-reference",
    );
    expect(registry.getSnapshot().revision).toBe(0);
  });

  it("weist unkontrollierte Runtime-Bindings fail-closed ab", () => {
    const registry = new PageRouteRegistry();
    const invalid = batch("workbench.test");

    expectSurfaceError(
      () =>
        registry.replaceOwner("workbench.test", {
          ...invalid,
          pages: [
            {
              ...invalid.pages[0]!,
              runtime: { ...pageRuntime, exportName: "../Unsafe" },
            },
          ],
        }),
      "invalid-page-runtime",
    );
    expectSurfaceError(
      () =>
        registry.replaceOwner("workbench.test", {
          ...invalid,
          routes: [
            {
              ...invalid.routes[0]!,
              runtime: { ...routeRuntime, prefetchPathPrefix: "relative" },
            },
          ],
        }),
      "invalid-route-runtime",
    );
  });

  it("normalisiert dynamische Pfade für globale Kollisionen", () => {
    const registry = new PageRouteRegistry();
    registry.replaceOwner(
      "workbench.first",
      batch("workbench.first", "/dynamic", "itemId"),
    );
    const before = registry.getSnapshot();

    expectSurfaceError(
      () =>
        registry.replaceOwner(
          "workbench.second",
          batch("workbench.second", "/dynamic", "id"),
        ),
      "route-path-collision",
    );
    expect(registry.getSnapshot()).toBe(before);
  });

  it("erlaubt einem Owner, seinen eigenen Pfad atomar zu ersetzen", () => {
    const registry = new PageRouteRegistry();
    registry.replaceOwner("workbench.test", batch("workbench.test"));

    registry.replaceOwner(
      "workbench.test",
      batch("workbench.test", "/replacement"),
    );
    expect(registry.matchRoute("/test")).toBeUndefined();
    expect(registry.matchRoute("/replacement")?.route.ownerId).toBe(
      "workbench.test",
    );
  });

  it("matcht statische Pfade, Parameter und Aliase ohne Query-Heuristik", () => {
    const registry = new PageRouteRegistry();
    const base = batch("workbench.test", "/dynamic", "itemId");
    registry.replaceOwner("workbench.test", {
      ...base,
      routes: [
        {
          ...base.routes[0]!,
          contribution: routeContributionSchema.parse({
            ...base.routes[0]!.contribution,
            aliases: ["/legacy/:itemId"],
          }),
        },
      ],
    });

    expect(registry.matchRoute("/dynamic/42")?.alias).toBe(false);
    expect(registry.matchRoute("/legacy/42")?.alias).toBe(true);
    expect(registry.matchRoute("/dynamic")).toBeUndefined();
    expect(registry.matchRoute("/dynamic/42?tab=all")).toBeUndefined();
  });

  it("benachrichtigt Subscriber und entfernt einen Owner vollständig", () => {
    const registry = new PageRouteRegistry();
    const listener = vi.fn(() => registry.getSnapshot());
    const unsubscribe = registry.subscribe(listener);

    registry.replaceOwner("workbench.test", batch("workbench.test"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(registry.removeOwner("workbench.test")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(registry.getSnapshot()).toMatchObject({ pages: [], routes: [] });

    unsubscribe();
  });
});
