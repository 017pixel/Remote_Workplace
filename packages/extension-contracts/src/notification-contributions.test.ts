import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_ACTIONS_MAX_COUNT,
  NOTIFICATION_CATEGORIES_MAX_COUNT,
  NOTIFICATION_CONTRIBUTIONS_MAX_COUNT,
  notificationContributionSchema,
  notificationContributionsSchema,
} from "./notification-contributions.js";

const source = {
  id: "workbench.agent-tasks.notification.source",
  title: "Agent Tasks",
  description: "Benachrichtigungen zu Agent-Aufgaben.",
  icon: "extension",
  categories: [
    {
      id: "workbench.agent-tasks.notification-category.tasks",
      title: "Agent-Aufgaben",
    },
  ],
  actions: [
    {
      id: "workbench.agent-tasks.notification-action.open",
      title: "Aufgabe öffnen",
      commandId: "workbench.agent-tasks.command.open",
    },
  ],
  retention: "until-resolved",
  deduplication: {
    mode: "keyed",
    keyMaxLength: 128,
    behavior: "replace-active",
  },
} as const;

describe("Notification Contributions V1", () => {
  it("akzeptiert eine deklarative Notification Source", () => {
    expect(notificationContributionSchema.safeParse(source).success).toBe(
      true,
    );
  });

  it("akzeptiert hostverwaltete Retention und optionale Deduplizierung", () => {
    expect(
      notificationContributionSchema.safeParse({
        ...source,
        actions: undefined,
        retention: "transient",
        deduplication: { mode: "none" },
      }).success,
    ).toBe(true);
    expect(
      notificationContributionSchema.safeParse({
        ...source,
        retention: "forever",
      }).success,
    ).toBe(false);
  });

  it("weist freie Inhalte und Runtime-Ziele im Manifest ab", () => {
    expect(
      notificationContributionSchema.safeParse({
        ...source,
        html: "<strong>Fertig</strong>",
        link: "https://example.com",
        pushEndpoint: "https://push.example.com",
      }).success,
    ).toBe(false);
  });

  it("verlangt eindeutige Kategorie- und Action-IDs", () => {
    expect(
      notificationContributionSchema.safeParse({
        ...source,
        categories: [source.categories[0], source.categories[0]],
      }).success,
    ).toBe(false);
    expect(
      notificationContributionSchema.safeParse({
        ...source,
        actions: [source.actions[0], source.actions[0]],
      }).success,
    ).toBe(false);
  });

  it("begrenzt Kategorien und Actions je Source", () => {
    expect(
      notificationContributionSchema.safeParse({
        ...source,
        categories: Array.from(
          { length: NOTIFICATION_CATEGORIES_MAX_COUNT + 1 },
          (_, index) => ({
            ...source.categories[0],
            id: `workbench.agent-tasks.notification-category.tasks-${index}`,
          }),
        ),
      }).success,
    ).toBe(false);
    expect(
      notificationContributionSchema.safeParse({
        ...source,
        actions: Array.from(
          { length: NOTIFICATION_ACTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...source.actions[0],
            id: `workbench.agent-tasks.notification-action.open-${index}`,
          }),
        ),
      }).success,
    ).toBe(false);
  });

  it("begrenzt die Deduplizierungs-ID", () => {
    expect(
      notificationContributionSchema.safeParse({
        ...source,
        deduplication: {
          ...source.deduplication,
          keyMaxLength: 201,
        },
      }).success,
    ).toBe(false);
  });

  it("weist doppelte Sources und übergroße Listen ab", () => {
    expect(notificationContributionsSchema.safeParse([source, source]).success)
      .toBe(false);
    expect(
      notificationContributionsSchema.safeParse(
        Array.from(
          { length: NOTIFICATION_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...source,
            id: `workbench.agent-tasks.notification.source-${index}`,
            categories: [
              {
                ...source.categories[0],
                id: `workbench.agent-tasks.notification-category.tasks-${index}`,
              },
            ],
            actions: undefined,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
