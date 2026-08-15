import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionIconReferenceSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contextExpressionSchema } from "./context-expressions.js";
import { contributionIdSchema } from "./ids.js";

export const PREVIEW_CONTRIBUTIONS_MAX_COUNT = 128;
export const PREVIEW_ORDER_MIN = 0;
export const PREVIEW_ORDER_MAX = 10_000;

export const previewContributionKinds = ["target", "action"] as const;
export const previewContributionKindSchema = z.enum(previewContributionKinds);
export type PreviewContributionKind = z.infer<
  typeof previewContributionKindSchema
>;

export const previewOpenModes = [
  "embedded",
  "external",
  "server-browser",
] as const;
export const previewOpenModeSchema = z.enum(previewOpenModes);
export type PreviewOpenMode = z.infer<typeof previewOpenModeSchema>;

export const previewOpenModesSchema = z
  .array(previewOpenModeSchema)
  .min(1)
  .max(previewOpenModes.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Preview Open Modes dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

export const previewSessionAccessLevels = ["read", "manage"] as const;
export const previewSessionAccessSchema = z.enum(previewSessionAccessLevels);
export type PreviewSessionAccess = z.infer<
  typeof previewSessionAccessSchema
>;

export const previewActionSurfaces = [
  "hub-toolbar",
  "target-menu",
  "session-menu",
  "mobile-actions",
  "diagnostics",
] as const;
export const previewActionSurfaceSchema = z.enum(previewActionSurfaces);
export type PreviewActionSurface = z.infer<
  typeof previewActionSurfaceSchema
>;

export const previewActionSurfacesSchema = z
  .array(previewActionSurfaceSchema)
  .min(1)
  .max(previewActionSurfaces.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Preview Action Surfaces dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

export const previewActionGroups = [
  "session",
  "runtime",
  "view",
  "diagnostics",
  "danger",
] as const;
export const previewActionGroupSchema = z.enum(previewActionGroups);
export type PreviewActionGroup = z.infer<typeof previewActionGroupSchema>;

const previewContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: contributionIconReferenceSchema.optional(),
  order: z.number().int().min(PREVIEW_ORDER_MIN).max(PREVIEW_ORDER_MAX),
  when: contextExpressionSchema.optional(),
};

export const previewTargetContributionSchema = z.strictObject({
  ...previewContributionBaseShape,
  kind: z.literal("target"),
  provider: contributionIdSchema,
  projectContext: z.boolean(),
  sessionAccess: previewSessionAccessSchema,
  openModes: previewOpenModesSchema,
  diagnostics: z.boolean(),
  storageProfiles: z.boolean(),
  visibleByDefault: z.boolean(),
});

export const previewActionContributionSchema = z.strictObject({
  ...previewContributionBaseShape,
  kind: z.literal("action"),
  commandId: contributionIdSchema,
  group: previewActionGroupSchema,
  surfaces: previewActionSurfacesSchema,
  requiresSession: z.boolean(),
});

export const previewContributionSchema = z.discriminatedUnion("kind", [
  previewTargetContributionSchema,
  previewActionContributionSchema,
]);

export type PreviewContribution = z.infer<typeof previewContributionSchema>;

export const previewContributionsSchema = z
  .array(previewContributionSchema)
  .min(1)
  .max(PREVIEW_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Preview Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type PreviewContributions = z.infer<typeof previewContributionsSchema>;
