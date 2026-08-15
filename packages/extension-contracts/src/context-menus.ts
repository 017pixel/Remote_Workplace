import { z } from "zod";
import { contributionIconReferenceSchema } from "./contributions.js";
import { contextExpressionSchema } from "./context-expressions.js";
import { contributionBelongsToExtension, contributionIdSchema } from "./ids.js";

export const CONTEXT_MENU_CONTRIBUTIONS_MAX_COUNT = 256;
export const CONTEXT_MENU_ORDER_MIN = 0;
export const CONTEXT_MENU_ORDER_MAX = 10_000;

export const hostContextMenuSurfaces = [
  "host.context-menu.project",
  "host.context-menu.file",
  "host.context-menu.directory",
  "host.context-menu.orbit-node",
  "host.context-menu.orbit-pane",
  "host.context-menu.preview",
  "host.context-menu.terminal",
  "host.context-menu.git",
  "host.context-menu.agent-session",
  "host.context-menu.browser",
  "host.context-menu.tool",
] as const;

export const hostContextMenuSurfaceSchema = z.enum(hostContextMenuSurfaces);
export type HostContextMenuSurface = z.infer<
  typeof hostContextMenuSurfaceSchema
>;

const extensionContextMenuSurfaceSchema = contributionIdSchema.refine(
  (value) => !value.startsWith("host."),
  "Der reservierte host-Namespace darf nur bekannte Context-Menu-Surfaces enthalten.",
);

export const contextMenuSurfaceSchema = z.union([
  hostContextMenuSurfaceSchema,
  extensionContextMenuSurfaceSchema,
]);
export type ContextMenuSurface = z.infer<typeof contextMenuSurfaceSchema>;

export function contextMenuSurfaceBelongsToExtension(
  extensionId: string,
  surface: ContextMenuSurface | string,
): boolean {
  if (hostContextMenuSurfaceSchema.safeParse(surface).success) return true;
  return contributionBelongsToExtension(extensionId, surface);
}

export const contextMenuGroups = [
  "navigation",
  "open",
  "create",
  "edit",
  "run",
  "view",
  "share",
  "danger",
] as const;

export const contextMenuGroupSchema = z.enum(contextMenuGroups);
export type ContextMenuGroup = z.infer<typeof contextMenuGroupSchema>;

export const contextMenuContributionSchema = z.strictObject({
  id: contributionIdSchema,
  surface: contextMenuSurfaceSchema,
  commandId: contributionIdSchema,
  group: contextMenuGroupSchema,
  order: z
    .number()
    .int()
    .min(CONTEXT_MENU_ORDER_MIN)
    .max(CONTEXT_MENU_ORDER_MAX),
  icon: contributionIconReferenceSchema.optional(),
  when: contextExpressionSchema.optional(),
});

export type ContextMenuContribution = z.infer<
  typeof contextMenuContributionSchema
>;

export const contextMenuContributionsSchema = z
  .array(contextMenuContributionSchema)
  .min(1)
  .max(CONTEXT_MENU_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message:
            "Jede Context Menu Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type ContextMenuContributions = z.infer<
  typeof contextMenuContributionsSchema
>;
