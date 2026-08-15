import { z } from "zod";
import {
  activationEventBelongsToExtension,
  activationEventContributionId,
  activationEventsV1Schema,
} from "./activation-events.js";
import {
  commandContributionsSchema,
  dashboardContributionsSchema,
  navigationContributionsSchema,
  orbitContributionsSchema,
  pageContributionsSchema,
  routeContributionsSchema,
} from "./contributions.js";
import {
  extensionConflictsSchema,
  extensionDependencyMapSchema,
} from "./dependencies.js";
import { contributionBelongsToExtension, extensionIdSchema } from "./ids.js";
import {
  extensionEntrypointPathSchema,
  extensionIconPathSchema,
  extensionMarkdownPathSchema,
} from "./package-paths.js";
import {
  extensionApiCompatibilitySchema,
  manifestVersionSchema,
  remoteWorkplaceCompatibilitySchema,
  semanticVersionSchema,
} from "./versioning.js";
import { extensionPermissionRequestsSchema } from "./permissions.js";
import { settingsContributionsSchema } from "./settings-contributions.js";

export * from "./package-paths.js";

export const EXTENSION_NAME_MAX_LENGTH = 80;
export const EXTENSION_DESCRIPTION_MAX_LENGTH = 500;
export const EXTENSION_PUBLISHER_MAX_LENGTH = 64;
export const EXTENSION_LICENSE_MAX_LENGTH = 128;
export const EXTENSION_CATEGORY_MAX_LENGTH = 64;
export const EXTENSION_KEYWORD_MAX_LENGTH = 48;
export const EXTENSION_KEYWORDS_MAX_COUNT = 20;
export const EXTENSION_SCHEMA_REFERENCE_MAX_LENGTH = 512;

const slugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function boundedTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value === value.trim() && !containsControlCharacter(value),
      `${fieldName} darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.`,
    );
}

function slugSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .regex(slugPattern, `${fieldName} muss ein kleingeschriebener Slug sein.`);
}

export const extensionSchemaReferenceSchema = z
  .string()
  .min(1)
  .max(EXTENSION_SCHEMA_REFERENCE_MAX_LENGTH)
  .refine(
    (value) => value === value.trim() && !containsControlCharacter(value),
    "Die Schema-Referenz darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.",
  );

export const extensionNameSchema = boundedTextSchema(
  EXTENSION_NAME_MAX_LENGTH,
  "Der Name",
);
export const extensionDescriptionSchema = boundedTextSchema(
  EXTENSION_DESCRIPTION_MAX_LENGTH,
  "Die Beschreibung",
);
export const extensionPublisherSchema = slugSchema(
  EXTENSION_PUBLISHER_MAX_LENGTH,
  "Der Publisher",
);
export const extensionLicenseSchema = boundedTextSchema(
  EXTENSION_LICENSE_MAX_LENGTH,
  "Die Lizenz",
);
export const extensionCategorySchema = slugSchema(
  EXTENSION_CATEGORY_MAX_LENGTH,
  "Die Kategorie",
);
export const extensionKeywordSchema = boundedTextSchema(
  EXTENSION_KEYWORD_MAX_LENGTH,
  "Ein Keyword",
);

export const extensionKeywordsSchema = z
  .array(extensionKeywordSchema)
  .max(EXTENSION_KEYWORDS_MAX_COUNT)
  .superRefine((keywords, context) => {
    const normalized = new Set<string>();
    for (const [index, keyword] of keywords.entries()) {
      const comparableKeyword = keyword.toLowerCase();
      if (normalized.has(comparableKeyword)) {
        context.addIssue({
          code: "custom",
          message: "Keywords dürfen nicht doppelt vorkommen.",
          path: [index],
        });
      }
      normalized.add(comparableKeyword);
    }
  });

export const extensionTrustLevels = [
  "system",
  "builtin",
  "catalog-first-party",
  "developer",
  "sandboxed-webview",
] as const;

export const extensionTrustLevelSchema = z.enum(extensionTrustLevels);
export type ExtensionTrustLevel = z.infer<typeof extensionTrustLevelSchema>;

export const extensionEnginesSchema = z.strictObject({
  remoteWorkplace: remoteWorkplaceCompatibilitySchema,
  extensionApi: extensionApiCompatibilitySchema,
});

export type ExtensionEngines = z.infer<typeof extensionEnginesSchema>;

export const extensionEntrypointsSchema = z.strictObject({
  ui: extensionEntrypointPathSchema.optional(),
  server: extensionEntrypointPathSchema.optional(),
});

export type ExtensionEntrypoints = z.infer<typeof extensionEntrypointsSchema>;

// Manifest V1 öffnet Surfaces erst mit ihrem typisierten Contract. Contributions bleiben bis
// zu ihrem Phase-1-Subgoal fail-closed.
export const extensionPermissionsV1Schema = extensionPermissionRequestsSchema;
export const extensionActivationEventsV1Schema = activationEventsV1Schema;
export const extensionContributionsV1Schema = z.strictObject({
  commands: commandContributionsSchema.optional(),
  pages: pageContributionsSchema.optional(),
  routes: routeContributionsSchema.optional(),
  navigation: navigationContributionsSchema.optional(),
  orbit: orbitContributionsSchema.optional(),
  dashboard: dashboardContributionsSchema.optional(),
  settings: settingsContributionsSchema.optional(),
});

export const extensionManifestV1Schema = z
  .strictObject({
    $schema: extensionSchemaReferenceSchema.optional(),
    manifestVersion: manifestVersionSchema,
    id: extensionIdSchema,
    name: extensionNameSchema,
    version: semanticVersionSchema,
    publisher: extensionPublisherSchema,
    description: extensionDescriptionSchema,
    license: extensionLicenseSchema,
    category: extensionCategorySchema.optional(),
    keywords: extensionKeywordsSchema.optional(),
    icon: extensionIconPathSchema.optional(),
    readme: extensionMarkdownPathSchema.optional(),
    changelog: extensionMarkdownPathSchema.optional(),
    dataSchemaVersion: z.number().int().positive().optional(),
    engines: extensionEnginesSchema,
    trust: extensionTrustLevelSchema,
    entrypoints: extensionEntrypointsSchema,
    permissions: extensionPermissionsV1Schema,
    activationEvents: extensionActivationEventsV1Schema,
    extensionDependencies: extensionDependencyMapSchema.optional(),
    optionalExtensionDependencies: extensionDependencyMapSchema.optional(),
    extensionConflicts: extensionConflictsSchema.optional(),
    contributes: extensionContributionsV1Schema,
  })
  .refine(
    (manifest) =>
      manifest.entrypoints.ui !== undefined ||
      manifest.entrypoints.server !== undefined ||
      Object.keys(manifest.contributes).length > 0,
    {
      message:
        "Eine Extension benötigt mindestens einen Entrypoint oder eine Contribution.",
      path: ["entrypoints"],
    },
  )
  .superRefine((manifest, context) => {
    const commandIds = new Set(
      (manifest.contributes.commands ?? []).map((command) => command.id),
    );
    const pageIds = new Set(
      (manifest.contributes.pages ?? []).map((page) => page.id),
    );
    const routeIds = new Set(
      (manifest.contributes.routes ?? []).map((route) => route.id),
    );
    const orbitIds = new Set(
      (manifest.contributes.orbit ?? []).map((node) => node.id),
    );

    for (const [index, event] of manifest.activationEvents.entries()) {
      if (!activationEventBelongsToExtension(manifest.id, event)) {
        context.addIssue({
          code: "custom",
          message:
            "Referenzierte Contributions müssen zur deklarierenden Extension gehören.",
          path: ["activationEvents", index],
        });
        continue;
      }

      const contributionId = activationEventContributionId(event);
      if (
        event.startsWith("onCommand:") &&
        (contributionId === null || !commandIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onCommand Activation Event benötigt eine deklarierte Command Contribution.",
          path: ["activationEvents", index],
        });
      }
      if (
        event.startsWith("onRoute:") &&
        (contributionId === null || !routeIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onRoute Activation Event benötigt eine deklarierte Route Contribution.",
          path: ["activationEvents", index],
        });
      }
      if (
        event.startsWith("onOrbitNode:") &&
        (contributionId === null || !orbitIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onOrbitNode Activation Event benötigt eine deklarierte Orbit Contribution.",
          path: ["activationEvents", index],
        });
      }
    }

    const declaredContributions = [
      ...(manifest.contributes.commands ?? []).map((command, index) => ({
        id: command.id,
        path: ["contributes", "commands", index, "id"] as const,
      })),
      ...(manifest.contributes.pages ?? []).map((page, index) => ({
        id: page.id,
        path: ["contributes", "pages", index, "id"] as const,
      })),
      ...(manifest.contributes.routes ?? []).map((route, index) => ({
        id: route.id,
        path: ["contributes", "routes", index, "id"] as const,
      })),
      ...(manifest.contributes.navigation ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "navigation", index, "id"] as const,
      })),
      ...(manifest.contributes.orbit ?? []).map((node, index) => ({
        id: node.id,
        path: ["contributes", "orbit", index, "id"] as const,
      })),
      ...(manifest.contributes.dashboard ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "dashboard", index, "id"] as const,
      })),
      ...(manifest.contributes.settings ?? []).flatMap((setting, index) => [
        {
          id: setting.id,
          path: ["contributes", "settings", index, "id"] as const,
        },
        ...(setting.kind === "schema"
          ? setting.fields.map((field, fieldIndex) => ({
              id: field.id,
              path: [
                "contributes",
                "settings",
                index,
                "fields",
                fieldIndex,
                "id",
              ] as const,
            }))
          : []),
      ]),
    ];
    const seenContributionIds = new Set<string>();
    for (const contribution of declaredContributions) {
      if (!contributionBelongsToExtension(manifest.id, contribution.id)) {
        context.addIssue({
          code: "custom",
          message:
            "Contribution IDs müssen zur deklarierenden Extension gehören.",
          path: [...contribution.path],
        });
      }
      if (seenContributionIds.has(contribution.id)) {
        context.addIssue({
          code: "custom",
          message: "Contribution IDs müssen manifestweit eindeutig sein.",
          path: [...contribution.path],
        });
      }
      seenContributionIds.add(contribution.id);
    }

    for (const [index, route] of (
      manifest.contributes.routes ?? []
    ).entries()) {
      if (pageIds.has(route.pageId)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Route muss eine deklarierte Page Contribution derselben Extension referenzieren.",
        path: ["contributes", "routes", index, "pageId"],
      });
    }

    for (const [index, item] of (
      manifest.contributes.navigation ?? []
    ).entries()) {
      if (!routeIds.has(item.routeId)) {
        context.addIssue({
          code: "custom",
          message:
            "Navigation muss eine deklarierte Route Contribution derselben Extension referenzieren.",
          path: ["contributes", "navigation", index, "routeId"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Navigation Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "navigation", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "navigation", index, "icon"],
        });
      }
      if (
        item.badgeProvider !== undefined &&
        !contributionBelongsToExtension(manifest.id, item.badgeProvider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Navigation Badge Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "navigation", index, "badgeProvider"],
        });
      }
    }

    for (const [index, node] of (manifest.contributes.orbit ?? []).entries()) {
      if (
        node.icon !== undefined &&
        node.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, node.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Orbit Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "orbit", index, "icon"],
        });
      }
      if (node.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "orbit", index, "icon"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.dashboard ?? []
    ).entries()) {
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Dashboard Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "dashboard", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "dashboard", index, "icon"],
        });
      }
      if (item.kind === "quick-action") {
        if (!commandIds.has(item.commandId)) {
          context.addIssue({
            code: "custom",
            message:
              "Eine Dashboard Quick Action muss eine deklarierte Command Contribution referenzieren.",
            path: ["contributes", "dashboard", index, "commandId"],
          });
        }
        continue;
      }
      if (!contributionBelongsToExtension(manifest.id, item.provider)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Dashboard Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "dashboard", index, "provider"],
        });
      }
    }

    for (const [index, setting] of (
      manifest.contributes.settings ?? []
    ).entries()) {
      if (
        setting.icon !== undefined &&
        setting.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, setting.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Settings Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "settings", index, "icon"],
        });
      }
      if (setting.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "settings", index, "icon"],
        });
      }
      if (setting.kind === "page" && !pageIds.has(setting.pageId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine eigene Settings Page muss eine deklarierte Page Contribution referenzieren.",
          path: ["contributes", "settings", index, "pageId"],
        });
      }
    }

    if (
      manifest.contributes.commands !== undefined &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Command Contributions benötigen einen UI- oder Server-Entrypoint für ihren Handler.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.pages !== undefined &&
      manifest.entrypoints.ui === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Page Contributions benötigen einen UI-Entrypoint für ihren Renderer.",
        path: ["entrypoints", "ui"],
      });
    }

    if (
      manifest.contributes.orbit !== undefined &&
      manifest.entrypoints.ui === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Orbit Contributions benötigen einen UI-Entrypoint für Renderer und State Contract.",
        path: ["entrypoints", "ui"],
      });
    }

    if (
      manifest.contributes.dashboard?.some(
        (item) => item.kind !== "quick-action",
      ) === true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Providerbasierte Dashboard Contributions benötigen einen UI- oder Server-Entrypoint.",
        path: ["entrypoints"],
      });
    }

    const requiredDependencies = manifest.extensionDependencies ?? {};
    const optionalDependencies = manifest.optionalExtensionDependencies ?? {};

    if (Object.hasOwn(requiredDependencies, manifest.id)) {
      context.addIssue({
        code: "custom",
        message: "Eine Extension darf nicht von sich selbst abhängen.",
        path: ["extensionDependencies", manifest.id],
      });
    }
    if (Object.hasOwn(optionalDependencies, manifest.id)) {
      context.addIssue({
        code: "custom",
        message:
          "Eine Extension darf sich nicht selbst als optionale Abhängigkeit deklarieren.",
        path: ["optionalExtensionDependencies", manifest.id],
      });
    }

    for (const dependencyId of Object.keys(optionalDependencies)) {
      if (!Object.hasOwn(requiredDependencies, dependencyId)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Extension darf nicht zugleich Pflicht- und optionale Abhängigkeit sein.",
        path: ["optionalExtensionDependencies", dependencyId],
      });
    }

    for (const [index, conflict] of (
      manifest.extensionConflicts ?? []
    ).entries()) {
      if (conflict.id === manifest.id) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Extension darf keinen Konflikt mit sich selbst deklarieren.",
          path: ["extensionConflicts", index, "id"],
        });
      }
      if (
        !Object.hasOwn(requiredDependencies, conflict.id) &&
        !Object.hasOwn(optionalDependencies, conflict.id)
      ) {
        continue;
      }
      context.addIssue({
        code: "custom",
        message:
          "Eine Abhängigkeit darf nicht zugleich als Konflikt deklariert sein.",
        path: ["extensionConflicts", index, "id"],
      });
    }
  });

export type ExtensionManifestV1 = z.infer<typeof extensionManifestV1Schema>;
