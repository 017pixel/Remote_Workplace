import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionIconReferenceSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contextExpressionSchema } from "./context-expressions.js";
import { contributionIdSchema } from "./ids.js";

export const TERMINAL_CONTRIBUTIONS_MAX_COUNT = 128;
export const TERMINAL_ORDER_MIN = 0;
export const TERMINAL_ORDER_MAX = 10_000;

export const terminalContributionKinds = ["profile", "action"] as const;
export const terminalContributionKindSchema = z.enum(
  terminalContributionKinds,
);
export type TerminalContributionKind = z.infer<
  typeof terminalContributionKindSchema
>;

export const terminalActionSurfaces = [
  "toolbar",
  "session-menu",
  "session-list",
  "mobile-actions",
] as const;
export const terminalActionSurfaceSchema = z.enum(terminalActionSurfaces);
export type TerminalActionSurface = z.infer<
  typeof terminalActionSurfaceSchema
>;

export const terminalActionSurfacesSchema = z
  .array(terminalActionSurfaceSchema)
  .min(1)
  .max(terminalActionSurfaces.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Terminal Action Surfaces dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

export const terminalActionGroups = [
  "create",
  "session",
  "edit",
  "view",
  "danger",
] as const;
export const terminalActionGroupSchema = z.enum(terminalActionGroups);
export type TerminalActionGroup = z.infer<typeof terminalActionGroupSchema>;

const terminalContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: contributionIconReferenceSchema.optional(),
  order: z.number().int().min(TERMINAL_ORDER_MIN).max(TERMINAL_ORDER_MAX),
  when: contextExpressionSchema.optional(),
};

export const terminalProfileContributionSchema = z.strictObject({
  ...terminalContributionBaseShape,
  kind: z.literal("profile"),
  provider: contributionIdSchema,
  projectContext: z.boolean(),
  supportsSplit: z.boolean(),
  visibleByDefault: z.boolean(),
});

export const terminalActionContributionSchema = z.strictObject({
  ...terminalContributionBaseShape,
  kind: z.literal("action"),
  commandId: contributionIdSchema,
  group: terminalActionGroupSchema,
  surfaces: terminalActionSurfacesSchema,
  requiresSession: z.boolean(),
});

export const terminalContributionSchema = z.discriminatedUnion("kind", [
  terminalProfileContributionSchema,
  terminalActionContributionSchema,
]);

export type TerminalContribution = z.infer<typeof terminalContributionSchema>;

export const terminalContributionsSchema = z
  .array(terminalContributionSchema)
  .min(1)
  .max(TERMINAL_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Terminal Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type TerminalContributions = z.infer<
  typeof terminalContributionsSchema
>;
