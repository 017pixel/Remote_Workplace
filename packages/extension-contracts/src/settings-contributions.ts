import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionIconReferenceSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contributionIdSchema } from "./ids.js";

export const SETTINGS_CONTRIBUTIONS_MAX_COUNT = 64;
export const SETTING_FIELDS_MAX_COUNT = 128;
export const SETTING_OPTIONS_MAX_COUNT = 100;
export const SETTING_ORDER_MIN = 0;
export const SETTING_ORDER_MAX = 10_000;
export const SETTING_STRING_MAX_LENGTH = 10_000;
export const SETTING_PATH_MAX_LENGTH = 4_096;
export const SETTING_URL_MAX_LENGTH = 2_048;
export const SETTING_NUMBER_ABSOLUTE_LIMIT = 1_000_000_000_000_000;
export const SETTING_DURATION_MAX_MILLISECONDS = 315_576_000_000;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function normalizedTextSchema(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value === value.trim() && !containsControlCharacter(value),
      "Der Wert darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.",
    );
}

export const settingScopes = ["server", "user", "project"] as const;
export const settingScopeSchema = z.enum(settingScopes);
export type SettingScope = z.infer<typeof settingScopeSchema>;

export const settingFieldTypes = [
  "string",
  "number",
  "boolean",
  "enum",
  "multi-select",
  "path",
  "url",
  "secret",
  "project",
  "duration",
] as const;
export const settingFieldTypeSchema = z.enum(settingFieldTypes);
export type SettingFieldType = z.infer<typeof settingFieldTypeSchema>;

const settingFieldBaseShape = {
  id: contributionIdSchema,
  label: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  required: z.boolean().default(false),
};

export const stringSettingFieldSchema = z
  .strictObject({
    ...settingFieldBaseShape,
    type: z.literal("string"),
    default: z.string().max(SETTING_STRING_MAX_LENGTH).optional(),
    minLength: z
      .number()
      .int()
      .min(0)
      .max(SETTING_STRING_MAX_LENGTH)
      .default(0),
    maxLength: z
      .number()
      .int()
      .min(1)
      .max(SETTING_STRING_MAX_LENGTH)
      .default(SETTING_STRING_MAX_LENGTH),
    multiline: z.boolean().default(false),
  })
  .superRefine((field, context) => {
    if (field.minLength > field.maxLength) {
      context.addIssue({
        code: "custom",
        message: "minLength darf maxLength nicht überschreiten.",
        path: ["minLength"],
      });
    }
    if (
      field.default !== undefined &&
      (field.default.length < field.minLength ||
        field.default.length > field.maxLength)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Der Default muss innerhalb der deklarierten Längengrenzen liegen.",
        path: ["default"],
      });
    }
  });

const boundedNumberSchema = z
  .number()
  .finite()
  .min(-SETTING_NUMBER_ABSOLUTE_LIMIT)
  .max(SETTING_NUMBER_ABSOLUTE_LIMIT);

export const numberSettingFieldSchema = z
  .strictObject({
    ...settingFieldBaseShape,
    type: z.literal("number"),
    default: boundedNumberSchema.optional(),
    minimum: boundedNumberSchema.optional(),
    maximum: boundedNumberSchema.optional(),
    step: z
      .number()
      .finite()
      .positive()
      .max(SETTING_NUMBER_ABSOLUTE_LIMIT)
      .optional(),
  })
  .superRefine((field, context) => {
    if (
      field.minimum !== undefined &&
      field.maximum !== undefined &&
      field.minimum > field.maximum
    ) {
      context.addIssue({
        code: "custom",
        message: "minimum darf maximum nicht überschreiten.",
        path: ["minimum"],
      });
    }
    if (
      field.default !== undefined &&
      ((field.minimum !== undefined && field.default < field.minimum) ||
        (field.maximum !== undefined && field.default > field.maximum))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Der Default muss innerhalb der deklarierten Zahlengrenzen liegen.",
        path: ["default"],
      });
    }
  });

export const booleanSettingFieldSchema = z.strictObject({
  ...settingFieldBaseShape,
  type: z.literal("boolean"),
  default: z.boolean().optional(),
});

export const settingOptionSchema = z.strictObject({
  value: normalizedTextSchema(120),
  label: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
});

export type SettingOption = z.infer<typeof settingOptionSchema>;

export const settingOptionsSchema = z
  .array(settingOptionSchema)
  .min(1)
  .max(SETTING_OPTIONS_MAX_COUNT)
  .superRefine((options, context) => {
    const seen = new Set<string>();
    for (const [index, option] of options.entries()) {
      if (seen.has(option.value)) {
        context.addIssue({
          code: "custom",
          message: "Option Values dürfen nicht doppelt vorkommen.",
          path: [index, "value"],
        });
      }
      seen.add(option.value);
    }
  })
  .meta({ uniqueItems: true });

export const enumSettingFieldSchema = z
  .strictObject({
    ...settingFieldBaseShape,
    type: z.literal("enum"),
    options: settingOptionsSchema,
    default: normalizedTextSchema(120).optional(),
  })
  .superRefine((field, context) => {
    if (
      field.default === undefined ||
      field.options.some((option) => option.value === field.default)
    )
      return;
    context.addIssue({
      code: "custom",
      message: "Der Default muss eine deklarierte Option referenzieren.",
      path: ["default"],
    });
  });

export const multiSelectSettingFieldSchema = z
  .strictObject({
    ...settingFieldBaseShape,
    type: z.literal("multi-select"),
    options: settingOptionsSchema,
    default: z
      .array(normalizedTextSchema(120))
      .max(SETTING_OPTIONS_MAX_COUNT)
      .meta({ uniqueItems: true })
      .optional(),
  })
  .superRefine((field, context) => {
    const optionValues = new Set(field.options.map((option) => option.value));
    const seenDefaults = new Set<string>();
    for (const [index, value] of (field.default ?? []).entries()) {
      if (!optionValues.has(value)) {
        context.addIssue({
          code: "custom",
          message: "Jeder Default muss eine deklarierte Option referenzieren.",
          path: ["default", index],
        });
      }
      if (seenDefaults.has(value)) {
        context.addIssue({
          code: "custom",
          message: "Multi-Select Defaults dürfen nicht doppelt vorkommen.",
          path: ["default", index],
        });
      }
      seenDefaults.add(value);
    }
  });

export const settingPathKinds = ["file", "directory", "either"] as const;
export const settingPathKindSchema = z.enum(settingPathKinds);
export type SettingPathKind = z.infer<typeof settingPathKindSchema>;

export const pathSettingFieldSchema = z.strictObject({
  ...settingFieldBaseShape,
  type: z.literal("path"),
  default: normalizedTextSchema(SETTING_PATH_MAX_LENGTH).optional(),
  pathKind: settingPathKindSchema.default("either"),
  mustExist: z.boolean().default(false),
});

export const settingUrlValueSchema = z
  .url()
  .max(SETTING_URL_MAX_LENGTH)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Nur HTTP- und HTTPS-URLs sind erlaubt.");

export const urlSettingFieldSchema = z.strictObject({
  ...settingFieldBaseShape,
  type: z.literal("url"),
  default: settingUrlValueSchema.optional(),
});

export const secretSettingFieldSchema = z.strictObject({
  ...settingFieldBaseShape,
  type: z.literal("secret"),
});

export const projectSettingFieldSchema = z.strictObject({
  ...settingFieldBaseShape,
  type: z.literal("project"),
  allowCurrent: z.boolean().default(true),
  allowNone: z.boolean().default(true),
});

export const settingDurationUnits = [
  "milliseconds",
  "seconds",
  "minutes",
  "hours",
  "days",
] as const;
export const settingDurationUnitSchema = z.enum(settingDurationUnits);
export type SettingDurationUnit = z.infer<typeof settingDurationUnitSchema>;

const durationMillisecondsSchema = z
  .number()
  .int()
  .min(0)
  .max(SETTING_DURATION_MAX_MILLISECONDS);

export const durationSettingFieldSchema = z
  .strictObject({
    ...settingFieldBaseShape,
    type: z.literal("duration"),
    defaultMilliseconds: durationMillisecondsSchema.optional(),
    minimumMilliseconds: durationMillisecondsSchema.default(0),
    maximumMilliseconds: durationMillisecondsSchema.default(
      SETTING_DURATION_MAX_MILLISECONDS,
    ),
    displayUnit: settingDurationUnitSchema.default("seconds"),
  })
  .superRefine((field, context) => {
    if (field.minimumMilliseconds > field.maximumMilliseconds) {
      context.addIssue({
        code: "custom",
        message:
          "minimumMilliseconds darf maximumMilliseconds nicht überschreiten.",
        path: ["minimumMilliseconds"],
      });
    }
    if (
      field.defaultMilliseconds !== undefined &&
      (field.defaultMilliseconds < field.minimumMilliseconds ||
        field.defaultMilliseconds > field.maximumMilliseconds)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Der Default muss innerhalb der deklarierten Dauergrenzen liegen.",
        path: ["defaultMilliseconds"],
      });
    }
  });

export const settingFieldSchema = z.discriminatedUnion("type", [
  stringSettingFieldSchema,
  numberSettingFieldSchema,
  booleanSettingFieldSchema,
  enumSettingFieldSchema,
  multiSelectSettingFieldSchema,
  pathSettingFieldSchema,
  urlSettingFieldSchema,
  secretSettingFieldSchema,
  projectSettingFieldSchema,
  durationSettingFieldSchema,
]);

export type SettingField = z.infer<typeof settingFieldSchema>;

export const settingFieldsSchema = z
  .array(settingFieldSchema)
  .min(1)
  .max(SETTING_FIELDS_MAX_COUNT)
  .superRefine((fields, context) => {
    const seen = new Set<string>();
    for (const [index, field] of fields.entries()) {
      if (seen.has(field.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Setting Field ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(field.id);
    }
  })
  .meta({ uniqueItems: true });

const settingContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  icon: contributionIconReferenceSchema.optional(),
  order: z.number().int().min(SETTING_ORDER_MIN).max(SETTING_ORDER_MAX),
  scope: settingScopeSchema.default("user"),
};

export const settingSchemaContributionSchema = z.strictObject({
  ...settingContributionBaseShape,
  kind: z.literal("schema"),
  fields: settingFieldsSchema,
});

export const settingPageContributionSchema = z.strictObject({
  ...settingContributionBaseShape,
  kind: z.literal("page"),
  pageId: contributionIdSchema,
});

export const settingContributionSchema = z.discriminatedUnion("kind", [
  settingSchemaContributionSchema,
  settingPageContributionSchema,
]);

export type SettingContribution = z.infer<typeof settingContributionSchema>;

export const settingsContributionsSchema = z
  .array(settingContributionSchema)
  .min(1)
  .max(SETTINGS_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((contributions, context) => {
    const seen = new Set<string>();
    for (const [index, contribution] of contributions.entries()) {
      if (seen.has(contribution.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Settings Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(contribution.id);

      if (contribution.kind !== "schema") continue;
      for (const [fieldIndex, field] of contribution.fields.entries()) {
        if (seen.has(field.id)) {
          context.addIssue({
            code: "custom",
            message:
              "Settings Contribution und Field IDs müssen gemeinsam eindeutig sein.",
            path: [index, "fields", fieldIndex, "id"],
          });
        }
        seen.add(field.id);
      }
    }
  })
  .meta({ uniqueItems: true });

export type SettingsContributions = z.infer<typeof settingsContributionsSchema>;
