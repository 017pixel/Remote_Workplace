import type {
  ContextClause,
  ContextExpression,
  ContextKey,
  ContextPrimitive,
} from "@wrapt/extension-contracts";

export type ShortcutContextValues = ReadonlyMap<ContextKey, ContextPrimitive>;

function evaluateClause(
  clause: ContextClause,
  values: ShortcutContextValues,
): boolean {
  const actual = values.get(clause.key);
  switch (clause.operator) {
    case "exists":
      return actual !== undefined;
    case "not-exists":
      return actual === undefined;
    case "equals":
      return actual !== undefined && actual === clause.value;
    case "not-equals":
      return actual === undefined || actual !== clause.value;
    case "in":
      return actual !== undefined && clause.values.includes(actual);
    case "not-in":
      return actual === undefined || !clause.values.includes(actual);
    default:
      return false;
  }
}

function evaluateGroup(
  clauses: readonly ContextClause[],
  operator: "all" | "any" | "none",
  values: ShortcutContextValues,
): boolean {
  const results = clauses.map((clause) => evaluateClause(clause, values));
  if (operator === "all") return results.every(Boolean);
  if (operator === "any") return results.some(Boolean);
  return results.every((result) => !result);
}

/**
 * Wertet eine Context Expression gegen einen Host-Kontext aus. Fehlende Werte
 * gelten als `not-exists` — eine Expression wird nie stillschweigend erfüllt.
 */
export function evaluateContextExpression(
  expression: ContextExpression,
  values: ShortcutContextValues,
): boolean {
  const groups: Array<[string, boolean]> = [];
  if (expression.all !== undefined) {
    groups.push(["all", evaluateGroup(expression.all, "all", values)]);
  }
  if (expression.any !== undefined) {
    groups.push(["any", evaluateGroup(expression.any, "any", values)]);
  }
  if (expression.none !== undefined) {
    groups.push(["none", evaluateGroup(expression.none, "none", values)]);
  }
  return groups.length > 0 && groups.every(([, result]) => result);
}
