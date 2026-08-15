import { randomUUID } from "node:crypto";
import {
  extensionManifestV1Schema,
  isExtensionLifecycleTransitionAllowed,
  type ExtensionLifecycleState,
  type ExtensionManagementAccepted,
  type ExtensionManagementOperation,
  type ExtensionManagementRequest,
  type ExtensionManifestV1,
  type ExtensionPermissionRequests,
  type ExtensionPermissionReview,
  type ExtensionPublicError,
  type ExtensionRegistryDetail,
  type ExtensionRegistrySnapshot,
  type ExtensionRegistrySummary,
  type ExtensionSource,
} from "@workbench/extension-contracts";
import { AppError } from "../utils/errors.js";
import type { LocalExtensionCatalog } from "./catalog.js";
import { defaultHealth, type ExtensionDatabase } from "./database.js";

interface DiscoveredExtension {
  manifest: ExtensionManifestV1;
  source: ExtensionSource;
}

type PermissionLike = { permission: string; scope?: unknown };

function grantIsWithinRequest(request: PermissionLike, grant: PermissionLike): boolean {
  if (grant.scope === undefined) return true;
  if (request.scope === undefined) return false;
  const requested = request.scope as Record<string, unknown>;
  const granted = grant.scope as Record<string, unknown>;
  for (const [key, grantedValues] of Object.entries(granted)) {
    const requestedValues = requested[key];
    if (!Array.isArray(requestedValues) || !Array.isArray(grantedValues)) {
      return false;
    }
    const allowed = new Set<unknown>(requestedValues);
    if (grantedValues.some((value) => !allowed.has(value))) return false;
  }
  return true;
}

interface ApplyResult {
  detail: ExtensionRegistryDetail | null;
  review?: ExtensionPermissionReview;
}

const errorFor = (code: ExtensionPublicError["code"]): ExtensionPublicError => ({
  code,
  occurredAt: new Date().toISOString(),
});

function summaryOf(detail: ExtensionRegistryDetail): ExtensionRegistrySummary {
  return {
    id: detail.id,
    name: detail.name,
    description: detail.description,
    publisher: detail.publisher,
    source: detail.source,
    effectiveTrust: detail.effectiveTrust,
    lifecycle: detail.lifecycle,
    desiredEnablement: detail.desiredEnablement,
    runtimeActive: detail.runtimeActive,
    required: detail.required,
    ...(detail.installedVersion !== undefined ? { installedVersion: detail.installedVersion } : {}),
    ...(detail.activeVersion !== undefined ? { activeVersion: detail.activeVersion } : {}),
    ...(detail.availableVersion !== undefined ? { availableVersion: detail.availableVersion } : {}),
    ...(detail.rollbackVersion !== undefined ? { rollbackVersion: detail.rollbackVersion } : {}),
    ...(detail.activeAssetRevision !== undefined
      ? { activeAssetRevision: detail.activeAssetRevision }
      : {}),
    allowedOperations: detail.allowedOperations,
    ...(detail.permissionReview !== undefined
      ? { permissionReview: detail.permissionReview }
      : {}),
  };
}
/**
 * Serverseitiger Extension Manager. Er ist die einzige Schreibinstanz der
 * Registry, serialisiert Operationen je Extension, prüft die erwartete
 * Revision und führt alle Lifecycle-Übergänge über die geschlossene
 * Zustandsmaschine. Die tatsächliche Code-Aktivierung der Entrypoints folgt
 * in Phase 6/7; bis dahin bleiben catalog- und paketbasierte Installationen
 * fail-closed, während system-, builtin- und developer-Quellen über die
 * Discovery registriert werden.
 */
export class ExtensionManager {
  private readonly discovered = new Map<string, DiscoveredExtension>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private catalog: LocalExtensionCatalog | undefined;

  constructor(private readonly database: ExtensionDatabase) {}

  attachCatalog(catalog: LocalExtensionCatalog): void {
    this.catalog = catalog;
  }

  registerDiscovered(manifest: ExtensionManifestV1, source: ExtensionSource): void {
    const parsed = extensionManifestV1Schema.parse(manifest);
    this.discovered.set(parsed.id, { manifest: parsed, source });
  }

  private withOpenReview(detail: ExtensionRegistryDetail): ExtensionRegistryDetail {
    if (detail.lifecycle !== "permissions-pending") return detail;
    const review = this.database.openReview(detail.id);
    if (review === null) return detail;
    return { ...detail, permissionReview: review };
  }

  snapshot(): ExtensionRegistrySnapshot {
    return {
      revision: this.database.revision(),
      generatedAt: new Date().toISOString(),
      extensions: this.database
        .listExtensions()
        .map((detail) => summaryOf(this.withOpenReview(detail))),
    };
  }

  detail(extensionId: string): ExtensionRegistryDetail {
    const detail = this.database.getExtension(extensionId);
    if (detail === null) {
      throw new AppError(404, "not-found", `Extension ${extensionId} ist nicht registriert.`);
    }
    const lastOperation = this.database.lastOperation(extensionId);
    return {
      ...this.withOpenReview(detail),
      ...(lastOperation !== undefined ? { lastOperation } : {}),
      ...(detail.lastError !== undefined ? { lastError: detail.lastError } : {}),
    };
  }

  /** Gleicht installierte Versionen mit dem Local Catalog ab. */
  syncCatalogUpdates(): void {
    if (this.catalog === undefined) return;
    for (const detail of this.database.listExtensions()) {
      const entry = this.catalog.get(detail.id);
      if (entry === undefined || detail.installedVersion === undefined) continue;
      if (entry.package.version === detail.installedVersion) continue;
      const next: ExtensionRegistryDetail = {
        ...detail,
        availableVersion: entry.package.version,
        lifecycle: isExtensionLifecycleTransitionAllowed(
          detail.lifecycle,
          "update-available",
        )
          ? "update-available"
          : detail.lifecycle,
      };
      this.database.upsertExtension(next);
    }
  }

  reportHealth(extensionId: string, status: ExtensionRegistryDetail["health"]["status"]): void {
    const detail = this.database.getExtension(extensionId);
    if (detail === null) {
      throw new AppError(404, "not-found", `Extension ${extensionId} ist nicht registriert.`);
    }
    const nextHealth = {
      status,
      checkedAt: new Date().toISOString(),
      consecutiveFailures:
        status === "unhealthy" ? detail.health.consecutiveFailures + 1 : 0,
    };
    this.database.upsertExtension({ ...detail, health: nextHealth });
    this.database.bumpRevision();
  }

  dispatch(request: ExtensionManagementRequest): Promise<ExtensionManagementAccepted> {
    const extensionId = request.extensionId;
    const previous = this.queues.get(extensionId) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => this.execute(request));
    this.queues.set(extensionId, run);
    return run as Promise<ExtensionManagementAccepted>;
  }

  private execute(request: ExtensionManagementRequest): ExtensionManagementAccepted {
    const operationId = randomUUID();
    const queued: ExtensionManagementOperation = {
      id: operationId,
      type: request.operation,
      status: "queued",
      requestedAt: new Date().toISOString(),
    };
    const current = this.database.getExtension(request.extensionId);
    if (current !== null) {
      this.database.addOperation(request.extensionId, queued);
    }

    if (request.expectedRevision !== this.database.revision()) {
      throw new AppError(
        409,
        "operation-conflict",
        "Die Registry wurde inzwischen geändert; bitte erneut laden.",
      );
    }

    const operation: ExtensionManagementOperation = {
      ...queued,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    if (current !== null) this.database.updateOperation(operation);

    try {
      const result = this.apply(request, current);
      const completed: ExtensionManagementOperation = {
        ...operation,
        status: "succeeded",
        completedAt: new Date().toISOString(),
      };
      if (result.detail !== null) {
        this.database.upsertExtension(result.detail);
        if (result.review !== undefined) {
          this.database.addReview(request.extensionId, result.review);
        }
        if (current !== null) {
          this.database.updateOperation(completed);
        } else {
          this.database.addOperation(request.extensionId, completed);
        }
        this.database.bumpRevision();
        this.syncCatalogUpdates();
      }
      return {
        revision: this.database.revision(),
        operation: completed,
        extension: summaryOf(
          this.withOpenReview(
            result.detail ?? this.database.getExtension(request.extensionId)!,
          ),
        ),
      };
    } catch (error) {
      const publicError: ExtensionPublicError =
        error instanceof AppError && error.code.startsWith("extension-")
          ? errorFor(error.code as ExtensionPublicError["code"])
          : errorFor("internal-error");
      const failed: ExtensionManagementOperation = {
        ...operation,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: publicError,
      };
      if (current !== null) {
        this.database.updateOperation(failed);
        this.database.upsertExtension({ ...current, lastError: publicError });
        this.database.bumpRevision();
      }
      throw error;
    }
  }

  private apply(
    request: ExtensionManagementRequest,
    current: ExtensionRegistryDetail | null,
  ): ApplyResult {
    switch (request.operation) {
      case "install":
        return this.install(request, current);
      case "enable":
        return { detail: this.transition(request.extensionId, this.require(current), "enabling", true) };
      case "disable":
        return { detail: this.transition(request.extensionId, this.require(current), "deactivating", false) };
      case "uninstall":
        return { detail: this.uninstall(request.extensionId, this.require(current)) };
      case "update":
        return { detail: this.update(request, this.require(current)) };
      case "rollback":
        return { detail: this.rollback(request, this.require(current)) };
      case "reload":
        return { detail: this.reload(request.extensionId, this.require(current)) };
      case "review-permissions":
        return { detail: this.reviewPermissions(request, this.require(current)) };
    }
  }

  private require(detail: ExtensionRegistryDetail | null): ExtensionRegistryDetail {
    if (detail === null) {
      throw new AppError(404, "not-found", "Die Extension ist nicht registriert.");
    }
    return detail;
  }

  private assertTransition(
    extensionId: string,
    from: ExtensionLifecycleState,
    to: ExtensionLifecycleState,
  ): void {
    if (!isExtensionLifecycleTransitionAllowed(from, to)) {
      throw new AppError(
        409,
        "operation-conflict",
        `Übergang ${from} → ${to} ist für ${extensionId} nicht erlaubt.`,
      );
    }
  }

  private transition(
    extensionId: string,
    detail: ExtensionRegistryDetail,
    first: ExtensionLifecycleState,
    enable: boolean,
  ): ExtensionRegistryDetail {
    const steps: ExtensionLifecycleState[] = enable
      ? [first, "activating", "active"]
      : [first, "disabled"];
    let previous = detail.lifecycle;
    for (const step of steps) {
      this.assertTransition(extensionId, previous, step);
      previous = step;
    }
    const target: ExtensionLifecycleState = enable ? "active" : "disabled";
    return {
      ...detail,
      lifecycle: target,
      desiredEnablement: enable ? "enabled" : "disabled",
      runtimeActive: enable,
      health: defaultHealth,
      ...(enable ? { activeVersion: detail.installedVersion } : {}),
    };
  }

  private install(
    request: Extract<ExtensionManagementRequest, { operation: "install" }>,
    current: ExtensionRegistryDetail | null,
  ): ApplyResult {
    if (current !== null && current.installedVersion !== undefined) {
      throw new AppError(409, "operation-conflict", "Die Extension ist bereits installiert.");
    }

    let discovered = this.discovered.get(request.extensionId);

    if (request.source.kind === "catalog") {
      if (this.catalog === undefined) {
        throw new AppError(501, "staging-failed", "Der Local Catalog ist nicht verfügbar.");
      }
      const manifest = this.catalog.resolvePackage(
        request.extensionId,
        request.source.version,
        request.source.packageIntegrity,
      );
      discovered = {
        manifest,
        source: request.source,
      };
    } else if (request.source.kind === "local-package") {
      throw new AppError(
        501,
        "staging-failed",
        "Paketinstallationen aus .rwext folgen mit dem Paket-Installer.",
      );
    }

    if (discovered === undefined) {
      throw new AppError(404, "not-found", "Die Extension wurde nicht entdeckt.");
    }
    if (request.source.kind !== discovered.source.kind) {
      throw new AppError(409, "operation-conflict", "Die Installationsquelle passt nicht zur Discovery.");
    }

    const manifest = discovered.manifest;
    const needsReview = manifest.permissions.length > 0;
    const desiredEnablement = request.enableAfterInstall ? "enabled" : "disabled";
    const detail: ExtensionRegistryDetail = {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      publisher: manifest.publisher,
      source: discovered.source,
      effectiveTrust: manifest.trust,
      lifecycle: needsReview ? "permissions-pending" : "installed",
      desiredEnablement,
      runtimeActive: false,
      // V1: system- und builtin-Quellen werden nicht über den Install-
      // Request installiert; developer-Installationen sind nie required.
      required: false,
      installedVersion: manifest.version,
      ...(needsReview ? {} : desiredEnablement === "enabled" ? { activeVersion: manifest.version } : {}),
      allowedOperations: [],
      manifest,
      grantedPermissions: [],
      health: defaultHealth,
    };

    if (needsReview) {
      return {
        detail,
        review: {
          reviewId: randomUUID(),
          reason: "install",
          requestedPermissions: manifest.permissions,
          addedPermissions: manifest.permissions,
          createdAt: new Date().toISOString(),
        },
      };
    }

    return {
      detail: desiredEnablement === "enabled"
        ? { ...detail, lifecycle: "active", runtimeActive: true }
        : detail,
    };
  }

  private update(
    request: Extract<ExtensionManagementRequest, { operation: "update" }>,
    detail: ExtensionRegistryDetail,
  ): ExtensionRegistryDetail {
    if (detail.lifecycle !== "update-available" && detail.availableVersion === undefined) {
      throw new AppError(
        409,
        "operation-conflict",
        "Für diese Extension steht kein Update bereit.",
      );
    }
    if (this.catalog === undefined) {
      throw new AppError(501, "staging-failed", "Der Local Catalog ist nicht verfügbar.");
    }
    const manifest = this.catalog.resolvePackage(
      request.extensionId,
      request.target.version,
      request.target.packageIntegrity,
    );

    const steps: ExtensionLifecycleState[] =
      detail.lifecycle === "active"
        ? ["deactivating", "disabled", "staging", "updating", "activating", "active"]
        : ["staging", "updating", "installed"];
    let previous = detail.lifecycle;
    for (const step of steps) {
      this.assertTransition(request.extensionId, previous, step);
      previous = step;
    }

    const rollbackVersion = detail.activeVersion ?? detail.installedVersion;
    return {
      ...detail,
      manifest,
      installedVersion: manifest.version,
      activeVersion: detail.desiredEnablement === "enabled" ? manifest.version : undefined,
      rollbackVersion,
      availableVersion: undefined,
      lifecycle: detail.desiredEnablement === "enabled" ? "active" : "installed",
      runtimeActive: detail.desiredEnablement === "enabled",
      health: defaultHealth,
    };
  }

  private uninstall(extensionId: string, detail: ExtensionRegistryDetail): ExtensionRegistryDetail {
    const steps: ExtensionLifecycleState[] =
      detail.lifecycle === "active"
        ? ["deactivating", "disabled", "uninstalling"]
        : ["uninstalling"];
    let previous = detail.lifecycle;
    for (const step of steps) {
      this.assertTransition(extensionId, previous, step);
      previous = step;
    }
    // Die Extension bleibt als „available" in der Registry: Das
    // Operationsjournal, Health und ein möglicher Permission Review bleiben
    // lesbar, Installationsversionen werden zurückgesetzt.
    return {
      ...detail,
      lifecycle: "available",
      desiredEnablement: "disabled",
      runtimeActive: false,
      installedVersion: undefined,
      activeVersion: undefined,
      availableVersion: undefined,
      rollbackVersion: undefined,
      activeAssetRevision: undefined,
      grantedPermissions: [],
      health: defaultHealth,
    };
  }

  private rollback(
    request: Extract<ExtensionManagementRequest, { operation: "rollback" }>,
    detail: ExtensionRegistryDetail,
  ): ExtensionRegistryDetail {
    if (detail.rollbackVersion === undefined) {
      throw new AppError(409, "rollback-unavailable", "Es ist keine vorherige Version verfügbar.");
    }
    if (request.targetVersion !== detail.rollbackVersion) {
      throw new AppError(409, "rollback-unavailable", "Die Zielversion liegt nicht für Rollback vor.");
    }
    return {
      ...detail,
      activeVersion: detail.rollbackVersion,
      lifecycle: detail.desiredEnablement === "enabled" ? "active" : "installed",
      runtimeActive: detail.desiredEnablement === "enabled",
      health: defaultHealth,
    };
  }

  private reload(extensionId: string, detail: ExtensionRegistryDetail): ExtensionRegistryDetail {
    this.assertTransition(extensionId, detail.lifecycle, "deactivating");
    this.assertTransition(extensionId, "deactivating", "activating");
    return {
      ...detail,
      lifecycle: "active",
      runtimeActive: true,
      health: defaultHealth,
    };
  }

  private reviewPermissions(
    request: Extract<ExtensionManagementRequest, { operation: "review-permissions" }>,
    detail: ExtensionRegistryDetail,
  ): ExtensionRegistryDetail {
    if (detail.lifecycle !== "permissions-pending") {
      throw new AppError(409, "operation-conflict", "Für diese Extension steht kein Review aus.");
    }
    const review = this.database.getReview(request.extensionId, request.reviewId);
    if (review === null) {
      throw new AppError(404, "not-found", "Das Permission Review ist nicht mehr offen.");
    }

    if (request.resolution.decision === "deny") {
      this.database.resolveReview(request.reviewId);
      return {
        ...detail,
        lifecycle: "installed",
        desiredEnablement: "disabled",
        runtimeActive: false,
        grantedPermissions: [],
      };
    }

    const grants = request.resolution.grants as ExtensionPermissionRequests;
    const requestedIds = new Map(review.requestedPermissions.map((entry) => [entry.permission, entry]));
    for (const grant of grants) {
      const requestEntry = requestedIds.get(grant.permission);
      if (requestEntry === undefined) {
        throw new AppError(409, "permissions-denied", `Die Permission ${grant.permission} wurde nicht angefragt.`);
      }
      if (!grantIsWithinRequest(requestEntry, grant)) {
        throw new AppError(
          409,
          "permissions-denied",
          `Der Grant für ${grant.permission} erweitert den angefragten Scope.`,
        );
      }
    }
    this.database.resolveReview(request.reviewId);
    return {
      ...detail,
      lifecycle: detail.desiredEnablement === "enabled" ? "active" : "installed",
      runtimeActive: detail.desiredEnablement === "enabled",
      grantedPermissions: grants,
      health: defaultHealth,
    };
  }
}
