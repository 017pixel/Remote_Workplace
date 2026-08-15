import { z } from "zod";
import { extensionIdSchema } from "./ids.js";
import {
  extensionApiCompatibilitySchema,
  manifestVersionSchema,
  remoteWorkplaceCompatibilitySchema,
  semanticVersionSchema,
} from "./versioning.js";

export const EXTENSION_NAME_MAX_LENGTH = 80;
export const EXTENSION_DESCRIPTION_MAX_LENGTH = 500;
export const EXTENSION_PUBLISHER_MAX_LENGTH = 64;
export const EXTENSION_LICENSE_MAX_LENGTH = 128;
export const EXTENSION_CATEGORY_MAX_LENGTH = 64;
export const EXTENSION_KEYWORD_MAX_LENGTH = 48;
export const EXTENSION_KEYWORDS_MAX_COUNT = 20;
export const EXTENSION_LOCAL_PATH_MAX_LENGTH = 512;
export const EXTENSION_SCHEMA_REFERENCE_MAX_LENGTH = 512;

const slugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Pfade in einem Extension-Paket sind absichtlich unabhängig vom Host-Dateisystem.
// Das enge POSIX-Format verhindert absolute Pfade, Traversal, URL-Sonderzeichen und Backslashes.
export const extensionPackagePathPattern =
  /^\.\/[A-Za-z0-9_](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?(?:\/[A-Za-z0-9_](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?)*$/;

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

export const extensionNameSchema = boundedTextSchema(EXTENSION_NAME_MAX_LENGTH, "Der Name");
export const extensionDescriptionSchema = boundedTextSchema(
  EXTENSION_DESCRIPTION_MAX_LENGTH,
  "Die Beschreibung",
);
export const extensionPublisherSchema = slugSchema(EXTENSION_PUBLISHER_MAX_LENGTH, "Der Publisher");
export const extensionLicenseSchema = boundedTextSchema(EXTENSION_LICENSE_MAX_LENGTH, "Die Lizenz");
export const extensionCategorySchema = slugSchema(EXTENSION_CATEGORY_MAX_LENGTH, "Die Kategorie");
export const extensionKeywordSchema = boundedTextSchema(EXTENSION_KEYWORD_MAX_LENGTH, "Ein Keyword");

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

const extensionPackagePathBaseSchema = z
  .string()
  .max(EXTENSION_LOCAL_PATH_MAX_LENGTH)
  .regex(
    extensionPackagePathPattern,
    "Ein lokaler Paketpfad im POSIX-Format mit führendem ./ wird erwartet.",
  );

export const extensionPackagePathSchema = extensionPackagePathBaseSchema.brand<"ExtensionPackagePath">();

export type ExtensionPackagePath = z.infer<typeof extensionPackagePathSchema>;

export const extensionEntrypointPathSchema = extensionPackagePathBaseSchema
  .regex(/\.(?:c|m)?js$/, "Ein Extension-Entrypoint muss auf .js, .mjs oder .cjs enden.")
  .brand<"ExtensionEntrypointPath">();

export const extensionIconPathSchema = extensionPackagePathBaseSchema
  .regex(
    /\.(?:png|webp|jpe?g)$/,
    "Manifest V1 erlaubt für Icons nur lokale PNG-, WebP- oder JPEG-Dateien.",
  )
  .brand<"ExtensionIconPath">();

export const extensionMarkdownPathSchema = extensionPackagePathBaseSchema
  .regex(/\.md$/, "README und Changelog müssen lokale Markdown-Dateien sein.")
  .brand<"ExtensionMarkdownPath">();

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

// Die späteren Phase-1-Subgoals erweitern diese drei Surfaces. Bis dahin sind sie
// fail-closed: Das Manifest kann sie deklarieren, aber noch keine Inhalte einschleusen.
export const extensionPermissionsV1Schema = z.array(z.never()).max(0);
export const extensionActivationEventsV1Schema = z.array(z.never()).max(0);
export const extensionContributionsV1Schema = z.strictObject({});

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
    contributes: extensionContributionsV1Schema,
  })
  .refine(
    (manifest) =>
      manifest.entrypoints.ui !== undefined ||
      manifest.entrypoints.server !== undefined ||
      Object.keys(manifest.contributes).length > 0,
    {
      message: "Eine Extension benötigt mindestens einen Entrypoint oder eine Contribution.",
      path: ["entrypoints"],
    },
  );

export type ExtensionManifestV1 = z.infer<typeof extensionManifestV1Schema>;
