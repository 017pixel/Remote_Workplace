import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  catalogEntrySchema,
  catalogProviderIdSchema,
  extensionManifestV1Schema,
  extensionPackageDescriptorSchema,
  sha256IntegritySchema,
  type CatalogEntry,
  type CatalogProviderId,
  type ExtensionManifestV1,
  type ExtensionPackageDescriptor,
  type ExtensionPackageFile,
} from "@workbench/extension-contracts";
import { AppError } from "../utils/errors.js";

interface CatalogSource {
  providerId: CatalogProviderId;
  directory: string;
}

interface CatalogLogger {
  warn(message: string): void;
}

function sha256Of(filePath: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(filePath)).digest("hex")}`;
}

function packageFiles(directory: string): ExtensionPackageFile[] {
  const files: ExtensionPackageFile[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = statSync(absolute);
      const path = `./${relative(directory, absolute).split(sep).join("/")}`;
      files.push({
        path: path as ExtensionPackageFile["path"],
        bytes: stats.size,
        integrity: sha256IntegritySchema.parse(sha256Of(absolute)),
      });
    }
  };
  walk(directory);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/**
 * Lokaler, gebündelter Catalog. V1 liest ausschließlich aus einem
 * konfigurierten Verzeichnis; Remote-, Git-, npm- und HTTP-Quellen sind
 * nicht Teil des Providers. Jedes Catalog-Paket besteht aus einem
 * Verzeichnis mit `extension.json` und vollständigem Dateiinventar.
 * Ein beschädigtes Paketverzeichnis überspringt der Scan mit Warnung,
 * statt den gesamten Catalog unbenutzbar zu machen; die Registry bleibt
 * dabei unverändert.
 */
export class LocalExtensionCatalog {
  private readonly sources: CatalogSource[] = [];
  private scanned = false;
  private entries = new Map<string, CatalogEntry>();
  private manifests = new Map<string, ExtensionManifestV1>();
  private packageDirectories = new Map<string, string>();
  private manifestIntegrity = new Map<string, string>();

  constructor(
    private readonly providerId: CatalogProviderId,
    private readonly logger?: CatalogLogger,
  ) {}

  addSourceDirectory(directory: string): void {
    this.sources.push({ providerId: this.providerId, directory });
    this.scanned = false;
  }

  scan(): void {
    if (this.scanned) return;
    const nextEntries = new Map<string, CatalogEntry>();
    const nextManifests = new Map<string, ExtensionManifestV1>();
    const nextDirectories = new Map<string, string>();
    const nextIntegrity = new Map<string, string>();
    for (const source of this.sources) {
      if (!existsSync(source.directory)) continue;
      const directoryEntries = readdirSync(source.directory, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
      for (const directoryEntry of directoryEntries) {
        if (!directoryEntry.isDirectory()) continue;
        const packageDirectory = join(source.directory, directoryEntry.name);
        const manifestPath = join(packageDirectory, "extension.json");
        if (!existsSync(manifestPath)) continue;

        try {
          const manifest = extensionManifestV1Schema.parse(
            JSON.parse(readFileSync(manifestPath, "utf8")) as unknown,
          );
          const files = packageFiles(packageDirectory);
          const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
          const manifestIntegrity = sha256IntegritySchema.parse(
            sha256Of(manifestPath),
          );
          const descriptor = extensionPackageDescriptorSchema.parse({
            formatVersion: 1,
            extensionId: manifest.id,
            version: manifest.version,
            manifestPath: "./extension.json",
            archiveBytes: totalBytes,
            unpackedBytes: totalBytes,
            integrity: manifestIntegrity,
            files,
          } satisfies ExtensionPackageDescriptor);

          const entry = catalogEntrySchema.parse({
            providerId: source.providerId,
            effectiveTrust: "catalog-first-party",
            manifest,
            package: descriptor,
          });
          nextEntries.set(manifest.id, entry);
          nextManifests.set(manifest.id, manifest);
          nextDirectories.set(manifest.id, packageDirectory);
          nextIntegrity.set(manifest.id, manifestIntegrity);
        } catch (error) {
          this.logger?.warn(
            `Catalog-Paket ${directoryEntry.name} übersprungen: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    this.entries = nextEntries;
    this.manifests = nextManifests;
    this.packageDirectories = nextDirectories;
    this.manifestIntegrity = nextIntegrity;
    this.scanned = true;
  }

  list(): CatalogEntry[] {
    this.scan();
    return [...this.entries.values()].sort((left, right) =>
      left.manifest.id.localeCompare(right.manifest.id),
    );
  }

  get(extensionId: string): CatalogEntry | undefined {
    this.scan();
    return this.entries.get(extensionId);
  }

  manifestOf(extensionId: string): ExtensionManifestV1 | undefined {
    this.scan();
    return this.manifests.get(extensionId);
  }

  resolvePackage(
    extensionId: string,
    version: string,
    expectedIntegrity: string,
  ): ExtensionManifestV1 {
    this.scan();
    const entry = this.entries.get(extensionId);
    if (entry === undefined) {
      throw new AppError(404, "not-found", `Catalog-Eintrag ${extensionId} fehlt.`);
    }
    if (entry.package.version !== version) {
      throw new AppError(
        409,
        "operation-conflict",
        `Catalog-Version ${entry.package.version} passt nicht zu ${version}.`,
      );
    }
    const packageIntegrity = this.manifestIntegrity.get(extensionId);
    if (packageIntegrity === undefined || packageIntegrity !== expectedIntegrity) {
      throw new AppError(
        409,
        "integrity-mismatch",
        "Der Catalog-Integritätswert passt nicht zur Anfrage.",
      );
    }
    const manifest = this.manifests.get(extensionId);
    if (manifest === undefined) {
      throw new AppError(404, "not-found", `Catalog-Manifest ${extensionId} fehlt.`);
    }
    return manifest;
  }

  /** V1: Paketintegrität = SHA-256 der Catalog-Manifestdatei. */
  integrityOf(extensionId: string): string | undefined {
    this.scan();
    return this.manifestIntegrity.get(extensionId);
  }

  packageDirectoryOf(extensionId: string): string | undefined {
    this.scan();
    return this.packageDirectories.get(extensionId);
  }

  /**
   * Deterministische Catalog-Revision über alle Einträge: SHA-256 über die
   * sortierten (Extension-ID, Paket-Integrität)-Paare. Die UI leitet
   * Install- und Update-Anfragen mit dieser Revision ein.
   */
  revision(): string {
    this.scan();
    const parts = [...this.entries.values()]
      .map((entry) => `${entry.manifest.id}:${entry.package.integrity}`)
      .sort();
    return `sha256:${createHash("sha256").update(parts.join("\n")).digest("hex")}`;
  }
}

export function defaultCatalogProviderId(): CatalogProviderId {
  return catalogProviderIdSchema.parse("workbench-catalog");
}
