import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXTENSION_CATALOG_V1_SCHEMA_ID,
  EXTENSION_PACKAGE_DESCRIPTOR_V1_SCHEMA_ID,
  createExtensionCatalogV1JsonSchema,
  createExtensionPackageDescriptorV1JsonSchema,
} from "./catalog-json-schema.js";
import {
  CATALOG_ENTRIES_MAX_COUNT,
  EXTENSION_PACKAGE_FILES_MAX_COUNT,
} from "./catalog.js";

const trackedCatalogSchema = JSON.parse(
  readFileSync(
    new URL("../schema/extension-catalog-v1.schema.json", import.meta.url),
    "utf8",
  ),
);
const trackedPackageSchema = JSON.parse(
  readFileSync(
    new URL(
      "../schema/extension-package-descriptor-v1.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("generierte Local-Catalog-JSON-Schemas", () => {
  it("nutzt stabile Draft-2020-12-IDs und Grenzen", () => {
    expect(createExtensionCatalogV1JsonSchema()).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: EXTENSION_CATALOG_V1_SCHEMA_ID,
      type: "object",
      additionalProperties: false,
      properties: {
        entries: { type: "array", maxItems: CATALOG_ENTRIES_MAX_COUNT },
      },
    });
    expect(createExtensionPackageDescriptorV1JsonSchema()).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: EXTENSION_PACKAGE_DESCRIPTOR_V1_SCHEMA_ID,
      type: "object",
      additionalProperties: false,
      properties: {
        formatVersion: { type: "number", const: 1 },
        files: {
          type: "array",
          maxItems: EXTENSION_PACKAGE_FILES_MAX_COUNT,
          uniqueItems: true,
        },
      },
    });
  });

  it("entspricht exakt den versionierten Schema-Artefakten", () => {
    expect(trackedCatalogSchema).toEqual(
      createExtensionCatalogV1JsonSchema(),
    );
    expect(trackedPackageSchema).toEqual(
      createExtensionPackageDescriptorV1JsonSchema(),
    );
  });
});
