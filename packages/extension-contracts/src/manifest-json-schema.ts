import { z } from "zod";
import { extensionManifestV1Schema } from "./manifest.js";

export const EXTENSION_MANIFEST_V1_SCHEMA_ID = "urn:remote-workplace:extension-manifest:v1";

export function createExtensionManifestV1JsonSchema() {
  const schema = z.toJSONSchema(extensionManifestV1Schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "throw",
  });

  return {
    ...schema,
    $id: EXTENSION_MANIFEST_V1_SCHEMA_ID,
    title: "Remote Workplace Extension Manifest V1",
    description:
      "Kanonischer Vertrag für lokale Remote-Workplace-Extensions mit Manifest-Version 1.",
  };
}

export const extensionManifestV1JsonSchema = createExtensionManifestV1JsonSchema();
