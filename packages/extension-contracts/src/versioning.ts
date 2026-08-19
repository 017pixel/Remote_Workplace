import { satisfies, valid, validRange } from "semver";
import { z } from "zod";

export const MANIFEST_VERSION = 1 as const;
export const EXTENSION_API_VERSION = 1 as const;
export const EXTENSION_API_SEMVER = "1.0.0" as const;

export const MANIFEST_VERSION_MINIMUM = MANIFEST_VERSION;
export const MANIFEST_VERSION_MAXIMUM = MANIFEST_VERSION;

export const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const manifestVersionSchema = z.literal(MANIFEST_VERSION);
export type ManifestVersion = z.infer<typeof manifestVersionSchema>;

export const extensionApiVersionSchema = z.literal(EXTENSION_API_VERSION);
export type ExtensionApiVersion = z.infer<typeof extensionApiVersionSchema>;

export const semanticVersionSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(semanticVersionPattern, "Eine kanonische Semantic Version wird erwartet.")
  .refine(
    (value) => valid(value) !== null,
    "Eine kanonische Semantic Version wird erwartet.",
  )
  .brand<"SemanticVersion">();

export type SemanticVersion = z.infer<typeof semanticVersionSchema>;

export const semanticVersionRangeSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^\S(?:.*\S)?$/, "Ein Semantic-Version-Range darf keine äußeren Leerzeichen enthalten.")
  .refine(
    (value) => value === value.trim() && validRange(value) !== null,
    "Ein gültiger Semantic-Version-Range wird erwartet.",
  )
  .brand<"SemanticVersionRange">();

export type SemanticVersionRange = z.infer<typeof semanticVersionRangeSchema>;

export const wraptVersionSchema = semanticVersionSchema;
export const wraptCompatibilitySchema = semanticVersionRangeSchema;
// Legacy-Exports bleiben für bestehende Extensions und gespeicherte Integrationen
// verfügbar; neue Manifeste verwenden ausschließlich die Wrapt-Bezeichnungen.
/** @deprecated Use wraptVersionSchema. */
export const remoteWorkplaceVersionSchema = wraptVersionSchema;
/** @deprecated Use wraptCompatibilitySchema. */
export const remoteWorkplaceCompatibilitySchema = wraptCompatibilitySchema;
export const extensionApiCompatibilitySchema = semanticVersionRangeSchema;

export function isVersionCompatible(version: string, range: string): boolean {
  const parsedVersion = semanticVersionSchema.safeParse(version);
  const parsedRange = semanticVersionRangeSchema.safeParse(range);
  if (!parsedVersion.success || !parsedRange.success) return false;
  return satisfies(parsedVersion.data, parsedRange.data);
}
