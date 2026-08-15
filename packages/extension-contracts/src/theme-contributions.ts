import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contributionIdSchema } from "./ids.js";

export const THEME_CONTRIBUTIONS_MAX_COUNT = 32;
export const THEME_TEXT_MIN_CONTRAST = 4.5;
export const THEME_SECONDARY_TEXT_MIN_CONTRAST = 4.5;
export const THEME_FAINT_TEXT_MIN_CONTRAST = 3;
export const THEME_ACCENT_MIN_CONTRAST = 3;
export const THEME_ACCENT_CONTENT_MIN_CONTRAST = 4.5;
export const THEME_STATUS_MIN_CONTRAST = 3;

const hexRgbPattern = /^#[0-9a-fA-F]{6}$/;

export const themeColorSchema = z
  .string()
  .regex(hexRgbPattern, "Theme-Farben müssen opake sechsstellige Hex-RGB-Werte sein.")
  .transform((value) => value.toLowerCase())
  .brand<"ThemeColor">();
export type ThemeColor = z.infer<typeof themeColorSchema>;

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function themeColorRelativeLuminance(color: string): number | null {
  if (!hexRgbPattern.test(color)) return null;
  const channels = [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ].map(channelToLinear);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function themeColorContrastRatio(
  first: string,
  second: string,
): number | null {
  const firstLuminance = themeColorRelativeLuminance(first);
  const secondLuminance = themeColorRelativeLuminance(second);
  if (firstLuminance === null || secondLuminance === null) return null;
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const themePaletteBaseSchema = z.strictObject({
  surfaceBase: themeColorSchema,
  surfaceRaised: themeColorSchema,
  surfaceOverlay: themeColorSchema,
  surfaceSunken: themeColorSchema,
  text: themeColorSchema,
  textMuted: themeColorSchema,
  textFaint: themeColorSchema,
  accent: themeColorSchema,
  accentContrast: themeColorSchema,
  success: themeColorSchema,
  warning: themeColorSchema,
  danger: themeColorSchema,
  info: themeColorSchema,
});

function addContrastIssue(
  palette: z.infer<typeof themePaletteBaseSchema>,
  context: z.RefinementCtx,
  foreground: keyof z.infer<typeof themePaletteBaseSchema>,
  background: keyof z.infer<typeof themePaletteBaseSchema>,
  minimum: number,
): void {
  const ratio = themeColorContrastRatio(
    palette[foreground],
    palette[background],
  );
  if (ratio !== null && ratio >= minimum) return;
  context.addIssue({
    code: "custom",
    message: `Der Kontrast zwischen ${foreground} und ${background} muss mindestens ${minimum}:1 betragen.`,
    path: [foreground],
  });
}

function validateThemePalette(
  palette: z.infer<typeof themePaletteBaseSchema>,
  context: z.RefinementCtx,
  appearance: "dark" | "light",
): void {
  const baseLuminance = themeColorRelativeLuminance(palette.surfaceBase);
  const textLuminance = themeColorRelativeLuminance(palette.text);
  if (
    baseLuminance !== null &&
    textLuminance !== null &&
    (appearance === "dark"
      ? baseLuminance > 0.25 || textLuminance <= baseLuminance
      : baseLuminance < 0.65 || textLuminance >= baseLuminance)
  ) {
    context.addIssue({
      code: "custom",
      message: `Die Palette muss ihrer ${appearance === "dark" ? "dunklen" : "hellen"} Darstellung entsprechen.`,
      path: ["surfaceBase"],
    });
  }

  if (
    new Set([
      palette.surfaceBase,
      palette.surfaceRaised,
      palette.surfaceOverlay,
      palette.surfaceSunken,
    ]).size < 3
  ) {
    context.addIssue({
      code: "custom",
      message: "Mindestens drei Surface-Rollen müssen unterscheidbar sein.",
      path: ["surfaceRaised"],
    });
  }

  addContrastIssue(
    palette,
    context,
    "text",
    "surfaceBase",
    THEME_TEXT_MIN_CONTRAST,
  );
  addContrastIssue(
    palette,
    context,
    "textMuted",
    "surfaceBase",
    THEME_SECONDARY_TEXT_MIN_CONTRAST,
  );
  addContrastIssue(
    palette,
    context,
    "textFaint",
    "surfaceBase",
    THEME_FAINT_TEXT_MIN_CONTRAST,
  );
  addContrastIssue(
    palette,
    context,
    "accent",
    "surfaceBase",
    THEME_ACCENT_MIN_CONTRAST,
  );
  addContrastIssue(
    palette,
    context,
    "accentContrast",
    "accent",
    THEME_ACCENT_CONTENT_MIN_CONTRAST,
  );
  for (const status of ["success", "warning", "danger", "info"] as const) {
    addContrastIssue(
      palette,
      context,
      status,
      "surfaceBase",
      THEME_STATUS_MIN_CONTRAST,
    );
  }
}

export const darkThemePaletteSchema = themePaletteBaseSchema.superRefine(
  (palette, context) => validateThemePalette(palette, context, "dark"),
);
export const lightThemePaletteSchema = themePaletteBaseSchema.superRefine(
  (palette, context) => validateThemePalette(palette, context, "light"),
);
export type DarkThemePalette = z.infer<typeof darkThemePaletteSchema>;
export type LightThemePalette = z.infer<typeof lightThemePaletteSchema>;

export const themeVariantsSchema = z
  .strictObject({
    dark: darkThemePaletteSchema.optional(),
    light: lightThemePaletteSchema.optional(),
  })
  .refine((variants) => variants.dark !== undefined || variants.light !== undefined, {
    message: "Eine Theme Contribution benötigt mindestens eine Farbvariante.",
  });
export type ThemeVariants = z.infer<typeof themeVariantsSchema>;

export const themeContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  variants: themeVariantsSchema,
});
export type ThemeContribution = z.infer<typeof themeContributionSchema>;

export const themeContributionsSchema = z
  .array(themeContributionSchema)
  .min(1)
  .max(THEME_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((themes, context) => {
    const ids = new Set<string>();
    for (const [index, theme] of themes.entries()) {
      if (ids.has(theme.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Theme Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(theme.id);
    }
  })
  .meta({ uniqueItems: true });
export type ThemeContributions = z.infer<typeof themeContributionsSchema>;
