import { describe, expect, it } from "vitest";
import {
  COMMAND_CONTRIBUTIONS_MAX_COUNT,
  CONTRIBUTION_TITLE_MAX_LENGTH,
  DASHBOARD_CONTRIBUTIONS_MAX_COUNT,
  DASHBOARD_REFRESH_INTERVAL_MAX_MS,
  DASHBOARD_REFRESH_INTERVAL_MIN_MS,
  NAVIGATION_CONTRIBUTIONS_MAX_COUNT,
  ORBIT_CONTRIBUTIONS_MAX_COUNT,
  ORBIT_STATE_VERSION_MAX,
  PAGE_CONTRIBUTIONS_MAX_COUNT,
  ROUTE_CONTRIBUTIONS_MAX_COUNT,
  commandContributionSchema,
  commandContributionsSchema,
  dashboardContributionSchema,
  dashboardContributionsSchema,
  dashboardRefreshSchema,
  navigationContributionSchema,
  navigationContributionsSchema,
  orbitContributionsSchema,
  orbitNodeContributionSchema,
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
    expect(commandContributionSchema.parse(createCommand)).toEqual(
      createCommand,
    );
    expect(
      commandContributionSchema.parse({
        id: "workbench.agent-tasks.command.open",
        title: "Agent Tasks öffnen",
      }),
    ).toEqual({
      id: "workbench.agent-tasks.command.open",
      title: "Agent Tasks öffnen",
    });
  });

  it("weist Code, unbekannte Felder und ungültige IDs ab", () => {
    expect(
      commandContributionSchema.safeParse({
        ...createCommand,
        execute: "spawn('task')",
      }).success,
    ).toBe(false);
    expect(
      commandContributionSchema.safeParse({
        ...createCommand,
        id: "create-task",
      }).success,
    ).toBe(false);
  });

  it("weist leere, nicht normalisierte und überlange Texte ab", () => {
    expect(
      commandContributionSchema.safeParse({ ...createCommand, title: "" })
        .success,
    ).toBe(false);
    expect(
      commandContributionSchema.safeParse({
        ...createCommand,
        title: " Agent Tasks",
      }).success,
    ).toBe(false);
    expect(
      commandContributionSchema.safeParse({
        ...createCommand,
        description: "Zeile 1\nZeile 2",
      }).success,
    ).toBe(false);
    expect(
      commandContributionSchema.safeParse({
        ...createCommand,
        title: "a".repeat(CONTRIBUTION_TITLE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("verlangt bei vorhandenem Commands-Bereich mindestens einen Eintrag", () => {
    expect(commandContributionsSchema.safeParse([]).success).toBe(false);
  });

  it("weist doppelte IDs auch bei anderen Metadaten ab", () => {
    expect(
      commandContributionsSchema.safeParse([
        createCommand,
        { ...createCommand, title: "Andere Anzeige" },
      ]).success,
    ).toBe(false);
  });

  it("begrenzt die Zahl deklarierter Commands", () => {
    const commands = Array.from(
      { length: COMMAND_CONTRIBUTIONS_MAX_COUNT + 1 },
      (_, index) => ({
        id: `workbench.agent-tasks.command.command-${index}`,
        title: `Command ${index}`,
      }),
    );
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
    const page = {
      id: "workbench.agent-tasks.page.main",
      title: "Agent Tasks",
    };
    expect(pageContributionsSchema.safeParse([]).success).toBe(false);
    expect(pageContributionsSchema.safeParse([page, page]).success).toBe(false);
    expect(
      pageContributionsSchema.safeParse(
        Array.from(
          { length: PAGE_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            id: `workbench.agent-tasks.page.page-${index}`,
            title: `Page ${index}`,
          }),
        ),
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

  it.each([
    "/",
    "/agent-tasks",
    "/agent-tasks/:taskId",
    "/projects/:projectId/tasks",
  ])("akzeptiert den sicheren Pfad %s", (path) => {
    expect(routePathSchema.parse(path)).toBe(path);
  });

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
    expect(
      routeContributionSchema.safeParse({ ...route, layout: "custom" }).success,
    ).toBe(false);
    expect(
      routeContributionSchema.safeParse({
        ...route,
        aliases: ["/agent-tasks/:id", "/agent-tasks/:taskId"],
      }).success,
    ).toBe(false);
    expect(
      routeContributionSchema.safeParse({
        ...route,
        path: "/agent-tasks/:id",
        aliases: ["/agent-tasks/:taskId"],
      }).success,
    ).toBe(false);
  });

  it("weist doppelte IDs und kollidierende URL-Muster über Routes hinweg ab", () => {
    expect(
      routeContributionsSchema.safeParse([route, { ...route, path: "/other" }])
        .success,
    ).toBe(false);
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
        Array.from(
          { length: ROUTE_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            id: `workbench.agent-tasks.route.route-${index}`,
            pageId: "workbench.agent-tasks.page.main",
            path: `/route-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});

describe("Navigation Contributions V1", () => {
  const navigation = {
    id: "workbench.agent-tasks.navigation.main",
    routeId: "workbench.agent-tasks.route.main",
    label: "Agent Tasks",
    description: "Aufgaben und Agent Runs verwalten.",
    icon: "workbench.agent-tasks.icon.main",
    group: "tools",
    order: 120,
    badgeProvider: "workbench.agent-tasks.badge.open-tasks",
  } as const;

  it("akzeptiert gemeinsame Desktop- und Mobile-Metadaten mit stabilen Defaults", () => {
    expect(navigationContributionSchema.parse(navigation)).toEqual({
      ...navigation,
      visibleByDefault: true,
    });
    expect(
      navigationContributionSchema.safeParse({
        ...navigation,
        icon: "extension",
        group: "extensions",
        visibleByDefault: false,
      }).success,
    ).toBe(true);
  });

  it("weist unbekannte Gruppen, ungültige Reihenfolgen und ausführbare Felder ab", () => {
    expect(
      navigationContributionSchema.safeParse({
        ...navigation,
        group: "marketplace",
      }).success,
    ).toBe(false);
    expect(
      navigationContributionSchema.safeParse({ ...navigation, order: -1 })
        .success,
    ).toBe(false);
    expect(
      navigationContributionSchema.safeParse({ ...navigation, order: 1.5 })
        .success,
    ).toBe(false);
    expect(
      navigationContributionSchema.safeParse({
        ...navigation,
        badgeProvider: () => 3,
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Navigation-Listen ab", () => {
    expect(navigationContributionsSchema.safeParse([]).success).toBe(false);
    expect(
      navigationContributionsSchema.safeParse([navigation, navigation]).success,
    ).toBe(false);
    expect(
      navigationContributionsSchema.safeParse(
        Array.from(
          { length: NAVIGATION_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...navigation,
            id: `workbench.agent-tasks.navigation.item-${index}`,
            order: index,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});

describe("Orbit Contributions V1", () => {
  const orbitNode = {
    id: "workbench.agent-tasks.orbit.task-board",
    title: "Agent Tasks",
    description: "Aufgaben eines Projekts im Orbit verwalten.",
    category: "Productivity",
    icon: "workbench.agent-tasks.icon.task-board",
    stateVersion: 3,
    stateSchema: "./schemas/task-board-state.schema.json",
    defaultSize: { width: 720, height: 480 },
  } as const;

  it("akzeptiert versionierten State und füllt sichere Host-Defaults", () => {
    expect(orbitNodeContributionSchema.parse(orbitNode)).toEqual({
      ...orbitNode,
      resizable: true,
      projectContext: false,
      inspector: false,
      connections: "bidirectional",
      visibleByDefault: true,
    });
  });

  it("akzeptiert kontrollierte Renderer-Metadaten für komplexe Knoten", () => {
    expect(
      orbitNodeContributionSchema.safeParse({
        ...orbitNode,
        icon: "extension",
        resizable: false,
        projectContext: true,
        inspector: true,
        connections: "incoming",
        visibleByDefault: false,
      }).success,
    ).toBe(true);
  });

  it("weist ungültige State-Versionen, Größen und Connection-Modi ab", () => {
    expect(
      orbitNodeContributionSchema.safeParse({ ...orbitNode, stateVersion: 0 })
        .success,
    ).toBe(false);
    expect(
      orbitNodeContributionSchema.safeParse({
        ...orbitNode,
        stateVersion: ORBIT_STATE_VERSION_MAX + 1,
      }).success,
    ).toBe(false);
    expect(
      orbitNodeContributionSchema.safeParse({
        ...orbitNode,
        defaultSize: { width: 159, height: 480 },
      }).success,
    ).toBe(false);
    expect(
      orbitNodeContributionSchema.safeParse({
        ...orbitNode,
        connections: "custom",
      }).success,
    ).toBe(false);
    expect(
      orbitNodeContributionSchema.safeParse({
        ...orbitNode,
        stateSchema: "https://example.com/state.json",
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Orbit-Listen ab", () => {
    expect(orbitContributionsSchema.safeParse([]).success).toBe(false);
    expect(
      orbitContributionsSchema.safeParse([orbitNode, orbitNode]).success,
    ).toBe(false);
    expect(
      orbitContributionsSchema.safeParse(
        Array.from(
          { length: ORBIT_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...orbitNode,
            id: `workbench.agent-tasks.orbit.node-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});

describe("Dashboard Contributions V1", () => {
  const providerContribution = {
    id: "workbench.agent-tasks.dashboard.open-count",
    kind: "metric",
    title: "Offene Aufgaben",
    icon: "workbench.agent-tasks.icon.tasks",
    order: 100,
    provider: "workbench.agent-tasks.dashboard-provider.open-count",
  } as const;

  it("füllt stabile Host-Defaults für providerbasierte Contributions", () => {
    expect(dashboardContributionSchema.parse(providerContribution)).toEqual({
      ...providerContribution,
      defaultSize: "medium",
      projectContext: false,
      visibleByDefault: true,
      refresh: { mode: "on-demand" },
      format: "number",
    });
  });

  it.each([
    { ...providerContribution, kind: "metric", format: "bytes" },
    { ...providerContribution, kind: "status" },
    { ...providerContribution, kind: "card" },
    {
      id: "workbench.agent-tasks.dashboard.create",
      kind: "quick-action",
      title: "Aufgabe erstellen",
      order: 110,
      commandId: "workbench.agent-tasks.command.create",
    },
    { ...providerContribution, kind: "list" },
    { ...providerContribution, kind: "chart", chartType: "line" },
    { ...providerContribution, kind: "error-indicator" },
    { ...providerContribution, kind: "health-indicator" },
  ])("akzeptiert den Dashboard-Typ $kind", (contribution) => {
    expect(dashboardContributionSchema.safeParse(contribution).success).toBe(
      true,
    );
  });

  it("begrenzt Intervalle und verlangt typspezifische Refresh-Felder", () => {
    expect(
      dashboardRefreshSchema.safeParse({
        mode: "interval",
        intervalMilliseconds: DASHBOARD_REFRESH_INTERVAL_MIN_MS,
      }).success,
    ).toBe(true);
    expect(
      dashboardRefreshSchema.safeParse({
        mode: "interval",
        intervalMilliseconds: DASHBOARD_REFRESH_INTERVAL_MAX_MS,
      }).success,
    ).toBe(true);
    expect(dashboardRefreshSchema.safeParse({ mode: "interval" }).success).toBe(
      false,
    );
    expect(
      dashboardRefreshSchema.safeParse({
        mode: "interval",
        intervalMilliseconds: DASHBOARD_REFRESH_INTERVAL_MIN_MS - 1,
      }).success,
    ).toBe(false);
    expect(
      dashboardRefreshSchema.safeParse({
        mode: "realtime",
        intervalMilliseconds: 5_000,
      }).success,
    ).toBe(false);
  });

  it("weist ungültige Format-, Chart- und Quick-Action-Metadaten ab", () => {
    expect(
      dashboardContributionSchema.safeParse({
        ...providerContribution,
        format: "currency",
      }).success,
    ).toBe(false);
    expect(
      dashboardContributionSchema.safeParse({
        ...providerContribution,
        kind: "chart",
        chartType: "scatter",
      }).success,
    ).toBe(false);
    expect(
      dashboardContributionSchema.safeParse({
        id: "workbench.agent-tasks.dashboard.create",
        kind: "quick-action",
        title: "Aufgabe erstellen",
        order: 110,
        commandId: "workbench.agent-tasks.command.create",
        provider: "workbench.agent-tasks.dashboard-provider.create",
      }).success,
    ).toBe(false);
  });

  it("weist leere, doppelte und übergroße Dashboard-Listen ab", () => {
    expect(dashboardContributionsSchema.safeParse([]).success).toBe(false);
    expect(
      dashboardContributionsSchema.safeParse([
        providerContribution,
        providerContribution,
      ]).success,
    ).toBe(false);
    expect(
      dashboardContributionsSchema.safeParse(
        Array.from(
          { length: DASHBOARD_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...providerContribution,
            id: `workbench.agent-tasks.dashboard.metric-${index}`,
            order: index,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
