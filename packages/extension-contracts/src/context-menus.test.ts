import { describe, expect, it } from "vitest";
import {
  CONTEXT_MENU_CONTRIBUTIONS_MAX_COUNT,
  CONTEXT_MENU_ORDER_MAX,
  contextMenuContributionSchema,
  contextMenuContributionsSchema,
  contextMenuSurfaceBelongsToExtension,
  contextMenuSurfaceSchema,
  hostContextMenuSurfaces,
} from "./context-menus.js";

const item = {
  id: "workbench.agent-tasks.context-menu.create",
  surface: "host.context-menu.project",
  commandId: "workbench.agent-tasks.command.create",
  group: "create",
  order: 100,
} as const;

describe("Context Menu Contributions V1", () => {
  it.each(hostContextMenuSurfaces)(
    "akzeptiert die Host-Surface %s",
    (surface) => {
      expect(
        contextMenuContributionSchema.safeParse({ ...item, surface }).success,
      ).toBe(true);
    },
  );

  it("erlaubt extensioneigene Surfaces und strikt typisierte Context Expressions", () => {
    expect(
      contextMenuContributionSchema.safeParse({
        ...item,
        surface: "workbench.agent-tasks.context-menu.task",
        icon: "workbench.agent-tasks.icon.task",
        when: {
          all: [
            {
              key: "workbench.agent-tasks.context.task-selected",
              operator: "equals",
              value: true,
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("hält unbekannte Host-Surfaces und Felder geschlossen", () => {
    expect(
      contextMenuSurfaceSchema.safeParse("host.context-menu.unknown").success,
    ).toBe(false);
    expect(
      contextMenuContributionSchema.safeParse({
        ...item,
        execute: "delete --all",
      }).success,
    ).toBe(false);
  });

  it("begrenzt Gruppen und deterministische Reihenfolgen", () => {
    expect(
      contextMenuContributionSchema.safeParse({ ...item, group: "other" })
        .success,
    ).toBe(false);
    expect(
      contextMenuContributionSchema.safeParse({ ...item, order: -1 }).success,
    ).toBe(false);
    expect(
      contextMenuContributionSchema.safeParse({
        ...item,
        order: CONTEXT_MENU_ORDER_MAX + 1,
      }).success,
    ).toBe(false);
  });

  it("ordnet Host- und eigene Surfaces der Extension zu", () => {
    expect(
      contextMenuSurfaceBelongsToExtension(
        "workbench.agent-tasks",
        "host.context-menu.file",
      ),
    ).toBe(true);
    expect(
      contextMenuSurfaceBelongsToExtension(
        "workbench.agent-tasks",
        "workbench.agent-tasks.context-menu.task",
      ),
    ).toBe(true);
    expect(
      contextMenuSurfaceBelongsToExtension(
        "workbench.agent-tasks",
        "workbench.other.context-menu.task",
      ),
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Contribution-Listen ab", () => {
    expect(contextMenuContributionsSchema.safeParse([]).success).toBe(false);
    expect(contextMenuContributionsSchema.safeParse([item, item]).success).toBe(
      false,
    );
    expect(
      contextMenuContributionsSchema.safeParse(
        Array.from(
          { length: CONTEXT_MENU_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...item,
            id: `workbench.agent-tasks.context-menu.item-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
