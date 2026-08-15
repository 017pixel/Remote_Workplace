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

interface CatalogSource {
  providerId: CatalogProviderId;
  directory: string;
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
 */
export class LocalExtensionCatalog {
  private readonly sources: CatalogSource[] = [];
  private scanned = false;
  private entries = new Map<string, CatalogEntry>();
  private manifests = new Map<string, ExtensionManifestV1>();
  private packageDirectories = new Map<string, string>();
  private manifestIntegrity = new Map<string, string>();

  constructor(private readonly providerId: CatalogProviderId) {}

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
      for (const directoryEntry of readdirSync(source.directory, { withFileTypes: true })) {
        if (!directoryEntry.isDirectory()) continue;
        const packageDirectory = join(source.directory, directoryEntry.name);
        const manifestPath = join(packageDirectory, "extension.json");
        if (!existsSync(manifestPath)) continue;

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
      throw new Error(`Catalog-Eintrag ${extensionId} fehlt.`);
    }
    if (entry.package.version !== version) {
      throw new Error(`Catalog-Version ${entry.package.version} passt nicht zu ${version}.`);
    }
    const packageIntegrity = this.manifestIntegrity.get(extensionId);
    if (packageIntegrity === undefined || packageIntegrity !== expectedIntegrity) {
      throw new Error("Der Catalog-Integritätswert passt nicht zur Anfrage.");
    }
    const manifest = this.manifests.get(extensionId);
    if (manifest === undefined) {
      throw new Error(`Catalog-Manifest ${extensionId} fehlt.`);
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
}

export function defaultCatalogProviderId(): CatalogProviderId {
  return catalogProviderIdSchema.parse("workbench-catalog");
}
