import { describe, expect, it } from "vitest";
import {
  CONTEXT_CLAUSES_MAX_COUNT,
  CONTEXT_IN_VALUES_MAX_COUNT,
  contextClauseSchema,
  contextExpressionKeys,
  contextExpressionSchema,
  contextKeyBelongsToExtension,
  contextKeySchema,
} from "./context-expressions.js";

describe("Context Expressions V1", () => {
  it.each([
    { key: "host.input.focused", operator: "exists" },
    { key: "host.modal.open", operator: "not-exists" },
    {
      key: "host.route.id",
      operator: "equals",
      value: "workbench.agent-tasks.route.main",
    },
    { key: "host.project.open", operator: "not-equals", value: false },
    { key: "host.platform", operator: "in", values: ["mac", "linux"] },
    {
      key: "workbench.agent-tasks.context.has-selection",
      operator: "equals",
      value: true,
    },
  ])("akzeptiert die typisierte Klausel $operator", (clause) => {
    expect(contextClauseSchema.safeParse(clause).success).toBe(true);
  });

  it("hält den Host-Namespace geschlossen und erlaubt eigene Context Keys", () => {
    expect(contextKeySchema.safeParse("host.input.focused").success).toBe(true);
    expect(contextKeySchema.safeParse("host.typo.focused").success).toBe(false);
    expect(
      contextKeySchema.safeParse("workbench.agent-tasks.context.has-selection")
        .success,
    ).toBe(true);
    expect(contextKeySchema.safeParse("hasSelection").success).toBe(false);
  });

  it("weist operatorfremde Felder und leere Wertelisten ab", () => {
    expect(
      contextClauseSchema.safeParse({
        key: "host.input.focused",
        operator: "exists",
        value: true,
      }).success,
    ).toBe(false);
    expect(
      contextClauseSchema.safeParse({
        key: "host.platform",
        operator: "in",
        values: [],
      }).success,
    ).toBe(false);
  });

  it("verlangt homogene, eindeutige und begrenzte In-Werte", () => {
    expect(
      contextClauseSchema.safeParse({
        key: "host.platform",
        operator: "in",
        values: ["mac", true],
      }).success,
    ).toBe(false);
    expect(
      contextClauseSchema.safeParse({
        key: "host.platform",
        operator: "in",
        values: ["mac", "mac"],
      }).success,
    ).toBe(false);
    expect(
      contextClauseSchema.safeParse({
        key: "host.platform",
        operator: "in",
        values: Array.from(
          { length: CONTEXT_IN_VALUES_MAX_COUNT + 1 },
          (_, index) => `value-${index}`,
        ),
      }).success,
    ).toBe(false);
  });

  it("kombiniert all, any und none ohne freie Ausdruckssprache", () => {
    const expression = contextExpressionSchema.parse({
      all: [
        { key: "host.input.focused", operator: "equals", value: false },
        { key: "host.modal.open", operator: "equals", value: false },
      ],
      any: [
        {
          key: "host.route.id",
          operator: "equals",
          value: "workbench.agent-tasks.route.main",
        },
        { key: "host.orbit.focused", operator: "equals", value: true },
      ],
      none: [{ key: "host.terminal.focused", operator: "equals", value: true }],
    });
    expect(contextExpressionKeys(expression)).toEqual([
      "host.input.focused",
      "host.modal.open",
      "host.route.id",
      "host.orbit.focused",
      "host.terminal.focused",
    ]);
  });

  it("weist leere, unbekannte, doppelte und übergroße Expressions ab", () => {
    const clause = {
      key: "host.input.focused",
      operator: "equals",
      value: false,
    } as const;
    expect(contextExpressionSchema.safeParse({}).success).toBe(false);
    expect(
      contextExpressionSchema.safeParse({
        all: [clause],
        script: "return true",
      }).success,
    ).toBe(false);
    expect(
      contextExpressionSchema.safeParse({ all: [clause, clause] }).success,
    ).toBe(false);
    expect(
      contextExpressionSchema.safeParse({
        all: Array.from(
          { length: CONTEXT_CLAUSES_MAX_COUNT + 1 },
          () => clause,
        ),
      }).success,
    ).toBe(false);
  });

  it("ordnet Host- und eigene Keys der deklarierenden Extension zu", () => {
    expect(
      contextKeyBelongsToExtension("workbench.agent-tasks", "host.route.id"),
    ).toBe(true);
    expect(
      contextKeyBelongsToExtension(
        "workbench.agent-tasks",
        "workbench.agent-tasks.context.has-selection",
      ),
    ).toBe(true);
    expect(
      contextKeyBelongsToExtension(
        "workbench.agent-tasks",
        "workbench.other.context.has-selection",
      ),
    ).toBe(false);
  });
});
