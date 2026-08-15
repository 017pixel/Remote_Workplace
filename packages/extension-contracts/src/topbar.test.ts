import { describe, expect, it } from "vitest";
import {
  TOPBAR_CONTRIBUTIONS_MAX_COUNT,
  TOPBAR_ORDER_MAX,
  TOPBAR_PRIORITY_MAX,
  topbarContributionSchema,
  topbarContributionsSchema,
} from "./topbar.js";

const actionItem = {
  id: "workbench.agent-tasks.topbar.create",
  kind: "action",
  routeId: "workbench.agent-tasks.route.main",
  commandId: "workbench.agent-tasks.command.create",
  icon: "workbench.agent-tasks.icon.tasks",
  placement: "primary",
  order: 100,
  priority: 80,
  presentation: "icon-label",
  compact: "icon",
} as const;

describe("Topbar Contributions V1", () => {
  it("akzeptiert routegebundene Command-Aktionen", () => {
    expect(topbarContributionSchema.safeParse(actionItem).success).toBe(true);
  });

  it("akzeptiert hostgerenderte Selector Provider", () => {
    expect(
      topbarContributionSchema.safeParse({
        ...actionItem,
        id: "workbench.agent-tasks.topbar.project",
        kind: "selector",
        title: "Projekt",
        provider: "workbench.agent-tasks.topbar-provider.projects",
        when: {
          all: [{ key: "host.project.open", operator: "exists" }],
        },
      }).success,
    ).toBe(true);
  });

  it("verlangt für icon-basierte Darstellungen eine Icon-Referenz", () => {
    expect(
      topbarContributionSchema.safeParse({
        ...actionItem,
        icon: undefined,
        presentation: "icon",
        compact: "overflow",
      }).success,
    ).toBe(false);
    expect(
      topbarContributionSchema.safeParse({
        ...actionItem,
        icon: undefined,
        presentation: "label",
        compact: "icon",
      }).success,
    ).toBe(false);
  });

  it("begrenzt Platzierung, Reihenfolge, Priorität und freie Felder", () => {
    expect(
      topbarContributionSchema.safeParse({
        ...actionItem,
        placement: "navigation",
      }).success,
    ).toBe(false);
    expect(
      topbarContributionSchema.safeParse({
        ...actionItem,
        order: TOPBAR_ORDER_MAX + 1,
      }).success,
    ).toBe(false);
    expect(
      topbarContributionSchema.safeParse({
        ...actionItem,
        priority: TOPBAR_PRIORITY_MAX + 1,
      }).success,
    ).toBe(false);
    expect(
      topbarContributionSchema.safeParse({
        ...actionItem,
        render: "<button>Ausführen</button>",
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Contribution-Listen ab", () => {
    expect(topbarContributionsSchema.safeParse([]).success).toBe(false);
    expect(
      topbarContributionsSchema.safeParse([actionItem, actionItem]).success,
    ).toBe(false);
    expect(
      topbarContributionsSchema.safeParse(
        Array.from(
          { length: TOPBAR_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...actionItem,
            id: `workbench.agent-tasks.topbar.item-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
