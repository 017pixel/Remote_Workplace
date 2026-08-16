import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extensionRegistrySummarySchema,
  type ExtensionManagementRequest,
  type ExtensionManifestV1,
} from "@workbench/extension-contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultCatalogProviderId, LocalExtensionCatalog } from "./catalog.js";
import { ExtensionDatabase } from "./database.js";
import { ExtensionManager } from "./manager.js";

function testManifest(id: string, overrides: Partial<ExtensionManifestV1> = {}): ExtensionManifestV1 {
  return {
    manifestVersion: 1,
    id,
    name: id.split(".").at(-1) ?? "Test",
    version: "1.0.0",
    publisher: "workbench",
    description: "Test-Extension",
    license: "MIT",
    engines: {
      remoteWorkplace: "^0.44.0",
      extensionApi: "^1.0.0",
    },
    trust: "developer",
    entrypoints: { server: "./server.js" },
    permissions: [],
    activationEvents: [],
    contributes: {},
    ...overrides,
  } as ExtensionManifestV1;
}

function requests(extensionId: string, revision: number): {
  install: ExtensionManagementRequest;
  enable: ExtensionManagementRequest;
  disable: ExtensionManagementRequest;
} {
  const base = { extensionId, expectedRevision: revision };
  return {
    install: {
      operation: "install",
      ...base,
      source: { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
      enableAfterInstall: true,
    } as ExtensionManagementRequest,
    enable: { operation: "enable", ...base } as ExtensionManagementRequest,
    disable: { operation: "disable", ...base } as ExtensionManagementRequest,
  };
}

describe("Extension Manager Registry", () => {
  let directory: string;
  let database: ExtensionDatabase;
  let manager: ExtensionManager;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "extension-registry-"));
    database = new ExtensionDatabase(join(directory, "extensions.sqlite"));
    manager = new ExtensionManager(database);
  });

  it("installiert eine entdeckte Extension und aktiviert sie", async () => {
    manager.registerDiscovered(testManifest("workbench.test"), {
      kind: "developer",
      registrationId: "00000000-0000-4000-8000-000000000001",
    });
    const request = requests("workbench.test", database.revision());
    const result = await manager.dispatch(request.install);

    expect(result.operation.status).toBe("succeeded");
    expect(result.extension.lifecycle).toBe("active");
    expect(result.extension.runtimeActive).toBe(true);
    expect(result.extension.installedVersion).toBe("1.0.0");
    expect(database.revision()).toBeGreaterThan(0);
  });

  it("legt bei Permission Requests ein Review an statt zu aktivieren", async () => {
    manager.registerDiscovered(
      testManifest("workbench.test", {
        permissions: [{ permission: "projects.read" }],
      }),
      { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
    );
    const result = await manager.dispatch(requests("workbench.test", database.revision()).install);

    expect(result.extension.lifecycle).toBe("permissions-pending");
    expect(result.extension.permissionReview).toBeDefined();
    expect(result.extension.runtimeActive).toBe(false);

    const detail = manager.detail("workbench.test");
    expect(detail.permissionReview?.reason).toBe("install");
  });

  it("aktiviert erst nach genehmigtem Review", async () => {
    manager.registerDiscovered(
      testManifest("workbench.test", {
        permissions: [{ permission: "projects.read" }],
      }),
      { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
    );
    const installed = await manager.dispatch(requests("workbench.test", database.revision()).install);
    const reviewId = installed.extension.permissionReview?.reviewId;
    expect(reviewId).toBeDefined();

    const reviewed = await manager.dispatch({
      operation: "review-permissions",
      extensionId: "workbench.test",
      expectedRevision: database.revision(),
      reviewId: reviewId!,
      resolution: {
        decision: "approve",
        grants: [{ permission: "projects.read" }],
      },
    } as ExtensionManagementRequest);

    expect(reviewed.extension.lifecycle).toBe("active");
    expect(database.getExtension("workbench.test")?.grantedPermissions).toHaveLength(1);
  });

  it("deaktiviert und aktiviert eine Extension über die Zustandsmaschine", async () => {
    manager.registerDiscovered(testManifest("workbench.test"), {
      kind: "developer",
      registrationId: "00000000-0000-4000-8000-000000000001",
    });
    await manager.dispatch(requests("workbench.test", database.revision()).install);

    const disabled = await manager.dispatch({
      operation: "disable",
      extensionId: "workbench.test",
      expectedRevision: database.revision(),
    } as ExtensionManagementRequest);
    expect(disabled.extension.lifecycle).toBe("disabled");
    expect(disabled.extension.runtimeActive).toBe(false);

    const enabled = await manager.dispatch({
      operation: "enable",
      extensionId: "workbench.test",
      expectedRevision: database.revision(),
    } as ExtensionManagementRequest);
    expect(enabled.extension.lifecycle).toBe("active");
    expect(enabled.extension.runtimeActive).toBe(true);
  });

  it("lehnt einen Aufruf mit veralteter Revision ab", async () => {
    manager.registerDiscovered(testManifest("workbench.test"), {
      kind: "developer",
      registrationId: "00000000-0000-4000-8000-000000000001",
    });
    const request = requests("workbench.test", database.revision());
    await manager.dispatch(request.install);

    await expect(
      manager.dispatch({ ...request.enable, expectedRevision: 0 } as ExtensionManagementRequest),
    ).rejects.toMatchObject({ code: "operation-conflict", statusCode: 409 });
  });

  it("bleibt bei paketbasierten Quellen fail-closed", async () => {
    manager.registerDiscovered(testManifest("workbench.test"), {
      kind: "catalog",
      providerId: "workbench.catalog" as never,
      packageIntegrity: "b".repeat(64) as never,
    });
    await expect(
      manager.dispatch({
        operation: "install",
        extensionId: "workbench.test",
        expectedRevision: database.revision(),
        source: {
          kind: "catalog",
          providerId: "workbench.catalog",
          catalogRevision: "a".repeat(64),
          version: "1.0.0",
          packageIntegrity: "b".repeat(64),
        },
        enableAfterInstall: true,
      } as ExtensionManagementRequest),
    ).rejects.toMatchObject({ code: "staging-failed" });
  });

  it("installiert Catalog-Pakete über den lokalen Catalog", async () => {
    const catalogDirectory = mkdtempSync(join(directory, "catalog-"));
    const packageDirectory = join(catalogDirectory, "agent-tasks");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, "extension.json"),
      JSON.stringify({
        ...testManifest("workbench.agent-tasks", { trust: "catalog-first-party" as never }),
        permissions: [{ permission: "projects.read" }],
      }),
    );

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(catalogDirectory);
    manager.attachCatalog(catalog);
    const integrity = catalog.integrityOf("workbench.agent-tasks");

    const result = await manager.dispatch({
      operation: "install",
      extensionId: "workbench.agent-tasks",
      expectedRevision: database.revision(),
      source: {
        kind: "catalog",
        providerId: "workbench-catalog",
        catalogRevision: integrity!,
        version: "1.0.0",
        packageIntegrity: integrity!,
      },
      enableAfterInstall: true,
    } as ExtensionManagementRequest);

    expect(result.operation.status).toBe("succeeded");
    expect(result.extension.lifecycle).toBe("permissions-pending");
    expect(database.getExtension("workbench.agent-tasks")?.source.kind).toBe("catalog");
  });

  it("setzt update-available aus dem Catalog und installiert das Update", async () => {
    const catalogDirectory = mkdtempSync(join(directory, "catalog-update-"));
    const packageDirectory = join(catalogDirectory, "agent-tasks");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, "extension.json"),
      JSON.stringify({
        ...testManifest("workbench.agent-tasks", { trust: "catalog-first-party" as never, version: "2.0.0" as never }),
      }),
    );

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(catalogDirectory);
    manager.attachCatalog(catalog);
    const integrity = catalog.integrityOf("workbench.agent-tasks");

    await manager.dispatch({
      operation: "install",
      extensionId: "workbench.agent-tasks",
      expectedRevision: database.revision(),
      source: {
        kind: "catalog",
        providerId: "workbench-catalog",
        catalogRevision: integrity!,
        version: "2.0.0",
        packageIntegrity: integrity!,
      },
      enableAfterInstall: true,
    } as ExtensionManagementRequest);

    // ältere installierte Version simulieren, damit ein Update bereitsteht
    const current = database.getExtension("workbench.agent-tasks");
    database.upsertExtension({
      ...current!,
      installedVersion: "1.0.0" as never,
      activeVersion: "1.0.0" as never,
      lifecycle: "active",
    });
    manager.syncCatalogUpdates();
    expect(database.getExtension("workbench.agent-tasks")?.lifecycle).toBe("update-available");

    const updated = await manager.dispatch({
      operation: "update",
      extensionId: "workbench.agent-tasks",
      expectedRevision: database.revision(),
      target: {
        providerId: "workbench-catalog",
        catalogRevision: integrity!,
        version: "2.0.0",
        packageIntegrity: integrity!,
      },
    } as ExtensionManagementRequest);

    expect(updated.operation.status).toBe("succeeded");
    expect(updated.extension.lifecycle).toBe("active");
    expect(updated.extension.installedVersion).toBe("2.0.0");
    expect(updated.extension.rollbackVersion).toBe("1.0.0");
  });

  it("lehnt Grants ab, die den angefragten Scope erweitern", async () => {
    manager.registerDiscovered(
      testManifest("workbench.test", {
        permissions: [
          {
            permission: "projects.read",
            scope: { projects: ["id:remote"] },
          },
        ],
      }),
      { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
    );
    const installed = await manager.dispatch(requests("workbench.test", database.revision()).install);
    const reviewId = installed.extension.permissionReview?.reviewId;

    await expect(
      manager.dispatch({
        operation: "review-permissions",
        extensionId: "workbench.test",
        expectedRevision: database.revision(),
        reviewId: reviewId!,
        resolution: {
          decision: "approve",
          grants: [
            {
              permission: "projects.read",
              scope: { projects: ["id:remote", "id:fremd"] },
            },
          ],
        },
      } as ExtensionManagementRequest),
    ).rejects.toMatchObject({ code: "permissions-denied" });

    const approved = await manager.dispatch({
      operation: "review-permissions",
      extensionId: "workbench.test",
      expectedRevision: database.revision(),
      reviewId: reviewId!,
      resolution: {
        decision: "approve",
        grants: [
          { permission: "projects.read", scope: { projects: ["id:remote"] } },
        ],
      },
    } as ExtensionManagementRequest);
    expect(approved.extension.lifecycle).toBe("active");
    expect(database.getExtension("workbench.test")?.grantedPermissions).toHaveLength(1);
  });

  it("meldet Health und hält das Operationsjournal", async () => {
    manager.registerDiscovered(testManifest("workbench.test"), {
      kind: "developer",
      registrationId: "00000000-0000-4000-8000-000000000001",
    });
    await manager.dispatch(requests("workbench.test", database.revision()).install);

    manager.reportHealth("workbench.test", "healthy");
    manager.reportHealth("workbench.test", "unhealthy");

    const detail = manager.detail("workbench.test");
    expect(detail.health.status).toBe("unhealthy");
    expect(detail.health.consecutiveFailures).toBe(1);
    expect(detail.lastOperation?.type).toBe("install");
  });

  it("deinstalliert eine Extension und entfernt ihren Registry-Eintrag", async () => {
    manager.registerDiscovered(testManifest("workbench.test"), {
      kind: "developer",
      registrationId: "00000000-0000-4000-8000-000000000001",
    });
    await manager.dispatch(requests("workbench.test", database.revision()).install);

    const result = await manager.dispatch({
      operation: "uninstall",
      extensionId: "workbench.test",
      expectedRevision: database.revision(),
      data: "retain",
    } as ExtensionManagementRequest);

    expect(result.operation.status).toBe("succeeded");
    const afterUninstall = database.getExtension("workbench.test");
    expect(afterUninstall?.lifecycle).toBe("available");
    expect(afterUninstall?.installedVersion).toBeUndefined();
    expect(database.listOperations("workbench.test")).toHaveLength(2);
  });

  it("lädt eine aktive Extension über den vollständigen Zustandspfad neu", async () => {
    manager.registerDiscovered(testManifest("workbench.test"), {
      kind: "developer",
      registrationId: "00000000-0000-4000-8000-000000000001",
    });
    await manager.dispatch(requests("workbench.test", database.revision()).install);

    const result = await manager.dispatch({
      operation: "reload",
      extensionId: "workbench.test",
      expectedRevision: database.revision(),
    } as ExtensionManagementRequest);

    expect(result.operation.status).toBe("succeeded");
    expect(result.extension.lifecycle).toBe("active");
    expect(result.extension.runtimeActive).toBe(true);
  });

  it("deaktiviert eine Extension mit offenem Permission Review", async () => {
    manager.registerDiscovered(
      testManifest("workbench.test", {
        permissions: [{ permission: "projects.read" }],
      }),
      { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
    );
    await manager.dispatch(requests("workbench.test", database.revision()).install);

    const disabled = await manager.dispatch({
      operation: "disable",
      extensionId: "workbench.test",
      expectedRevision: database.revision(),
    } as ExtensionManagementRequest);

    expect(disabled.operation.status).toBe("succeeded");
    expect(disabled.extension.lifecycle).toBe("disabled");
    expect(disabled.extension.runtimeActive).toBe(false);
  });

  it("setzt nach genehmigtem Review eine aktive Version und bleibt schema-valide", async () => {
    manager.registerDiscovered(
      testManifest("workbench.test", {
        permissions: [{ permission: "projects.read" }],
      }),
      { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
    );
    const installed = await manager.dispatch(requests("workbench.test", database.revision()).install);
    const reviewId = installed.extension.permissionReview?.reviewId;

    const reviewed = await manager.dispatch({
      operation: "review-permissions",
      extensionId: "workbench.test",
      expectedRevision: database.revision(),
      reviewId: reviewId!,
      resolution: {
        decision: "approve",
        grants: [{ permission: "projects.read" }],
      },
    } as ExtensionManagementRequest);

    expect(reviewed.extension.lifecycle).toBe("active");
    expect(reviewed.extension.activeVersion).toBe("1.0.0");
    expect(() => extensionRegistrySummarySchema.parse(reviewed.extension)).not.toThrow();
    expect(() => extensionRegistrySummarySchema.parse(manager.snapshot().extensions[0]!)).not.toThrow();
  });

  it("lehnt einen scope-losen Grant für einen gescopten Request ab", async () => {
    manager.registerDiscovered(
      testManifest("workbench.test", {
        permissions: [
          { permission: "projects.read", scope: { projects: ["id:remote"] } },
        ],
      }),
      { kind: "developer", registrationId: "00000000-0000-4000-8000-000000000001" },
    );
    const installed = await manager.dispatch(requests("workbench.test", database.revision()).install);
    const reviewId = installed.extension.permissionReview?.reviewId;

    await expect(
      manager.dispatch({
        operation: "review-permissions",
        extensionId: "workbench.test",
        expectedRevision: database.revision(),
        reviewId: reviewId!,
        resolution: {
          decision: "approve",
          grants: [{ permission: "projects.read" }],
        },
      } as ExtensionManagementRequest),
    ).rejects.toMatchObject({ code: "permissions-denied" });
  });

  it("erzwingt bei neuen Permissions ein Update-Review statt stiller Aktivierung", async () => {
    const catalogDirectory = mkdtempSync(join(directory, "catalog-review-"));
    const packageDirectory = join(catalogDirectory, "agent-tasks");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, "extension.json"),
      JSON.stringify({
        ...testManifest("workbench.agent-tasks", { trust: "catalog-first-party" as never }),
        permissions: [{ permission: "projects.read" }],
      }),
    );

    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(catalogDirectory);
    manager.attachCatalog(catalog);
    const integrity = catalog.integrityOf("workbench.agent-tasks");

    const installed = await manager.dispatch({
      operation: "install",
      extensionId: "workbench.agent-tasks",
      expectedRevision: database.revision(),
      source: {
        kind: "catalog",
        providerId: "workbench-catalog",
        catalogRevision: integrity!,
        version: "1.0.0",
        packageIntegrity: integrity!,
      },
      enableAfterInstall: true,
    } as ExtensionManagementRequest);
    await manager.dispatch({
      operation: "review-permissions",
      extensionId: "workbench.agent-tasks",
      expectedRevision: database.revision(),
      reviewId: installed.extension.permissionReview!.reviewId,
      resolution: { decision: "approve", grants: [{ permission: "projects.read" }] },
    } as ExtensionManagementRequest);

    // Neue Fassung mit zusätzlicher Permission
    writeFileSync(
      join(packageDirectory, "extension.json"),
      JSON.stringify({
        ...testManifest("workbench.agent-tasks", {
          trust: "catalog-first-party" as never,
          version: "2.0.0" as never,
        }),
        permissions: [{ permission: "projects.read" }, { permission: "storage.read" }],
      }),
    );
    catalog.addSourceDirectory(catalogDirectory);
    const updateIntegrity = catalog.integrityOf("workbench.agent-tasks");
    expect(updateIntegrity).toBeDefined();
    manager.syncCatalogUpdates();
    expect(database.getExtension("workbench.agent-tasks")?.lifecycle).toBe("update-available");

    const updated = await manager.dispatch({
      operation: "update",
      extensionId: "workbench.agent-tasks",
      expectedRevision: database.revision(),
      target: {
        providerId: "workbench-catalog",
        catalogRevision: updateIntegrity!,
        version: "2.0.0",
        packageIntegrity: updateIntegrity!,
      },
    } as ExtensionManagementRequest);

    expect(updated.operation.status).toBe("succeeded");
    expect(updated.extension.lifecycle).toBe("permissions-pending");
    expect(updated.extension.permissionReview?.reason).toBe("update");
    expect(updated.extension.runtimeActive).toBe(false);
    expect(() => extensionRegistrySummarySchema.parse(updated.extension)).not.toThrow();

    const approved = await manager.dispatch({
      operation: "review-permissions",
      extensionId: "workbench.agent-tasks",
      expectedRevision: database.revision(),
      reviewId: updated.extension.permissionReview!.reviewId,
      resolution: {
        decision: "approve",
        grants: [{ permission: "projects.read" }, { permission: "storage.read" }],
      },
    } as ExtensionManagementRequest);
    expect(approved.extension.lifecycle).toBe("active");
    expect(approved.extension.activeVersion).toBe("2.0.0");
    expect(database.getExtension("workbench.agent-tasks")?.grantedPermissions).toHaveLength(2);
  });

  it("markiert eine veraltete Revision im Operationsjournal als fehlgeschlagen", async () => {
    manager.registerDiscovered(testManifest("workbench.test"), {
      kind: "developer",
      registrationId: "00000000-0000-4000-8000-000000000001",
    });
    await manager.dispatch(requests("workbench.test", database.revision()).install);

    await expect(
      manager.dispatch({ ...requests("workbench.test", 0).enable, expectedRevision: 0 } as ExtensionManagementRequest),
    ).rejects.toMatchObject({ code: "operation-conflict" });

    const operations = database.listOperations("workbench.test");
    expect(operations).toHaveLength(2);
    expect(operations[0]?.status).toBe("failed");
    expect(operations[0]?.error?.code).toBe("operation-conflict");
  });

  it("erhöht die Revision, wenn der Catalog ein Update entdeckt", async () => {
    const catalogDirectory = mkdtempSync(join(directory, "catalog-revision-"));
    const packageDirectory = join(catalogDirectory, "agent-tasks");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(
      join(packageDirectory, "extension.json"),
      JSON.stringify({
        ...testManifest("workbench.agent-tasks", { trust: "catalog-first-party" as never }),
      }),
    );
    const catalog = new LocalExtensionCatalog(defaultCatalogProviderId());
    catalog.addSourceDirectory(catalogDirectory);
    manager.attachCatalog(catalog);
    const integrity = catalog.integrityOf("workbench.agent-tasks");
    await manager.dispatch({
      operation: "install",
      extensionId: "workbench.agent-tasks",
      expectedRevision: database.revision(),
      source: {
        kind: "catalog",
        providerId: "workbench-catalog",
        catalogRevision: integrity!,
        version: "1.0.0",
        packageIntegrity: integrity!,
      },
      enableAfterInstall: true,
    } as ExtensionManagementRequest);
    const revisionBefore = database.revision();

    writeFileSync(
      join(packageDirectory, "extension.json"),
      JSON.stringify({
        ...testManifest("workbench.agent-tasks", {
          trust: "catalog-first-party" as never,
          version: "2.0.0" as never,
        }),
      }),
    );
    catalog.addSourceDirectory(catalogDirectory);
    manager.syncCatalogUpdates();

    expect(database.getExtension("workbench.agent-tasks")?.availableVersion).toBe("2.0.0");
    expect(database.revision()).toBe(revisionBefore + 1);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
