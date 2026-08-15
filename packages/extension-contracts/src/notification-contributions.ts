import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionIconReferenceSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contributionIdSchema } from "./ids.js";

export const NOTIFICATION_CONTRIBUTIONS_MAX_COUNT = 128;
export const NOTIFICATION_CATEGORIES_MAX_COUNT = 32;
export const NOTIFICATION_ACTIONS_MAX_COUNT = 16;
export const NOTIFICATION_DEDUPLICATION_KEY_MAX_LENGTH = 200;

export const notificationRetentionClasses = [
  "transient",
  "standard",
  "until-resolved",
] as const;
export const notificationRetentionClassSchema = z.enum(
  notificationRetentionClasses,
);
export type NotificationRetentionClass = z.infer<
  typeof notificationRetentionClassSchema
>;

export const notificationDeduplicationBehaviors = [
  "keep-first",
  "replace-active",
] as const;
export const notificationDeduplicationBehaviorSchema = z.enum(
  notificationDeduplicationBehaviors,
);
export type NotificationDeduplicationBehavior = z.infer<
  typeof notificationDeduplicationBehaviorSchema
>;

export const notificationDeduplicationSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("none") }),
  z.strictObject({
    mode: z.literal("keyed"),
    keyMaxLength: z
      .number()
      .int()
      .min(1)
      .max(NOTIFICATION_DEDUPLICATION_KEY_MAX_LENGTH),
    behavior: notificationDeduplicationBehaviorSchema,
  }),
]);
export type NotificationDeduplication = z.infer<
  typeof notificationDeduplicationSchema
>;

export const notificationCategoryContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
});
export type NotificationCategoryContribution = z.infer<
  typeof notificationCategoryContributionSchema
>;

export const notificationCategoriesSchema = z
  .array(notificationCategoryContributionSchema)
  .min(1)
  .max(NOTIFICATION_CATEGORIES_MAX_COUNT)
  .superRefine((categories, context) => {
    const ids = new Set<string>();
    for (const [index, category] of categories.entries()) {
      if (ids.has(category.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Notification Category ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(category.id);
    }
  })
  .meta({ uniqueItems: true });

export const notificationActionContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  commandId: contributionIdSchema,
});
export type NotificationActionContribution = z.infer<
  typeof notificationActionContributionSchema
>;

export const notificationActionsSchema = z
  .array(notificationActionContributionSchema)
  .min(1)
  .max(NOTIFICATION_ACTIONS_MAX_COUNT)
  .superRefine((actions, context) => {
    const ids = new Set<string>();
    for (const [index, action] of actions.entries()) {
      if (ids.has(action.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Notification Action ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(action.id);
    }
  })
  .meta({ uniqueItems: true });

export const notificationContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: contributionIconReferenceSchema,
  categories: notificationCategoriesSchema,
  actions: notificationActionsSchema.optional(),
  retention: notificationRetentionClassSchema,
  deduplication: notificationDeduplicationSchema,
});
export type NotificationContribution = z.infer<
  typeof notificationContributionSchema
>;

export const notificationContributionsSchema = z
  .array(notificationContributionSchema)
  .min(1)
  .max(NOTIFICATION_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((sources, context) => {
    const ids = new Set<string>();
    for (const [index, source] of sources.entries()) {
      if (ids.has(source.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Notification Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(source.id);
    }
  })
  .meta({ uniqueItems: true });

export type NotificationContributions = z.infer<
  typeof notificationContributionsSchema
>;
