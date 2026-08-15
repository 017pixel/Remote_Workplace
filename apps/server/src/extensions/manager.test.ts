import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionManagementRequest,
  ExtensionManifestV1,
} from "@workbench/extension-contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    expect(database.getExtension("workbench.test")).toBeNull();
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
