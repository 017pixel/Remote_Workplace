import { z } from "zod";
import { contributionIdSchema } from "./ids.js";

export const CONTRIBUTION_TITLE_MAX_LENGTH = 120;
export const CONTRIBUTION_DESCRIPTION_MAX_LENGTH = 500;
export const CONTRIBUTION_CATEGORY_MAX_LENGTH = 80;
export const COMMAND_CONTRIBUTIONS_MAX_COUNT = 256;
export const PAGE_CONTRIBUTIONS_MAX_COUNT = 128;
export const ROUTE_CONTRIBUTIONS_MAX_COUNT = 128;
export const ROUTE_ALIASES_MAX_COUNT = 16;
export const ROUTE_PATH_MAX_LENGTH = 256;

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

export const contributionTitleSchema = contributionTextSchema(CONTRIBUTION_TITLE_MAX_LENGTH, "Der Titel");
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

export function routePathCollisionKey(path: ExtensionRoutePath | string): string | null {
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
          message: "Route Aliases dürfen keine identischen URL-Muster besitzen.",
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
        message: "Ein Route Alias darf nicht dasselbe URL-Muster wie der Hauptpfad besitzen.",
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

      for (const [pathIndex, path] of [route.path, ...(route.aliases ?? [])].entries()) {
        const collisionKey = routePathCollisionKey(path);
        if (collisionKey !== null && seenPaths.has(collisionKey)) {
          context.addIssue({
            code: "custom",
            message: "Routes und Aliases dürfen keine kollidierenden URL-Muster besitzen.",
            path: pathIndex === 0 ? [index, "path"] : [index, "aliases", pathIndex - 1],
          });
        }
        if (collisionKey !== null) seenPaths.add(collisionKey);
      }
    }
  })
  .meta({ uniqueItems: true });

export type RouteContributions = z.infer<typeof routeContributionsSchema>;
