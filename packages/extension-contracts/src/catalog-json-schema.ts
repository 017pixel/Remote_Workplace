import { z } from "zod";
import {
  catalogSnapshotSchema,
  extensionPackageDescriptorSchema,
} from "./catalog.js";

export const EXTENSION_CATALOG_V1_SCHEMA_ID =
  "urn:remote-workplace:extension-catalog:v1";
export const EXTENSION_PACKAGE_DESCRIPTOR_V1_SCHEMA_ID =
  "urn:remote-workplace:extension-package-descriptor:v1";

function createJsonSchema(schema: z.ZodType, id: string, title: string) {
  return {
    ...z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "input",
      unrepresentable: "throw",
    }),
    $id: id,
    title,
  };
}

export function createExtensionCatalogV1JsonSchema() {
  return createJsonSchema(
    catalogSnapshotSchema,
    EXTENSION_CATALOG_V1_SCHEMA_ID,
    "Remote Workplace Local Extension Catalog V1",
  );
}

export function createExtensionPackageDescriptorV1JsonSchema() {
  return createJsonSchema(
    extensionPackageDescriptorSchema,
    EXTENSION_PACKAGE_DESCRIPTOR_V1_SCHEMA_ID,
    "Remote Workplace Extension Package Descriptor V1",
  );
}

export const extensionCatalogV1JsonSchema =
  createExtensionCatalogV1JsonSchema();
export const extensionPackageDescriptorV1JsonSchema =
  createExtensionPackageDescriptorV1JsonSchema();
