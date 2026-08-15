import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVATION_EVENTS_MAX_COUNT } from "./activation-events.js";
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
      },
    });
  });

  it("entspricht exakt dem versionierten Schema-Artefakt", () => {
    expect(trackedSchema).toEqual(createExtensionManifestV1JsonSchema());
  });
});
