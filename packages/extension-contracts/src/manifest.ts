import { z } from "zod";
import {
  activationEventBelongsToExtension,
  activationEventContributionId,
  activationEventsV1Schema,
} from "./activation-events.js";
import {
  agentSkillContributionsSchema,
  agentSkillNameBelongsToExtension,
} from "./agent-skill-contributions.js";
import { agentToolContributionsSchema } from "./agent-tool-contributions.js";
import {
  commandContributionsSchema,
  dashboardContributionsSchema,
  navigationContributionsSchema,
  orbitContributionsSchema,
  pageContributionsSchema,
  routeContributionsSchema,
} from "./contributions.js";
import {
  contextExpressionKeys,
  contextKeyBelongsToExtension,
} from "./context-expressions.js";
import {
  contextMenuContributionsSchema,
  contextMenuSurfaceBelongsToExtension,
} from "./context-menus.js";
import {
  extensionConflictsSchema,
  extensionDependencyMapSchema,
} from "./dependencies.js";
import { fileContributionsSchema } from "./file-contributions.js";
import { contributionBelongsToExtension, extensionIdSchema } from "./ids.js";
import { keyboardShortcutContributionsSchema } from "./keyboard-shortcuts.js";
import {
  extensionEntrypointPathSchema,
  extensionIconPathSchema,
  extensionMarkdownPathSchema,
} from "./package-paths.js";
import {
  extensionApiCompatibilitySchema,
  manifestVersionSchema,
  remoteWorkplaceCompatibilitySchema,
  semanticVersionSchema,
} from "./versioning.js";
import { extensionPermissionRequestsSchema } from "./permissions.js";
import { browserContributionsSchema } from "./browser-contributions.js";
import { previewContributionsSchema } from "./preview-contributions.js";
import { settingsContributionsSchema } from "./settings-contributions.js";
import { statusBarContributionsSchema } from "./status-bar.js";
import { terminalContributionsSchema } from "./terminal-contributions.js";
import { topbarContributionsSchema } from "./topbar.js";

export * from "./package-paths.js";

export const EXTENSION_NAME_MAX_LENGTH = 80;
export const EXTENSION_DESCRIPTION_MAX_LENGTH = 500;
export const EXTENSION_PUBLISHER_MAX_LENGTH = 64;
export const EXTENSION_LICENSE_MAX_LENGTH = 128;
export const EXTENSION_CATEGORY_MAX_LENGTH = 64;
export const EXTENSION_KEYWORD_MAX_LENGTH = 48;
export const EXTENSION_KEYWORDS_MAX_COUNT = 20;
export const EXTENSION_SCHEMA_REFERENCE_MAX_LENGTH = 512;

const slugPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function boundedTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value === value.trim() && !containsControlCharacter(value),
      `${fieldName} darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.`,
    );
}

function slugSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .regex(slugPattern, `${fieldName} muss ein kleingeschriebener Slug sein.`);
}

export const extensionSchemaReferenceSchema = z
  .string()
  .min(1)
  .max(EXTENSION_SCHEMA_REFERENCE_MAX_LENGTH)
  .refine(
    (value) => value === value.trim() && !containsControlCharacter(value),
    "Die Schema-Referenz darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.",
  );

export const extensionNameSchema = boundedTextSchema(
  EXTENSION_NAME_MAX_LENGTH,
  "Der Name",
);
export const extensionDescriptionSchema = boundedTextSchema(
  EXTENSION_DESCRIPTION_MAX_LENGTH,
  "Die Beschreibung",
);
export const extensionPublisherSchema = slugSchema(
  EXTENSION_PUBLISHER_MAX_LENGTH,
  "Der Publisher",
);
export const extensionLicenseSchema = boundedTextSchema(
  EXTENSION_LICENSE_MAX_LENGTH,
  "Die Lizenz",
);
export const extensionCategorySchema = slugSchema(
  EXTENSION_CATEGORY_MAX_LENGTH,
  "Die Kategorie",
);
export const extensionKeywordSchema = boundedTextSchema(
  EXTENSION_KEYWORD_MAX_LENGTH,
  "Ein Keyword",
);

export const extensionKeywordsSchema = z
  .array(extensionKeywordSchema)
  .max(EXTENSION_KEYWORDS_MAX_COUNT)
  .superRefine((keywords, context) => {
    const normalized = new Set<string>();
    for (const [index, keyword] of keywords.entries()) {
      const comparableKeyword = keyword.toLowerCase();
      if (normalized.has(comparableKeyword)) {
        context.addIssue({
          code: "custom",
          message: "Keywords dürfen nicht doppelt vorkommen.",
          path: [index],
        });
      }
      normalized.add(comparableKeyword);
    }
  });

export const extensionTrustLevels = [
  "system",
  "builtin",
  "catalog-first-party",
  "developer",
  "sandboxed-webview",
] as const;

export const extensionTrustLevelSchema = z.enum(extensionTrustLevels);
export type ExtensionTrustLevel = z.infer<typeof extensionTrustLevelSchema>;

export const extensionEnginesSchema = z.strictObject({
  remoteWorkplace: remoteWorkplaceCompatibilitySchema,
  extensionApi: extensionApiCompatibilitySchema,
});

export type ExtensionEngines = z.infer<typeof extensionEnginesSchema>;

export const extensionEntrypointsSchema = z.strictObject({
  ui: extensionEntrypointPathSchema.optional(),
  server: extensionEntrypointPathSchema.optional(),
});

export type ExtensionEntrypoints = z.infer<typeof extensionEntrypointsSchema>;

// Manifest V1 öffnet Surfaces erst mit ihrem typisierten Contract. Contributions bleiben bis
// zu ihrem Phase-1-Subgoal fail-closed.
export const extensionPermissionsV1Schema = extensionPermissionRequestsSchema;
export const extensionActivationEventsV1Schema = activationEventsV1Schema;
export const extensionContributionsV1Schema = z.strictObject({
  commands: commandContributionsSchema.optional(),
  pages: pageContributionsSchema.optional(),
  routes: routeContributionsSchema.optional(),
  navigation: navigationContributionsSchema.optional(),
  orbit: orbitContributionsSchema.optional(),
  dashboard: dashboardContributionsSchema.optional(),
  settings: settingsContributionsSchema.optional(),
  keyboardShortcuts: keyboardShortcutContributionsSchema.optional(),
  contextMenus: contextMenuContributionsSchema.optional(),
  statusBar: statusBarContributionsSchema.optional(),
  topbar: topbarContributionsSchema.optional(),
  files: fileContributionsSchema.optional(),
  terminal: terminalContributionsSchema.optional(),
  previews: previewContributionsSchema.optional(),
  browser: browserContributionsSchema.optional(),
  agentTools: agentToolContributionsSchema.optional(),
  agentSkills: agentSkillContributionsSchema.optional(),
});

export const extensionManifestV1Schema = z
  .strictObject({
    $schema: extensionSchemaReferenceSchema.optional(),
    manifestVersion: manifestVersionSchema,
    id: extensionIdSchema,
    name: extensionNameSchema,
    version: semanticVersionSchema,
    publisher: extensionPublisherSchema,
    description: extensionDescriptionSchema,
    license: extensionLicenseSchema,
    category: extensionCategorySchema.optional(),
    keywords: extensionKeywordsSchema.optional(),
    icon: extensionIconPathSchema.optional(),
    readme: extensionMarkdownPathSchema.optional(),
    changelog: extensionMarkdownPathSchema.optional(),
    dataSchemaVersion: z.number().int().positive().optional(),
    engines: extensionEnginesSchema,
    trust: extensionTrustLevelSchema,
    entrypoints: extensionEntrypointsSchema,
    permissions: extensionPermissionsV1Schema,
    activationEvents: extensionActivationEventsV1Schema,
    extensionDependencies: extensionDependencyMapSchema.optional(),
    optionalExtensionDependencies: extensionDependencyMapSchema.optional(),
    extensionConflicts: extensionConflictsSchema.optional(),
    contributes: extensionContributionsV1Schema,
  })
  .refine(
    (manifest) =>
      manifest.entrypoints.ui !== undefined ||
      manifest.entrypoints.server !== undefined ||
      Object.keys(manifest.contributes).length > 0,
    {
      message:
        "Eine Extension benötigt mindestens einen Entrypoint oder eine Contribution.",
      path: ["entrypoints"],
    },
  )
  .superRefine((manifest, context) => {
    const commandIds = new Set(
      (manifest.contributes.commands ?? []).map((command) => command.id),
    );
    const pageIds = new Set(
      (manifest.contributes.pages ?? []).map((page) => page.id),
    );
    const routeIds = new Set(
      (manifest.contributes.routes ?? []).map((route) => route.id),
    );
    const orbitIds = new Set(
      (manifest.contributes.orbit ?? []).map((node) => node.id),
    );

    for (const [index, event] of manifest.activationEvents.entries()) {
      if (!activationEventBelongsToExtension(manifest.id, event)) {
        context.addIssue({
          code: "custom",
          message:
            "Referenzierte Contributions müssen zur deklarierenden Extension gehören.",
          path: ["activationEvents", index],
        });
        continue;
      }

      const contributionId = activationEventContributionId(event);
      if (
        event.startsWith("onCommand:") &&
        (contributionId === null || !commandIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onCommand Activation Event benötigt eine deklarierte Command Contribution.",
          path: ["activationEvents", index],
        });
      }
      if (
        event.startsWith("onRoute:") &&
        (contributionId === null || !routeIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onRoute Activation Event benötigt eine deklarierte Route Contribution.",
          path: ["activationEvents", index],
        });
      }
      if (
        event.startsWith("onOrbitNode:") &&
        (contributionId === null || !orbitIds.has(contributionId))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Ein onOrbitNode Activation Event benötigt eine deklarierte Orbit Contribution.",
          path: ["activationEvents", index],
        });
      }
    }

    const declaredContributions = [
      ...(manifest.contributes.commands ?? []).map((command, index) => ({
        id: command.id,
        path: ["contributes", "commands", index, "id"] as const,
      })),
      ...(manifest.contributes.pages ?? []).map((page, index) => ({
        id: page.id,
        path: ["contributes", "pages", index, "id"] as const,
      })),
      ...(manifest.contributes.routes ?? []).map((route, index) => ({
        id: route.id,
        path: ["contributes", "routes", index, "id"] as const,
      })),
      ...(manifest.contributes.navigation ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "navigation", index, "id"] as const,
      })),
      ...(manifest.contributes.orbit ?? []).map((node, index) => ({
        id: node.id,
        path: ["contributes", "orbit", index, "id"] as const,
      })),
      ...(manifest.contributes.dashboard ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "dashboard", index, "id"] as const,
      })),
      ...(manifest.contributes.settings ?? []).flatMap((setting, index) => [
        {
          id: setting.id,
          path: ["contributes", "settings", index, "id"] as const,
        },
        ...(setting.kind === "schema"
          ? setting.fields.map((field, fieldIndex) => ({
              id: field.id,
              path: [
                "contributes",
                "settings",
                index,
                "fields",
                fieldIndex,
                "id",
              ] as const,
            }))
          : []),
      ]),
      ...(manifest.contributes.keyboardShortcuts ?? []).map(
        (shortcut, index) => ({
          id: shortcut.id,
          path: ["contributes", "keyboardShortcuts", index, "id"] as const,
        }),
      ),
      ...(manifest.contributes.contextMenus ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "contextMenus", index, "id"] as const,
      })),
      ...(manifest.contributes.statusBar ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "statusBar", index, "id"] as const,
      })),
      ...(manifest.contributes.topbar ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "topbar", index, "id"] as const,
      })),
      ...(manifest.contributes.files ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "files", index, "id"] as const,
      })),
      ...(manifest.contributes.terminal ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "terminal", index, "id"] as const,
      })),
      ...(manifest.contributes.previews ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "previews", index, "id"] as const,
      })),
      ...(manifest.contributes.browser ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "browser", index, "id"] as const,
      })),
      ...(manifest.contributes.agentTools ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "agentTools", index, "id"] as const,
      })),
      ...(manifest.contributes.agentSkills ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "agentSkills", index, "id"] as const,
      })),
    ];
    const seenContributionIds = new Set<string>();
    for (const contribution of declaredContributions) {
      if (!contributionBelongsToExtension(manifest.id, contribution.id)) {
        context.addIssue({
          code: "custom",
          message:
            "Contribution IDs müssen zur deklarierenden Extension gehören.",
          path: [...contribution.path],
        });
      }
      if (seenContributionIds.has(contribution.id)) {
        context.addIssue({
          code: "custom",
          message: "Contribution IDs müssen manifestweit eindeutig sein.",
          path: [...contribution.path],
        });
      }
      seenContributionIds.add(contribution.id);
    }

    for (const [index, route] of (
      manifest.contributes.routes ?? []
    ).entries()) {
      if (pageIds.has(route.pageId)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Route muss eine deklarierte Page Contribution derselben Extension referenzieren.",
        path: ["contributes", "routes", index, "pageId"],
      });
    }

    for (const [index, item] of (
      manifest.contributes.navigation ?? []
    ).entries()) {
      if (!routeIds.has(item.routeId)) {
        context.addIssue({
          code: "custom",
          message:
            "Navigation muss eine deklarierte Route Contribution derselben Extension referenzieren.",
          path: ["contributes", "navigation", index, "routeId"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Navigation Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "navigation", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "navigation", index, "icon"],
        });
      }
      if (
        item.badgeProvider !== undefined &&
        !contributionBelongsToExtension(manifest.id, item.badgeProvider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Navigation Badge Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "navigation", index, "badgeProvider"],
        });
      }
    }

    for (const [index, node] of (manifest.contributes.orbit ?? []).entries()) {
      if (
        node.icon !== undefined &&
        node.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, node.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Orbit Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "orbit", index, "icon"],
        });
      }
      if (node.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "orbit", index, "icon"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.dashboard ?? []
    ).entries()) {
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Dashboard Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "dashboard", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "dashboard", index, "icon"],
        });
      }
      if (item.kind === "quick-action") {
        if (!commandIds.has(item.commandId)) {
          context.addIssue({
            code: "custom",
            message:
              "Eine Dashboard Quick Action muss eine deklarierte Command Contribution referenzieren.",
            path: ["contributes", "dashboard", index, "commandId"],
          });
        }
        continue;
      }
      if (!contributionBelongsToExtension(manifest.id, item.provider)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Dashboard Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "dashboard", index, "provider"],
        });
      }
    }

    for (const [index, setting] of (
      manifest.contributes.settings ?? []
    ).entries()) {
      if (
        setting.icon !== undefined &&
        setting.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, setting.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Settings Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "settings", index, "icon"],
        });
      }
      if (setting.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "settings", index, "icon"],
        });
      }
      if (setting.kind === "page" && !pageIds.has(setting.pageId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine eigene Settings Page muss eine deklarierte Page Contribution referenzieren.",
          path: ["contributes", "settings", index, "pageId"],
        });
      }
    }

    for (const [index, shortcut] of (
      manifest.contributes.keyboardShortcuts ?? []
    ).entries()) {
      if (!commandIds.has(shortcut.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Ein Keyboard Shortcut muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "keyboardShortcuts", index, "commandId"],
        });
      }
      if (shortcut.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(shortcut.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "keyboardShortcuts", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.contextMenus ?? []
    ).entries()) {
      if (!commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Ein Context Menu Item muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "contextMenus", index, "commandId"],
        });
      }
      if (!contextMenuSurfaceBelongsToExtension(manifest.id, item.surface)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Extension Context-Menu-Surface muss zur deklarierenden Extension gehören.",
          path: ["contributes", "contextMenus", index, "surface"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Context Menu Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "contextMenus", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "contextMenus", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "contextMenus", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.statusBar ?? []
    ).entries()) {
      if (item.commandId !== undefined && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Status Bar Command-Aktion muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "statusBar", index, "commandId"],
        });
      }
      if (
        item.kind !== "action" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Status Bar Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "statusBar", index, "provider"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Status Bar Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "statusBar", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "statusBar", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "statusBar", index, "when"],
        });
      }
    }

    for (const [index, item] of (manifest.contributes.topbar ?? []).entries()) {
      if (!commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Contribution muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "topbar", index, "commandId"],
        });
      }
      const targetRoute = (manifest.contributes.routes ?? []).find(
        (route) => route.id === item.routeId,
      );
      if (targetRoute === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Contribution muss eine deklarierte Route Contribution referenzieren.",
          path: ["contributes", "topbar", index, "routeId"],
        });
      } else if (!targetRoute.topbar) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Contribution kann nur eine Route mit aktivierter Topbar referenzieren.",
          path: ["contributes", "topbar", index, "routeId"],
        });
      }
      if (
        item.kind === "selector" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "topbar", index, "provider"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "topbar", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "topbar", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "topbar", index, "when"],
        });
      }
    }

    for (const [index, item] of (manifest.contributes.files ?? []).entries()) {
      if (item.kind === "opener" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Ein File Opener muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "files", index, "commandId"],
        });
      }
      if (
        item.kind === "viewer" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine File Viewer Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "files", index, "provider"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine File Contribution Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "files", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "files", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "files", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.terminal ?? []
    ).entries()) {
      if (item.kind === "action" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Terminal Action muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "terminal", index, "commandId"],
        });
      }
      if (
        item.kind === "profile" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Terminal Profile Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "terminal", index, "provider"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Terminal Contribution Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "terminal", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "terminal", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "terminal", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.previews ?? []
    ).entries()) {
      if (item.kind === "action" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Preview Action muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "previews", index, "commandId"],
        });
      }
      if (
        item.kind === "target" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Preview Target Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "previews", index, "provider"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Preview Contribution Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "previews", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "previews", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "previews", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.browser ?? []
    ).entries()) {
      if (item.kind === "action" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Browser Action muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "browser", index, "commandId"],
        });
      }
      if (
        item.kind === "tool" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Browser Tool Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "browser", index, "provider"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Browser Contribution Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "browser", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "browser", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "browser", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.agentTools ?? []
    ).entries()) {
      if (item.kind === "command" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Ein Command-basiertes Agent Tool muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "agentTools", index, "commandId"],
        });
      }
      if (
        item.kind === "provider" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Agent Tool Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "agentTools", index, "provider"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.agentSkills ?? []
    ).entries()) {
      if (agentSkillNameBelongsToExtension(manifest.id, item.name)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Ein Agent Skill Name muss mit dem normalisierten Extension-Namespace beginnen.",
        path: ["contributes", "agentSkills", index, "name"],
      });
    }

    if (
      manifest.contributes.commands !== undefined &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Command Contributions benötigen einen UI- oder Server-Entrypoint für ihren Handler.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.pages !== undefined &&
      manifest.entrypoints.ui === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Page Contributions benötigen einen UI-Entrypoint für ihren Renderer.",
        path: ["entrypoints", "ui"],
      });
    }

    if (
      manifest.contributes.orbit !== undefined &&
      manifest.entrypoints.ui === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Orbit Contributions benötigen einen UI-Entrypoint für Renderer und State Contract.",
        path: ["entrypoints", "ui"],
      });
    }

    if (
      manifest.contributes.dashboard?.some(
        (item) => item.kind !== "quick-action",
      ) === true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Providerbasierte Dashboard Contributions benötigen einen UI- oder Server-Entrypoint.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.statusBar?.some((item) => item.kind !== "action") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Providerbasierte Status Bar Contributions benötigen einen UI- oder Server-Entrypoint.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.topbar?.some((item) => item.kind === "selector") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Providerbasierte Topbar Contributions benötigen einen UI- oder Server-Entrypoint.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.files?.some((item) => item.kind === "viewer") ===
        true &&
      manifest.entrypoints.ui === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "File Viewer Contributions benötigen einen UI-Entrypoint für ihren Renderer.",
        path: ["entrypoints", "ui"],
      });
    }

    if (
      manifest.contributes.terminal?.some((item) => item.kind === "profile") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Terminal Profile Contributions benötigen einen UI- oder Server-Entrypoint für ihren Provider.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.previews?.some((item) => item.kind === "target") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Preview Target Contributions benötigen einen UI- oder Server-Entrypoint für ihren Provider.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.previews?.some((item) => item.kind === "target") ===
        true &&
      !manifest.permissions.some(
        (request) => request.permission === "preview.read",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Preview Target Contributions müssen die Permission preview.read anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.previews?.some(
        (item) => item.kind === "target" && item.sessionAccess === "manage",
      ) === true &&
      !manifest.permissions.some(
        (request) => request.permission === "preview.manage",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Verwaltende Preview Targets müssen die Permission preview.manage anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.browser?.some((item) => item.kind === "tool") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Browser Tool Contributions benötigen einen UI- oder Server-Entrypoint für ihren Provider.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.agentTools !== undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Agent Tool Contributions benötigen einen Server-Entrypoint für ihre Handler.",
        path: ["entrypoints", "server"],
      });
    }

    if (
      manifest.contributes.agentSkills !== undefined &&
      !manifest.permissions.some(
        (request) => request.permission === "agents.skills.register",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Agent Skill Contributions müssen die Permission agents.skills.register anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.agentTools !== undefined &&
      !manifest.permissions.some(
        (request) => request.permission === "agents.tools.register",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Agent Tool Contributions müssen die Permission agents.tools.register anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.browser?.some((item) => item.kind === "tool") ===
        true &&
      !manifest.permissions.some(
        (request) => request.permission === "browser.control",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Browser Tool Contributions müssen die Permission browser.control anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.terminal?.some((item) => item.kind === "profile") ===
        true &&
      !manifest.permissions.some(
        (request) => request.permission === "terminal.create",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Terminal Profile Contributions müssen die Permission terminal.create anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.files?.some((item) => item.kind === "viewer") ===
        true &&
      !manifest.permissions.some(
        (request) => request.permission === "files.read",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "File Viewer Contributions müssen die Permission files.read anfordern.",
        path: ["permissions"],
      });
    }

    const requiredDependencies = manifest.extensionDependencies ?? {};
    const optionalDependencies = manifest.optionalExtensionDependencies ?? {};

    if (Object.hasOwn(requiredDependencies, manifest.id)) {
      context.addIssue({
        code: "custom",
        message: "Eine Extension darf nicht von sich selbst abhängen.",
        path: ["extensionDependencies", manifest.id],
      });
    }
    if (Object.hasOwn(optionalDependencies, manifest.id)) {
      context.addIssue({
        code: "custom",
        message:
          "Eine Extension darf sich nicht selbst als optionale Abhängigkeit deklarieren.",
        path: ["optionalExtensionDependencies", manifest.id],
      });
    }

    for (const dependencyId of Object.keys(optionalDependencies)) {
      if (!Object.hasOwn(requiredDependencies, dependencyId)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Extension darf nicht zugleich Pflicht- und optionale Abhängigkeit sein.",
        path: ["optionalExtensionDependencies", dependencyId],
      });
    }

    for (const [index, conflict] of (
      manifest.extensionConflicts ?? []
    ).entries()) {
      if (conflict.id === manifest.id) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Extension darf keinen Konflikt mit sich selbst deklarieren.",
          path: ["extensionConflicts", index, "id"],
        });
      }
      if (
        !Object.hasOwn(requiredDependencies, conflict.id) &&
        !Object.hasOwn(optionalDependencies, conflict.id)
      ) {
        continue;
      }
      context.addIssue({
        code: "custom",
        message:
          "Eine Abhängigkeit darf nicht zugleich als Konflikt deklariert sein.",
        path: ["extensionConflicts", index, "id"],
      });
    }
  });

export type ExtensionManifestV1 = z.infer<typeof extensionManifestV1Schema>;
