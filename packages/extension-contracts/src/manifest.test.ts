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
  contributes: {},
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
    expect(extensionManifestV1Schema.safeParse({ ...validManifest, entrypoints: {} }).success).toBe(false);
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

  it("hält noch nicht definierte Contributions geschlossen", () => {
    expect(extensionActivationEventsV1Schema.safeParse([]).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({}).success).toBe(true);
    expect(extensionActivationEventsV1Schema.safeParse(["onStartup"]).success).toBe(true);
    expect(extensionContributionsV1Schema.safeParse({ pages: [] }).success).toBe(false);
  });
});
