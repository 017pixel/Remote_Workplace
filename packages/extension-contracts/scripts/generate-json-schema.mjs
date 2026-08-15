import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createExtensionManifestV1JsonSchema } from "../dist/manifest-json-schema.js";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(packageDirectory, "schema/extension-manifest-v1.schema.json");
const output = `${JSON.stringify(createExtensionManifestV1JsonSchema(), null, 2)}\n`;

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
