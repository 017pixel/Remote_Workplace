import { describe, expect, it } from "vitest";
import {
  EXTENSION_KEYWORDS_MAX_COUNT,
  extensionActivationEventsV1Schema,
  extensionContributionsV1Schema,
  extensionEntrypointsSchema,
  extensionManifestV1Schema,
  extensionPackagePathSchema,
  extensionPermissionsV1Schema,
  extensionTrustLevelSchema,
} from "./manifest.js";

const validManifest = {
  $schema: "./node_modules/@workbench/extension-contracts/schema/extension-manifest-v1.schema.json",
  manifestVersion: 1,
  id: "workbench.agent-tasks",
  name: "Agent Tasks",
  version: "1.0.0",
  publisher: "remote-workplace",
  description: "Aufgaben und Agent Runs verwalten",
  license: "MIT",
  category: "productivity",
  keywords: ["agents", "tasks"],
  icon: "./assets/icon.webp",
  readme: "./README.md",
  changelog: "./CHANGELOG.md",
  dataSchemaVersion: 1,
  engines: {
    remoteWorkplace: ">=0.50.0",
    extensionApi: "^1",
  },
  trust: "catalog-first-party",
  entrypoints: {
    ui: "./dist/ui.js",
    server: "./dist/server.mjs",
  },
  permissions: [],
  activationEvents: [],
  extensionDependencies: {
    "workbench.projects": "^1.0.0",
  },
  optionalExtensionDependencies: {
    "workbench.notifications": ">=1.0.0 <2.0.0",
  },
  extensionConflicts: [
    { id: "workbench.legacy-agent-tasks", range: "<2.0.0" },
    { id: "workbench.agent-board" },
  ],
  contributes: {
    commands: [
      {
        id: "workbench.agent-tasks.command.create",
        title: "Agent Tasks: Aufgabe erstellen",
        description: "Erstellt eine neue Aufgabe im aktuellen Projekt.",
        category: "Agent Tasks",
      },
    ],
    pages: [
      {
        id: "workbench.agent-tasks.page.main",
        title: "Agent Tasks",
      },
    ],
    routes: [
      {
        id: "workbench.agent-tasks.route.main",
        pageId: "workbench.agent-tasks.page.main",
        path: "/agent-tasks",
        shell: "standard",
        persistent: true,
        prefetch: "idle",
        projectContext: true,
        topbar: true,
        breadcrumbs: true,
        standaloneActions: false,
        mobileNavigation: true,
      },
    ],
    navigation: [
      {
        id: "workbench.agent-tasks.navigation.main",
        routeId: "workbench.agent-tasks.route.main",
        label: "Agent Tasks",
        description: "Aufgaben und Agent Runs verwalten.",
        icon: "workbench.agent-tasks.icon.main",
        group: "tools",
        order: 120,
        badgeProvider: "workbench.agent-tasks.badge.open-tasks",
        visibleByDefault: true,
      },
    ],
    orbit: [
      {
        id: "workbench.agent-tasks.orbit.task-board",
        title: "Agent Tasks",
        description: "Aufgaben eines Projekts im Orbit verwalten.",
        category: "Productivity",
        icon: "workbench.agent-tasks.icon.task-board",
        stateVersion: 3,
        stateSchema: "./schemas/task-board-state.schema.json",
        defaultSize: { width: 720, height: 480 },
        resizable: true,
        projectContext: true,
        inspector: true,
        connections: "bidirectional",
        visibleByDefault: true,
      },
    ],
  },
};

describe("Extension Manifest V1", () => {
  it("akzeptiert ein vollständiges lokales Manifest", () => {
    expect(extensionManifestV1Schema.parse(validManifest)).toEqual(validManifest);
  });

  it("akzeptiert ein Manifest ohne optionale Metadaten", () => {
    const manifest = {
      manifestVersion: 1,
      id: "workbench.agent-tasks",
      name: "Agent Tasks",
      version: "1.0.0",
      publisher: "remote-workplace",
      description: "Aufgaben und Agent Runs verwalten",
      license: "MIT",
      engines: { remoteWorkplace: ">=0.50.0", extensionApi: "^1" },
      trust: "catalog-first-party",
      entrypoints: { server: "./dist/server.js" },
      permissions: [],
      activationEvents: [],
      contributes: {},
    };

    expect(extensionManifestV1Schema.parse(manifest)).toEqual(manifest);
  });

  it("verlangt mindestens einen Entrypoint oder später eine Contribution", () => {
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, entrypoints: {}, contributes: {} }).success).toBe(false);
  });

  it("weist unbekannte Felder auf allen definierten Ebenen ab", () => {
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, remoteRegistry: "https://example.com" }).success).toBe(
      false,
    );
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        engines: { ...validManifest.engines, node: ">=22" },
      }).success,
    ).toBe(false);
    expect(extensionEntrypointsSchema.safeParse({ ...validManifest.entrypoints, worker: "./dist/worker.js" }).success).toBe(
      false,
    );
  });

  it.each([
    ["manifestVersion", { ...validManifest, manifestVersion: 2 }],
    ["ID", { ...validManifest, id: "Agent Tasks" }],
    ["Version", { ...validManifest, version: "v1.0.0" }],
    ["Workbench Range", { ...validManifest, engines: { ...validManifest.engines, remoteWorkplace: "latest" } }],
    ["Extension API Range", { ...validManifest, engines: { ...validManifest.engines, extensionApi: " ^1" } }],
    ["Trust", { ...validManifest, trust: "first-party" }],
    ["Data Schema Version", { ...validManifest, dataSchemaVersion: 0 }],
  ])("weist einen ungültigen Wert für %s ab", (_field, manifest) => {
    expect(extensionManifestV1Schema.safeParse(manifest).success).toBe(false);
  });

  it.each(["system", "builtin", "catalog-first-party", "developer", "sandboxed-webview"])(
    "akzeptiert das Trust Level %s",
    (trust) => {
      expect(extensionTrustLevelSchema.parse(trust)).toBe(trust);
    },
  );

  it("weist nicht normalisierte Texte und doppelte Keywords ab", () => {
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, name: " Agent Tasks" }).success).toBe(false);
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, description: "Agent\nTasks" }).success).toBe(false);
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, keywords: ["Agent", "agent"] }).success).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        keywords: Array.from({ length: EXTENSION_KEYWORDS_MAX_COUNT + 1 }, (_, index) => `keyword-${index}`),
      }).success,
    ).toBe(false);
  });

  it.each([
    "../server.js",
    "/tmp/server.js",
    "./dist/../server.js",
    "./dist\\server.js",
    "./%2e%2e/server.js",
    "./dist/server.js?debug=1",
    "./dist/server.js#entry",
    "https://example.com/server.js",
    "file:///tmp/server.js",
  ])("weist den unsicheren oder nicht lokalen Paketpfad %s ab", (path) => {
    expect(extensionPackagePathSchema.safeParse(path).success).toBe(false);
    expect(extensionEntrypointsSchema.safeParse({ server: path }).success).toBe(false);
  });

  it("begrenzt Entrypoint- und Asset-Dateitypen", () => {
    expect(extensionEntrypointsSchema.safeParse({ ui: "./dist/ui.ts" }).success).toBe(false);
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, icon: "./assets/icon.svg" }).success).toBe(false);
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, icon: "./assets/icon.PNG" }).success).toBe(false);
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, readme: "./README.html" }).success).toBe(false);
  });

  it("akzeptiert ausschließlich strukturierte Permission Requests", () => {
    expect(extensionPermissionsV1Schema.safeParse([]).success).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [
          { permission: "files.read", scope: { projects: ["current"] } },
          { permission: "network.fetch", scope: { hosts: ["api.example.com"] } },
          { permission: "notifications.create" },
        ],
      }).success,
    ).toBe(true);
    expect(extensionPermissionsV1Schema.safeParse(["files.read"]).success).toBe(false);
  });

  it("akzeptiert Activation Events im eigenen Contribution-Namespace", () => {
    const manifest = {
      ...validManifest,
      activationEvents: [
        "onStartup",
        "onProject",
        "onEvent:project.opened",
        "onCommand:workbench.agent-tasks.command.create",
        "onRoute:workbench.agent-tasks.route.main",
        "onOrbitNode:workbench.agent-tasks.orbit.task-board",
        "onSchedule:workbench.agent-tasks.job.cleanup",
      ],
    };
    expect(extensionManifestV1Schema.safeParse(manifest).success).toBe(true);
  });

  it("weist fremde Contribution-Namespaces und doppelte Events ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onCommand:workbench.other.command.create"],
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onEvent:workbench.other.task.created"],
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onStartup", "onStartup"],
      }).success,
    ).toBe(false);
  });

  it("akzeptiert optionale Dependency- und Conflict-Verträge", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        extensionDependencies: { "workbench.projects": "^1.0.0" },
        optionalExtensionDependencies: { "workbench.git": "^1.0.0" },
        extensionConflicts: [{ id: "workbench.legacy-agent-tasks", range: "<2.0.0" }],
      }).success,
    ).toBe(true);
  });

  it("weist Selbstabhängigkeiten und Selbstkonflikte ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        extensionDependencies: { "workbench.agent-tasks": "^1.0.0" },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        optionalExtensionDependencies: { "workbench.agent-tasks": "^1.0.0" },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        extensionConflicts: [{ id: "workbench.agent-tasks" }],
      }).success,
    ).toBe(false);
  });

  it("weist Überschneidungen zwischen Dependency-Bereichen ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        extensionDependencies: { "workbench.projects": "^1.0.0" },
        optionalExtensionDependencies: { "workbench.projects": "^1.0.0" },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        extensionDependencies: { "workbench.projects": "^1.0.0" },
        optionalExtensionDependencies: {},
        extensionConflicts: [{ id: "workbench.projects" }],
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        extensionDependencies: {},
        optionalExtensionDependencies: { "workbench.notifications": "^1.0.0" },
        extensionConflicts: [{ id: "workbench.notifications", range: "^1.0.0" }],
      }).success,
    ).toBe(false);
  });

  it("akzeptiert strikt deklarierte Command Contributions", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onCommand:workbench.agent-tasks.command.create"],
      }).success,
    ).toBe(true);
  });

  it("weist fremde, doppelte und handlerlose Command Contributions ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: [{ id: "workbench.other.command.create", title: "Aufgabe erstellen" }],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: [
            { id: "workbench.agent-tasks.command.create", title: "Aufgabe erstellen" },
            { id: "workbench.agent-tasks.command.create", title: "Andere Anzeige" },
          ],
        },
      }).success,
    ).toBe(false);
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, entrypoints: {} }).success).toBe(false);
  });

  it("verlangt für onCommand ein tatsächlich deklariertes Command-Ziel", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onCommand:workbench.agent-tasks.command.missing"],
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onRoute:workbench.agent-tasks.route.main"],
      }).success,
    ).toBe(true);
  });

  it("akzeptiert Pages, Routes und onRoute mit tatsächlichen Manifestzielen", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onRoute:workbench.agent-tasks.route.main"],
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Page- und onRoute-Ziele ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          routes: [
            {
              ...validManifest.contributes.routes[0],
              pageId: "workbench.agent-tasks.page.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onRoute:workbench.agent-tasks.route.missing"],
      }).success,
    ).toBe(false);
  });

  it("weist fremde und manifestweit doppelte Contribution IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          pages: [{ id: "workbench.other.page.main", title: "Fremde Page" }],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          pages: [{ id: "workbench.agent-tasks.command.create", title: "Doppelte ID" }],
          routes: [
            {
              ...validManifest.contributes.routes[0],
              pageId: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          navigation: [
            {
              ...validManifest.contributes.navigation[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          orbit: [
            {
              ...validManifest.contributes.orbit[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt für Pages einen UI-Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: { server: "./dist/server.js" },
        contributes: { pages: validManifest.contributes.pages },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert Navigation mit tatsächlichem Route-Ziel und sicherem Extension-Icon", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          navigation: [
            {
              ...validManifest.contributes.navigation[0],
              icon: "extension",
              visibleByDefault: false,
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Navigation-Routen und fremde Runtime-Referenzen ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          navigation: [
            {
              ...validManifest.contributes.navigation[0],
              routeId: "workbench.agent-tasks.route.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          navigation: [
            {
              ...validManifest.contributes.navigation[0],
              icon: "workbench.other.icon.main",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          navigation: [
            {
              ...validManifest.contributes.navigation[0],
              badgeProvider: "workbench.other.badge.open-tasks",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt für die Extension-Icon-Referenz ein lokales Manifest-Icon", () => {
    const manifestWithoutIcon: Partial<typeof validManifest> = { ...validManifest };
    delete manifestWithoutIcon.icon;
    expect(
      extensionManifestV1Schema.safeParse({
        ...manifestWithoutIcon,
        contributes: {
          ...validManifest.contributes,
          navigation: [
            {
              ...validManifest.contributes.navigation[0],
              icon: "extension",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert Orbit Contributions und bindet onOrbitNode an ein tatsächliches Ziel", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onOrbitNode:workbench.agent-tasks.orbit.task-board"],
      }).success,
    ).toBe(true);
  });

  it("weist fehlende onOrbitNode-Ziele und fremde Orbit-Icons ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: ["onOrbitNode:workbench.agent-tasks.orbit.missing"],
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          orbit: [
            {
              ...validManifest.contributes.orbit[0],
              icon: "workbench.other.icon.task-board",
            },
          ],
        },
      }).success,
    ).toBe(false);
    const manifestWithoutIcon: Partial<typeof validManifest> = { ...validManifest };
    delete manifestWithoutIcon.icon;
    expect(
      extensionManifestV1Schema.safeParse({
        ...manifestWithoutIcon,
        contributes: {
          ...validManifest.contributes,
          orbit: [
            {
              ...validManifest.contributes.orbit[0],
              icon: "extension",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt für Orbit Renderer einen UI-Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: { server: "./dist/server.js" },
        contributes: { orbit: validManifest.contributes.orbit },
      }).success,
    ).toBe(false);
  });

  it("hält noch nicht definierte Contributions geschlossen", () => {
    expect(extensionActivationEventsV1Schema.safeParse([]).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({}).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({ commands: validManifest.contributes.commands }).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({ commands: [] }).success).toBe(false);
    expect(extensionActivationEventsV1Schema.safeParse(["onStartup"]).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({ pages: validManifest.contributes.pages }).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({ routes: validManifest.contributes.routes }).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({ navigation: validManifest.contributes.navigation }).success).toBe(
      true,
    );
    expect(extensionContributionsV1Schema.safeParse({ orbit: validManifest.contributes.orbit }).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({ pages: [] }).success).toBe(false);
    expect(extensionContributionsV1Schema.safeParse({ navigation: [] }).success).toBe(false);
    expect(extensionContributionsV1Schema.safeParse({ mobileNavigation: [] }).success).toBe(false);
    expect(extensionContributionsV1Schema.safeParse({ dashboard: [] }).success).toBe(false);
  });
});
