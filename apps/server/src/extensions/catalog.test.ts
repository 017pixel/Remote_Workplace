import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "./catalog.js";

function catalogFixture(): { directory: string; manifest: string } {
  const directory = mkdtempSync(join(tmpdir(), "extension-catalog-"));
  const packageDirectory = join(directory, "agent-tasks");
  mkdirSync(packageDirectory, { recursive: true });
  const manifest = JSON.stringify({
    manifestVersion: 1,
    id: "workbench.agent-tasks",
    name: "Agent Tasks",
    version: "1.0.0",
    publisher: "workbench",
    description: "Aufgaben und Agent Runs",
    license: "MIT",
    engines: { wrapt: "^0.95.0", extensionApi: "^1.0.0" },
    trust: "catalog-first-party",
    entrypoints: { server: "./server.js" },
    permissions: [{ permission: "projects.read" }],
    activationEvents: [],
    contributes: {},
  });
  writeFileSync(join(packageDirectory, "extension.json"), manifest);
  writeFileSync(join(packageDirectory, "server.js"), "// leerer Einstieg\n");
  return { directory, manifest };
}

describe("LocalExtensionCatalog", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("scannt Paketverzeichnisse mit validiertem Manifest und Inventar", () => {
    const fixture = catalogFixture();
    cleanup = () => rmSync(fixture.directory, { recursive: true, force: true });

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(fixture.directory);

    const entries = catalog.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.manifest.id).toBe("workbench.agent-tasks");
    expect(entries[0]?.package.files.map((file) => file.path)).toEqual([
      "./extension.json",
      "./server.js",
    ]);
  });

  it("löst Pakete nur mit passender Version und Integrität auf", () => {
    const fixture = catalogFixture();
    cleanup = () => rmSync(fixture.directory, { recursive: true, force: true });

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(fixture.directory);
    const integrity = catalog.integrityOf("workbench.agent-tasks");
    expect(integrity).toMatch(/^sha256:[0-9a-f]{64}$/);

    const manifest = catalog.resolvePackage(
      "workbench.agent-tasks",
      "1.0.0",
      integrity ?? "",
    );
    expect(manifest.name).toBe("Agent Tasks");

    expect(() =>
      catalog.resolvePackage("workbench.agent-tasks", "2.0.0", integrity ?? ""),
    ).toThrow();
    expect(() =>
      catalog.resolvePackage("workbench.agent-tasks", "1.0.0", "sha256:00".padEnd(71, "0")),
    ).toThrow();
    expect(() => catalog.resolvePackage("workbench.fehlt", "1.0.0", integrity ?? "")).toThrow();
  });

  it("ignoriert Verzeichnisse ohne extension.json", () => {
    const fixture = catalogFixture();
    cleanup = () => rmSync(fixture.directory, { recursive: true, force: true });
    mkdirSync(join(fixture.directory, "kein-paket"));

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(fixture.directory);
    expect(catalog.list()).toHaveLength(1);
  });

  it("überspringt beschädigte Pakete, ohne den Catalog zu blockieren", () => {
    const fixture = catalogFixture();
    cleanup = () => rmSync(fixture.directory, { recursive: true, force: true });
    const broken = join(fixture.directory, "kaputt");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "extension.json"), "{ kein json");

    const warnings: string[] = [];
    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId(), {
      warn: (message) => warnings.push(message),
    });
    catalog.addSourceDirectory(fixture.directory);

    expect(catalog.list()).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("kaputt");
  });

  it("lehnt fremde Trust-Stufen im Catalog ab statt sie durchzureichen", () => {
    const fixture = catalogFixture();
    cleanup = () => rmSync(fixture.directory, { recursive: true, force: true });
    const manifest = JSON.parse(fixture.manifest) as Record<string, unknown>;
    writeFileSync(
      join(fixture.directory, "agent-tasks", "extension.json"),
      JSON.stringify({ ...manifest, trust: "developer" }),
    );

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(fixture.directory);
    expect(catalog.list()).toHaveLength(0);
  });

  it("wirft AppErrors statt generischer Fehler beim Auflösen", () => {
    const fixture = catalogFixture();
    cleanup = () => rmSync(fixture.directory, { recursive: true, force: true });

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(fixture.directory);
    const integrity = catalog.integrityOf("workbench.agent-tasks");

    try {
      catalog.resolvePackage("workbench.agent-tasks", "2.0.0", integrity ?? "");
      throw new Error("Der erwartete Fehler blieb aus.");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 409, code: "operation-conflict" });
    }
    try {
      catalog.resolvePackage("workbench.agent-tasks", "1.0.0", "sha256:00".padEnd(71, "0"));
      throw new Error("Der erwartete Fehler blieb aus.");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 409, code: "integrity-mismatch" });
    }
    try {
      catalog.resolvePackage("workbench.fehlt", "1.0.0", integrity ?? "");
      throw new Error("Der erwartete Fehler blieb aus.");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 404, code: "not-found" });
    }
  });

  it("liefert leere Bestände für fehlende Verzeichnisse", () => {
    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(join(tmpdir(), "gibt-es-nicht"));
    expect(catalog.list()).toHaveLength(0);
  });
});
