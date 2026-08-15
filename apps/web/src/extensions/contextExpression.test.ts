import { describe, expect, it } from "vitest";
import type {
  ContextExpression,
  ContextKey,
} from "@workbench/extension-contracts";
import {
  evaluateContextExpression,
  type ShortcutContextValues,
} from "./contextExpression";

const values = (entries: Array<[ContextKey, string | number | boolean]>): ShortcutContextValues =>
  new Map(entries as Array<[ContextKey, never]>);

describe("evaluateContextExpression", () => {
  it("erfüllt all-Gruppen nur bei vollständiger Übereinstimmung", () => {
    const expression = {
      all: [
        { key: "host.surface", operator: "equals", value: "workbench" },
        { key: "host.input.focused", operator: "not-exists" },
      ],
    } as unknown as ContextExpression;
    expect(
      evaluateContextExpression(
        expression,
        values([["host.surface", "workbench"]]),
      ),
    ).toBe(true);
    expect(
      evaluateContextExpression(
        expression,
        values([
          ["host.surface", "terminal"],
          ["host.input.focused", true],
        ]),
      ),
    ).toBe(false);
  });

  it("erfüllt any-Gruppen bei mindestens einer Übereinstimmung", () => {
    const expression = {
      any: [
        { key: "host.terminal.focused", operator: "exists" },
        { key: "host.browser.focused", operator: "exists" },
      ],
    } as unknown as ContextExpression;
    expect(
      evaluateContextExpression(
        expression,
        values([["host.browser.focused", true]]),
      ),
    ).toBe(true);
    expect(evaluateContextExpression(expression, values([]))).toBe(false);
  });

  it("erfüllt none-Gruppen nur, wenn keine Klausel zutrifft", () => {
    const expression = {
      none: [{ key: "host.modal.open", operator: "exists" }],
    } as unknown as ContextExpression;
    expect(evaluateContextExpression(expression, values([]))).toBe(true);
    expect(
      evaluateContextExpression(
        expression,
        values([["host.modal.open", true]]),
      ),
    ).toBe(false);
  });

  it("kombiniert mehrere Gruppen mit Und", () => {
    const expression = {
      all: [{ key: "host.surface", operator: "equals", value: "workbench" }],
      none: [{ key: "host.modal.open", operator: "exists" }],
    } as unknown as ContextExpression;
    expect(
      evaluateContextExpression(
        expression,
        values([["host.surface", "workbench"]]),
      ),
    ).toBe(true);
    expect(
      evaluateContextExpression(
        expression,
        values([
          ["host.surface", "workbench"],
          ["host.modal.open", true],
        ]),
      ),
    ).toBe(false);
  });

  it("wertet in- und not-in-Klauseln aus", () => {
    const expression = {
      all: [
        {
          key: "host.route.id",
          operator: "in",
          values: ["workbench.orbit.route.main", "workbench.inbox.route.main"],
        },
      ],
    } as unknown as ContextExpression;
    expect(
      evaluateContextExpression(
        expression,
        values([["host.route.id", "workbench.inbox.route.main"]]),
      ),
    ).toBe(true);
    expect(
      evaluateContextExpression(
        expression,
        values([["host.route.id", "workbench.usage.route.main"]]),
      ),
    ).toBe(false);
  });
});
