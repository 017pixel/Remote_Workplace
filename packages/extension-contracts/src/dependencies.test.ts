import { describe, expect, it } from "vitest";
import {
  EXTENSION_CONFLICTS_MAX_COUNT,
  EXTENSION_DEPENDENCIES_MAX_COUNT,
  extensionConflictSchema,
  extensionConflictsSchema,
  extensionDependencyMapSchema,
} from "./dependencies.js";

describe("Extension-Abhängigkeiten V1", () => {
  it("bildet stabile Extension IDs auf Semantic-Version-Ranges ab", () => {
    const dependencies = {
      "workbench.projects": "^1.0.0",
      "workbench.notifications": ">=1.2.0 <2.0.0",
    };
    expect(extensionDependencyMapSchema.parse(dependencies)).toEqual(dependencies);
  });

  it.each([
    [{ "WorkBench.Projects": "^1.0.0" }],
    [{ "workbench.projects": "latest" }],
    [{ "workbench.projects": " ^1.0.0" }],
  ])("weist ungültige Dependency Maps ab", (dependencies) => {
    expect(extensionDependencyMapSchema.safeParse(dependencies).success).toBe(false);
  });

  it("begrenzt die Anzahl deklarierter Abhängigkeiten", () => {
    const dependencies = Object.fromEntries(
      Array.from({ length: EXTENSION_DEPENDENCIES_MAX_COUNT + 1 }, (_, index) => [
        `workbench.dependency-${index}`,
        "^1.0.0",
      ]),
    );
    expect(extensionDependencyMapSchema.safeParse(dependencies).success).toBe(false);
  });
});

describe("Extension-Konflikte V1", () => {
  it("akzeptiert Konflikte mit und ohne eingeschränkte Versionsspanne", () => {
    const conflicts = [
      { id: "workbench.legacy-tasks" },
      { id: "workbench.agent-board", range: "<2.0.0" },
    ];
    expect(extensionConflictsSchema.parse(conflicts)).toEqual(conflicts);
  });

  it("weist unbekannte Felder, ungültige IDs und ungültige Ranges ab", () => {
    expect(extensionConflictSchema.safeParse({ id: "workbench.legacy", version: "^1" }).success).toBe(false);
    expect(extensionConflictSchema.safeParse({ id: "legacy", range: "^1" }).success).toBe(false);
    expect(extensionConflictSchema.safeParse({ id: "workbench.legacy", range: "latest" }).success).toBe(false);
  });

  it("weist doppelte Konflikte unabhängig von ihrer Range ab", () => {
    expect(
      extensionConflictsSchema.safeParse([
        { id: "workbench.legacy", range: "^1" },
        { id: "workbench.legacy", range: "^2" },
      ]).success,
    ).toBe(false);
  });

  it("begrenzt die Anzahl deklarierter Konflikte", () => {
    const conflicts = Array.from({ length: EXTENSION_CONFLICTS_MAX_COUNT + 1 }, (_, index) => ({
      id: `workbench.conflict-${index}`,
    }));
    expect(extensionConflictsSchema.safeParse(conflicts).success).toBe(false);
  });
});
