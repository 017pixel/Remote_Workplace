import { z } from "zod";
import {
  contributionIconReferenceSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contextExpressionSchema } from "./context-expressions.js";
import { contributionIdSchema } from "./ids.js";

export const STATUS_BAR_CONTRIBUTIONS_MAX_COUNT = 128;
export const STATUS_BAR_ORDER_MIN = 0;
export const STATUS_BAR_ORDER_MAX = 10_000;
export const STATUS_BAR_PRIORITY_MIN = 0;
export const STATUS_BAR_PRIORITY_MAX = 100;

export const statusBarContributionKinds = [
  "text",
  "status",
  "counter",
  "progress",
  "action",
] as const;
export const statusBarContributionKindSchema = z.enum(
  statusBarContributionKinds,
);
export type StatusBarContributionKind = z.infer<
  typeof statusBarContributionKindSchema
>;

export const statusBarAlignments = ["left", "right"] as const;
export const statusBarAlignmentSchema = z.enum(statusBarAlignments);
export type StatusBarAlignment = z.infer<typeof statusBarAlignmentSchema>;

export const statusBarCompactModes = ["hide", "icon", "value"] as const;
export const statusBarCompactModeSchema = z.enum(statusBarCompactModes);
export type StatusBarCompactMode = z.infer<typeof statusBarCompactModeSchema>;

const statusBarContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  icon: contributionIconReferenceSchema.optional(),
  alignment: statusBarAlignmentSchema,
  order: z.number().int().min(STATUS_BAR_ORDER_MIN).max(STATUS_BAR_ORDER_MAX),
  priority: z
    .number()
    .int()
    .min(STATUS_BAR_PRIORITY_MIN)
    .max(STATUS_BAR_PRIORITY_MAX),
  compact: statusBarCompactModeSchema,
  when: contextExpressionSchema.optional(),
};

const statusBarProviderShape = {
  provider: contributionIdSchema,
  commandId: contributionIdSchema.optional(),
};

export const statusBarTextContributionSchema = z.strictObject({
  ...statusBarContributionBaseShape,
  ...statusBarProviderShape,
  kind: z.literal("text"),
});

export const statusBarStatusContributionSchema = z.strictObject({
  ...statusBarContributionBaseShape,
  ...statusBarProviderShape,
  kind: z.literal("status"),
});

export const statusBarCounterContributionSchema = z.strictObject({
  ...statusBarContributionBaseShape,
  ...statusBarProviderShape,
  kind: z.literal("counter"),
});

export const statusBarProgressContributionSchema = z.strictObject({
  ...statusBarContributionBaseShape,
  ...statusBarProviderShape,
  kind: z.literal("progress"),
});

export const statusBarActionContributionSchema = z.strictObject({
  ...statusBarContributionBaseShape,
  kind: z.literal("action"),
  commandId: contributionIdSchema,
});

export const statusBarContributionSchema = z
  .discriminatedUnion("kind", [
    statusBarTextContributionSchema,
    statusBarStatusContributionSchema,
    statusBarCounterContributionSchema,
    statusBarProgressContributionSchema,
    statusBarActionContributionSchema,
  ])
  .superRefine((item, context) => {
    if (item.compact !== "icon" || item.icon !== undefined) return;
    context.addIssue({
      code: "custom",
      message: "Der Compact Mode icon benötigt eine Icon-Referenz.",
      path: ["compact"],
    });
  });

export type StatusBarContribution = z.infer<typeof statusBarContributionSchema>;

export const statusBarContributionsSchema = z
  .array(statusBarContributionSchema)
  .min(1)
  .max(STATUS_BAR_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Status Bar Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type StatusBarContributions = z.infer<
  typeof statusBarContributionsSchema
>;
