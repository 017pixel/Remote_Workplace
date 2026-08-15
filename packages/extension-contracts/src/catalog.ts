import { z } from "zod";
import { extensionIdSchema } from "./ids.js";
import { extensionManifestV1Schema } from "./manifest.js";
import {
  extensionIconPathSchema,
  extensionPackagePathSchema,
} from "./package-paths.js";
import { semanticVersionSchema } from "./versioning.js";

export const EXTENSION_PACKAGE_FORMAT_VERSION = 1 as const;
export const CATALOG_ENTRIES_MAX_COUNT = 256;
export const CATALOG_ISSUES_MAX_COUNT = 256;
export const EXTENSION_PACKAGE_FILES_MAX_COUNT = 20_000;
export const EXTENSION_PACKAGE_FILE_MAX_BYTES = 64 * 1024 * 1024;
export const EXTENSION_PACKAGE_ARCHIVE_MAX_BYTES = 512 * 1024 * 1024;
export const EXTENSION_PACKAGE_UNPACKED_MAX_BYTES = 1024 * 1024 * 1024;
export const EXTENSION_CATALOG_SCREENSHOTS_MAX_COUNT = 8;
export const CATALOG_PROVIDER_ID_MAX_LENGTH = 64;

const catalogProviderIdPattern =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const catalogProviderIdSchema = z
  .string()
  .min(1)
  .max(CATALOG_PROVIDER_ID_MAX_LENGTH)
  .regex(
    catalogProviderIdPattern,
    "Catalog Provider IDs müssen kleingeschriebene Slugs sein.",
  )
  .brand<"CatalogProviderId">();
export type CatalogProviderId = z.infer<typeof catalogProviderIdSchema>;

export const sha256IntegritySchema = z
  .string()
  .regex(
    /^sha256:[0-9a-fA-F]{64}$/,
    "Ein SHA-256-Integritätswert wird erwartet.",
  )
  .transform((value) => value.toLowerCase())
  .brand<"Sha256Integrity">();
export type Sha256Integrity = z.infer<typeof sha256IntegritySchema>;

export const extensionPackageFileSchema = z.strictObject({
  path: extensionPackagePathSchema,
  bytes: z.number().int().nonnegative().max(EXTENSION_PACKAGE_FILE_MAX_BYTES),
  integrity: sha256IntegritySchema,
});
export type ExtensionPackageFile = z.infer<
  typeof extensionPackageFileSchema
>;

export const extensionPackageFilesSchema = z
  .array(extensionPackageFileSchema)
  .min(1)
  .max(EXTENSION_PACKAGE_FILES_MAX_COUNT)
  .superRefine((files, context) => {
    const paths = new Set<string>();
    for (const [index, file] of files.entries()) {
      if (paths.has(file.path)) {
        context.addIssue({
          code: "custom",
          message: "Jeder Paketpfad darf nur einmal vorkommen.",
          path: [index, "path"],
        });
      }
      paths.add(file.path);
    }
  })
  .meta({ uniqueItems: true });

export const extensionPackageDescriptorSchema = z
  .strictObject({
    formatVersion: z.literal(EXTENSION_PACKAGE_FORMAT_VERSION),
    extensionId: extensionIdSchema,
    version: semanticVersionSchema,
    manifestPath: z.literal("./extension.json"),
    archiveBytes: z
      .number()
      .int()
      .positive()
      .max(EXTENSION_PACKAGE_ARCHIVE_MAX_BYTES),
    unpackedBytes: z
      .number()
      .int()
      .positive()
      .max(EXTENSION_PACKAGE_UNPACKED_MAX_BYTES),
    integrity: sha256IntegritySchema,
    files: extensionPackageFilesSchema,
  })
  .superRefine((descriptor, context) => {
    const manifestIndex = descriptor.files.findIndex(
      (file) => file.path === descriptor.manifestPath,
    );
    if (manifestIndex === -1) {
      context.addIssue({
        code: "custom",
        message: "Das Paketinventar muss ./extension.json enthalten.",
        path: ["files"],
      });
    }

    const totalBytes = descriptor.files.reduce(
      (sum, file) => sum + file.bytes,
      0,
    );
    if (totalBytes !== descriptor.unpackedBytes) {
      context.addIssue({
        code: "custom",
        message:
          "Die entpackte Paketgröße muss der Summe der regulären Dateien entsprechen.",
        path: ["unpackedBytes"],
      });
    }
  });
export type ExtensionPackageDescriptor = z.infer<
  typeof extensionPackageDescriptorSchema
>;

export const catalogEntrySchema = z
  .strictObject({
    providerId: catalogProviderIdSchema,
    effectiveTrust: z.literal("catalog-first-party"),
    manifest: extensionManifestV1Schema,
    package: extensionPackageDescriptorSchema,
    screenshots: z
      .array(extensionIconPathSchema)
      .max(EXTENSION_CATALOG_SCREENSHOTS_MAX_COUNT)
      .optional(),
  })
  .superRefine((entry, context) => {
    if (entry.manifest.id !== entry.package.extensionId) {
      context.addIssue({
        code: "custom",
        message: "Manifest und Paket müssen dieselbe Extension ID besitzen.",
        path: ["package", "extensionId"],
      });
    }
    if (entry.manifest.version !== entry.package.version) {
      context.addIssue({
        code: "custom",
        message: "Manifest und Paket müssen dieselbe Version besitzen.",
        path: ["package", "version"],
      });
    }
    if (entry.manifest.trust !== entry.effectiveTrust) {
      context.addIssue({
        code: "custom",
        message:
          "Ein Local-Catalog-Manifest muss catalog-first-party deklarieren.",
        path: ["manifest", "trust"],
      });
    }

    const packagedPaths = new Set<string>(
      entry.package.files.map((file) => file.path),
    );
    for (const [field, path] of [
      ["icon", entry.manifest.icon],
      ["readme", entry.manifest.readme],
      ["changelog", entry.manifest.changelog],
    ] as const) {
      if (path === undefined || packagedPaths.has(path)) continue;
      context.addIssue({
        code: "custom",
        message: "Ein referenziertes Manifest-Asset fehlt im Paketinventar.",
        path: ["manifest", field],
      });
    }
    for (const [index, screenshot] of (entry.screenshots ?? []).entries()) {
      if (packagedPaths.has(screenshot)) continue;
      context.addIssue({
        code: "custom",
        message: "Ein Catalog-Screenshot fehlt im Paketinventar.",
        path: ["screenshots", index],
      });
    }
  });
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const catalogEntriesSchema = z
  .array(catalogEntrySchema)
  .max(CATALOG_ENTRIES_MAX_COUNT)
  .superRefine((entries, context) => {
    const ids = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (ids.has(entry.manifest.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Extension ID darf im Catalog nur einmal vorkommen.",
          path: [index, "manifest", "id"],
        });
      }
      ids.add(entry.manifest.id);
    }
  })
  .meta({ uniqueItems: true });

export const catalogIssueCodes = [
  "package-missing",
  "package-invalid",
  "manifest-invalid",
  "integrity-mismatch",
  "duplicate-extension",
] as const;
export const catalogIssueCodeSchema = z.enum(catalogIssueCodes);
export type CatalogIssueCode = z.infer<typeof catalogIssueCodeSchema>;

export const catalogPackageNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "Ein pfadfreier lokaler Paketname wird erwartet.",
  );

export const catalogIssueSchema = z.strictObject({
  providerId: catalogProviderIdSchema,
  code: catalogIssueCodeSchema,
  packageName: catalogPackageNameSchema.optional(),
});
export type CatalogIssue = z.infer<typeof catalogIssueSchema>;

export const catalogSnapshotSchema = z.strictObject({
  revision: sha256IntegritySchema,
  scannedAt: z.iso.datetime(),
  entries: catalogEntriesSchema,
  issues: z.array(catalogIssueSchema).max(CATALOG_ISSUES_MAX_COUNT),
});
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;
