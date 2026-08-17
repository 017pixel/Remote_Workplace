#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceRoot = resolve(root, "apps/web/src");
const extensionsRoot = resolve(sourceRoot, "extensions");
const boundaryFile = resolve(extensionsRoot, "builtinContributions.ts");
const violations = [];

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const files = await sourceFiles(sourceRoot);
for (const file of files) {
  if (file.startsWith(`${extensionsRoot}/`)) continue;
  if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(file)) continue;
  const text = await readFile(file, "utf8");
  if (/from\s+["'][^"']*extensions\/legacy[^"']*["']/.test(text)) {
    violations.push(`${relative(root, file)} importiert direkt eine legacy Extension-Bridge.`);
  }
  if (/bootstrapLegacy[A-Za-z0-9_]*/.test(text)) {
    violations.push(`${relative(root, file)} ruft einen Legacy-Bootstrap außerhalb der Extension-Boundary auf.`);
  }
}

const boundary = await readFile(boundaryFile, "utf8");
const requiredBootstraps = [
  "bootstrapLegacyPageRoutes",
  "bootstrapLegacyNavigation",
  "bootstrapLegacyCommands",
  "bootstrapLegacyStatusBar",
  "bootstrapLegacyTopbar",
  "bootstrapLegacyContextMenus",
  "bootstrapLegacyDashboardSections",
  "bootstrapLegacySettingsCards",
  "bootstrapLegacyOrbitPalette",
];

for (const bootstrap of requiredBootstraps) {
  if (!boundary.includes(bootstrap)) {
    violations.push(`builtinContributions.ts enthält ${bootstrap} nicht mehr. Migration oder Entfernung muss explizit erfolgen.`);
  }
}

const main = await readFile(resolve(sourceRoot, "main.tsx"), "utf8");
if (!main.includes('from "./extensions/builtinContributions"')) {
  violations.push("main.tsx verwendet nicht die zentrale Builtin-Contribution-Boundary.");
}
if (!main.includes("bootstrapBuiltinContributions();")) {
  violations.push("main.tsx bootstrapped Builtin Contributions nicht zentral.");
}

if (violations.length > 0) {
  console.error("Extension-Kernel-Boundary verletzt:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Extension-Kernel-Boundary OK.");
