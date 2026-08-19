#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : ["extensions"];

const build = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["--filter", "@wrapt/extension-contracts", "build"],
  { cwd: root, stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const contractsUrl = new URL("../../packages/extension-contracts/dist/index.js", import.meta.url);
const { extensionManifestSchema } = await import(contractsUrl.href);

async function collectManifestFiles(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) return [];
  const info = await stat(absolute);
  if (info.isFile()) return absolute.endsWith("extension.json") ? [absolute] : [];

  const manifests = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const child = join(absolute, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) manifests.push(...await collectManifestFiles(child));
    else if (entry.isFile() && entry.name === "extension.json") manifests.push(child);
  }
  return manifests;
}

const files = [...new Set((await Promise.all(targets.map(collectManifestFiles))).flat())].sort();
if (files.length === 0) {
  console.error(`Keine extension.json gefunden in: ${targets.join(", ")}`);
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const label = relative(root, file);
  try {
    const raw = JSON.parse(await readFile(file, "utf8"));
    const result = extensionManifestSchema.safeParse(raw);
    if (result.success) {
      console.log(`OK  ${label}`);
      continue;
    }

    failures += 1;
    console.error(`FEHLER  ${label}`);
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<manifest>";
      console.error(`  ${path}: ${issue.message}`);
    }
  } catch (error) {
    failures += 1;
    console.error(`FEHLER  ${label}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} Extension-Manifest(e) ungültig.`);
  process.exit(1);
}

console.log(`\n${files.length} Extension-Manifest(e) gültig.`);
