import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVATION_EVENTS_MAX_COUNT } from "./activation-events.js";
import {
  COMMAND_CONTRIBUTIONS_MAX_COUNT,
  NAVIGATION_CONTRIBUTIONS_MAX_COUNT,
  ORBIT_CONTRIBUTIONS_MAX_COUNT,
  PAGE_CONTRIBUTIONS_MAX_COUNT,
  ROUTE_CONTRIBUTIONS_MAX_COUNT,
} from "./contributions.js";
import { EXTENSION_CONFLICTS_MAX_COUNT, EXTENSION_DEPENDENCIES_MAX_COUNT } from "./dependencies.js";
import {
  EXTENSION_MANIFEST_V1_SCHEMA_ID,
  createExtensionManifestV1JsonSchema,
} from "./manifest-json-schema.js";
import { extensionPermissionIds } from "./permissions.js";

const trackedSchema = JSON.parse(
  readFileSync(new URL("../schema/extension-manifest-v1.schema.json", import.meta.url), "utf8"),
);

describe("generiertes Extension-Manifest-JSON-Schema", () => {
  it("nutzt Draft 2020-12 und eine stabile lokale Schema-ID", () => {
    expect(createExtensionManifestV1JsonSchema()).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: EXTENSION_MANIFEST_V1_SCHEMA_ID,
      type: "object",
      additionalProperties: false,
      properties: {
        manifestVersion: { type: "number", const: 1 },
        trust: {
          type: "string",
          enum: ["system", "builtin", "catalog-first-party", "developer", "sandboxed-webview"],
        },
        permissions: {
          type: "array",
          maxItems: extensionPermissionIds.length,
          uniqueItems: true,
          items: { oneOf: expect.any(Array) },
        },
        activationEvents: {
          type: "array",
          maxItems: ACTIVATION_EVENTS_MAX_COUNT,
          uniqueItems: true,
          items: { anyOf: expect.any(Array) },
        },
        extensionDependencies: {
          type: "object",
          maxProperties: EXTENSION_DEPENDENCIES_MAX_COUNT,
          propertyNames: { type: "string", pattern: expect.any(String) },
          additionalProperties: { type: "string" },
        },
        optionalExtensionDependencies: {
          type: "object",
          maxProperties: EXTENSION_DEPENDENCIES_MAX_COUNT,
          propertyNames: { type: "string", pattern: expect.any(String) },
          additionalProperties: { type: "string" },
        },
        extensionConflicts: {
          type: "array",
          maxItems: EXTENSION_CONFLICTS_MAX_COUNT,
          uniqueItems: true,
          items: { type: "object", additionalProperties: false },
        },
        contributes: {
          type: "object",
          additionalProperties: false,
          properties: {
            commands: {
              type: "array",
              minItems: 1,
              maxItems: COMMAND_CONTRIBUTIONS_MAX_COUNT,
              uniqueItems: true,
              items: { type: "object", additionalProperties: false },
            },
            pages: {
              type: "array",
              minItems: 1,
              maxItems: PAGE_CONTRIBUTIONS_MAX_COUNT,
              uniqueItems: true,
              items: { type: "object", additionalProperties: false },
            },
            routes: {
              type: "array",
              minItems: 1,
              maxItems: ROUTE_CONTRIBUTIONS_MAX_COUNT,
              uniqueItems: true,
              items: { type: "object", additionalProperties: false },
            },
            navigation: {
              type: "array",
              minItems: 1,
              maxItems: NAVIGATION_CONTRIBUTIONS_MAX_COUNT,
              uniqueItems: true,
              items: { type: "object", additionalProperties: false },
            },
            orbit: {
              type: "array",
              minItems: 1,
              maxItems: ORBIT_CONTRIBUTIONS_MAX_COUNT,
              uniqueItems: true,
              items: { type: "object", additionalProperties: false },
            },
          },
        },
      },
    });
  });

  it("entspricht exakt dem versionierten Schema-Artefakt", () => {
    expect(trackedSchema).toEqual(createExtensionManifestV1JsonSchema());
  });
});
