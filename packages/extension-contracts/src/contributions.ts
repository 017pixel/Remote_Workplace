import { z } from "zod";
import { contributionIdSchema } from "./ids.js";
import { extensionJsonPathSchema } from "./package-paths.js";

export const CONTRIBUTION_TITLE_MAX_LENGTH = 120;
export const CONTRIBUTION_DESCRIPTION_MAX_LENGTH = 500;
export const CONTRIBUTION_CATEGORY_MAX_LENGTH = 80;
export const COMMAND_CONTRIBUTIONS_MAX_COUNT = 256;
export const PAGE_CONTRIBUTIONS_MAX_COUNT = 128;
export const ROUTE_CONTRIBUTIONS_MAX_COUNT = 128;
export const NAVIGATION_CONTRIBUTIONS_MAX_COUNT = 256;
export const ORBIT_CONTRIBUTIONS_MAX_COUNT = 128;
export const DASHBOARD_CONTRIBUTIONS_MAX_COUNT = 256;
export const ROUTE_ALIASES_MAX_COUNT = 16;
export const ROUTE_PATH_MAX_LENGTH = 256;
export const NAVIGATION_ORDER_MIN = 0;
export const NAVIGATION_ORDER_MAX = 10_000;
export const DASHBOARD_ORDER_MIN = 0;
export const DASHBOARD_ORDER_MAX = 10_000;
export const DASHBOARD_REFRESH_INTERVAL_MIN_MS = 1_000;
export const DASHBOARD_REFRESH_INTERVAL_MAX_MS = 600_000;
export const ORBIT_STATE_VERSION_MAX = 1_000_000;
export const EXTENSION_ORBIT_SIZE_LIMITS = {
  minWidth: 160,
  minHeight: 96,
  maxWidth: 20_000,
  maxHeight: 20_000,
} as const;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function contributionTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value === value.trim() && !containsControlCharacter(value),
      `${fieldName} darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.`,
    );
}

export const contributionTitleSchema = contributionTextSchema(
  CONTRIBUTION_TITLE_MAX_LENGTH,
  "Der Titel",
);
export const contributionDescriptionSchema = contributionTextSchema(
  CONTRIBUTION_DESCRIPTION_MAX_LENGTH,
  "Die Beschreibung",
);
export const contributionCategorySchema = contributionTextSchema(
  CONTRIBUTION_CATEGORY_MAX_LENGTH,
  "Die Kategorie",
);

export const commandContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  category: contributionCategorySchema.optional(),
});

export type CommandContribution = z.infer<typeof commandContributionSchema>;

export const commandContributionsSchema = z
  .array(commandContributionSchema)
  .min(1)
  .max(COMMAND_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((commands, context) => {
    const seen = new Set<string>();
    for (const [index, command] of commands.entries()) {
      if (seen.has(command.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Command Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(command.id);
    }
  })
  .meta({ uniqueItems: true });

export type CommandContributions = z.infer<typeof commandContributionsSchema>;

export const pageContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
});

export type PageContribution = z.infer<typeof pageContributionSchema>;

export const pageContributionsSchema = z
  .array(pageContributionSchema)
  .min(1)
  .max(PAGE_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((pages, context) => {
    const seen = new Set<string>();
    for (const [index, page] of pages.entries()) {
      if (seen.has(page.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Page Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(page.id);
    }
  })
  .meta({ uniqueItems: true });

export type PageContributions = z.infer<typeof pageContributionsSchema>;

const routeStaticSegmentPattern = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const routeParameterSegmentPattern = ":[a-z][A-Za-z0-9]*";

export const routePathPattern = new RegExp(
  `^(?:/|/(?:${routeStaticSegmentPattern}|${routeParameterSegmentPattern})(?:/(?:${routeStaticSegmentPattern}|${routeParameterSegmentPattern}))*)$`,
);

export const routePathSchema = z
  .string()
  .max(ROUTE_PATH_MAX_LENGTH)
  .regex(
    routePathPattern,
    "Ein absoluter Extension-Pfad mit statischen Segmenten oder benannten Pflichtparametern wird erwartet.",
  )
  .brand<"ExtensionRoutePath">();

export type ExtensionRoutePath = z.infer<typeof routePathSchema>;

export function routePathCollisionKey(
  path: ExtensionRoutePath | string,
): string | null {
  const parsedPath = routePathSchema.safeParse(path);
  if (!parsedPath.success) return null;
  if (parsedPath.data === "/") return "/";
  return parsedPath.data
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":" : segment))
    .join("/");
}

export const routeAliasesSchema = z
  .array(routePathSchema)
  .min(1)
  .max(ROUTE_ALIASES_MAX_COUNT)
  .superRefine((aliases, context) => {
    const seen = new Set<string>();
    for (const [index, alias] of aliases.entries()) {
      const collisionKey = routePathCollisionKey(alias);
      if (collisionKey !== null && seen.has(collisionKey)) {
        context.addIssue({
          code: "custom",
          message:
            "Route Aliases dürfen keine identischen URL-Muster besitzen.",
          path: [index],
        });
      }
      if (collisionKey !== null) seen.add(collisionKey);
    }
  })
  .meta({ uniqueItems: true });

export const routeShells = ["standard", "full-bleed", "standalone"] as const;
export const routeShellSchema = z.enum(routeShells);
export type RouteShell = z.infer<typeof routeShellSchema>;

export const routePrefetchModes = ["none", "idle"] as const;
export const routePrefetchSchema = z.enum(routePrefetchModes);
export type RoutePrefetch = z.infer<typeof routePrefetchSchema>;

export const routeContributionSchema = z
  .strictObject({
    id: contributionIdSchema,
    pageId: contributionIdSchema,
    path: routePathSchema,
    aliases: routeAliasesSchema.optional(),
    title: contributionTitleSchema.optional(),
    shell: routeShellSchema.default("standard"),
    persistent: z.boolean().default(false),
    prefetch: routePrefetchSchema.default("none"),
    projectContext: z.boolean().default(false),
    topbar: z.boolean().default(true),
    breadcrumbs: z.boolean().default(true),
    standaloneActions: z.boolean().default(false),
    mobileNavigation: z.boolean().default(false),
  })
  .superRefine((route, context) => {
    const primaryCollisionKey = routePathCollisionKey(route.path);
    for (const [index, alias] of (route.aliases ?? []).entries()) {
      if (routePathCollisionKey(alias) !== primaryCollisionKey) continue;
      context.addIssue({
        code: "custom",
        message:
          "Ein Route Alias darf nicht dasselbe URL-Muster wie der Hauptpfad besitzen.",
        path: ["aliases", index],
      });
    }
  });

export type RouteContribution = z.infer<typeof routeContributionSchema>;

export const routeContributionsSchema = z
  .array(routeContributionSchema)
  .min(1)
  .max(ROUTE_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((routes, context) => {
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();

    for (const [index, route] of routes.entries()) {
      if (seenIds.has(route.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Route Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seenIds.add(route.id);

      for (const [pathIndex, path] of [
        route.path,
        ...(route.aliases ?? []),
      ].entries()) {
        const collisionKey = routePathCollisionKey(path);
        if (collisionKey !== null && seenPaths.has(collisionKey)) {
          context.addIssue({
            code: "custom",
            message:
              "Routes und Aliases dürfen keine kollidierenden URL-Muster besitzen.",
            path:
              pathIndex === 0
                ? [index, "path"]
                : [index, "aliases", pathIndex - 1],
          });
        }
        if (collisionKey !== null) seenPaths.add(collisionKey);
      }
    }
  })
  .meta({ uniqueItems: true });

export type RouteContributions = z.infer<typeof routeContributionsSchema>;

export const navigationGroups = [
  "workspace",
  "tools",
  "extensions",
  "account",
  "system",
] as const;
export const navigationGroupSchema = z.enum(navigationGroups);
export type NavigationGroup = z.infer<typeof navigationGroupSchema>;

// `extension` verwendet das sichere lokale Manifest-Icon. Eine namespaced ID wird später
// durch den UI-Entrypoint gegen die kontrollierte Icon Registry aufgelöst.
export const contributionIconReferenceSchema = z.union([
  z.literal("extension"),
  contributionIdSchema,
]);
export type ContributionIconReference = z.infer<
  typeof contributionIconReferenceSchema
>;
export const navigationIconReferenceSchema = contributionIconReferenceSchema;
export type NavigationIconReference = ContributionIconReference;

export const navigationContributionSchema = z.strictObject({
  id: contributionIdSchema,
  routeId: contributionIdSchema,
  label: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: navigationIconReferenceSchema.optional(),
  group: navigationGroupSchema,
  order: z.number().int().min(NAVIGATION_ORDER_MIN).max(NAVIGATION_ORDER_MAX),
  badgeProvider: contributionIdSchema.optional(),
  visibleByDefault: z.boolean().default(true),
});

export type NavigationContribution = z.infer<
  typeof navigationContributionSchema
>;

export const navigationContributionsSchema = z
  .array(navigationContributionSchema)
  .min(1)
  .max(NAVIGATION_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Navigation Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type NavigationContributions = z.infer<
  typeof navigationContributionsSchema
>;

export const orbitContributionSizeSchema = z.strictObject({
  width: z
    .number()
    .int()
    .min(EXTENSION_ORBIT_SIZE_LIMITS.minWidth)
    .max(EXTENSION_ORBIT_SIZE_LIMITS.maxWidth),
  height: z
    .number()
    .int()
    .min(EXTENSION_ORBIT_SIZE_LIMITS.minHeight)
    .max(EXTENSION_ORBIT_SIZE_LIMITS.maxHeight),
});

export type OrbitContributionSize = z.infer<typeof orbitContributionSizeSchema>;

export const orbitConnectionModes = [
  "none",
  "incoming",
  "outgoing",
  "bidirectional",
] as const;
export const orbitConnectionModeSchema = z.enum(orbitConnectionModes);
export type OrbitConnectionMode = z.infer<typeof orbitConnectionModeSchema>;

export const orbitNodeContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  category: contributionCategorySchema.optional(),
  icon: contributionIconReferenceSchema.optional(),
  stateVersion: z.number().int().positive().max(ORBIT_STATE_VERSION_MAX),
  stateSchema: extensionJsonPathSchema,
  defaultSize: orbitContributionSizeSchema,
  resizable: z.boolean().default(true),
  projectContext: z.boolean().default(false),
  inspector: z.boolean().default(false),
  connections: orbitConnectionModeSchema.default("bidirectional"),
  visibleByDefault: z.boolean().default(true),
});

export type OrbitNodeContribution = z.infer<typeof orbitNodeContributionSchema>;

export const orbitContributionsSchema = z
  .array(orbitNodeContributionSchema)
  .min(1)
  .max(ORBIT_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((nodes, context) => {
    const seen = new Set<string>();
    for (const [index, node] of nodes.entries()) {
      if (seen.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Orbit Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(node.id);
    }
  })
  .meta({ uniqueItems: true });

export type OrbitContributions = z.infer<typeof orbitContributionsSchema>;

export const dashboardContributionKinds = [
  "metric",
  "status",
  "card",
  "quick-action",
  "list",
  "chart",
  "error-indicator",
  "health-indicator",
] as const;
export const dashboardContributionKindSchema = z.enum(
  dashboardContributionKinds,
);
export type DashboardContributionKind = z.infer<
  typeof dashboardContributionKindSchema
>;

export const dashboardContributionSizes = [
  "small",
  "medium",
  "large",
  "full",
] as const;
export const dashboardContributionSizeSchema = z.enum(
  dashboardContributionSizes,
);
export type DashboardContributionSize = z.infer<
  typeof dashboardContributionSizeSchema
>;

export const dashboardMetricFormats = [
  "number",
  "percentage",
  "duration",
  "bytes",
  "text",
] as const;
export const dashboardMetricFormatSchema = z.enum(dashboardMetricFormats);
export type DashboardMetricFormat = z.infer<typeof dashboardMetricFormatSchema>;

export const dashboardChartTypes = ["line", "bar", "area", "donut"] as const;
export const dashboardChartTypeSchema = z.enum(dashboardChartTypes);
export type DashboardChartType = z.infer<typeof dashboardChartTypeSchema>;

export const dashboardRefreshSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("on-demand") }),
  z.strictObject({
    mode: z.literal("interval"),
    intervalMilliseconds: z
      .number()
      .int()
      .min(DASHBOARD_REFRESH_INTERVAL_MIN_MS)
      .max(DASHBOARD_REFRESH_INTERVAL_MAX_MS),
  }),
  z.strictObject({ mode: z.literal("realtime") }),
]);

export type DashboardRefresh = z.infer<typeof dashboardRefreshSchema>;

const dashboardContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: contributionIconReferenceSchema.optional(),
  defaultSize: dashboardContributionSizeSchema.default("medium"),
  order: z.number().int().min(DASHBOARD_ORDER_MIN).max(DASHBOARD_ORDER_MAX),
  projectContext: z.boolean().default(false),
  visibleByDefault: z.boolean().default(true),
};

const dashboardProviderShape = {
  provider: contributionIdSchema,
  refresh: dashboardRefreshSchema.default({ mode: "on-demand" }),
};

export const dashboardMetricContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("metric"),
  format: dashboardMetricFormatSchema.default("number"),
});

export const dashboardStatusContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("status"),
});

export const dashboardCardContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("card"),
});

export const dashboardQuickActionContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  kind: z.literal("quick-action"),
  commandId: contributionIdSchema,
});

export const dashboardListContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("list"),
});

export const dashboardChartContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("chart"),
  chartType: dashboardChartTypeSchema,
});

export const dashboardErrorIndicatorContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("error-indicator"),
});

export const dashboardHealthIndicatorContributionSchema = z.strictObject({
  ...dashboardContributionBaseShape,
  ...dashboardProviderShape,
  kind: z.literal("health-indicator"),
});

export const dashboardContributionSchema = z.discriminatedUnion("kind", [
  dashboardMetricContributionSchema,
  dashboardStatusContributionSchema,
  dashboardCardContributionSchema,
  dashboardQuickActionContributionSchema,
  dashboardListContributionSchema,
  dashboardChartContributionSchema,
  dashboardErrorIndicatorContributionSchema,
  dashboardHealthIndicatorContributionSchema,
]);

export type DashboardContribution = z.infer<typeof dashboardContributionSchema>;

export const dashboardContributionsSchema = z
  .array(dashboardContributionSchema)
  .min(1)
  .max(DASHBOARD_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Dashboard Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type DashboardContributions = z.infer<
  typeof dashboardContributionsSchema
>;
