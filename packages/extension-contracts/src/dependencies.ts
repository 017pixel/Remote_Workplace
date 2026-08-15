import { z } from "zod";
import { extensionIdSchema } from "./ids.js";
import { semanticVersionRangeSchema } from "./versioning.js";

export const EXTENSION_DEPENDENCIES_MAX_COUNT = 64;
export const EXTENSION_CONFLICTS_MAX_COUNT = 64;

export const extensionDependencyMapSchema = z
  .record(extensionIdSchema, semanticVersionRangeSchema)
  .superRefine((dependencies, context) => {
    if (Object.keys(dependencies).length <= EXTENSION_DEPENDENCIES_MAX_COUNT) return;
    context.addIssue({
      code: "custom",
      message: `Eine Extension darf höchstens ${EXTENSION_DEPENDENCIES_MAX_COUNT} Abhängigkeiten deklarieren.`,
    });
  })
  .meta({ maxProperties: EXTENSION_DEPENDENCIES_MAX_COUNT });

export type ExtensionDependencyMap = z.infer<typeof extensionDependencyMapSchema>;

export const extensionConflictSchema = z.strictObject({
  id: extensionIdSchema,
  range: semanticVersionRangeSchema.optional(),
});

export type ExtensionConflict = z.infer<typeof extensionConflictSchema>;

export const extensionConflictsSchema = z
  .array(extensionConflictSchema)
  .max(EXTENSION_CONFLICTS_MAX_COUNT)
  .superRefine((conflicts, context) => {
    const seen = new Set<string>();
    for (const [index, conflict] of conflicts.entries()) {
      if (seen.has(conflict.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede inkompatible Extension darf nur einmal deklariert werden.",
          path: [index, "id"],
        });
      }
      seen.add(conflict.id);
    }
  })
  .meta({ uniqueItems: true });

export type ExtensionConflicts = z.infer<typeof extensionConflictsSchema>;
