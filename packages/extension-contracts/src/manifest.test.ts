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
  $schema:
    "./node_modules/@workbench/extension-contracts/schema/extension-manifest-v1.schema.json",
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
    dashboard: [
      {
        id: "workbench.agent-tasks.dashboard.open-count",
        kind: "metric",
        title: "Offene Aufgaben",
        icon: "workbench.agent-tasks.icon.tasks",
        defaultSize: "small",
        order: 100,
        projectContext: true,
        visibleByDefault: true,
        provider: "workbench.agent-tasks.dashboard-provider.open-count",
        refresh: { mode: "interval", intervalMilliseconds: 5_000 },
        format: "number",
      },
      {
        id: "workbench.agent-tasks.dashboard.create",
        kind: "quick-action",
        title: "Aufgabe erstellen",
        defaultSize: "small",
        order: 110,
        projectContext: true,
        visibleByDefault: true,
        commandId: "workbench.agent-tasks.command.create",
      },
    ],
    settings: [
      {
        id: "workbench.agent-tasks.settings.general",
        kind: "schema",
        title: "Agent Tasks",
        icon: "workbench.agent-tasks.icon.settings",
        order: 100,
        scope: "user",
        fields: [
          {
            id: "workbench.agent-tasks.setting.notifications",
            type: "boolean",
            label: "Benachrichtigungen",
            required: false,
            default: true,
          },
          {
            id: "workbench.agent-tasks.setting.api-token",
            type: "secret",
            label: "API Token",
            required: true,
          },
        ],
      },
    ],
    keyboardShortcuts: [
      {
        id: "workbench.agent-tasks.shortcut.create",
        commandId: "workbench.agent-tasks.command.create",
        keybinding: [{ key: "KeyK", modifiers: ["primary", "shift"] }],
        when: {
          all: [
            {
              key: "host.input.focused",
              operator: "equals",
              value: false,
            },
          ],
        },
        allowInEditable: false,
        allowRepeat: false,
      },
    ],
    contextMenus: [
      {
        id: "workbench.agent-tasks.context-menu.create",
        surface: "host.context-menu.project",
        commandId: "workbench.agent-tasks.command.create",
        group: "create",
        order: 100,
        icon: "workbench.agent-tasks.icon.tasks",
        when: {
          all: [
            {
              key: "host.project.open",
              operator: "equals",
              value: true,
            },
          ],
        },
      },
    ],
    statusBar: [
      {
        id: "workbench.agent-tasks.status-bar.open-count",
        kind: "counter",
        title: "Offene Aufgaben",
        icon: "workbench.agent-tasks.icon.tasks",
        alignment: "right",
        order: 100,
        priority: 60,
        compact: "value",
        provider: "workbench.agent-tasks.status-provider.open-count",
        commandId: "workbench.agent-tasks.command.create",
        when: {
          all: [
            {
              key: "host.project.open",
              operator: "equals",
              value: true,
            },
          ],
        },
      },
    ],
    topbar: [
      {
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
        when: {
          all: [
            {
              key: "host.project.open",
              operator: "equals",
              value: true,
            },
          ],
        },
      },
    ],
    files: [
      {
        id: "workbench.agent-tasks.file.open",
        kind: "opener",
        title: "In Agent Tasks öffnen",
        icon: "workbench.agent-tasks.icon.tasks",
        matcher: {
          extensions: ["task.json"],
          mimeTypes: ["application/json"],
          caseSensitiveFileNames: false,
        },
        priority: 60,
        commandId: "workbench.agent-tasks.command.create",
        when: {
          all: [
            {
              key: "host.project.open",
              operator: "equals",
              value: true,
            },
          ],
        },
      },
    ],
  },
};

describe("Extension Manifest V1", () => {
  it("akzeptiert ein vollständiges lokales Manifest", () => {
    expect(extensionManifestV1Schema.parse(validManifest)).toEqual(
      validManifest,
    );
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
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        contributes: {},
      }).success,
    ).toBe(false);
  });

  it("weist unbekannte Felder auf allen definierten Ebenen ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        remoteRegistry: "https://example.com",
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        engines: { ...validManifest.engines, node: ">=22" },
      }).success,
    ).toBe(false);
    expect(
      extensionEntrypointsSchema.safeParse({
        ...validManifest.entrypoints,
        worker: "./dist/worker.js",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["manifestVersion", { ...validManifest, manifestVersion: 2 }],
    ["ID", { ...validManifest, id: "Agent Tasks" }],
    ["Version", { ...validManifest, version: "v1.0.0" }],
    [
      "Workbench Range",
      {
        ...validManifest,
        engines: { ...validManifest.engines, remoteWorkplace: "latest" },
      },
    ],
    [
      "Extension API Range",
      {
        ...validManifest,
        engines: { ...validManifest.engines, extensionApi: " ^1" },
      },
    ],
    ["Trust", { ...validManifest, trust: "first-party" }],
    ["Data Schema Version", { ...validManifest, dataSchemaVersion: 0 }],
  ])("weist einen ungültigen Wert für %s ab", (_field, manifest) => {
    expect(extensionManifestV1Schema.safeParse(manifest).success).toBe(false);
  });

  it.each([
    "system",
    "builtin",
    "catalog-first-party",
    "developer",
    "sandboxed-webview",
  ])("akzeptiert das Trust Level %s", (trust) => {
    expect(extensionTrustLevelSchema.parse(trust)).toBe(trust);
  });

  it("weist nicht normalisierte Texte und doppelte Keywords ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        name: " Agent Tasks",
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        description: "Agent\nTasks",
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        keywords: ["Agent", "agent"],
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        keywords: Array.from(
          { length: EXTENSION_KEYWORDS_MAX_COUNT + 1 },
          (_, index) => `keyword-${index}`,
        ),
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
    expect(extensionEntrypointsSchema.safeParse({ server: path }).success).toBe(
      false,
    );
  });

  it("begrenzt Entrypoint- und Asset-Dateitypen", () => {
    expect(
      extensionEntrypointsSchema.safeParse({ ui: "./dist/ui.ts" }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        icon: "./assets/icon.svg",
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        icon: "./assets/icon.PNG",
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        readme: "./README.html",
      }).success,
    ).toBe(false);
  });

  it("akzeptiert ausschließlich strukturierte Permission Requests", () => {
    expect(extensionPermissionsV1Schema.safeParse([]).success).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [
          { permission: "files.read", scope: { projects: ["current"] } },
          {
            permission: "network.fetch",
            scope: { hosts: ["api.example.com"] },
          },
          { permission: "notifications.create" },
        ],
      }).success,
    ).toBe(true);
    expect(extensionPermissionsV1Schema.safeParse(["files.read"]).success).toBe(
      false,
    );
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
        extensionConflicts: [
          { id: "workbench.legacy-agent-tasks", range: "<2.0.0" },
        ],
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
        extensionConflicts: [
          { id: "workbench.notifications", range: "^1.0.0" },
        ],
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
          commands: [
            {
              id: "workbench.other.command.create",
              title: "Aufgabe erstellen",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: [
            {
              id: "workbench.agent-tasks.command.create",
              title: "Aufgabe erstellen",
            },
            {
              id: "workbench.agent-tasks.command.create",
              title: "Andere Anzeige",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({ ...validManifest, entrypoints: {} })
        .success,
    ).toBe(false);
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
          pages: [
            {
              id: "workbench.agent-tasks.command.create",
              title: "Doppelte ID",
            },
          ],
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
    const manifestWithoutIcon: Partial<typeof validManifest> = {
      ...validManifest,
    };
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
        activationEvents: [
          "onOrbitNode:workbench.agent-tasks.orbit.task-board",
        ],
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
    const manifestWithoutIcon: Partial<typeof validManifest> = {
      ...validManifest,
    };
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

  it("akzeptiert Dashboard Provider und bindet Quick Actions an tatsächliche Commands", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          dashboard: validManifest.contributes.dashboard,
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Quick-Action-Commands und fremde Dashboard Provider ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          dashboard: [
            {
              ...validManifest.contributes.dashboard[1],
              commandId: "workbench.agent-tasks.command.missing",
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
          dashboard: [
            {
              ...validManifest.contributes.dashboard[0],
              provider: "workbench.other.dashboard-provider.open-count",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist fremde Dashboard Icons und eine unbelegte Extension-Icon-Referenz ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          dashboard: [
            {
              ...validManifest.contributes.dashboard[0],
              icon: "workbench.other.icon.tasks",
            },
          ],
        },
      }).success,
    ).toBe(false);

    const manifestWithoutIcon: Partial<typeof validManifest> = {
      ...validManifest,
    };
    delete manifestWithoutIcon.icon;
    expect(
      extensionManifestV1Schema.safeParse({
        ...manifestWithoutIcon,
        contributes: {
          ...validManifest.contributes,
          dashboard: [
            {
              ...validManifest.contributes.dashboard[0],
              icon: "extension",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt für providerbasierte Dashboard Contributions einen Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        contributes: { dashboard: [validManifest.contributes.dashboard[0]] },
      }).success,
    ).toBe(false);
  });

  it("weist manifestweit doppelte Dashboard IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          ...validManifest.contributes,
          dashboard: [
            {
              ...validManifest.contributes.dashboard[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert hostgerenderte Settings ohne Extension-Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        contributes: { settings: validManifest.contributes.settings },
      }).success,
    ).toBe(true);
  });

  it("bindet eine eigene Settings Page an eine tatsächlich deklarierte Page", () => {
    const settingsPage = {
      id: "workbench.agent-tasks.settings.advanced",
      kind: "page",
      title: "Erweitert",
      order: 200,
      scope: "server",
      pageId: "workbench.agent-tasks.page.main",
    } as const;
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          pages: validManifest.contributes.pages,
          settings: [settingsPage],
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          pages: validManifest.contributes.pages,
          settings: [
            {
              ...settingsPage,
              pageId: "workbench.agent-tasks.page.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist fremde Settings IDs, Field IDs und Icons ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          settings: [
            {
              ...validManifest.contributes.settings[0],
              id: "workbench.other.settings.general",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          settings: [
            {
              ...validManifest.contributes.settings[0],
              fields: [
                {
                  ...validManifest.contributes.settings[0]!.fields[0]!,
                  id: "workbench.other.setting.notifications",
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          settings: [
            {
              ...validManifest.contributes.settings[0],
              icon: "workbench.other.icon.settings",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt für das Extension-Icon in Settings ein lokales Manifest-Icon", () => {
    const manifestWithoutIcon: Partial<typeof validManifest> = {
      ...validManifest,
    };
    delete manifestWithoutIcon.icon;
    expect(
      extensionManifestV1Schema.safeParse({
        ...manifestWithoutIcon,
        contributes: {
          settings: [
            {
              ...validManifest.contributes.settings[0],
              icon: "extension",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist manifestweit doppelte Setting Field IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          settings: [
            {
              ...validManifest.contributes.settings[0],
              fields: [
                {
                  ...validManifest.contributes.settings[0]!.fields[0]!,
                  id: "workbench.agent-tasks.command.create",
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("bindet Keyboard Shortcuts an tatsächlich deklarierte Commands", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          keyboardShortcuts: validManifest.contributes.keyboardShortcuts,
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          keyboardShortcuts: [
            {
              ...validManifest.contributes.keyboardShortcuts[0],
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("begrenzt Extension Context Keys auf den eigenen Namespace", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          keyboardShortcuts: [
            {
              ...validManifest.contributes.keyboardShortcuts[0],
              when: {
                all: [
                  {
                    key: "workbench.agent-tasks.context.has-selection",
                    operator: "equals",
                    value: true,
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          keyboardShortcuts: [
            {
              ...validManifest.contributes.keyboardShortcuts[0],
              when: {
                all: [
                  {
                    key: "workbench.other.context.has-selection",
                    operator: "equals",
                    value: true,
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          keyboardShortcuts: [
            {
              ...validManifest.contributes.keyboardShortcuts[0],
              when: {
                all: [
                  {
                    key: "host.unknown.focused",
                    operator: "equals",
                    value: true,
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist fremde und manifestweit doppelte Shortcut IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          keyboardShortcuts: [
            {
              ...validManifest.contributes.keyboardShortcuts[0],
              id: "workbench.other.shortcut.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          keyboardShortcuts: [
            {
              ...validManifest.contributes.keyboardShortcuts[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("bindet Context Menu Items an tatsächliche Commands und Host-Surfaces", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          contextMenus: validManifest.contributes.contextMenus,
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          contextMenus: [
            {
              ...validManifest.contributes.contextMenus[0],
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("begrenzt eigene Context-Menu-Surfaces und Context Keys auf den Extension-Namespace", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          contextMenus: [
            {
              ...validManifest.contributes.contextMenus[0],
              surface: "workbench.agent-tasks.context-menu.task",
              when: {
                all: [
                  {
                    key: "workbench.agent-tasks.context.task-selected",
                    operator: "equals",
                    value: true,
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          contextMenus: [
            {
              ...validManifest.contributes.contextMenus[0],
              surface: "workbench.other.context-menu.task",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          contextMenus: [
            {
              ...validManifest.contributes.contextMenus[0],
              when: {
                all: [
                  {
                    key: "workbench.other.context.task-selected",
                    operator: "equals",
                    value: true,
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist fremde Icons und manifestweit doppelte Context Menu IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          contextMenus: [
            {
              ...validManifest.contributes.contextMenus[0],
              icon: "workbench.other.icon.task",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          contextMenus: [
            {
              ...validManifest.contributes.contextMenus[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);

    const manifestWithoutIcon: Partial<typeof validManifest> = {
      ...validManifest,
    };
    delete manifestWithoutIcon.icon;
    expect(
      extensionManifestV1Schema.safeParse({
        ...manifestWithoutIcon,
        contributes: {
          commands: validManifest.contributes.commands,
          contextMenus: [
            {
              ...validManifest.contributes.contextMenus[0],
              icon: "extension",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert providerbasierte Status Bar Items und Command-Aktionen", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          statusBar: validManifest.contributes.statusBar,
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          statusBar: [
            {
              id: "workbench.agent-tasks.status-bar.create",
              kind: "action",
              title: "Aufgabe erstellen",
              alignment: "right",
              order: 110,
              priority: 40,
              compact: "hide",
              commandId: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Commands und fremde Status Bar Provider ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          statusBar: [
            {
              ...validManifest.contributes.statusBar[0],
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          statusBar: [
            {
              ...validManifest.contributes.statusBar[0],
              provider: "workbench.other.status-provider.open-count",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist fremde Status Bar Icons, Context Keys und manifestweite IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          statusBar: [
            {
              ...validManifest.contributes.statusBar[0],
              icon: "workbench.other.icon.tasks",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          statusBar: [
            {
              ...validManifest.contributes.statusBar[0],
              when: {
                all: [
                  {
                    key: "workbench.other.context.visible",
                    operator: "equals",
                    value: true,
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          statusBar: [
            {
              ...validManifest.contributes.statusBar[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt für providerbasierte Status Bar Items einen Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        contributes: {
          statusBar: [
            {
              ...validManifest.contributes.statusBar[0],
              commandId: undefined,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert routegebundene Topbar-Aktionen und Selector Provider", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: validManifest.contributes.routes,
          topbar: validManifest.contributes.topbar,
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: validManifest.contributes.routes,
          topbar: [
            {
              ...validManifest.contributes.topbar[0],
              id: "workbench.agent-tasks.topbar.project",
              kind: "selector",
              title: "Projekt",
              provider: "workbench.agent-tasks.topbar-provider.projects",
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Commands und Routes für Topbar Contributions ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: validManifest.contributes.routes,
          topbar: [
            {
              ...validManifest.contributes.topbar[0],
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          topbar: [
            {
              ...validManifest.contributes.topbar[0],
              routeId: "workbench.agent-tasks.route.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist Topbar Contributions auf Routes ohne Topbar ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: [
            {
              ...validManifest.contributes.routes[0],
              topbar: false,
            },
          ],
          topbar: validManifest.contributes.topbar,
        },
      }).success,
    ).toBe(false);
  });

  it("weist fremde Topbar Provider, Icons und Context Keys ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: validManifest.contributes.routes,
          topbar: [
            {
              ...validManifest.contributes.topbar[0],
              kind: "selector",
              title: "Projekt",
              provider: "workbench.other.topbar-provider.projects",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: validManifest.contributes.routes,
          topbar: [
            {
              ...validManifest.contributes.topbar[0],
              icon: "workbench.other.icon.tasks",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: validManifest.contributes.routes,
          topbar: [
            {
              ...validManifest.contributes.topbar[0],
              when: {
                all: [
                  {
                    key: "workbench.other.context.visible",
                    operator: "equals",
                    value: true,
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist Topbar Icon- und manifestweite ID-Verstöße ab", () => {
    const manifestWithoutIcon: Partial<typeof validManifest> = {
      ...validManifest,
    };
    delete manifestWithoutIcon.icon;
    expect(
      extensionManifestV1Schema.safeParse({
        ...manifestWithoutIcon,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: validManifest.contributes.routes,
          topbar: [
            {
              ...validManifest.contributes.topbar[0],
              icon: "extension",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          pages: validManifest.contributes.pages,
          routes: validManifest.contributes.routes,
          topbar: [
            {
              ...validManifest.contributes.topbar[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert File Opener und permission-gebundene Viewer", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          files: validManifest.contributes.files,
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "files.read" }],
        contributes: {
          files: [
            {
              id: "workbench.agent-tasks.file.viewer",
              kind: "viewer",
              title: "Agent Task Vorschau",
              icon: "workbench.agent-tasks.icon.tasks",
              matcher: validManifest.contributes.files[0]!.matcher,
              priority: 80,
              provider: "workbench.agent-tasks.file-provider.viewer",
              surfaces: ["detail", "quick-look"],
              contentMode: "text",
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende File Commands und fremde Viewer Provider ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          files: [
            {
              ...validManifest.contributes.files[0],
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "files.read" }],
        contributes: {
          files: [
            {
              id: "workbench.agent-tasks.file.viewer",
              kind: "viewer",
              title: "Agent Task Vorschau",
              matcher: validManifest.contributes.files[0]!.matcher,
              priority: 80,
              provider: "workbench.other.file-provider.viewer",
              surfaces: ["quick-look"],
              contentMode: "text",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist fremde File Icons, Context Keys und manifestweite IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          files: [
            {
              ...validManifest.contributes.files[0],
              icon: "workbench.other.icon.tasks",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          files: [
            {
              ...validManifest.contributes.files[0],
              when: {
                all: [
                  {
                    key: "workbench.other.context.visible",
                    operator: "exists",
                  },
                ],
              },
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          files: [
            {
              ...validManifest.contributes.files[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt UI-Entrypoint und files.read für File Viewer", () => {
    const viewer = {
      id: "workbench.agent-tasks.file.viewer",
      kind: "viewer",
      title: "Agent Task Vorschau",
      matcher: validManifest.contributes.files[0]!.matcher,
      priority: 80,
      provider: "workbench.agent-tasks.file-provider.viewer",
      surfaces: ["detail"],
      contentMode: "text",
    } as const;
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: { server: "./dist/server.mjs" },
        permissions: [{ permission: "files.read" }],
        contributes: { files: [viewer] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [],
        contributes: { files: [viewer] },
      }).success,
    ).toBe(false);
  });

  it("hält noch nicht definierte Contributions geschlossen", () => {
    expect(extensionActivationEventsV1Schema.safeParse([]).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({}).success).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        commands: validManifest.contributes.commands,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ commands: [] }).success,
    ).toBe(false);
    expect(
      extensionActivationEventsV1Schema.safeParse(["onStartup"]).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        pages: validManifest.contributes.pages,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        routes: validManifest.contributes.routes,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        navigation: validManifest.contributes.navigation,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        orbit: validManifest.contributes.orbit,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        dashboard: validManifest.contributes.dashboard,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        settings: validManifest.contributes.settings,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        keyboardShortcuts: validManifest.contributes.keyboardShortcuts,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        contextMenus: validManifest.contributes.contextMenus,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        statusBar: validManifest.contributes.statusBar,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        topbar: validManifest.contributes.topbar,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({
        files: validManifest.contributes.files,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ pages: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ navigation: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ mobileNavigation: [] })
        .success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ settings: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ keyboardShortcuts: [] })
        .success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ contextMenus: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ statusBar: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ topbar: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ files: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ terminal: [] }).success,
    ).toBe(false);
  });
});
