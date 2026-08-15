import { describe, expect, it } from "vitest";
import {
  COMMAND_CONTRIBUTIONS_MAX_COUNT,
  CONTRIBUTION_TITLE_MAX_LENGTH,
  PAGE_CONTRIBUTIONS_MAX_COUNT,
  ROUTE_CONTRIBUTIONS_MAX_COUNT,
  commandContributionSchema,
  commandContributionsSchema,
  pageContributionsSchema,
  routeContributionSchema,
  routeContributionsSchema,
  routePathCollisionKey,
  routePathSchema,
} from "./contributions.js";

const createCommand = {
  id: "workbench.agent-tasks.command.create",
  title: "Agent Tasks: Aufgabe erstellen",
  description: "Erstellt eine neue Aufgabe im aktuellen Projekt.",
  category: "Agent Tasks",
};

describe("Command Contributions V1", () => {
  it("akzeptiert stabile IDs und reine Anzeigemetadaten", () => {
    expect(commandContributionSchema.parse(createCommand)).toEqual(createCommand);
    expect(
      commandContributionSchema.parse({ id: "workbench.agent-tasks.command.open", title: "Agent Tasks öffnen" }),
    ).toEqual({ id: "workbench.agent-tasks.command.open", title: "Agent Tasks öffnen" });
  });

  it("weist Code, unbekannte Felder und ungültige IDs ab", () => {
    expect(commandContributionSchema.safeParse({ ...createCommand, execute: "spawn('task')" }).success).toBe(false);
    expect(commandContributionSchema.safeParse({ ...createCommand, id: "create-task" }).success).toBe(false);
  });

  it("weist leere, nicht normalisierte und überlange Texte ab", () => {
    expect(commandContributionSchema.safeParse({ ...createCommand, title: "" }).success).toBe(false);
    expect(commandContributionSchema.safeParse({ ...createCommand, title: " Agent Tasks" }).success).toBe(false);
    expect(commandContributionSchema.safeParse({ ...createCommand, description: "Zeile 1\nZeile 2" }).success).toBe(false);
    expect(
      commandContributionSchema.safeParse({ ...createCommand, title: "a".repeat(CONTRIBUTION_TITLE_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it("verlangt bei vorhandenem Commands-Bereich mindestens einen Eintrag", () => {
    expect(commandContributionsSchema.safeParse([]).success).toBe(false);
  });

  it("weist doppelte IDs auch bei anderen Metadaten ab", () => {
    expect(
      commandContributionsSchema.safeParse([createCommand, { ...createCommand, title: "Andere Anzeige" }]).success,
    ).toBe(false);
  });

  it("begrenzt die Zahl deklarierter Commands", () => {
    const commands = Array.from({ length: COMMAND_CONTRIBUTIONS_MAX_COUNT + 1 }, (_, index) => ({
      id: `workbench.agent-tasks.command.command-${index}`,
      title: `Command ${index}`,
    }));
    expect(commandContributionsSchema.safeParse(commands).success).toBe(false);
  });
});

describe("Page Contributions V1", () => {
  it("akzeptiert Renderflächen mit stabiler ID und Anzeigemetadaten", () => {
    const page = {
      id: "workbench.agent-tasks.page.main",
      title: "Agent Tasks",
      description: "Aufgaben und Agent Runs verwalten.",
    };
    expect(pageContributionsSchema.parse([page])).toEqual([page]);
  });

  it("weist leere, doppelte und übergroße Page-Listen ab", () => {
    const page = { id: "workbench.agent-tasks.page.main", title: "Agent Tasks" };
    expect(pageContributionsSchema.safeParse([]).success).toBe(false);
    expect(pageContributionsSchema.safeParse([page, page]).success).toBe(false);
    expect(
      pageContributionsSchema.safeParse(
        Array.from({ length: PAGE_CONTRIBUTIONS_MAX_COUNT + 1 }, (_, index) => ({
          id: `workbench.agent-tasks.page.page-${index}`,
          title: `Page ${index}`,
        })),
      ).success,
    ).toBe(false);
  });
});

describe("Route Contributions V1", () => {
  const route = {
    id: "workbench.agent-tasks.route.main",
    pageId: "workbench.agent-tasks.page.main",
    path: "/agent-tasks",
    aliases: ["/tasks", "/agent-tasks/:taskId"],
  };

  it.each(["/", "/agent-tasks", "/agent-tasks/:taskId", "/projects/:projectId/tasks"])(
    "akzeptiert den sicheren Pfad %s",
    (path) => {
      expect(routePathSchema.parse(path)).toBe(path);
    },
  );

  it.each([
    "agent-tasks",
    "/agent-tasks/",
    "//agent-tasks",
    "/Agent-Tasks",
    "/agent_tasks",
    "/agent-tasks/:task-id",
    "/agent-tasks/:taskId?",
    "/agent-tasks/*",
    "/agent-tasks/../admin",
    "/agent-tasks?view=all",
    "/agent-tasks#main",
    "/agent-tasks%2fadmin",
    "/agent-tasks\\admin",
  ])("weist den unsicheren oder mehrdeutigen Pfad %s ab", (path) => {
    expect(routePathSchema.safeParse(path).success).toBe(false);
  });

  it("normalisiert Parameternamen für Kollisionserkennung", () => {
    expect(routePathCollisionKey("/projects/:projectId")).toBe("/projects/:");
    expect(routePathCollisionKey("/projects/:id")).toBe("/projects/:");
    expect(routePathCollisionKey("/projects/static")).toBe("/projects/static");
    expect(routePathCollisionKey("invalid")).toBeNull();
  });

  it("füllt stabile Host-Defaults für optionale Route-Metadaten", () => {
    expect(routeContributionSchema.parse(route)).toEqual({
      ...route,
      shell: "standard",
      persistent: false,
      prefetch: "none",
      projectContext: false,
      topbar: true,
      breadcrumbs: true,
      standaloneActions: false,
      mobileNavigation: false,
    });
  });

  it("akzeptiert die vollständigen Dynamic-Shell-Metadaten", () => {
    expect(
      routeContributionSchema.safeParse({
        ...route,
        title: "Agent Tasks",
        shell: "full-bleed",
        persistent: true,
        prefetch: "idle",
        projectContext: true,
        topbar: false,
        breadcrumbs: false,
        standaloneActions: true,
        mobileNavigation: true,
      }).success,
    ).toBe(true);
  });

  it("weist unbekannte Metadaten und Kollisionen zwischen Hauptpfad und Alias ab", () => {
    expect(routeContributionSchema.safeParse({ ...route, layout: "custom" }).success).toBe(false);
    expect(
      routeContributionSchema.safeParse({ ...route, aliases: ["/agent-tasks/:id", "/agent-tasks/:taskId"] })
        .success,
    ).toBe(false);
    expect(
      routeContributionSchema.safeParse({ ...route, path: "/agent-tasks/:id", aliases: ["/agent-tasks/:taskId"] })
        .success,
    ).toBe(false);
  });

  it("weist doppelte IDs und kollidierende URL-Muster über Routes hinweg ab", () => {
    expect(routeContributionsSchema.safeParse([route, { ...route, path: "/other" }]).success).toBe(false);
    expect(
      routeContributionsSchema.safeParse([
        route,
        {
          ...route,
          id: "workbench.agent-tasks.route.detail",
          path: "/projects/:id",
          aliases: ["/other"],
        },
        {
          ...route,
          id: "workbench.agent-tasks.route.alternative",
          path: "/projects/:projectId",
          aliases: ["/another"],
        },
      ]).success,
    ).toBe(false);
  });

  it("begrenzt die Zahl deklarierter Routes", () => {
    expect(
      routeContributionsSchema.safeParse(
        Array.from({ length: ROUTE_CONTRIBUTIONS_MAX_COUNT + 1 }, (_, index) => ({
          id: `workbench.agent-tasks.route.route-${index}`,
          pageId: "workbench.agent-tasks.page.main",
          path: `/route-${index}`,
        })),
      ).success,
    ).toBe(false);
  });
});
