import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createExtensionManifestV1JsonSchema } from "../dist/manifest-json-schema.js";
import {
  createExtensionCatalogV1JsonSchema,
  createExtensionPackageDescriptorV1JsonSchema,
} from "../dist/catalog-json-schema.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemas = [
  ["extension-manifest-v1.schema.json", createExtensionManifestV1JsonSchema()],
  ["extension-catalog-v1.schema.json", createExtensionCatalogV1JsonSchema()],
  [
    "extension-package-descriptor-v1.schema.json",
    createExtensionPackageDescriptorV1JsonSchema(),
  ],
];

for (const [fileName, schema] of schemas) {
  const outputPath = resolve(packageDirectory, "schema", fileName);
  const output = `${JSON.stringify(schema, null, 2)}\n`;
  await mkdir(dirname(outputPath), { recursive: true });

  let currentOutput;
  try {
    currentOutput = await readFile(outputPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (currentOutput !== output) {
    await writeFile(outputPath, output, "utf8");
  }
}
