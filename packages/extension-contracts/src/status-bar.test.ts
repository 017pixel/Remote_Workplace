import { describe, expect, it } from "vitest";
import {
  STATUS_BAR_CONTRIBUTIONS_MAX_COUNT,
  STATUS_BAR_ORDER_MAX,
  STATUS_BAR_PRIORITY_MAX,
  statusBarContributionKinds,
  statusBarContributionSchema,
  statusBarContributionsSchema,
} from "./status-bar.js";

const providerItem = {
  id: "workbench.agent-tasks.status-bar.open-count",
  kind: "counter",
  title: "Offene Aufgaben",
  alignment: "right",
  order: 100,
  priority: 60,
  compact: "value",
  provider: "workbench.agent-tasks.status-provider.open-count",
} as const;

describe("Status Bar Contributions V1", () => {
  it.each(statusBarContributionKinds.filter((kind) => kind !== "action"))(
    "akzeptiert die providerbasierte Art %s",
    (kind) => {
      expect(
        statusBarContributionSchema.safeParse({ ...providerItem, kind })
          .success,
      ).toBe(true);
    },
  );

  it("bindet Actions ausschließlich an Commands", () => {
    expect(
      statusBarContributionSchema.safeParse({
        ...providerItem,
        kind: "action",
        commandId: "workbench.agent-tasks.command.create",
        provider: undefined,
      }).success,
    ).toBe(false);
    expect(
      statusBarContributionSchema.safeParse({
        id: "workbench.agent-tasks.status-bar.create",
        kind: "action",
        title: "Aufgabe erstellen",
        alignment: "right",
        order: 110,
        priority: 40,
        compact: "hide",
        commandId: "workbench.agent-tasks.command.create",
      }).success,
    ).toBe(true);
  });

  it("erlaubt providerbasierten Items eine optionale Command-Aktion", () => {
    expect(
      statusBarContributionSchema.safeParse({
        ...providerItem,
        commandId: "workbench.agent-tasks.command.open",
        icon: "workbench.agent-tasks.icon.tasks",
        when: {
          all: [{ key: "host.project.open", operator: "equals", value: true }],
        },
      }).success,
    ).toBe(true);
  });

  it("verlangt für den Compact Mode icon eine kontrollierte Icon-Referenz", () => {
    expect(
      statusBarContributionSchema.safeParse({
        ...providerItem,
        compact: "icon",
      }).success,
    ).toBe(false);
    expect(
      statusBarContributionSchema.safeParse({
        ...providerItem,
        compact: "icon",
        icon: "extension",
      }).success,
    ).toBe(true);
  });

  it("begrenzt Alignment, Reihenfolge, Priorität und freie Felder", () => {
    expect(
      statusBarContributionSchema.safeParse({
        ...providerItem,
        alignment: "center",
      }).success,
    ).toBe(false);
    expect(
      statusBarContributionSchema.safeParse({
        ...providerItem,
        order: STATUS_BAR_ORDER_MAX + 1,
      }).success,
    ).toBe(false);
    expect(
      statusBarContributionSchema.safeParse({
        ...providerItem,
        priority: STATUS_BAR_PRIORITY_MAX + 1,
      }).success,
    ).toBe(false);
    expect(
      statusBarContributionSchema.safeParse({
        ...providerItem,
        render: "<script />",
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Contribution-Listen ab", () => {
    expect(statusBarContributionsSchema.safeParse([]).success).toBe(false);
    expect(
      statusBarContributionsSchema.safeParse([providerItem, providerItem])
        .success,
    ).toBe(false);
    expect(
      statusBarContributionsSchema.safeParse(
        Array.from(
          { length: STATUS_BAR_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...providerItem,
            id: `workbench.agent-tasks.status-bar.item-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
