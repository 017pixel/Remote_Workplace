import { describe, expect, it } from "vitest";
import {
  THEME_CONTRIBUTIONS_MAX_COUNT,
  darkThemePaletteSchema,
  lightThemePaletteSchema,
  themeColorContrastRatio,
  themeColorSchema,
  themeContributionSchema,
  themeContributionsSchema,
} from "./theme-contributions.js";

const darkPalette = {
  surfaceBase: "#0a0a0a",
  surfaceRaised: "#111111",
  surfaceOverlay: "#191919",
  surfaceSunken: "#060606",
  text: "#f5f5f5",
  textMuted: "#a0a0a0",
  textFaint: "#737373",
  accent: "#3666c2",
  accentContrast: "#ffffff",
  success: "#4bb38b",
  warning: "#d4a940",
  danger: "#cf7478",
  info: "#79a5df",
} as const;

const lightPalette = {
  surfaceBase: "#f7f7f7",
  surfaceRaised: "#ffffff",
  surfaceOverlay: "#eeeeee",
  surfaceSunken: "#e5e5e5",
  text: "#111111",
  textMuted: "#444444",
  textFaint: "#666666",
  accent: "#174ea6",
  accentContrast: "#ffffff",
  success: "#18794e",
  warning: "#8a5a00",
  danger: "#b42318",
  info: "#175cd3",
} as const;

const theme = {
  id: "workbench.appearance.theme.nightly",
  title: "Workbench Nightly",
  description: "Neutrales dunkles Workbench-Theme.",
  variants: { dark: darkPalette, light: lightPalette },
} as const;

describe("Theme Contributions V1", () => {
  it("akzeptiert kontrastreiche Dark- und Light-Varianten", () => {
    expect(themeContributionSchema.safeParse(theme).success).toBe(true);
    expect(darkThemePaletteSchema.safeParse(darkPalette).success).toBe(true);
    expect(lightThemePaletteSchema.safeParse(lightPalette).success).toBe(true);
  });

  it("normalisiert ausschließlich opake Hex-RGB-Farben", () => {
    expect(themeColorSchema.parse("#AABBCC")).toBe("#aabbcc");
    for (const color of [
      "#abc",
      "#aabbccdd",
      "oklch(58.8% .217 264)",
      "var(--color-accent)",
      "url(https://example.com/color)",
    ]) {
      expect(themeColorSchema.safeParse(color).success).toBe(false);
    }
  });

  it("berechnet den WCAG-Kontrast deterministisch", () => {
    expect(themeColorContrastRatio("#000000", "#ffffff")).toBe(21);
    expect(themeColorContrastRatio("ungültig", "#ffffff")).toBeNull();
  });

  it("weist falsche Darstellung und unzureichenden Textkontrast ab", () => {
    expect(darkThemePaletteSchema.safeParse(lightPalette).success).toBe(false);
    expect(lightThemePaletteSchema.safeParse(darkPalette).success).toBe(false);
    expect(
      darkThemePaletteSchema.safeParse({
        ...darkPalette,
        text: "#333333",
        textMuted: "#333333",
      }).success,
    ).toBe(false);
  });

  it("verlangt unterscheidbare Surfaces und zugängliche Akzentinhalte", () => {
    expect(
      darkThemePaletteSchema.safeParse({
        ...darkPalette,
        surfaceRaised: darkPalette.surfaceBase,
        surfaceOverlay: darkPalette.surfaceBase,
        surfaceSunken: darkPalette.surfaceBase,
      }).success,
    ).toBe(false);
    expect(
      darkThemePaletteSchema.safeParse({
        ...darkPalette,
        accentContrast: "#777777",
      }).success,
    ).toBe(false);
  });

  it("verlangt mindestens eine Variante und weist CSS-Felder ab", () => {
    expect(
      themeContributionSchema.safeParse({ ...theme, variants: {} }).success,
    ).toBe(false);
    expect(
      themeContributionSchema.safeParse({
        ...theme,
        css: "body { display: none }",
        stylesheet: "https://example.com/theme.css",
        font: "Remote Font",
      }).success,
    ).toBe(false);
  });

  it("weist doppelte IDs und übergroße Listen ab", () => {
    expect(themeContributionsSchema.safeParse([theme, theme]).success).toBe(
      false,
    );
    expect(
      themeContributionsSchema.safeParse(
        Array.from(
          { length: THEME_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...theme,
            id: `workbench.appearance.theme.nightly-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
