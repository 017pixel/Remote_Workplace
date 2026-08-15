import { z } from "zod";

export const EXTENSION_PERMISSION_SCOPE_MAX_ITEMS = 64;
export const EXTENSION_PERMISSION_HOST_MAX_LENGTH = 253;
export const EXTENSION_PERMISSION_REFERENCE_MAX_LENGTH = 128;

export const projectScopedPermissionIds = [
  "projects.read",
  "projects.write",
  "files.read",
  "files.write",
  "git.read",
  "git.write",
  "terminal.create",
  "terminal.input",
  "preview.read",
  "preview.manage",
  "agents.invoke",
] as const;

export const unscopedPermissionIds = [
  "notifications.create",
  "browser.control",
  "agents.tools.register",
  "agents.skills.register",
  "storage.read",
  "storage.write",
  "system.metrics.read",
] as const;

export const serviceScopedPermissionIds = ["system.services.read", "system.services.control"] as const;

export const extensionPermissionIds = [
  ...projectScopedPermissionIds,
  "process.execute",
  "network.fetch",
  ...unscopedPermissionIds,
  "secrets.request",
  ...serviceScopedPermissionIds,
] as const;

export const extensionPermissionIdSchema = z.enum(extensionPermissionIds);
export type ExtensionPermissionId = z.infer<typeof extensionPermissionIdSchema>;

export const extensionPermissionRiskLevels = ["normal", "sensitive", "highly-privileged"] as const;
export const extensionPermissionRiskLevelSchema = z.enum(extensionPermissionRiskLevels);
export type ExtensionPermissionRiskLevel = z.infer<typeof extensionPermissionRiskLevelSchema>;

export const extensionPermissionRiskById = {
  "projects.read": "normal",
  "projects.write": "sensitive",
  "files.read": "sensitive",
  "files.write": "sensitive",
  "git.read": "normal",
  "git.write": "sensitive",
  "terminal.create": "sensitive",
  "terminal.input": "sensitive",
  "process.execute": "highly-privileged",
  "network.fetch": "sensitive",
  "notifications.create": "normal",
  "browser.control": "highly-privileged",
  "preview.read": "normal",
  "preview.manage": "sensitive",
  "agents.invoke": "sensitive",
  "agents.tools.register": "sensitive",
  "agents.skills.register": "sensitive",
  "storage.read": "normal",
  "storage.write": "sensitive",
  "secrets.request": "highly-privileged",
  "system.metrics.read": "sensitive",
  "system.services.read": "sensitive",
  "system.services.control": "highly-privileged",
} as const satisfies Record<ExtensionPermissionId, ExtensionPermissionRiskLevel>;

function uniqueNonEmptyArraySchema<T extends z.ZodType>(itemSchema: T) {
  return z
    .array(itemSchema)
    .min(1)
    .max(EXTENSION_PERMISSION_SCOPE_MAX_ITEMS)
    .superRefine((values, context) => {
      const seen = new Set<unknown>();
      for (const [index, value] of values.entries()) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            message: "Scope-Einträge dürfen nicht doppelt vorkommen.",
            path: [index],
          });
        }
        seen.add(value);
      }
    })
    .meta({ uniqueItems: true });
}

export const projectPermissionSelectorSchema = z.union([
  z.literal("current"),
  z.string().regex(/^id:[a-z0-9]+(?:-[a-z0-9]+)*$/, "Eine Projekt-ID mit Präfix id: wird erwartet."),
]);

export type ProjectPermissionSelector = z.infer<typeof projectPermissionSelectorSchema>;

export const projectPermissionScopeSchema = z.strictObject({
  projects: uniqueNonEmptyArraySchema(projectPermissionSelectorSchema),
});

export type ProjectPermissionScope = z.infer<typeof projectPermissionScopeSchema>;

export const processCommandSchema = z
  .string()
  .min(1)
  .max(EXTENSION_PERMISSION_REFERENCE_MAX_LENGTH)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._+-]*$/,
    "Process Scopes verwenden ausführbare Dateinamen ohne Pfadsegmente.",
  );

export const processPermissionScopeSchema = z.union([
  z.strictObject({
    projects: uniqueNonEmptyArraySchema(projectPermissionSelectorSchema),
    commands: uniqueNonEmptyArraySchema(processCommandSchema).optional(),
  }),
  z.strictObject({
    projects: uniqueNonEmptyArraySchema(projectPermissionSelectorSchema).optional(),
    commands: uniqueNonEmptyArraySchema(processCommandSchema),
  }),
]);

export type ProcessPermissionScope = z.infer<typeof processPermissionScopeSchema>;

export const networkHostSchema = z
  .string()
  .min(1)
  .max(EXTENSION_PERMISSION_HOST_MAX_LENGTH)
  .regex(
    /^(?=.*[a-z])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "Ein kleingeschriebener, exakter DNS-Hostname wird erwartet.",
  );

export const networkPermissionScopeSchema = z.strictObject({
  hosts: uniqueNonEmptyArraySchema(networkHostSchema),
});

export type NetworkPermissionScope = z.infer<typeof networkPermissionScopeSchema>;

export const secretReferenceSchema = z
  .string()
  .min(1)
  .max(EXTENSION_PERMISSION_REFERENCE_MAX_LENGTH)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Eine stabile Secret-Referenz wird erwartet.");

export const secretsPermissionScopeSchema = z.strictObject({
  names: uniqueNonEmptyArraySchema(secretReferenceSchema),
});

export type SecretsPermissionScope = z.infer<typeof secretsPermissionScopeSchema>;

export const systemServiceUnitSchema = z
  .string()
  .min(1)
  .max(EXTENSION_PERMISSION_REFERENCE_MAX_LENGTH)
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9@_.-]*[A-Za-z0-9@_-])?\.service$/,
    "Eine exakte systemd-Service-Unit wird erwartet.",
  );

export const servicesPermissionScopeSchema = z.strictObject({
  services: uniqueNonEmptyArraySchema(systemServiceUnitSchema),
});

export type ServicesPermissionScope = z.infer<typeof servicesPermissionScopeSchema>;

const projectScopedPermissionRequestSchema = z.strictObject({
  permission: z.enum(projectScopedPermissionIds),
  scope: projectPermissionScopeSchema.optional(),
});

const processPermissionRequestSchema = z.strictObject({
  permission: z.literal("process.execute"),
  scope: processPermissionScopeSchema.optional(),
});

const networkPermissionRequestSchema = z.strictObject({
  permission: z.literal("network.fetch"),
  scope: networkPermissionScopeSchema.optional(),
});

const unscopedPermissionRequestSchema = z.strictObject({
  permission: z.enum(unscopedPermissionIds),
});

const secretsPermissionRequestSchema = z.strictObject({
  permission: z.literal("secrets.request"),
  scope: secretsPermissionScopeSchema.optional(),
});

const serviceScopedPermissionRequestSchema = z.strictObject({
  permission: z.enum(serviceScopedPermissionIds),
  scope: servicesPermissionScopeSchema.optional(),
});

export const extensionPermissionRequestSchema = z.discriminatedUnion("permission", [
  projectScopedPermissionRequestSchema,
  processPermissionRequestSchema,
  networkPermissionRequestSchema,
  unscopedPermissionRequestSchema,
  secretsPermissionRequestSchema,
  serviceScopedPermissionRequestSchema,
]);

export type ExtensionPermissionRequest = z.infer<typeof extensionPermissionRequestSchema>;

export const extensionPermissionRequestsSchema = z
  .array(extensionPermissionRequestSchema)
  .max(extensionPermissionIds.length)
  .superRefine((requests, context) => {
    const seen = new Set<ExtensionPermissionId>();
    for (const [index, request] of requests.entries()) {
      if (seen.has(request.permission)) {
        context.addIssue({
          code: "custom",
          message: "Jede Permission darf nur einmal angefordert werden.",
          path: [index, "permission"],
        });
      }
      seen.add(request.permission);
    }
  })
  .meta({ uniqueItems: true });

export type ExtensionPermissionRequests = z.infer<typeof extensionPermissionRequestsSchema>;
