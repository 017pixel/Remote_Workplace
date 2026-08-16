import { describe, expect, it } from "vitest";
import {
  extensionManagementAcceptedSchema,
  extensionManagementOperationSchema,
  extensionManagementRequestSchema,
  extensionPermissionReviewSchema,
  extensionPublicErrorSchema,
  extensionRegistryDetailSchema,
  extensionRegistrySnapshotSchema,
  extensionRegistrySummarySchema,
} from "./management.js";

const integrity = (character: string) =>
  `sha256:${character.repeat(64)}` as const;

const reviewId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";
const uploadId = "00000000-0000-4000-8000-000000000003";
const registrationId = "00000000-0000-4000-8000-000000000004";
const now = "2026-08-15T13:00:00.000Z";

const manifest = {
  manifestVersion: 1,
  id: "workbench.agent-tasks",
  name: "Agent Tasks",
  version: "1.0.0",
  publisher: "remote-workplace",
  description: "Aufgaben und Agent Runs verwalten",
  license: "MIT",
  engines: {
    remoteWorkplace: ">=0.44.0",
    extensionApi: "^1",
  },
  trust: "catalog-first-party",
  entrypoints: { ui: "./dist/ui.js" },
  permissions: [
    {
      permission: "files.read",
      scope: { projects: ["current"] },
    },
  ],
  activationEvents: [],
  contributes: {},
} as const;

const summary = {
  id: manifest.id,
  name: manifest.name,
  description: manifest.description,
  publisher: manifest.publisher,
  source: {
    kind: "catalog",
    providerId: "bundled",
    packageIntegrity: integrity("a"),
  },
  effectiveTrust: "catalog-first-party",
  lifecycle: "active",
  desiredEnablement: "enabled",
  runtimeActive: true,
  required: false,
  installedVersion: "1.0.0",
  activeVersion: "1.0.0",
  availableVersion: "1.1.0",
  rollbackVersion: "0.9.0",
  activeAssetRevision: integrity("b"),
  allowedOperations: ["disable", "update", "uninstall", "rollback"],
} as const;

const operation = {
  id: operationId,
  type: "update",
  status: "queued",
  requestedAt: now,
  targetVersion: "1.1.0",
} as const;

describe("Extension Management Contracts V1", () => {
  it("hält Lifecycle, Versionen, Enablement und Runtime als getrennte Fakten", () => {
    expect(extensionRegistrySummarySchema.safeParse(summary).success).toBe(
      true,
    );
    expect(
      extensionRegistrySnapshotSchema.safeParse({
        revision: 12,
        generatedAt: now,
        extensions: [summary],
      }).success,
    ).toBe(true);
  });

  it("validiert Details gegen Manifest, Trust, Assets und Grants", () => {
    expect(
      extensionRegistryDetailSchema.safeParse({
        ...summary,
        manifest,
        grantedPermissions: manifest.permissions,
        health: {
          status: "healthy",
          checkedAt: now,
          consecutiveFailures: 0,
        },
        lastOperation: {
          ...operation,
          status: "succeeded",
          startedAt: now,
          completedAt: now,
        },
      }).success,
    ).toBe(true);

    expect(
      extensionRegistryDetailSchema.safeParse({
        ...summary,
        manifest: { ...manifest, id: "workbench.other" },
        grantedPermissions: manifest.permissions,
        health: { status: "healthy", consecutiveFailures: 0 },
      }).success,
    ).toBe(false);
    expect(
      extensionRegistryDetailSchema.safeParse({
        ...summary,
        activeAssetRevision: undefined,
        manifest,
        grantedPermissions: manifest.permissions,
        health: { status: "healthy", consecutiveFailures: 0 },
      }).success,
    ).toBe(false);
  });

  it("erlaubt nur Grants innerhalb der Manifest Requests", () => {
    const detail = {
      ...summary,
      manifest,
      health: { status: "healthy", consecutiveFailures: 0 },
    } as const;
    expect(
      extensionRegistryDetailSchema.safeParse({
        ...detail,
        grantedPermissions: [
          {
            permission: "files.read",
            scope: { projects: ["current"] },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      extensionRegistryDetailSchema.safeParse({
        ...detail,
        grantedPermissions: [{ permission: "files.read" }],
      }).success,
    ).toBe(false);
    expect(
      extensionRegistryDetailSchema.safeParse({
        ...detail,
        grantedPermissions: [{ permission: "process.execute" }],
      }).success,
    ).toBe(false);
  });

  it("bindet Source, Trust und Required Policy serverseitig", () => {
    expect(
      extensionRegistrySummarySchema.safeParse({
        ...summary,
        effectiveTrust: "developer",
      }).success,
    ).toBe(false);
    expect(
      extensionRegistrySummarySchema.safeParse({
        ...summary,
        required: true,
      }).success,
    ).toBe(false);
    expect(
      extensionRegistrySummarySchema.safeParse({
        ...summary,
        source: { kind: "developer", registrationId },
        effectiveTrust: "developer",
        required: false,
      }).success,
    ).toBe(true);
  });

  it("verknüpft Permission Review strikt mit permissions-pending", () => {
    const permissionReview = {
      reviewId,
      reason: "update",
      requestedPermissions: manifest.permissions,
      addedPermissions: manifest.permissions,
      createdAt: now,
    } as const;
    expect(
      extensionRegistrySummarySchema.safeParse({
        ...summary,
        lifecycle: "permissions-pending",
        permissionReview,
      }).success,
    ).toBe(true);
    expect(
      extensionRegistrySummarySchema.safeParse({
        ...summary,
        lifecycle: "permissions-pending",
      }).success,
    ).toBe(false);
    expect(
      extensionPermissionReviewSchema.safeParse({
        ...permissionReview,
        addedPermissions: [{ permission: "process.execute" }],
      }).success,
    ).toBe(false);
  });

  it("akzeptiert alle acht expliziten Manager-Operationen", () => {
    const base = { extensionId: manifest.id, expectedRevision: 12 } as const;
    const requests = [
      {
        operation: "install",
        ...base,
        source: {
          kind: "catalog",
          providerId: "bundled",
          catalogRevision: integrity("c"),
          version: "1.1.0",
          packageIntegrity: integrity("d"),
        },
        enableAfterInstall: true,
      },
      { operation: "enable", ...base },
      { operation: "disable", ...base },
      {
        operation: "update",
        ...base,
        target: {
          providerId: "bundled",
          catalogRevision: integrity("c"),
          version: "1.1.0",
          packageIntegrity: integrity("d"),
        },
      },
      { operation: "uninstall", ...base, data: "retain" },
      {
        operation: "rollback",
        ...base,
        targetVersion: "0.9.0",
        enableAfterRollback: true,
      },
      { operation: "reload", ...base },
      {
        operation: "review-permissions",
        ...base,
        reviewId,
        resolution: {
          decision: "approve",
          grants: manifest.permissions,
        },
      },
    ] as const;

    expect(
      requests.every(
        (request) => extensionManagementRequestSchema.safeParse(request).success,
      ),
    ).toBe(true);
  });

  it("referenziert lokale Pakete und Entwicklerverzeichnisse nur über Serverbelege", () => {
    const base = {
      operation: "install",
      extensionId: manifest.id,
      expectedRevision: 12,
      enableAfterInstall: false,
    } as const;
    expect(
      extensionManagementRequestSchema.safeParse({
        ...base,
        source: {
          kind: "local-package",
          uploadId,
          packageIntegrity: integrity("e"),
        },
      }).success,
    ).toBe(true);
    expect(
      extensionManagementRequestSchema.safeParse({
        ...base,
        source: { kind: "developer", registrationId },
      }).success,
    ).toBe(true);
    expect(
      extensionManagementRequestSchema.safeParse({
        ...base,
        source: {
          kind: "catalog",
          providerId: "bundled",
          catalogRevision: integrity("c"),
          version: "1.1.0",
          packageIntegrity: integrity("d"),
          packageUrl: "https://example.com/agent-tasks.rwext",
          localPath: "/srv/extensions/agent-tasks.rwext",
          git: "https://github.com/example/agent-tasks",
          npm: "@example/agent-tasks",
        },
      }).success,
    ).toBe(false);
  });

  it("verlangt Revision und eine explizite Datenentscheidung", () => {
    expect(
      extensionManagementRequestSchema.safeParse({
        operation: "disable",
        extensionId: manifest.id,
        lifecycle: "disabled",
      }).success,
    ).toBe(false);
    expect(
      extensionManagementRequestSchema.safeParse({
        operation: "uninstall",
        extensionId: manifest.id,
        expectedRevision: 12,
      }).success,
    ).toBe(false);
  });

  it("prüft Operationszeiten und liefert nur redigierte Fehler", () => {
    expect(extensionManagementOperationSchema.safeParse(operation).success).toBe(
      true,
    );
    expect(
      extensionManagementOperationSchema.safeParse({
        ...operation,
        status: "running",
      }).success,
    ).toBe(false);
    expect(
      extensionPublicErrorSchema.safeParse({
        code: "activation-failed",
        occurredAt: now,
        message: "Token abc liegt unter /srv/secret.",
        stack: "Error at /srv/extensions/index.js",
      }).success,
    ).toBe(false);
  });

  it("nimmt wartende, laufende und synchron abgeschlossene Operationen an", () => {
    expect(
      extensionManagementAcceptedSchema.safeParse({
        revision: 13,
        operation,
        extension: { ...summary, lifecycle: "update-available" },
      }).success,
    ).toBe(true);
    // V1 führt Operationen synchron aus; die Antwort darf die abgeschlossene
    // Operation tragen. Fehlgeschlagene Operationen gehören nicht in eine
    // Annahme-Antwort.
    expect(
      extensionManagementAcceptedSchema.safeParse({
        revision: 13,
        operation: {
          ...operation,
          status: "succeeded",
          startedAt: now,
          completedAt: now,
        },
        extension: summary,
      }).success,
    ).toBe(true);
    expect(
      extensionManagementAcceptedSchema.safeParse({
        revision: 13,
        operation: {
          ...operation,
          status: "failed",
          startedAt: now,
          completedAt: now,
          error: { code: "staging-failed", occurredAt: now },
        },
        extension: summary,
      }).success,
    ).toBe(false);
  });

  it("weist doppelte Registry-IDs und Manager-Operationen ab", () => {
    expect(
      extensionRegistrySnapshotSchema.safeParse({
        revision: 12,
        generatedAt: now,
        extensions: [summary, summary],
      }).success,
    ).toBe(false);
    expect(
      extensionRegistrySummarySchema.safeParse({
        ...summary,
        allowedOperations: ["disable", "disable"],
      }).success,
    ).toBe(false);
  });
});
