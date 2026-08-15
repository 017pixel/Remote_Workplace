import { z } from "zod";
import { contributionBelongsToExtension, contributionIdSchema } from "./ids.js";

export const CONTEXT_CLAUSES_MAX_COUNT = 32;
export const CONTEXT_IN_VALUES_MAX_COUNT = 32;
export const CONTEXT_STRING_VALUE_MAX_LENGTH = 256;
export const CONTEXT_NUMBER_ABSOLUTE_LIMIT = 1_000_000_000_000_000;

export const hostContextKeys = [
  "host.input.focused",
  "host.modal.open",
  "host.route.id",
  "host.project.open",
  "host.surface",
  "host.platform",
  "host.orbit.focused",
  "host.terminal.focused",
  "host.preview.focused",
  "host.browser.focused",
  "host.agent.focused",
] as const;

export const hostContextKeySchema = z.enum(hostContextKeys);
export type HostContextKey = z.infer<typeof hostContextKeySchema>;

const extensionContextKeySchema = contributionIdSchema.refine(
  (value) => !value.startsWith("host."),
  "Der reservierte host-Namespace darf nur bekannte Context Keys enthalten.",
);

export const contextKeySchema = z.union([
  hostContextKeySchema,
  extensionContextKeySchema,
]);
export type ContextKey = z.infer<typeof contextKeySchema>;

const contextStringValueSchema = z
  .string()
  .min(1)
  .max(CONTEXT_STRING_VALUE_MAX_LENGTH)
  .refine(
    (value) =>
      value === value.trim() &&
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0);
        return (
          codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
        );
      }),
    "Context-Werte dürfen keine äußeren Leerzeichen oder Steuerzeichen enthalten.",
  );

export const contextPrimitiveSchema = z.union([
  contextStringValueSchema,
  z
    .number()
    .finite()
    .min(-CONTEXT_NUMBER_ABSOLUTE_LIMIT)
    .max(CONTEXT_NUMBER_ABSOLUTE_LIMIT),
  z.boolean(),
]);
export type ContextPrimitive = z.infer<typeof contextPrimitiveSchema>;

export const contextExistsClauseSchema = z.strictObject({
  key: contextKeySchema,
  operator: z.enum(["exists", "not-exists"]),
});

export const contextEqualsClauseSchema = z.strictObject({
  key: contextKeySchema,
  operator: z.enum(["equals", "not-equals"]),
  value: contextPrimitiveSchema,
});

export const contextInClauseSchema = z
  .strictObject({
    key: contextKeySchema,
    operator: z.enum(["in", "not-in"]),
    values: z
      .array(contextPrimitiveSchema)
      .min(1)
      .max(CONTEXT_IN_VALUES_MAX_COUNT)
      .meta({ uniqueItems: true }),
  })
  .superRefine((clause, context) => {
    const expectedType = typeof clause.values[0];
    const seen = new Set<string>();
    for (const [index, value] of clause.values.entries()) {
      if (typeof value !== expectedType) {
        context.addIssue({
          code: "custom",
          message:
            "Alle Werte einer Context-In-Klausel müssen denselben Typ besitzen.",
          path: ["values", index],
        });
      }
      const comparable = `${typeof value}:${String(value)}`;
      if (seen.has(comparable)) {
        context.addIssue({
          code: "custom",
          message: "Context-In-Werte dürfen nicht doppelt vorkommen.",
          path: ["values", index],
        });
      }
      seen.add(comparable);
    }
  });

export const contextClauseSchema = z.union([
  contextExistsClauseSchema,
  contextEqualsClauseSchema,
  contextInClauseSchema,
]);
export type ContextClause = z.infer<typeof contextClauseSchema>;

export const contextClausesSchema = z
  .array(contextClauseSchema)
  .min(1)
  .max(CONTEXT_CLAUSES_MAX_COUNT)
  .superRefine((clauses, context) => {
    const seen = new Set<string>();
    for (const [index, clause] of clauses.entries()) {
      const comparable = JSON.stringify(clause);
      if (seen.has(comparable)) {
        context.addIssue({
          code: "custom",
          message:
            "Identische Context-Klauseln dürfen nicht doppelt vorkommen.",
          path: [index],
        });
      }
      seen.add(comparable);
    }
  })
  .meta({ uniqueItems: true });

export const contextExpressionSchema = z
  .strictObject({
    all: contextClausesSchema.optional(),
    any: contextClausesSchema.optional(),
    none: contextClausesSchema.optional(),
  })
  .refine(
    (expression) =>
      expression.all !== undefined ||
      expression.any !== undefined ||
      expression.none !== undefined,
    "Eine Context Expression benötigt mindestens eine all-, any- oder none-Gruppe.",
  );

export type ContextExpression = z.infer<typeof contextExpressionSchema>;

export function contextExpressionKeys(
  expression: ContextExpression,
): ContextKey[] {
  return [
    ...(expression.all ?? []),
    ...(expression.any ?? []),
    ...(expression.none ?? []),
  ].map((clause) => clause.key);
}

export function contextKeyBelongsToExtension(
  extensionId: string,
  key: ContextKey | string,
): boolean {
  if (hostContextKeySchema.safeParse(key).success) return true;
  return contributionBelongsToExtension(extensionId, key);
}
