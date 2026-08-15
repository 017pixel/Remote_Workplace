import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionIconReferenceSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contextExpressionSchema } from "./context-expressions.js";
import { contributionIdSchema } from "./ids.js";

export const BROWSER_CONTRIBUTIONS_MAX_COUNT = 128;
export const BROWSER_ORDER_MIN = 0;
export const BROWSER_ORDER_MAX = 10_000;

export const browserContributionKinds = ["tool", "action"] as const;
export const browserContributionKindSchema = z.enum(
  browserContributionKinds,
);
export type BrowserContributionKind = z.infer<
  typeof browserContributionKindSchema
>;

export const browserToolOperations = [
  "state.read",
  "selection.read",
  "page.source",
  "page.capture",
  "navigation.control",
  "input.control",
  "devtools.open",
] as const;
export const browserToolOperationSchema = z.enum(browserToolOperations);
export type BrowserToolOperation = z.infer<
  typeof browserToolOperationSchema
>;

export const browserToolOperationsSchema = z
  .array(browserToolOperationSchema)
  .min(1)
  .max(browserToolOperations.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Browser Tool Operations dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

export const browserContributionSurfaces = [
  "toolbar",
  "context-menu",
  "side-panel",
  "mobile-actions",
] as const;
export const browserContributionSurfaceSchema = z.enum(
  browserContributionSurfaces,
);
export type BrowserContributionSurface = z.infer<
  typeof browserContributionSurfaceSchema
>;

export const browserContributionSurfacesSchema = z
  .array(browserContributionSurfaceSchema)
  .min(1)
  .max(browserContributionSurfaces.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Browser Contribution Surfaces dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

export const browserActionGroups = [
  "navigation",
  "page",
  "capture",
  "inspect",
  "session",
  "danger",
] as const;
export const browserActionGroupSchema = z.enum(browserActionGroups);
export type BrowserActionGroup = z.infer<typeof browserActionGroupSchema>;

const browserContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: contributionIconReferenceSchema.optional(),
  order: z.number().int().min(BROWSER_ORDER_MIN).max(BROWSER_ORDER_MAX),
  when: contextExpressionSchema.optional(),
};

export const browserToolContributionSchema = z.strictObject({
  ...browserContributionBaseShape,
  kind: z.literal("tool"),
  provider: contributionIdSchema,
  projectContext: z.boolean(),
  operations: browserToolOperationsSchema,
  surfaces: browserContributionSurfacesSchema,
  visibleByDefault: z.boolean(),
});

export const browserActionContributionSchema = z.strictObject({
  ...browserContributionBaseShape,
  kind: z.literal("action"),
  commandId: contributionIdSchema,
  group: browserActionGroupSchema,
  surfaces: browserContributionSurfacesSchema,
  requiresSession: z.boolean(),
});

export const browserContributionSchema = z.discriminatedUnion("kind", [
  browserToolContributionSchema,
  browserActionContributionSchema,
]);

export type BrowserContribution = z.infer<typeof browserContributionSchema>;

export const browserContributionsSchema = z
  .array(browserContributionSchema)
  .min(1)
  .max(BROWSER_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Browser Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type BrowserContributions = z.infer<
  typeof browserContributionsSchema
>;
