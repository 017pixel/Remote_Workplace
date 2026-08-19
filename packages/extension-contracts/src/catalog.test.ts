import { describe, expect, it } from "vitest";
import {
  CATALOG_ENTRIES_MAX_COUNT,
  EXTENSION_CATALOG_SCREENSHOTS_MAX_COUNT,
  catalogEntrySchema,
  catalogProviderIdSchema,
  catalogSnapshotSchema,
  extensionPackageDescriptorSchema,
  extensionPackageFilesSchema,
  sha256IntegritySchema,
} from "./catalog.js";

const integrity = (character: string) =>
  `sha256:${character.repeat(64)}` as const;

const manifest = {
  manifestVersion: 1,
  id: "workbench.agent-tasks",
  name: "Agent Tasks",
  version: "1.0.0",
  publisher: "wrapt",
  description: "Aufgaben und Agent Runs verwalten",
  license: "MIT",
  icon: "./assets/icon.webp",
  readme: "./README.md",
  changelog: "./CHANGELOG.md",
  engines: {
    wrapt: ">=0.95.0",
    extensionApi: "^1",
  },
  trust: "catalog-first-party",
  entrypoints: { ui: "./dist/ui.js" },
  permissions: [],
  activationEvents: [],
  contributes: {},
} as const;

const files = [
  { path: "./extension.json", bytes: 1_200, integrity: integrity("a") },
  { path: "./dist/ui.js", bytes: 2_000, integrity: integrity("b") },
  { path: "./assets/icon.webp", bytes: 400, integrity: integrity("c") },
  { path: "./assets/screenshot.webp", bytes: 500, integrity: integrity("d") },
  { path: "./README.md", bytes: 300, integrity: integrity("e") },
  { path: "./CHANGELOG.md", bytes: 200, integrity: integrity("f") },
] as const;

const packageDescriptor = {
  formatVersion: 1,
  extensionId: manifest.id,
  version: manifest.version,
  manifestPath: "./extension.json",
  archiveBytes: 3_100,
  unpackedBytes: 4_600,
  integrity: integrity("1"),
  files,
} as const;

const entry = {
  providerId: "bundled",
  effectiveTrust: "catalog-first-party",
  manifest,
  package: packageDescriptor,
  screenshots: ["./assets/screenshot.webp"],
} as const;

describe("Local Catalog Contracts V1", () => {
  it("akzeptiert einen vollständigen lokalen Catalog Entry", () => {
    expect(catalogEntrySchema.safeParse(entry).success).toBe(true);
    expect(
      catalogSnapshotSchema.safeParse({
        revision: integrity("2"),
        scannedAt: "2026-08-15T12:00:00.000Z",
        entries: [entry],
        issues: [],
      }).success,
    ).toBe(true);
  });

  it("normalisiert SHA-256 und weist andere Integritätsformen ab", () => {
    expect(sha256IntegritySchema.parse(integrity("A"))).toBe(integrity("a"));
    for (const value of [
      "md5:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sha256:abc",
      `sha512:${"a".repeat(64)}`,
    ]) {
      expect(sha256IntegritySchema.safeParse(value).success).toBe(false);
    }
  });

  it("verlangt ein vollständiges, eindeutiges Paketinventar", () => {
    expect(
      extensionPackageDescriptorSchema.safeParse({
        ...packageDescriptor,
        files: files.filter((file) => file.path !== "./extension.json"),
        unpackedBytes: 3_400,
      }).success,
    ).toBe(false);
    expect(
      extensionPackageFilesSchema.safeParse([files[0], files[0]]).success,
    ).toBe(false);
    expect(
      extensionPackageDescriptorSchema.safeParse({
        ...packageDescriptor,
        unpackedBytes: packageDescriptor.unpackedBytes + 1,
      }).success,
    ).toBe(false);
  });

  it("weist unsichere Archivpfade und Hostquellen ab", () => {
    expect(
      extensionPackageFilesSchema.safeParse([
        { ...files[0], path: "../extension.json" },
      ]).success,
    ).toBe(false);
    expect(
      catalogEntrySchema.safeParse({
        ...entry,
        packageUrl: "https://example.com/agent-tasks.rwext",
        git: "https://github.com/example/agent-tasks",
        npm: "@example/agent-tasks",
        localPath: "/srv/extensions/agent-tasks.rwext",
      }).success,
    ).toBe(false);
  });

  it("bindet Extension ID, Version und Trust an das Manifest", () => {
    expect(
      catalogEntrySchema.safeParse({
        ...entry,
        package: {
          ...packageDescriptor,
          extensionId: "workbench.other",
        },
      }).success,
    ).toBe(false);
    expect(
      catalogEntrySchema.safeParse({
        ...entry,
        package: { ...packageDescriptor, version: "1.1.0" },
      }).success,
    ).toBe(false);
    expect(
      catalogEntrySchema.safeParse({
        ...entry,
        manifest: { ...manifest, trust: "developer" },
      }).success,
    ).toBe(false);
  });

  it("verlangt alle sichtbaren lokalen Assets im Paket", () => {
    expect(
      catalogEntrySchema.safeParse({
        ...entry,
        package: {
          ...packageDescriptor,
          files: files.filter((file) => file.path !== manifest.icon),
          unpackedBytes: 4_200,
        },
      }).success,
    ).toBe(false);
    expect(
      catalogEntrySchema.safeParse({
        ...entry,
        screenshots: ["./assets/missing.webp"],
      }).success,
    ).toBe(false);
  });

  it("begrenzt Screenshots und Catalog-Einträge", () => {
    expect(
      catalogEntrySchema.safeParse({
        ...entry,
        screenshots: Array.from(
          { length: EXTENSION_CATALOG_SCREENSHOTS_MAX_COUNT + 1 },
          (_, index) => `./assets/screenshot-${index}.webp`,
        ),
      }).success,
    ).toBe(false);
    expect(
      catalogSnapshotSchema.safeParse({
        revision: integrity("2"),
        scannedAt: "2026-08-15T12:00:00.000Z",
        entries: Array.from(
          { length: CATALOG_ENTRIES_MAX_COUNT + 1 },
          (_, index) => ({
            ...entry,
            manifest: {
              ...manifest,
              id: `workbench.agent-tasks-${index}`,
            },
            package: {
              ...packageDescriptor,
              extensionId: `workbench.agent-tasks-${index}`,
            },
          }),
        ),
        issues: [],
      }).success,
    ).toBe(false);
  });

  it("weist doppelte Extension IDs und ungültige Provider ab", () => {
    expect(
      catalogSnapshotSchema.safeParse({
        revision: integrity("2"),
        scannedAt: "2026-08-15T12:00:00.000Z",
        entries: [entry, entry],
        issues: [],
      }).success,
    ).toBe(false);
    expect(catalogProviderIdSchema.safeParse("Remote Catalog").success).toBe(
      false,
    );
  });

  it("liefert begrenzte, pfadfreie Scan-Probleme", () => {
    expect(
      catalogSnapshotSchema.safeParse({
        revision: integrity("2"),
        scannedAt: "2026-08-15T12:00:00.000Z",
        entries: [],
        issues: [
          {
            providerId: "bundled",
            code: "package-missing",
            packageName: "agent-tasks.rwext",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      catalogSnapshotSchema.safeParse({
        revision: integrity("2"),
        scannedAt: "2026-08-15T12:00:00.000Z",
        entries: [],
        issues: [
          {
            providerId: "bundled",
            code: "network-error",
            packageName: "../agent-tasks.rwext",
            path: "/srv/extensions/catalog",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
