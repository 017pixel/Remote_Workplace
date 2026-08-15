import { z } from "zod";
import {
  contributionIconReferenceSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contextExpressionSchema } from "./context-expressions.js";
import { contributionIdSchema } from "./ids.js";

export const TOPBAR_CONTRIBUTIONS_MAX_COUNT = 128;
export const TOPBAR_ORDER_MIN = 0;
export const TOPBAR_ORDER_MAX = 10_000;
export const TOPBAR_PRIORITY_MIN = 0;
export const TOPBAR_PRIORITY_MAX = 100;

export const topbarContributionKinds = ["action", "selector"] as const;
export const topbarContributionKindSchema = z.enum(topbarContributionKinds);
export type TopbarContributionKind = z.infer<
  typeof topbarContributionKindSchema
>;

export const topbarPlacements = ["primary", "secondary", "overflow"] as const;
export const topbarPlacementSchema = z.enum(topbarPlacements);
export type TopbarPlacement = z.infer<typeof topbarPlacementSchema>;

export const topbarPresentations = ["icon", "label", "icon-label"] as const;
export const topbarPresentationSchema = z.enum(topbarPresentations);
export type TopbarPresentation = z.infer<typeof topbarPresentationSchema>;

export const topbarCompactModes = ["overflow", "icon", "hide"] as const;
export const topbarCompactModeSchema = z.enum(topbarCompactModes);
export type TopbarCompactMode = z.infer<typeof topbarCompactModeSchema>;

const topbarContributionBaseShape = {
  id: contributionIdSchema,
  routeId: contributionIdSchema,
  icon: contributionIconReferenceSchema.optional(),
  placement: topbarPlacementSchema,
  order: z.number().int().min(TOPBAR_ORDER_MIN).max(TOPBAR_ORDER_MAX),
  priority: z.number().int().min(TOPBAR_PRIORITY_MIN).max(TOPBAR_PRIORITY_MAX),
  presentation: topbarPresentationSchema,
  compact: topbarCompactModeSchema,
  when: contextExpressionSchema.optional(),
};

export const topbarActionContributionSchema = z.strictObject({
  ...topbarContributionBaseShape,
  kind: z.literal("action"),
  commandId: contributionIdSchema,
});

export const topbarSelectorContributionSchema = z.strictObject({
  ...topbarContributionBaseShape,
  kind: z.literal("selector"),
  title: contributionTitleSchema,
  provider: contributionIdSchema,
  commandId: contributionIdSchema,
});

export const topbarContributionSchema = z
  .discriminatedUnion("kind", [
    topbarActionContributionSchema,
    topbarSelectorContributionSchema,
  ])
  .superRefine((item, context) => {
    if (
      (item.presentation === "icon" || item.compact === "icon") &&
      item.icon === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Eine icon-basierte Topbar-Darstellung benötigt eine Icon-Referenz.",
        path: [item.presentation === "icon" ? "presentation" : "compact"],
      });
    }
  });

export type TopbarContribution = z.infer<typeof topbarContributionSchema>;

export const topbarContributionsSchema = z
  .array(topbarContributionSchema)
  .min(1)
  .max(TOPBAR_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Topbar Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type TopbarContributions = z.infer<typeof topbarContributionsSchema>;
