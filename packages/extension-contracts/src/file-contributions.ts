import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionIconReferenceSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contextExpressionSchema } from "./context-expressions.js";
import { contributionIdSchema } from "./ids.js";

export const FILE_CONTRIBUTIONS_MAX_COUNT = 128;
export const FILE_MATCH_VALUES_MAX_COUNT = 64;
export const FILE_PRIORITY_MIN = 0;
export const FILE_PRIORITY_MAX = 100;
export const FILE_NAME_MAX_LENGTH = 128;
export const FILE_EXTENSION_MAX_LENGTH = 32;
export const FILE_MIME_TYPE_MAX_LENGTH = 191;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export const fileExtensionSchema = z
  .string()
  .min(1)
  .max(FILE_EXTENSION_MAX_LENGTH)
  .regex(
    /^[a-z0-9][a-z0-9._+-]*$/,
    "Eine kleingeschriebene Dateiendung ohne führenden Punkt wird erwartet.",
  )
  .refine(
    (value) => !value.includes("..") && !value.endsWith("."),
    "Eine Dateiendung darf keine leeren Segmente besitzen.",
  );

export const fileNameSchema = z
  .string()
  .min(1)
  .max(FILE_NAME_MAX_LENGTH)
  .refine(
    (value) =>
      value === value.trim() &&
      value !== "." &&
      value !== ".." &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !containsControlCharacter(value),
    "Ein exakter Dateiname ohne Pfadsegmente oder Steuerzeichen wird erwartet.",
  );

export const fileMimeTypeSchema = z
  .string()
  .min(3)
  .max(FILE_MIME_TYPE_MAX_LENGTH)
  .regex(
    /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/(?:\*|[a-z0-9][a-z0-9!#$&^_.+-]{0,126})$/,
    "Ein kleingeschriebener MIME-Typ ohne Parameter wird erwartet.",
  );

const fileExtensionsSchema = z
  .array(fileExtensionSchema)
  .min(1)
  .max(FILE_MATCH_VALUES_MAX_COUNT)
  .refine(
    (values) => new Set(values).size === values.length,
    "Dateiendungen dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

const fileNamesSchema = z
  .array(fileNameSchema)
  .min(1)
  .max(FILE_MATCH_VALUES_MAX_COUNT)
  .refine(
    (values) => new Set(values).size === values.length,
    "Dateinamen dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

const fileMimeTypesSchema = z
  .array(fileMimeTypeSchema)
  .min(1)
  .max(FILE_MATCH_VALUES_MAX_COUNT)
  .refine(
    (values) => new Set(values).size === values.length,
    "MIME-Typen dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

export const fileMatcherSchema = z
  .strictObject({
    extensions: fileExtensionsSchema.optional(),
    fileNames: fileNamesSchema.optional(),
    mimeTypes: fileMimeTypesSchema.optional(),
    caseSensitiveFileNames: z.boolean(),
  })
  .superRefine((matcher, context) => {
    if (
      matcher.extensions === undefined &&
      matcher.fileNames === undefined &&
      matcher.mimeTypes === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Ein File Matcher benötigt mindestens eine Endung, einen Dateinamen oder einen MIME-Typ.",
        path: [],
      });
    }
    if (matcher.caseSensitiveFileNames || matcher.fileNames === undefined)
      return;
    const normalized = new Set<string>();
    for (const [index, fileName] of matcher.fileNames.entries()) {
      const comparable = fileName.toLocaleLowerCase("en-US");
      if (normalized.has(comparable)) {
        context.addIssue({
          code: "custom",
          message:
            "Nicht case-sensitive Dateinamen dürfen sich nicht nur durch Großschreibung unterscheiden.",
          path: ["fileNames", index],
        });
      }
      normalized.add(comparable);
    }
  });

export type FileMatcher = z.infer<typeof fileMatcherSchema>;

export const fileContributionKinds = ["viewer", "opener"] as const;
export const fileContributionKindSchema = z.enum(fileContributionKinds);
export type FileContributionKind = z.infer<typeof fileContributionKindSchema>;

export const fileViewerSurfaces = ["detail", "quick-look"] as const;
export const fileViewerSurfaceSchema = z.enum(fileViewerSurfaces);
export type FileViewerSurface = z.infer<typeof fileViewerSurfaceSchema>;

export const fileViewerSurfacesSchema = z
  .array(fileViewerSurfaceSchema)
  .min(1)
  .max(fileViewerSurfaces.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Viewer Surfaces dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

export const fileContentModes = ["text", "media", "binary"] as const;
export const fileContentModeSchema = z.enum(fileContentModes);
export type FileContentMode = z.infer<typeof fileContentModeSchema>;

const fileContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: contributionIconReferenceSchema.optional(),
  matcher: fileMatcherSchema,
  priority: z.number().int().min(FILE_PRIORITY_MIN).max(FILE_PRIORITY_MAX),
  when: contextExpressionSchema.optional(),
};

export const fileViewerContributionSchema = z.strictObject({
  ...fileContributionBaseShape,
  kind: z.literal("viewer"),
  provider: contributionIdSchema,
  surfaces: fileViewerSurfacesSchema,
  contentMode: fileContentModeSchema,
});

export const fileOpenerContributionSchema = z.strictObject({
  ...fileContributionBaseShape,
  kind: z.literal("opener"),
  commandId: contributionIdSchema,
});

export const fileContributionSchema = z.discriminatedUnion("kind", [
  fileViewerContributionSchema,
  fileOpenerContributionSchema,
]);

export type FileContribution = z.infer<typeof fileContributionSchema>;

export const fileContributionsSchema = z
  .array(fileContributionSchema)
  .min(1)
  .max(FILE_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede File Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(item.id);
    }
  })
  .meta({ uniqueItems: true });

export type FileContributions = z.infer<typeof fileContributionsSchema>;
