import {
  pageContributionSchema,
  routeContributionSchema,
  type NavigationContribution,
} from "@wrapt/extension-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageRouteRegistry } from "./pageRouteRegistry";
import { FrontendRegistryError } from "./registryCore";
import {
  NavigationRegistry,
  NavigationRegistryError,
  type NavigationRegistration,
} from "./navigationRegistry";

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

let pageRoutes: PageRouteRegistry;

function pageRouteBatch(ownerId: string, path = "/test"): void {
  const pageId = `${ownerId}.page.main`;
  pageRoutes.replaceOwner(ownerId, {
    pages: [
      {
        contribution: pageContributionSchema.parse({ id: pageId, title: "Testseite" }),
        runtime: pageRuntime,
      },
    ],
    routes: [
      {
        contribution: routeContributionSchema.parse({
          id: `${ownerId}.route.main`,
          pageId,
          path,
          prefetch: "idle",
          mobileNavigation: true,
        }),
        runtime: routeRuntime,
      },
    ],
  });
}

function TestIcon(): null {
  return null;
}

// Bewusst ohne Schema-Parse: die Registry validiert das Manifest selbst,
// damit negative Fälle auch wirklich die Registry erreichen.
function navigation(
  ownerId: string,
  overrides: Record<string, unknown> = {},
): NavigationRegistration {
  return {
    contribution: {
      id: `${ownerId}.navigation.main`,
      routeId: `${ownerId}.route.main`,
      label: "Testfläche",
      icon: "extension",
      group: "workspace",
      order: 10,
      visibleByDefault: true,
      ...overrides,
    } as NavigationContribution,
    runtime: Object.freeze({ icon: TestIcon }),
  };
}

function expectNavigationError(
  action: () => unknown,
  code: NavigationRegistryError["code"],
): void {
  try {
    action();
    throw new Error("Der erwartete Navigation-Registry-Fehler blieb aus.");
  } catch (error) {
    expect(error).toBeInstanceOf(NavigationRegistryError);
    expect((error as NavigationRegistryError).code).toBe(code);
  }
}

describe("NavigationRegistry", () => {
  beforeEach(() => {
    pageRoutes = new PageRouteRegistry();
  });

  it("friert die Route-Metadaten beim Commit in den Snapshot ein", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    const snapshot = registry.replaceOwner("workbench.test", [navigation("workbench.test")]);

    expect(snapshot.revision).toBe(1);
    expect(snapshot.items).toHaveLength(1);
    const item = snapshot.items[0]!;
    expect(item.value.route).toMatchObject({
      routeId: "workbench.test.route.main",
      pageId: "workbench.test.page.main",
      path: "/test",
      prefetch: "idle",
      prefetchPathPrefix: "/test",
      mobileNavigation: true,
    });
  });

  it("sortiert Items deterministisch nach Gruppe, Reihenfolge und ID", () => {
    pageRouteBatch("workbench.alpha", "/alpha");
    pageRouteBatch("workbench.beta", "/beta");
    const registry = new NavigationRegistry(pageRoutes);
    registry.replaceOwner("workbench.beta", [navigation("workbench.beta", { order: 10, group: "tools" })]);
    registry.replaceOwner("workbench.alpha", [navigation("workbench.alpha", { order: 10, group: "workspace" })]);

    const snapshot = registry.getSnapshot();
    expect(snapshot.items.map((item) => item.value.contribution.group)).toEqual(["workspace", "tools"]);
    expect(snapshot.byGroup.workspace).toHaveLength(1);
    expect(snapshot.byGroup.tools).toHaveLength(1);
    expect(snapshot.byGroup.account).toHaveLength(0);
  });

  it("gruppiert nach allen fünf kontrollierten Gruppen", () => {
    const groups = ["workspace", "tools", "extensions", "account", "system"] as const;
    for (const group of groups) {
      pageRouteBatch(`workbench.${group === "extensions" ? "extra" : group}`, `/${group}`);
    }
    const registry = new NavigationRegistry(pageRoutes);
    for (const [index, group] of groups.entries()) {
      const ownerId = `workbench.${group === "extensions" ? "extra" : group}`;
      registry.replaceOwner(ownerId, [navigation(ownerId, { group, order: index })]);
    }

    const snapshot = registry.getSnapshot();
    expect(snapshot.byGroup.workspace).toHaveLength(1);
    expect(snapshot.byGroup.tools).toHaveLength(1);
    expect(snapshot.byGroup.extensions).toHaveLength(1);
    expect(snapshot.byGroup.account).toHaveLength(1);
    expect(snapshot.byGroup.system).toHaveLength(1);
  });

  it("benachrichtigt Subscriber nur bei einem echten Snapshot-Wechsel", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    const listener = vi.fn();
    registry.subscribe(listener);
    const registrations = [navigation("workbench.test")];
    registry.replaceOwner("workbench.test", registrations);
    registry.replaceOwner("workbench.test", registrations);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("entfernt alle Navigation Contributions eines Owners beim Dispose", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    registry.replaceOwner("workbench.test", [navigation("workbench.test")]);
    expect(registry.removeOwner("workbench.test")).toBe(true);
    expect(registry.getSnapshot().items).toHaveLength(0);
  });

  it("lehnt ein ungültiges Manifest ab", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    expectNavigationError(
      () => registry.replaceOwner("workbench.test", [navigation("workbench.test", { label: "x".repeat(500) })]),
      "invalid-navigation",
    );
  });

  it("lehnt eine ungültige Runtime-Bindung ab", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    const registration = navigation("workbench.test");
    expectNavigationError(
      () => registry.replaceOwner("workbench.test", [{ ...registration, runtime: { icon: "kein-ComponentType" } as never }]),
      "invalid-navigation-runtime",
    );
  });

  it("lehnt eine fehlende Route-Referenz ab", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    expectNavigationError(
      () => registry.replaceOwner("workbench.test", [navigation("workbench.test", { routeId: "workbench.test.route.fehlt" })]),
      "missing-route",
    );
  });

  it("lehnt eine Route eines fremden Owners ab", () => {
    pageRouteBatch("workbench.test", "/test");
    pageRouteBatch("workbench.other", "/other");
    const registry = new NavigationRegistry(pageRoutes);
    expectNavigationError(
      () => registry.replaceOwner("workbench.test", [navigation("workbench.test", { routeId: "workbench.other.route.main" })]),
      "foreign-route",
    );
  });

  it("lehnt eine Manifest-Icon-Referenz ohne Runtime-Icon ab", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    expectNavigationError(
      () => registry.replaceOwner("workbench.test", [{ ...navigation("workbench.test"), runtime: Object.freeze({}) }]),
      "missing-icon",
    );
  });

  it("lehnt eine Icon-Referenz in einen fremden Namespace ab", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    expectNavigationError(
      () => registry.replaceOwner("workbench.test", [navigation("workbench.test", { icon: "workbench.other.icon.main" })]),
      "foreign-icon-reference",
    );
  });

  it("lehnt eine Contribution ID eines fremden Owners ab", () => {
    pageRouteBatch("workbench.test", "/test");
    const registry = new NavigationRegistry(pageRoutes);
    try {
      registry.replaceOwner("workbench.test", [navigation("workbench.test", { id: "workbench.other.navigation.main" })]);
      throw new Error("Der erwartete Namespace-Fehler blieb aus.");
    } catch (error) {
      expect(error).toBeInstanceOf(FrontendRegistryError);
      expect((error as FrontendRegistryError).code).toBe("foreign-namespace");
    }
  });
});
