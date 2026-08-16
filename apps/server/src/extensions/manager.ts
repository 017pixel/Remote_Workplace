import { randomUUID } from "node:crypto";
import {
  extensionManifestV1Schema,
  extensionPublicErrorCodes,
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
  const requestedScope = request.scope as Record<string, unknown> | undefined;
  if (requestedScope === undefined) return true;
  const grantedScope = grant.scope as Record<string, unknown> | undefined;
  if (grantedScope === undefined) return false;
  for (const [key, grantedValues] of Object.entries(grantedScope)) {
    const requestedValues = requestedScope[key];
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
    let changed = false;
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
      changed = true;
    }
    if (changed) this.database.bumpRevision();
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
      const conflicted: ExtensionManagementOperation = {
        ...queued,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: errorFor("operation-conflict"),
      };
      if (current !== null) this.database.updateOperation(conflicted);
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
        error instanceof AppError &&
        extensionPublicErrorCodes.includes(
          error.code as (typeof extensionPublicErrorCodes)[number],
        )
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
        return this.update(request, this.require(current));
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
    // Der Pfad hängt vom Ausgangszustand ab: aktive und wartende Zustände
    // erreichen ihr Ziel über die jeweils zulässigen Übergänge der Matrix,
    // ohne dass ein Zustand wie `permissions-pending` einen unerlaubten
    // Umweg über `deactivating` oder `enabling` nehmen muss.
    const steps: ExtensionLifecycleState[] = [];
    if (enable) {
      if (isExtensionLifecycleTransitionAllowed(detail.lifecycle, "enabling")) {
        steps.push("enabling", "activating");
      } else if (
        isExtensionLifecycleTransitionAllowed(detail.lifecycle, "activating")
      ) {
        steps.push("activating");
      } else if (
        isExtensionLifecycleTransitionAllowed(detail.lifecycle, "active")
      ) {
        steps.push("active");
      } else {
        steps.push(first, "activating", "active");
      }
    } else if (isExtensionLifecycleTransitionAllowed(detail.lifecycle, "deactivating")) {
      steps.push("deactivating", "disabled");
    } else if (isExtensionLifecycleTransitionAllowed(detail.lifecycle, "disabled")) {
      steps.push("disabled");
    } else {
      steps.push(first, "disabled");
    }
    let previous = detail.lifecycle;
    // Ein offenes Permission Review endet mit der Deaktivierung: Der Nutzer
    // will die Extension nicht mehr — der Review wäre sonst dauerhaft
    // verwaist und könnte nie mehr aufgelöst werden.
    if (!enable && detail.lifecycle === "permissions-pending") {
      const open = this.database.openReview(extensionId);
      if (open !== null) this.database.resolveReview(open.reviewId);
    }
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
      const entry = this.catalog.get(request.extensionId);
      if (entry === undefined || entry.providerId !== request.source.providerId) {
        throw new AppError(
          404,
          "not-found",
          "Der Catalog-Eintrag existiert nicht unter diesem Provider.",
        );
      }
      const manifest = this.catalog.resolvePackage(
        request.extensionId,
        request.source.version,
        request.source.packageIntegrity,
      );
      // Die Registry-Quelle enthält nie Install-Artefakte wie die
      // Catalog-Revision; sie muss der `extensionSourceSchema` genügen.
      discovered = {
        manifest,
        source: {
          kind: "catalog",
          providerId: request.source.providerId,
          packageIntegrity: request.source.packageIntegrity,
        },
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
    // Der effektive Trust folgt der Quelle, nicht der Selbstauskunft des
    // Manifests: Ein Catalog-Paket ist immer `catalog-first-party`, eine
    // Developer-Installation immer `developer`.
    const effectiveTrust =
      discovered.source.kind === "catalog"
        ? ("catalog-first-party" as const)
        : ("developer" as const);
    const detail: ExtensionRegistryDetail = {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      publisher: manifest.publisher,
      source: discovered.source,
      effectiveTrust,
      lifecycle: needsReview ? "permissions-pending" : "installed",
      desiredEnablement,
      runtimeActive: false,
      // V1: system- und builtin-Quellen werden nicht über den Install-
      // Request installiert; developer-Installationen sind nie required.
      required: false,
      installedVersion: manifest.version,
      ...(needsReview ? {} : desiredEnablement === "enabled" ? { activeVersion: manifest.version } : {}),
      allowedOperations: [],
      manifest: { ...manifest, trust: effectiveTrust },
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
  ): ApplyResult {
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
    const entry = this.catalog.get(request.extensionId);
    if (entry === undefined || entry.providerId !== request.target.providerId) {
      throw new AppError(
        404,
        "not-found",
        "Der Catalog-Eintrag existiert nicht unter diesem Provider.",
      );
    }
    const manifest = this.catalog.resolvePackage(
      request.extensionId,
      request.target.version,
      request.target.packageIntegrity,
    );

    // Grants behalten, die die neue Manifestfassung weiterhin abdeckt;
    // alles andere gehört nicht mehr in die Detail-Grants.
    const requestedById = new Map(
      manifest.permissions.map((entry) => [entry.permission, entry]),
    );
    const grantedPermissions = detail.grantedPermissions.filter((grant) => {
      const requested = requestedById.get(grant.permission);
      return requested !== undefined && grantIsWithinRequest(requested, grant);
    });

    // Neue oder erweiterte Permission-Requests führen zu einem Review statt
    // einer stillen Aktivierung (reason `update`).
    const addedPermissions = manifest.permissions.filter((requested) => {
      const granted = grantedPermissions.find(
        (grant) => grant.permission === requested.permission,
      );
      return granted === undefined || !grantIsWithinRequest(requested, granted);
    });
    const needsReview = addedPermissions.length > 0;

    const steps: ExtensionLifecycleState[] = [];
    if (detail.lifecycle === "active") {
      steps.push("deactivating", "disabled", "update-available", "staging");
    } else {
      steps.push("staging");
    }
    steps.push(...(needsReview ? (["permissions-pending"] as const) : (["updating"] as const)));
    const targetLifecycle = needsReview
      ? "permissions-pending"
      : detail.desiredEnablement === "enabled"
        ? "active"
        : "installed";
    const targetSteps: ExtensionLifecycleState[] = needsReview
      ? []
      : detail.desiredEnablement === "enabled"
        ? ["activating", "active"]
        : ["installed"];
    const walk: ExtensionLifecycleState[] = [...steps, ...targetSteps];
    let previous = detail.lifecycle;
    for (const step of walk) {
      this.assertTransition(request.extensionId, previous, step);
      previous = step;
    }

    const rollbackVersion = detail.activeVersion ?? detail.installedVersion;
    const next: ExtensionRegistryDetail = {
      ...detail,
      manifest,
      installedVersion: manifest.version,
      activeVersion:
        !needsReview && detail.desiredEnablement === "enabled"
          ? manifest.version
          : undefined,
      rollbackVersion,
      availableVersion: undefined,
      lifecycle: targetLifecycle,
      runtimeActive: !needsReview && detail.desiredEnablement === "enabled",
      grantedPermissions,
      health: defaultHealth,
    };

    if (!needsReview) return { detail: next };
    return {
      detail: next,
      review: {
        reviewId: randomUUID(),
        reason: "update",
        requestedPermissions: manifest.permissions,
        addedPermissions,
        createdAt: new Date().toISOString(),
      },
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
    // `deactivating` → `activating` existiert in der Matrix nicht: Ein Reload
    // läuft deshalb über den vollständigen Pfad durch `disabled`, ein
    // abgestürzter Prozess startet direkt neu, alle übrigen Zustände nutzen
    // den regulären Enable-Pfad.
    const steps: ExtensionLifecycleState[] = [];
    if (
      detail.lifecycle === "active" ||
      detail.lifecycle === "update-available"
    ) {
      steps.push("deactivating", "disabled", "enabling", "activating");
    } else if (detail.lifecycle === "crashed") {
      steps.push("activating");
    } else {
      steps.push("enabling", "activating");
    }
    let previous = detail.lifecycle;
    for (const step of steps) {
      this.assertTransition(extensionId, previous, step);
      previous = step;
    }
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
      // Ohne activeVersion wäre der Detail-Snapshot nach der Freigabe
      // schema-invalid („Eine aktive Phase benötigt eine aktive Version").
      ...(detail.desiredEnablement === "enabled" && detail.installedVersion !== undefined
        ? { activeVersion: detail.installedVersion }
        : {}),
    };
  }
}
