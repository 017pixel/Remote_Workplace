import { describe, expect, it } from "vitest";
import {
  BROWSER_CONTRIBUTIONS_MAX_COUNT,
  BROWSER_ORDER_MAX,
  browserContributionSchema,
  browserContributionsSchema,
} from "./browser-contributions.js";

const tool = {
  id: "workbench.accessibility.browser.tool.audit",
  kind: "tool",
  title: "Barrierefreiheit prüfen",
  description: "Prüft die aktive Seite über den Browser Broker.",
  icon: "workbench.accessibility.icon.audit",
  order: 100,
  provider: "workbench.accessibility.browser-provider.audit",
  projectContext: true,
  operations: ["state.read", "page.source", "page.capture"],
  surfaces: ["toolbar", "side-panel", "mobile-actions"],
  visibleByDefault: true,
} as const;

describe("Browser Contributions V1", () => {
  it("akzeptiert hostgerenderte Tools mit begrenzten Operationen", () => {
    expect(browserContributionSchema.safeParse(tool).success).toBe(true);
  });

  it("akzeptiert Command-basierte Actions auf kontrollierten Surfaces", () => {
    expect(
      browserContributionSchema.safeParse({
        id: "workbench.accessibility.browser.action.audit",
        kind: "action",
        title: "Seite prüfen",
        order: 200,
        commandId: "workbench.accessibility.command.audit",
        group: "inspect",
        surfaces: ["context-menu", "mobile-actions"],
        requiresSession: true,
      }).success,
    ).toBe(true);
  });

  it("weist Runtime-Daten, unbekannte Operationen und ungültige Grenzen ab", () => {
    expect(
      browserContributionSchema.safeParse({
        ...tool,
        profilePath: "/home/user/.config/chromium",
      }).success,
    ).toBe(false);
    expect(
      browserContributionSchema.safeParse({
        ...tool,
        operations: ["cdp.execute"],
      }).success,
    ).toBe(false);
    expect(
      browserContributionSchema.safeParse({
        ...tool,
        order: BROWSER_ORDER_MAX + 1,
      }).success,
    ).toBe(false);
  });

  it("weist doppelte Operationen, Surfaces, IDs und übergroße Listen ab", () => {
    expect(
      browserContributionSchema.safeParse({
        ...tool,
        operations: ["state.read", "state.read"],
      }).success,
    ).toBe(false);
    expect(
      browserContributionSchema.safeParse({
        ...tool,
        surfaces: ["toolbar", "toolbar"],
      }).success,
    ).toBe(false);
    expect(browserContributionsSchema.safeParse([tool, tool]).success).toBe(
      false,
    );
    expect(
      browserContributionsSchema.safeParse(
        Array.from(
          { length: BROWSER_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...tool,
            id: `workbench.accessibility.browser.tool.audit-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
