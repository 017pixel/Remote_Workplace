import { z } from "zod";
import {
  catalogProviderIdSchema,
  sha256IntegritySchema,
} from "./catalog.js";
import { extensionIdSchema } from "./ids.js";
import { extensionLifecycleStateSchema } from "./lifecycle.js";
import {
  extensionDescriptionSchema,
  extensionManifestV1Schema,
  extensionNameSchema,
  extensionPublisherSchema,
  extensionTrustLevelSchema,
} from "./manifest.js";
import { extensionPermissionRequestsSchema } from "./permissions.js";
import { semanticVersionSchema } from "./versioning.js";

export const EXTENSION_REGISTRY_MAX_ENTRIES = 1_024;
export const EXTENSION_ALLOWED_OPERATIONS_MAX_COUNT = 8;

type PermissionLike = {
  permission: string;
  scope?: unknown;
};

function permissionScopeIsSubset(grant: unknown, request: unknown): boolean {
  if (request === undefined) return true;
  if (
    grant === undefined ||
    typeof grant !== "object" ||
    grant === null ||
    typeof request !== "object" ||
    request === null
  ) {
    return false;
  }

  const grantRecord = grant as Record<string, unknown>;
  for (const [key, requestedValues] of Object.entries(request)) {
    const grantedValues = grantRecord[key];
    if (!Array.isArray(requestedValues) || !Array.isArray(grantedValues)) {
      return false;
    }
    const allowed = new Set<unknown>(requestedValues);
    if (grantedValues.some((value) => !allowed.has(value))) return false;
  }
  return true;
}

function permissionsAreSubset(
  grants: readonly PermissionLike[],
  requests: readonly PermissionLike[],
): boolean {
  const requestsById = new Map(
    requests.map((request) => [request.permission, request]),
  );
  return grants.every((grant) => {
    const request = requestsById.get(grant.permission);
    return (
      request !== undefined &&
      permissionScopeIsSubset(grant.scope, request.scope)
    );
  });
}

export const extensionRegistryRevisionSchema = z
  .number()
  .int()
  .nonnegative()
  .safe();
export type ExtensionRegistryRevision = z.infer<
  typeof extensionRegistryRevisionSchema
>;

export const extensionSourceKinds = [
  "system",
  "builtin",
  "catalog",
  "developer",
  "local-package",
] as const;
export const extensionSourceKindSchema = z.enum(extensionSourceKinds);
export type ExtensionSourceKind = z.infer<typeof extensionSourceKindSchema>;

export const extensionSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("system") }),
  z.strictObject({ kind: z.literal("builtin") }),
  z.strictObject({
    kind: z.literal("catalog"),
    providerId: catalogProviderIdSchema,
    packageIntegrity: sha256IntegritySchema,
  }),
  z.strictObject({
    kind: z.literal("developer"),
    registrationId: z.uuid(),
  }),
  z.strictObject({
    kind: z.literal("local-package"),
    packageIntegrity: sha256IntegritySchema,
  }),
]);
export type ExtensionSource = z.infer<typeof extensionSourceSchema>;

export const extensionDesiredEnablementSchema = z.enum([
  "enabled",
  "disabled",
]);
export type ExtensionDesiredEnablement = z.infer<
  typeof extensionDesiredEnablementSchema
>;

export const extensionManagementOperationTypes = [
  "install",
  "enable",
  "disable",
  "update",
  "uninstall",
  "rollback",
  "reload",
  "review-permissions",
] as const;
export const extensionManagementOperationTypeSchema = z.enum(
  extensionManagementOperationTypes,
);
export type ExtensionManagementOperationType = z.infer<
  typeof extensionManagementOperationTypeSchema
>;

export const extensionAllowedOperationsSchema = z
  .array(extensionManagementOperationTypeSchema)
  .max(EXTENSION_ALLOWED_OPERATIONS_MAX_COUNT)
  .superRefine((operations, context) => {
    const seen = new Set<string>();
    for (const [index, operation] of operations.entries()) {
      if (seen.has(operation)) {
        context.addIssue({
          code: "custom",
          message: "Eine Manager-Operation darf nur einmal freigegeben sein.",
          path: [index],
        });
      }
      seen.add(operation);
    }
  })
  .meta({ uniqueItems: true });

export const extensionPermissionReviewSchema = z
  .strictObject({
    reviewId: z.uuid(),
    reason: z.enum(["install", "update"]),
    requestedPermissions: extensionPermissionRequestsSchema,
    addedPermissions: extensionPermissionRequestsSchema.refine(
      (requests) => requests.length > 0,
      "Ein Permission Review muss mindestens eine neue Anfrage enthalten.",
    ),
    createdAt: z.iso.datetime(),
  })
  .superRefine((review, context) => {
    if (
      !permissionsAreSubset(
        review.addedPermissions,
        review.requestedPermissions,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Neue Permission Requests müssen Teil der Zielanfragen sein.",
        path: ["addedPermissions"],
      });
    }
  });
export type ExtensionPermissionReview = z.infer<
  typeof extensionPermissionReviewSchema
>;

export const extensionPublicErrorCodes = [
  "validation-failed",
  "incompatible",
  "dependency-conflict",
  "permissions-denied",
  "integrity-mismatch",
  "staging-failed",
  "migration-failed",
  "activation-failed",
  "health-check-failed",
  "operation-conflict",
  "not-found",
  "required-extension",
  "rollback-unavailable",
  "internal-error",
] as const;
export const extensionPublicErrorCodeSchema = z.enum(
  extensionPublicErrorCodes,
);

export const extensionPublicErrorSchema = z.strictObject({
  code: extensionPublicErrorCodeSchema,
  reference: z.uuid().optional(),
  occurredAt: z.iso.datetime(),
});
export type ExtensionPublicError = z.infer<typeof extensionPublicErrorSchema>;

export const extensionHealthSchema = z.strictObject({
  status: z.enum([
    "unknown",
    "starting",
    "healthy",
    "degraded",
    "unhealthy",
    "stopped",
  ]),
  checkedAt: z.iso.datetime().optional(),
  consecutiveFailures: z.number().int().nonnegative().max(1_000),
});
export type ExtensionHealth = z.infer<typeof extensionHealthSchema>;

export const extensionManagementOperationStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const extensionManagementOperationStatusSchema = z.enum(
  extensionManagementOperationStatuses,
);

export const extensionManagementOperationSchema = z
  .strictObject({
    id: z.uuid(),
    type: extensionManagementOperationTypeSchema,
    status: extensionManagementOperationStatusSchema,
    requestedAt: z.iso.datetime(),
    startedAt: z.iso.datetime().optional(),
    completedAt: z.iso.datetime().optional(),
    targetVersion: semanticVersionSchema.optional(),
    error: extensionPublicErrorSchema.optional(),
  })
  .superRefine((operation, context) => {
    if (operation.status === "queued") {
      if (operation.startedAt !== undefined || operation.completedAt !== undefined) {
        context.addIssue({
          code: "custom",
          message: "Eine wartende Operation besitzt noch keine Laufzeitdaten.",
          path: ["status"],
        });
      }
    } else if (operation.status === "running") {
      if (operation.startedAt === undefined || operation.completedAt !== undefined) {
        context.addIssue({
          code: "custom",
          message: "Eine laufende Operation benötigt nur einen Startzeitpunkt.",
          path: ["status"],
        });
      }
    } else if (operation.completedAt === undefined) {
      context.addIssue({
        code: "custom",
        message: "Eine abgeschlossene Operation benötigt einen Abschlusszeitpunkt.",
        path: ["completedAt"],
      });
    }

    if (operation.status === "failed" && operation.error === undefined) {
      context.addIssue({
        code: "custom",
        message: "Eine fehlgeschlagene Operation benötigt einen redigierten Fehler.",
        path: ["error"],
      });
    }
    if (operation.status !== "failed" && operation.error !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Nur eine fehlgeschlagene Operation darf einen Fehler enthalten.",
        path: ["error"],
      });
    }
  });
export type ExtensionManagementOperation = z.infer<
  typeof extensionManagementOperationSchema
>;

const extensionRegistrySummaryShape = {
  id: extensionIdSchema,
  name: extensionNameSchema,
  description: extensionDescriptionSchema,
  publisher: extensionPublisherSchema,
  source: extensionSourceSchema,
  effectiveTrust: extensionTrustLevelSchema,
  lifecycle: extensionLifecycleStateSchema,
  desiredEnablement: extensionDesiredEnablementSchema,
  runtimeActive: z.boolean(),
  required: z.boolean(),
  installedVersion: semanticVersionSchema.optional(),
  activeVersion: semanticVersionSchema.optional(),
  availableVersion: semanticVersionSchema.optional(),
  rollbackVersion: semanticVersionSchema.optional(),
  activeAssetRevision: sha256IntegritySchema.optional(),
  allowedOperations: extensionAllowedOperationsSchema,
  permissionReview: extensionPermissionReviewSchema.optional(),
} as const;

const extensionRegistrySummaryBaseSchema = z.strictObject(
  extensionRegistrySummaryShape,
);
type ExtensionRegistrySummaryBase = z.infer<
  typeof extensionRegistrySummaryBaseSchema
>;

function registrySummaryIssues(summary: ExtensionRegistrySummaryBase) {
  const issues: Array<{ message: string; path: PropertyKey[] }> = [];
  const expectedTrustBySource = {
    system: ["system"],
    builtin: ["builtin"],
    catalog: ["catalog-first-party"],
    developer: ["developer"],
    "local-package": ["developer", "sandboxed-webview"],
  } as const;

  if (
    !(expectedTrustBySource[summary.source.kind] as readonly string[]).includes(
      summary.effectiveTrust,
    )
  ) {
    issues.push({
      message: "Source und effektiver Trust passen nicht zusammen.",
      path: ["effectiveTrust"],
    });
  }
  if (summary.required !== (summary.source.kind === "system")) {
    issues.push({
      message: "Nur System Extensions sind in V1 verpflichtend.",
      path: ["required"],
    });
  }
  if (summary.activeVersion !== undefined && summary.installedVersion === undefined) {
    issues.push({
      message: "Eine aktive Version benötigt eine installierte Version.",
      path: ["activeVersion"],
    });
  }
  if (
    summary.lifecycle === "available" &&
    (summary.installedVersion !== undefined || summary.runtimeActive)
  ) {
    issues.push({
      message: "Eine verfügbare Extension darf noch nicht installiert oder aktiv sein.",
      path: ["lifecycle"],
    });
  }
  if (
    summary.lifecycle === "active" &&
    (!summary.runtimeActive || summary.activeVersion === undefined)
  ) {
    issues.push({
      message: "Eine aktive Phase benötigt eine aktive Runtime und Version.",
      path: ["lifecycle"],
    });
  }
  if (summary.lifecycle === "disabled" && summary.runtimeActive) {
    issues.push({
      message: "Eine deaktivierte Extension darf keine aktive Runtime melden.",
      path: ["runtimeActive"],
    });
  }
  if (
    (summary.lifecycle === "permissions-pending") !==
    (summary.permissionReview !== undefined)
  ) {
    issues.push({
      message: "Permission Review und Lifecycle müssen übereinstimmen.",
      path: ["permissionReview"],
    });
  }
  return issues;
}

export const extensionRegistrySummarySchema = extensionRegistrySummaryBaseSchema
  .superRefine((summary, context) => {
    for (const issue of registrySummaryIssues(summary)) {
      context.addIssue({ code: "custom", ...issue });
    }
  });
export type ExtensionRegistrySummary = z.infer<
  typeof extensionRegistrySummarySchema
>;

export const extensionRegistryDetailSchema = z
  .strictObject({
    ...extensionRegistrySummaryShape,
    manifest: extensionManifestV1Schema,
    grantedPermissions: extensionPermissionRequestsSchema,
    health: extensionHealthSchema,
    lastOperation: extensionManagementOperationSchema.optional(),
    lastError: extensionPublicErrorSchema.optional(),
  })
  .superRefine((detail, context) => {
    for (const issue of registrySummaryIssues(detail)) {
      context.addIssue({ code: "custom", ...issue });
    }
    if (detail.manifest.id !== detail.id) {
      context.addIssue({
        code: "custom",
        message: "Registry und Manifest müssen dieselbe Extension ID besitzen.",
        path: ["manifest", "id"],
      });
    }
    if (detail.manifest.trust !== detail.effectiveTrust) {
      context.addIssue({
        code: "custom",
        message: "Manifest und effektiver Registry-Trust müssen übereinstimmen.",
        path: ["manifest", "trust"],
      });
    }
    for (const field of ["name", "description", "publisher"] as const) {
      if (detail.manifest[field] !== detail[field]) {
        context.addIssue({
          code: "custom",
          message: "Registry-Metadaten und Manifest müssen übereinstimmen.",
          path: ["manifest", field],
        });
      }
    }
    if (
      detail.installedVersion !== undefined &&
      detail.manifest.version !== detail.installedVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "Installierte Registry-Version und Manifest müssen übereinstimmen.",
        path: ["manifest", "version"],
      });
    }
    if (
      !permissionsAreSubset(
        detail.grantedPermissions,
        detail.manifest.permissions,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Grants dürfen Manifest Requests nicht erweitern.",
        path: ["grantedPermissions"],
      });
    }
    if (
      detail.runtimeActive &&
      detail.manifest.entrypoints.ui !== undefined &&
      detail.activeAssetRevision === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Eine aktive UI Extension benötigt eine Asset-Revision.",
        path: ["activeAssetRevision"],
      });
    }
  });
export type ExtensionRegistryDetail = z.infer<
  typeof extensionRegistryDetailSchema
>;

export const extensionRegistrySnapshotSchema = z
  .strictObject({
    revision: extensionRegistryRevisionSchema,
    generatedAt: z.iso.datetime(),
    extensions: z
      .array(extensionRegistrySummarySchema)
      .max(EXTENSION_REGISTRY_MAX_ENTRIES),
  })
  .superRefine((snapshot, context) => {
    const ids = new Set<string>();
    for (const [index, extension] of snapshot.extensions.entries()) {
      if (ids.has(extension.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Extension ID darf in der Registry nur einmal vorkommen.",
          path: ["extensions", index, "id"],
        });
      }
      ids.add(extension.id);
    }
  });
export type ExtensionRegistrySnapshot = z.infer<
  typeof extensionRegistrySnapshotSchema
>;

const extensionMutationBaseShape = {
  extensionId: extensionIdSchema,
  expectedRevision: extensionRegistryRevisionSchema,
} as const;

export const extensionInstallSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("catalog"),
    providerId: catalogProviderIdSchema,
    catalogRevision: sha256IntegritySchema,
    version: semanticVersionSchema,
    packageIntegrity: sha256IntegritySchema,
  }),
  z.strictObject({
    kind: z.literal("local-package"),
    uploadId: z.uuid(),
    packageIntegrity: sha256IntegritySchema,
  }),
  z.strictObject({
    kind: z.literal("developer"),
    registrationId: z.uuid(),
  }),
]);
export type ExtensionInstallSource = z.infer<
  typeof extensionInstallSourceSchema
>;

export const installExtensionRequestSchema = z.strictObject({
  operation: z.literal("install"),
  ...extensionMutationBaseShape,
  source: extensionInstallSourceSchema,
  enableAfterInstall: z.boolean(),
});

export const enableExtensionRequestSchema = z.strictObject({
  operation: z.literal("enable"),
  ...extensionMutationBaseShape,
});

export const disableExtensionRequestSchema = z.strictObject({
  operation: z.literal("disable"),
  ...extensionMutationBaseShape,
});

export const updateExtensionRequestSchema = z.strictObject({
  operation: z.literal("update"),
  ...extensionMutationBaseShape,
  target: z.strictObject({
    providerId: catalogProviderIdSchema,
    catalogRevision: sha256IntegritySchema,
    version: semanticVersionSchema,
    packageIntegrity: sha256IntegritySchema,
  }),
});

export const uninstallExtensionRequestSchema = z.strictObject({
  operation: z.literal("uninstall"),
  ...extensionMutationBaseShape,
  data: z.enum(["retain", "delete"]),
});

export const rollbackExtensionRequestSchema = z.strictObject({
  operation: z.literal("rollback"),
  ...extensionMutationBaseShape,
  targetVersion: semanticVersionSchema,
  enableAfterRollback: z.boolean(),
});

export const reloadExtensionRequestSchema = z.strictObject({
  operation: z.literal("reload"),
  ...extensionMutationBaseShape,
});

export const reviewExtensionPermissionsRequestSchema = z.strictObject({
  operation: z.literal("review-permissions"),
  ...extensionMutationBaseShape,
  reviewId: z.uuid(),
  resolution: z.discriminatedUnion("decision", [
    z.strictObject({
      decision: z.literal("approve"),
      grants: extensionPermissionRequestsSchema,
    }),
    z.strictObject({ decision: z.literal("deny") }),
  ]),
});

export const extensionManagementRequestSchema = z.discriminatedUnion(
  "operation",
  [
    installExtensionRequestSchema,
    enableExtensionRequestSchema,
    disableExtensionRequestSchema,
    updateExtensionRequestSchema,
    uninstallExtensionRequestSchema,
    rollbackExtensionRequestSchema,
    reloadExtensionRequestSchema,
    reviewExtensionPermissionsRequestSchema,
  ],
);
export type ExtensionManagementRequest = z.infer<
  typeof extensionManagementRequestSchema
>;

export const extensionManagementAcceptedSchema = z.strictObject({
  revision: extensionRegistryRevisionSchema,
  // V1 führt der Server Management-Operationen synchron aus; die Antwort
  // enthält daher bereits die abgeschlossene Operation. Asynchrone
  // Antworten (queued/running) bleiben Teil des Vertrags, sobald die
  // Laufzeit Aktivierungsphasen echte Arbeit übernimmt.
  operation: extensionManagementOperationSchema.refine(
    (operation) =>
      operation.status === "queued" ||
      operation.status === "running" ||
      operation.status === "succeeded",
    "Eine Management-Antwort muss eine wartende, laufende oder abgeschlossene Operation enthalten.",
  ),
  extension: extensionRegistrySummarySchema,
});
export type ExtensionManagementAccepted = z.infer<
  typeof extensionManagementAcceptedSchema
>;
