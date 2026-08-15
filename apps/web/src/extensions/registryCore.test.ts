import { describe, expect, it, vi } from "vitest";
import {
  FrontendContributionRegistry,
  FrontendRegistryError,
} from "./registryCore";

interface TestContribution {
  readonly label: string;
}

function expectRegistryError(
  action: () => unknown,
  code: FrontendRegistryError["code"],
) {
  try {
    action();
    throw new Error("Der erwartete Registry-Fehler blieb aus.");
  } catch (error) {
    expect(error).toBeInstanceOf(FrontendRegistryError);
    expect((error as FrontendRegistryError).code).toBe(code);
  }
}

describe("FrontendContributionRegistry", () => {
  it("ersetzt einen Owner-Batch atomar und sortiert IDs deterministisch", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    const second = { label: "Zweite" };
    const first = { label: "Erste" };

    const snapshot = registry.replaceOwner("workbench.test", [
      { id: "workbench.test.page.second", value: second },
      { id: "workbench.test.page.first", value: first },
    ]);

    expect(snapshot.revision).toBe(1);
    expect(
      snapshot.contributions.map((entry) => entry.contributionId),
    ).toEqual([
      "workbench.test.page.first",
      "workbench.test.page.second",
    ]);
    expect(registry.get("workbench.test.page.first")?.value).toBe(first);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.contributions)).toBe(true);
    expect(Object.isFrozen(snapshot.contributions[0])).toBe(true);
  });

  it("behält Snapshot und Revision bei einem ungültigen Namespace unverändert", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    registry.replaceOwner("workbench.test", [
      { id: "workbench.test.page.main", value: { label: "Vorher" } },
    ]);
    const before = registry.getSnapshot();

    expectRegistryError(
      () =>
        registry.replaceOwner("workbench.test", [
          { id: "workbench.other.page.main", value: { label: "Fremd" } },
        ]),
      "foreign-namespace",
    );
    expect(registry.getSnapshot()).toBe(before);
    expect(registry.get("workbench.test.page.main")?.value.label).toBe(
      "Vorher",
    );
  });

  it("weist ungültige Owner und Contribution IDs fail-closed ab", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    expectRegistryError(
      () => registry.replaceOwner("INVALID", []),
      "invalid-owner",
    );
    expectRegistryError(
      () =>
        registry.replaceOwner("workbench.test", [
          { id: "invalid", value: { label: "Ungültig" } },
        ]),
      "invalid-contribution-id",
    );
    expect(registry.getSnapshot()).toEqual({
      revision: 0,
      contributions: [],
    });
  });

  it("weist doppelte IDs ab, ohne einen Teilbatch zu übernehmen", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    expectRegistryError(
      () =>
        registry.replaceOwner("workbench.test", [
          { id: "workbench.test.page.main", value: { label: "Erste" } },
          { id: "workbench.test.page.main", value: { label: "Zweite" } },
        ]),
      "duplicate-contribution",
    );
    expect(registry.getSnapshot().contributions).toHaveLength(0);
  });

  it("blockiert Kollisionen verschachtelter Extension-Namespaces", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    registry.replaceOwner("workbench.test", [
      { id: "workbench.test.child.page", value: { label: "Parent" } },
    ]);
    const before = registry.getSnapshot();

    expectRegistryError(
      () =>
        registry.replaceOwner("workbench.test.child", [
          { id: "workbench.test.child.page", value: { label: "Child" } },
        ]),
      "contribution-collision",
    );
    expect(registry.getSnapshot()).toBe(before);
  });

  it("überschreibt nur den eigenen Batch und bewahrt andere Owner", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    registry.replaceOwner("workbench.alpha", [
      { id: "workbench.alpha.page.main", value: { label: "Alpha" } },
    ]);
    registry.replaceOwner("workbench.beta", [
      { id: "workbench.beta.page.main", value: { label: "Beta" } },
    ]);

    registry.replaceOwner("workbench.alpha", [
      { id: "workbench.alpha.page.other", value: { label: "Neu" } },
    ]);
    expect(registry.get("workbench.alpha.page.main")).toBeUndefined();
    expect(registry.get("workbench.alpha.page.other")?.value.label).toBe(
      "Neu",
    );
    expect(registry.get("workbench.beta.page.main")?.value.label).toBe(
      "Beta",
    );
  });

  it("ändert einen identischen Owner-Batch nicht erneut", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    const value = { label: "Stabil" };
    registry.replaceOwner("workbench.test", [
      { id: "workbench.test.page.main", value },
    ]);
    const before = registry.getSnapshot();

    const after = registry.replaceOwner("workbench.test", [
      { id: "workbench.test.page.main", value },
    ]);
    expect(after).toBe(before);
  });

  it("stellt stabile Owner-Sichten bereit", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    registry.replaceOwner("workbench.test", [
      { id: "workbench.test.page.second", value: { label: "Zweite" } },
      { id: "workbench.test.page.first", value: { label: "Erste" } },
    ]);
    registry.replaceOwner("workbench.other", [
      { id: "workbench.other.page.main", value: { label: "Andere" } },
    ]);

    const owned = registry.contributionsByOwner("workbench.test");
    expect(owned.map((entry) => entry.value.label)).toEqual([
      "Erste",
      "Zweite",
    ]);
    expect(Object.isFrozen(owned)).toBe(true);
    expect(registry.contributionsByOwner("INVALID")).toEqual([]);
  });

  it("benachrichtigt Subscriber genau einmal pro tatsächlicher Änderung", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const value = { label: "Test" };

    registry.replaceOwner("workbench.test", [
      { id: "workbench.test.page.main", value },
    ]);
    registry.replaceOwner("workbench.test", [
      { id: "workbench.test.page.main", value },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    registry.replaceOwner("workbench.test", []);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("entfernt alle Beiträge eines Owners ohne fremde Runtime-Daten", () => {
    const registry = new FrontendContributionRegistry<TestContribution>();
    const runtime = { label: "Runtime" };
    registry.replaceOwner("workbench.test", [
      { id: "workbench.test.page.main", value: runtime },
    ]);
    registry.replaceOwner("workbench.other", [
      { id: "workbench.other.page.main", value: { label: "Andere" } },
    ]);

    expect(registry.removeOwner("workbench.test")).toBe(true);
    expect(registry.get("workbench.test.page.main")).toBeUndefined();
    expect(registry.get("workbench.other.page.main")).toBeDefined();
    expect(runtime).toEqual({ label: "Runtime" });
    expect(registry.removeOwner("workbench.test")).toBe(false);
    expect(registry.removeOwner("INVALID")).toBe(false);
  });
});
