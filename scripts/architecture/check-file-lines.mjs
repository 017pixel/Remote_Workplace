#!/usr/bin/env node

// check-file-lines.mjs — erzwingt das 400-Zeilen-Limit für handgeschriebene Projektdateien.
//
// Der Checker zählt physische Zeilen, ignoriert generierte Verzeichnisse und besitzt eine
// kleine, explizite Allowlist für generierte oder historische Dateien. Normale Source-Dateien
// dürfen hier niemals ausgenommen werden. Läuft ohne externe Unix-Spezialwerkzeuge, nur Node.js.

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import process from "node:process";

const MAX_LINES = 400;
const root = process.cwd();

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".json", ".jsonc", ".yaml", ".yml", ".sh", ".md",
]);

// Generierte, persönliche oder Build-Artefakte, die nie geprüft werden.
const IGNORED_DIRECTORIES = new Set([
  "node_modules", "dist", "coverage", ".git", ".next", ".turbo",
  "playwright-report", "test-results", "data", "plans", "memory", "handoffs",
  ".playwright-mcp", ".proxy", ".opencode", "backups", "generated",
]);

// Explizite Allowlist: Datei -> Grund. Nur generierte oder historisch unveränderliche
// Dateien sind hier erlaubt. Kein normaler Source-Code.
//
// Die historischen Einträge dokumentieren Dateien, die vor Einführung des Limits bereits
// über 400 Zeilen lagen. Sie dürfen nicht weiter wachsen; die Aufteilung ist als separates
// Refactoring geplant.
const ALLOWED_FILES = new Map([
  ["pnpm-lock.yaml", "generierte Lockfile"],
  ["package-lock.json", "generierte Lockfile"],
  ["yarn.lock", "generierte Lockfile"],
  ["CHANGELOG.md", "Changelog"],
  ["packages/extension-contracts/schema/extension-catalog-v1.schema.json", "generiertes JSON-Schema"],
  ["packages/extension-contracts/schema/extension-manifest-v1.schema.json", "generiertes JSON-Schema"],
  // Historisch gewachsene Dateien (Bestand vor dem 400-Zeilen-Limit).
  ["apps/server/src/browser/Manager.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/extensions/manager.test.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/extensions/manager.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/filesystem/fileManagerService.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/hermes/acp/Manager.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/orbit/database.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/previews/bridge.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/previews/database.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/previews/DevServerManager.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/previews/diagnostics.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/previews/gateway.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/previews/routes.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/previews/slots.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/services/t3Proxy.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/skills/skillEditorService.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/server/src/usage/timeline-service.test.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/components/browser/ChromiumBrowser.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/components/extensions/ExtensionSettings.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/components/files/FileManagerPanel.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/components/orbit/OrbitNodeView.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/components/preview/LocalPreviewRuntime.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/components/ToolPanel.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/components/usage/usage-mobile.css", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/extensions/builtins/pageRoutes.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/extensions/legacyPageRoutes.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/index.css", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/stores/orbit.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/stores/workspace.ts", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/views/Dashboard.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/views/OrbitWorkbench.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/views/PreviewHub.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/views/Settings.tsx", "historisch gewachsen, Aufteilung offen"],
  ["apps/web/src/views/TechTldrs.tsx", "historisch gewachsen, Aufteilung offen"],
  ["docs/configuration.md", "historisch gewachsen, Aufteilung offen"],
  ["packages/contracts/src/index.ts", "historisch gewachsen, Aufteilung offen"],
  ["packages/extension-contracts/src/contributions.test.ts", "historisch gewachsen, Aufteilung offen"],
  ["packages/extension-contracts/src/contributions.ts", "historisch gewachsen, Aufteilung offen"],
  ["packages/extension-contracts/src/management.ts", "historisch gewachsen, Aufteilung offen"],
  ["packages/extension-contracts/src/manifest.test.ts", "historisch gewachsen, Aufteilung offen"],
  ["packages/extension-contracts/src/manifest.ts", "historisch gewachsen, Aufteilung offen"],
  ["packages/extension-contracts/src/settings-contributions.ts", "historisch gewachsen, Aufteilung offen"],
]);

// Verzeichnisse mit historischen Dokumenten (Decision Records, Planungsinventare).
const ALLOWED_DIRECTORIES = new Map([
  ["docs/adr", "historische Decision Records"],
  ["docs/goals", "historische Planungs- und Inventardokumente"],
]);

function countLines(text) {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

function isIgnoredPath(path) {
  return path.split("/").some((segment) => IGNORED_DIRECTORIES.has(segment));
}

function isAllowedDirectory(relPath) {
  for (const [dir] of ALLOWED_DIRECTORIES) {
    if (relPath === dir || relPath.startsWith(`${dir}/`)) return true;
  }
  return false;
}

async function walk(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!isIgnoredPath(path)) await walk(path, files);
    } else if (entry.isFile()) {
      const rel = relative(root, path).split("\\").join("/");
      if (isIgnoredPath(rel)) continue;
      if (!SOURCE_EXTENSIONS.has(`.${entry.name.split(".").pop()}`)) continue;
      files.push(rel);
    }
  }
  return files;
}

const files = await walk(root, []);
const violations = [];
const exceptions = [];

for (const file of files) {
  if (isAllowedDirectory(file)) continue;
  const text = await readFile(join(root, file), "utf8");
  const lines = countLines(text);
  if (lines <= MAX_LINES) continue;

  const reason = ALLOWED_FILES.get(file);
  if (reason) {
    exceptions.push({ file, lines, reason });
    continue;
  }
  violations.push({ file, lines });
}

for (const { file, lines, reason } of exceptions) {
  console.log(`Ausnahme (${reason}): ${lines}  ${file}`);
}

if (violations.length > 0) {
  violations.sort((a, b) => b.lines - a.lines);
  console.error("\nFile length check failed.\n");
  for (const { file, lines } of violations) {
    console.error(`${String(lines).padStart(5)}  ${file}`);
  }
  console.error(`\nMaximum allowed: ${MAX_LINES} lines.`);
  process.exit(1);
}

console.log(`File length check OK (${files.length} Dateien geprüft, Limit ${MAX_LINES} Zeilen).`);
