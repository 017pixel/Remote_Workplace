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
    terminal: [
      {
        id: "workbench.agent-tasks.terminal.action.create",
        kind: "action",
        title: "Aufgabe im Terminal erstellen",
        icon: "workbench.agent-tasks.icon.tasks",
        order: 100,
        commandId: "workbench.agent-tasks.command.create",
        group: "create",
        surfaces: ["toolbar", "mobile-actions"],
        requiresSession: true,
      },
    ],
    previews: [
      {
        id: "workbench.agent-tasks.preview.action.reload",
        kind: "action",
        title: "Task Preview neu laden",
        icon: "workbench.agent-tasks.icon.tasks",
        order: 100,
        commandId: "workbench.agent-tasks.command.create",
        group: "view",
        surfaces: ["hub-toolbar", "mobile-actions"],
        requiresSession: true,
      },
    ],
    browser: [
      {
        id: "workbench.agent-tasks.browser.action.audit",
        kind: "action",
        title: "Task-Seite prüfen",
        icon: "workbench.agent-tasks.icon.tasks",
        order: 100,
        commandId: "workbench.agent-tasks.command.create",
        group: "inspect",
        surfaces: ["context-menu", "mobile-actions"],
        requiresSession: true,
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

  it("akzeptiert Terminal Actions und permission-gebundene Profile", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          terminal: validManifest.contributes.terminal,
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [
          {
            permission: "terminal.create",
            scope: { projects: ["current"] },
          },
        ],
        contributes: {
          terminal: [
            {
              id: "workbench.agent-tasks.terminal.profile.runner",
              kind: "profile",
              title: "Task Runner",
              order: 100,
              provider: "workbench.agent-tasks.terminal-provider.runner",
              projectContext: true,
              supportsSplit: true,
              visibleByDefault: true,
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Terminal Commands und fremde Profile Provider ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          terminal: [
            {
              ...validManifest.contributes.terminal[0],
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "terminal.create" }],
        contributes: {
          terminal: [
            {
              id: "workbench.agent-tasks.terminal.profile.runner",
              kind: "profile",
              title: "Task Runner",
              order: 100,
              provider: "workbench.other.terminal-provider.runner",
              projectContext: true,
              supportsSplit: true,
              visibleByDefault: true,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt terminal.create und einen Entrypoint für Terminal Profile", () => {
    const terminalProfile = {
      id: "workbench.agent-tasks.terminal.profile.runner",
      kind: "profile",
      title: "Task Runner",
      order: 100,
      provider: "workbench.agent-tasks.terminal-provider.runner",
      projectContext: true,
      supportsSplit: true,
      visibleByDefault: true,
    } as const;
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [],
        contributes: { terminal: [terminalProfile] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        permissions: [{ permission: "terminal.create" }],
        contributes: { terminal: [terminalProfile] },
      }).success,
    ).toBe(false);
  });

  it("weist fremde Terminal Icons, Context Keys und manifestweite IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          terminal: [
            {
              ...validManifest.contributes.terminal[0],
              icon: "workbench.other.icon.terminal",
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
          terminal: [
            {
              ...validManifest.contributes.terminal[0],
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
          terminal: [
            {
              ...validManifest.contributes.terminal[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert Preview Actions und permission-gebundene Targets", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          previews: validManifest.contributes.previews,
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [
          { permission: "preview.read", scope: { projects: ["current"] } },
          {
            permission: "preview.manage",
            scope: { projects: ["current"] },
          },
        ],
        contributes: {
          previews: [
            {
              id: "workbench.agent-tasks.preview.target.board",
              kind: "target",
              title: "Task Board",
              order: 100,
              provider: "workbench.agent-tasks.preview-provider.board",
              projectContext: true,
              sessionAccess: "manage",
              openModes: ["embedded", "external"],
              diagnostics: true,
              storageProfiles: true,
              visibleByDefault: true,
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Preview Commands und fremde Target Provider ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          previews: [
            {
              ...validManifest.contributes.previews[0],
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "preview.read" }],
        contributes: {
          previews: [
            {
              id: "workbench.agent-tasks.preview.target.board",
              kind: "target",
              title: "Task Board",
              order: 100,
              provider: "workbench.other.preview-provider.board",
              projectContext: true,
              sessionAccess: "read",
              openModes: ["embedded"],
              diagnostics: false,
              storageProfiles: false,
              visibleByDefault: true,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt passende Preview Permissions und einen Entrypoint", () => {
    const previewTarget = {
      id: "workbench.agent-tasks.preview.target.board",
      kind: "target",
      title: "Task Board",
      order: 100,
      provider: "workbench.agent-tasks.preview-provider.board",
      projectContext: true,
      sessionAccess: "manage",
      openModes: ["embedded"],
      diagnostics: true,
      storageProfiles: true,
      visibleByDefault: true,
    } as const;
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "preview.manage" }],
        contributes: { previews: [previewTarget] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "preview.read" }],
        contributes: { previews: [previewTarget] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        permissions: [
          { permission: "preview.read" },
          { permission: "preview.manage" },
        ],
        contributes: { previews: [previewTarget] },
      }).success,
    ).toBe(false);
  });

  it("weist fremde Preview Icons, Context Keys und manifestweite IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          previews: [
            {
              ...validManifest.contributes.previews[0],
              icon: "workbench.other.icon.preview",
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
          previews: [
            {
              ...validManifest.contributes.previews[0],
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
          previews: [
            {
              ...validManifest.contributes.previews[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert Browser Actions und permission-gebundene Tools", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          browser: validManifest.contributes.browser,
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "browser.control" }],
        contributes: {
          browser: [
            {
              id: "workbench.agent-tasks.browser.tool.audit",
              kind: "tool",
              title: "Task-Seite prüfen",
              order: 100,
              provider: "workbench.agent-tasks.browser-provider.audit",
              projectContext: true,
              operations: ["state.read", "page.source", "page.capture"],
              surfaces: ["toolbar", "side-panel"],
              visibleByDefault: true,
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Browser Commands und fremde Tool Provider ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          browser: [
            {
              ...validManifest.contributes.browser[0],
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "browser.control" }],
        contributes: {
          browser: [
            {
              id: "workbench.agent-tasks.browser.tool.audit",
              kind: "tool",
              title: "Task-Seite prüfen",
              order: 100,
              provider: "workbench.other.browser-provider.audit",
              projectContext: true,
              operations: ["state.read"],
              surfaces: ["toolbar"],
              visibleByDefault: true,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt für Browser Tools Permission und Entrypoint", () => {
    const browserTool = {
      id: "workbench.agent-tasks.browser.tool.audit",
      kind: "tool",
      title: "Task-Seite prüfen",
      order: 100,
      provider: "workbench.agent-tasks.browser-provider.audit",
      projectContext: true,
      operations: ["state.read", "page.source"],
      surfaces: ["toolbar", "side-panel"],
      visibleByDefault: true,
    } as const;
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [],
        contributes: { browser: [browserTool] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        permissions: [{ permission: "browser.control" }],
        contributes: { browser: [browserTool] },
      }).success,
    ).toBe(false);
  });

  it("weist fremde Browser Icons, Context Keys und manifestweite IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          browser: [
            {
              ...validManifest.contributes.browser[0],
              icon: "workbench.other.icon.browser",
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
          browser: [
            {
              ...validManifest.contributes.browser[0],
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
          browser: [
            {
              ...validManifest.contributes.browser[0],
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert Command- und Provider-basierte Agent Tools", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "agents.tools.register" }],
        contributes: {
          commands: validManifest.contributes.commands,
          agentTools: [
            {
              id: "workbench.agent-tasks.agent-tool.create",
              kind: "command",
              title: "Aufgabe erstellen",
              description: "Erstellt eine Aufgabe im aktuellen Projekt.",
              inputSchema: "./schemas/create-task-input.json",
              outputSchema: "./schemas/task-output.json",
              projectContext: true,
              approval: "host-policy",
              commandId: "workbench.agent-tasks.command.create",
            },
            {
              id: "workbench.agent-tasks.agent-tool.list",
              kind: "provider",
              title: "Aufgaben auflisten",
              description: "Liest Aufgaben aus dem aktuellen Projekt.",
              inputSchema: "./schemas/list-tasks-input.json",
              projectContext: true,
              approval: "always",
              provider: "workbench.agent-tasks.agent-tool-provider.list",
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("weist fehlende Agent Tool Commands und fremde Provider ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "agents.tools.register" }],
        contributes: {
          commands: validManifest.contributes.commands,
          agentTools: [
            {
              id: "workbench.agent-tasks.agent-tool.create",
              kind: "command",
              title: "Aufgabe erstellen",
              description: "Erstellt eine Aufgabe im aktuellen Projekt.",
              inputSchema: "./schemas/create-task-input.json",
              projectContext: true,
              approval: "host-policy",
              commandId: "workbench.agent-tasks.command.missing",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "agents.tools.register" }],
        contributes: {
          agentTools: [
            {
              id: "workbench.agent-tasks.agent-tool.list",
              kind: "provider",
              title: "Aufgaben auflisten",
              description: "Liest Aufgaben aus dem aktuellen Projekt.",
              inputSchema: "./schemas/list-tasks-input.json",
              projectContext: true,
              approval: "host-policy",
              provider: "workbench.other.agent-tool-provider.list",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt für Agent Tools Permission und Server-Entrypoint", () => {
    const agentTool = {
      id: "workbench.agent-tasks.agent-tool.list",
      kind: "provider",
      title: "Aufgaben auflisten",
      description: "Liest Aufgaben aus dem aktuellen Projekt.",
      inputSchema: "./schemas/list-tasks-input.json",
      projectContext: true,
      approval: "host-policy",
      provider: "workbench.agent-tasks.agent-tool-provider.list",
    } as const;
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [],
        contributes: { agentTools: [agentTool] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: { ui: "./dist/ui.js" },
        permissions: [{ permission: "agents.tools.register" }],
        contributes: { agentTools: [agentTool] },
      }).success,
    ).toBe(false);
  });

  it("weist manifestweit doppelte Agent Tool IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "agents.tools.register" }],
        contributes: {
          commands: validManifest.contributes.commands,
          agentTools: [
            {
              id: "workbench.agent-tasks.command.create",
              kind: "command",
              title: "Aufgabe erstellen",
              description: "Erstellt eine Aufgabe im aktuellen Projekt.",
              inputSchema: "./schemas/create-task-input.json",
              projectContext: true,
              approval: "host-policy",
              commandId: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("akzeptiert permission-gebundene Agent Skills ohne Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        permissions: [{ permission: "agents.skills.register" }],
        contributes: {
          agentSkills: [
            {
              id: "workbench.agent-tasks.agent-skill.task-management",
              name: "workbench-agent-tasks-task-management",
              description: "Verwaltet Agent Tasks in Remote Workplace.",
              path: "./skills/workbench-agent-tasks-task-management/SKILL.md",
              targets: ["codex", "claude-code", "opencode"],
              enabledByDefault: false,
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("verlangt für Agent Skills Permission und eigenen Namensraum", () => {
    const agentSkill = {
      id: "workbench.agent-tasks.agent-skill.task-management",
      name: "workbench-agent-tasks-task-management",
      description: "Verwaltet Agent Tasks in Remote Workplace.",
      path: "./skills/workbench-agent-tasks-task-management/SKILL.md",
      targets: ["codex", "claude-code", "opencode"],
      enabledByDefault: false,
    } as const;
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [],
        contributes: { agentSkills: [agentSkill] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "agents.skills.register" }],
        contributes: {
          agentSkills: [
            {
              ...agentSkill,
              name: "workbench-other-task-management",
              path: "./skills/workbench-other-task-management/SKILL.md",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("weist manifestweit doppelte Agent Skill IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "agents.skills.register" }],
        contributes: {
          commands: validManifest.contributes.commands,
          agentSkills: [
            {
              id: "workbench.agent-tasks.command.create",
              name: "workbench-agent-tasks-task-management",
              description: "Verwaltet Agent Tasks in Remote Workplace.",
              path: "./skills/workbench-agent-tasks-task-management/SKILL.md",
              targets: ["codex"],
              enabledByDefault: false,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  const backgroundService = {
    id: "workbench.agent-tasks.background-service.sync",
    title: "Agent Tasks synchronisieren",
    description: "Synchronisiert Agent Tasks im Hintergrund.",
    provider: "workbench.agent-tasks.background-service-provider.sync",
    enabledByDefault: true,
    restart: {
      mode: "on-failure",
      maxAttempts: 3,
      windowMilliseconds: 300_000,
      backoffMilliseconds: 1_000,
    },
    health: {
      intervalMilliseconds: 30_000,
      timeoutMilliseconds: 5_000,
      failureThreshold: 3,
    },
    shutdownTimeoutMilliseconds: 10_000,
  } as const;

  it("akzeptiert hostverwaltete Background Services", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: { backgroundServices: [backgroundService] },
      }).success,
    ).toBe(true);
  });

  it("verlangt für Background Services eigene Provider und Server-Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          backgroundServices: [
            {
              ...backgroundService,
              provider: "workbench.other.background-service-provider.sync",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: { ui: "./dist/ui.js" },
        contributes: { backgroundServices: [backgroundService] },
      }).success,
    ).toBe(false);
  });

  it("weist manifestweit doppelte Background Service IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          backgroundServices: [
            {
              ...backgroundService,
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  const scheduledJob = {
    id: "workbench.agent-tasks.scheduled-job.sync",
    title: "Agent Tasks synchronisieren",
    description: "Synchronisiert Agent Tasks regelmäßig.",
    provider: "workbench.agent-tasks.scheduled-job-provider.sync",
    enabledByDefault: true,
    schedule: {
      type: "interval",
      everyMilliseconds: 300_000,
      initialDelayMilliseconds: 1_000,
    },
    timeoutMilliseconds: 30_000,
    concurrency: { mode: "skip" },
    missedRuns: { mode: "run-once" },
    retries: {
      maxAttempts: 3,
      initialBackoffMilliseconds: 1_000,
      maximumBackoffMilliseconds: 30_000,
      multiplier: 2,
    },
    idempotency: "host-key",
    cancellationTimeoutMilliseconds: 5_000,
    historyLimit: 100,
  } as const;

  it("akzeptiert Scheduled Jobs als tatsächliche onSchedule-Ziele", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: [
          "onSchedule:workbench.agent-tasks.scheduled-job.sync",
        ],
        contributes: { scheduledJobs: [scheduledJob] },
      }).success,
    ).toBe(true);
  });

  it("verlangt für Scheduled Jobs eigene Provider und Server-Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          scheduledJobs: [
            {
              ...scheduledJob,
              provider: "workbench.other.scheduled-job-provider.sync",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: { ui: "./dist/ui.js" },
        contributes: { scheduledJobs: [scheduledJob] },
      }).success,
    ).toBe(false);
  });

  it("weist fehlende onSchedule-Ziele und manifestweit doppelte Job-IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        activationEvents: [
          "onSchedule:workbench.agent-tasks.scheduled-job.missing",
        ],
        contributes: { scheduledJobs: [scheduledJob] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          commands: validManifest.contributes.commands,
          scheduledJobs: [
            {
              ...scheduledJob,
              id: "workbench.agent-tasks.command.create",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  const httpEndpoint = {
    id: "workbench.agent-tasks.http.task",
    description: "Liest einen Agent Task.",
    provider: "workbench.agent-tasks.http-provider.task",
    requestSchema: "./schemas/task-request.json",
    responseSchema: "./schemas/task-response.json",
    maxRequestBytes: 64_000,
    maxResponseBytes: 256_000,
    timeoutMilliseconds: 10_000,
    rateLimit: { maxRequests: 60, windowMilliseconds: 60_000 },
    method: "GET",
    path: "/tasks/:taskId",
  } as const;

  const rpcProcedure = {
    id: "workbench.agent-tasks.rpc.create",
    description: "Erstellt einen Agent Task.",
    provider: "workbench.agent-tasks.rpc-provider.create",
    requestSchema: "./schemas/create-task-request.json",
    responseSchema: "./schemas/create-task-response.json",
    maxRequestBytes: 64_000,
    maxResponseBytes: 256_000,
    timeoutMilliseconds: 10_000,
    rateLimit: { maxRequests: 30, windowMilliseconds: 60_000 },
    kind: "mutation",
  } as const;

  it("akzeptiert namespaced HTTP- und typisierte RPC-Contributions", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: { http: [httpEndpoint], rpc: [rpcProcedure] },
      }).success,
    ).toBe(true);
  });

  it("verlangt für HTTP/RPC eigene Provider und Server-Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          http: [
            {
              ...httpEndpoint,
              provider: "workbench.other.http-provider.task",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: { ui: "./dist/ui.js" },
        contributes: { rpc: [rpcProcedure] },
      }).success,
    ).toBe(false);
  });

  it("weist manifestweit doppelte HTTP/RPC IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          http: [httpEndpoint],
          rpc: [{ ...rpcProcedure, id: httpEndpoint.id }],
        },
      }).success,
    ).toBe(false);
  });

  const realtimeChannel = {
    id: "workbench.agent-tasks.realtime.tasks",
    description: "Synchronisiert Agent Tasks in Echtzeit.",
    provider: "workbench.agent-tasks.realtime-provider.tasks",
    scope: "project",
    maxMessageBytes: 64_000,
    maxConnectionsPerUser: 4,
    queue: {
      delivery: "reliable",
      highWaterMarkBytes: 128_000,
      maxQueueBytes: 1_000_000,
    },
    rateLimit: { maxMessages: 120, windowMilliseconds: 60_000 },
    heartbeat: {
      intervalMilliseconds: 30_000,
      timeoutMilliseconds: 10_000,
    },
    closeTimeoutMilliseconds: 2_000,
    direction: "bidirectional",
    clientMessageSchema: "./schemas/task-client-message.json",
    serverMessageSchema: "./schemas/task-server-message.json",
  } as const;

  it("akzeptiert typisierte Realtime Channels", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: { realtime: [realtimeChannel] },
      }).success,
    ).toBe(true);
  });

  it("verlangt für Realtime eigene Provider und Server-Entrypoint", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          realtime: [
            {
              ...realtimeChannel,
              provider: "workbench.other.realtime-provider.tasks",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: { ui: "./dist/ui.js" },
        contributes: { realtime: [realtimeChannel] },
      }).success,
    ).toBe(false);
  });

  it("weist manifestweit doppelte Realtime IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          http: [httpEndpoint],
          realtime: [{ ...realtimeChannel, id: httpEndpoint.id }],
        },
      }).success,
    ).toBe(false);
  });

  const notificationSource = {
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
        commandId: "workbench.agent-tasks.command.create",
      },
    ],
    retention: "until-resolved",
    deduplication: {
      mode: "keyed",
      keyMaxLength: 128,
      behavior: "replace-active",
    },
  } as const;

  it("akzeptiert permission-gebundene Notification Sources", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "notifications.create" }],
        contributes: {
          commands: validManifest.contributes.commands,
          notifications: [notificationSource],
        },
      }).success,
    ).toBe(true);
  });

  it("verlangt für Notification Sources Permission, Commands und eigene Icons", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [],
        contributes: { notifications: [notificationSource] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "notifications.create" }],
        contributes: { notifications: [notificationSource] },
      }).success,
    ).toBe(false);
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "notifications.create" }],
        contributes: {
          commands: validManifest.contributes.commands,
          notifications: [
            {
              ...notificationSource,
              icon: "workbench.other.icon.notifications",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt ein Manifest-Icon für die lokale Notification Icon-Referenz", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        icon: undefined,
        permissions: [{ permission: "notifications.create" }],
        contributes: {
          commands: validManifest.contributes.commands,
          notifications: [notificationSource],
        },
      }).success,
    ).toBe(false);
  });

  it("weist fremde und manifestweit doppelte Notification IDs ab", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        permissions: [{ permission: "notifications.create" }],
        contributes: {
          commands: validManifest.contributes.commands,
          notifications: [
            {
              ...notificationSource,
              categories: [
                {
                  ...notificationSource.categories[0],
                  id: "workbench.other.notification-category.tasks",
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
        permissions: [{ permission: "notifications.create" }],
        contributes: {
          commands: validManifest.contributes.commands,
          notifications: [
            {
              ...notificationSource,
              actions: [
                {
                  ...notificationSource.actions[0],
                  id: notificationSource.categories[0].id,
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  const darkThemePalette = {
    surfaceBase: "#0a0a0a",
    surfaceRaised: "#111111",
    surfaceOverlay: "#191919",
    surfaceSunken: "#060606",
    text: "#f5f5f5",
    textMuted: "#a0a0a0",
    textFaint: "#737373",
    accent: "#3666c2",
    accentContrast: "#ffffff",
    success: "#4bb38b",
    warning: "#d4a940",
    danger: "#cf7478",
    info: "#79a5df",
  } as const;

  const themeContribution = {
    id: "workbench.agent-tasks.theme.nightly",
    title: "Agent Tasks Nightly",
    description: "Dunkles Theme für die Workbench.",
    variants: { dark: darkThemePalette },
  } as const;

  it("akzeptiert statische Theme Contributions ohne Entrypoint oder Permission", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        entrypoints: {},
        permissions: [],
        contributes: { themes: [themeContribution] },
      }).success,
    ).toBe(true);
  });

  it("verlangt für Themes eigene und manifestweit eindeutige IDs", () => {
    expect(
      extensionManifestV1Schema.safeParse({
        ...validManifest,
        contributes: {
          themes: [
            {
              ...themeContribution,
              id: "workbench.other.theme.nightly",
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
          themes: [
            {
              ...themeContribution,
              id: validManifest.contributes.commands[0]!.id,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("hält unbekannte Contributions geschlossen und verlangt nichtleere Listen", () => {
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
      extensionContributionsV1Schema.safeParse({
        terminal: validManifest.contributes.terminal,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ terminal: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        previews: validManifest.contributes.previews,
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ previews: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        browser: validManifest.contributes.browser,
      }).success,
    ).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({ browser: [] }).success)
      .toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        agentTools: [
          {
            id: "workbench.agent-tasks.agent-tool.create",
            kind: "command",
            title: "Aufgabe erstellen",
            description: "Erstellt eine Aufgabe im aktuellen Projekt.",
            inputSchema: "./schemas/create-task-input.json",
            projectContext: true,
            approval: "host-policy",
            commandId: "workbench.agent-tasks.command.create",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ agentTools: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        agentSkills: [
          {
            id: "workbench.agent-tasks.agent-skill.task-management",
            name: "workbench-agent-tasks-task-management",
            description: "Verwaltet Agent Tasks in Remote Workplace.",
            path: "./skills/workbench-agent-tasks-task-management/SKILL.md",
            targets: ["codex"],
            enabledByDefault: false,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ agentSkills: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        backgroundServices: [backgroundService],
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ backgroundServices: [] })
        .success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        scheduledJobs: [scheduledJob],
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ scheduledJobs: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ http: [httpEndpoint] })
        .success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ rpc: [rpcProcedure] }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ http: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ rpc: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        realtime: [realtimeChannel],
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ realtime: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        notifications: [notificationSource],
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ notifications: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({
        themes: [themeContribution],
      }).success,
    ).toBe(true);
    expect(
      extensionContributionsV1Schema.safeParse({ themes: [] }).success,
    ).toBe(false);
    expect(
      extensionContributionsV1Schema.safeParse({ unknown: [] }).success,
    ).toBe(false);
  });
});
