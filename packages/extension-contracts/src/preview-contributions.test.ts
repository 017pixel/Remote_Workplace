import { describe, expect, it } from "vitest";
import {
  PREVIEW_CONTRIBUTIONS_MAX_COUNT,
  PREVIEW_ORDER_MAX,
  previewContributionSchema,
  previewContributionsSchema,
} from "./preview-contributions.js";

const target = {
  id: "workbench.storybook.preview.target.main",
  kind: "target",
  title: "Storybook",
  description: "Öffnet den lokalen Storybook-Dienst.",
  icon: "workbench.storybook.icon.preview",
  order: 100,
  provider: "workbench.storybook.preview-provider.main",
  projectContext: true,
  sessionAccess: "manage",
  openModes: ["embedded", "external"],
  diagnostics: true,
  storageProfiles: true,
  visibleByDefault: true,
} as const;

describe("Preview Contributions V1", () => {
  it("akzeptiert hostverwaltete Preview Targets", () => {
    expect(previewContributionSchema.safeParse(target).success).toBe(true);
  });

  it("akzeptiert Command-basierte Actions auf kontrollierten Surfaces", () => {
    expect(
      previewContributionSchema.safeParse({
        id: "workbench.storybook.preview.action.reload",
        kind: "action",
        title: "Preview neu laden",
        order: 200,
        commandId: "workbench.storybook.command.reload",
        group: "view",
        surfaces: ["hub-toolbar", "mobile-actions"],
        requiresSession: true,
      }).success,
    ).toBe(true);
  });

  it("weist URLs, Ports, unbekannte Modi und ungültige Grenzen ab", () => {
    expect(
      previewContributionSchema.safeParse({
        ...target,
        url: "http://127.0.0.1:6006",
      }).success,
    ).toBe(false);
    expect(
      previewContributionSchema.safeParse({
        ...target,
        openModes: ["iframe"],
      }).success,
    ).toBe(false);
    expect(
      previewContributionSchema.safeParse({
        ...target,
        order: PREVIEW_ORDER_MAX + 1,
      }).success,
    ).toBe(false);
  });

  it("weist doppelte Modi, IDs und übergroße Listen ab", () => {
    expect(
      previewContributionSchema.safeParse({
        ...target,
        openModes: ["embedded", "embedded"],
      }).success,
    ).toBe(false);
    expect(previewContributionsSchema.safeParse([target, target]).success).toBe(
      false,
    );
    expect(
      previewContributionsSchema.safeParse(
        Array.from(
          { length: PREVIEW_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...target,
            id: `workbench.storybook.preview.target.main-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
