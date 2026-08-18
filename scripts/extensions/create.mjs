#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const idPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const id = process.argv[2];
const requestedDirectory = process.argv[3];

if (!id || !idPattern.test(id)) {
  console.error("Nutzung: pnpm extension:create <publisher.name> [zielordner]");
  console.error("Beispiel: pnpm extension:create benjamin.docker-monitor");
  process.exit(1);
}

const root = process.cwd();
const target = resolve(root, requestedDirectory ?? join("extensions", id));
const rel = relative(root, target);
if (rel.startsWith("..") || rel === "") {
  console.error("Der Zielordner muss innerhalb des Repositorys liegen.");
  process.exit(1);
}
if (existsSync(target)) {
  console.error(`Der Zielordner existiert bereits: ${rel}`);
  process.exit(1);
}

const [publisher, ...nameParts] = id.split(".");
const slug = nameParts.join("-");
const displayName = slug
  .split("-")
  .filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1))
  .join(" ");

const manifest = {
  manifestVersion: 1,
  id,
  name: displayName,
  version: "0.1.0",
  publisher,
  description: `${displayName} Extension für Remote Workplace.`,
  license: "MIT",
  engines: {
    remoteWorkplace: ">=0.44.0",
    extensionApi: ">=1.0.0",
  },
  trust: "developer",
  activationEvents: [],
  contributes: {
    commands: [
      {
        id: `${id}.open`,
        title: `${displayName} öffnen`,
        category: displayName,
      },
    ],
  },
};

const readme = `# ${displayName}\n\nLokale Remote-Workplace-Extension.\n\n## Regeln\n\n- Core-Dateien nur ändern, wenn eine dokumentierte Extension-API-Lücke vorliegt.\n- Nur die tatsächlich benötigten Permissions anfordern.\n- Navigation und Produkticons verwenden die Host-Icon-Registry, keine farbigen Vendor-Logos.\n- Vor Installation \`pnpm extension:validate ${rel}\` ausführen.\n- Der generierte Command ist ein Platzhalter. Entferne ihn, sobald echte Contributions definiert sind.\n\n## Nächste Schritte\n\n1. Contributions und gegebenenfalls UI-/Server-Entrypoints in \`extension.json\` definieren.\n2. Implementierung im Extension-Ordner halten.\n3. Manifest validieren und Tests ausführen.\n4. Paket in den lokalen Catalog der laufenden Workbench übernehmen und dort installieren.\n`;

await mkdir(target, { recursive: true });
await writeFile(join(target, "extension.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(join(target, "README.md"), readme, "utf8");

console.log(`Extension erstellt: ${rel}`);
console.log(`Validieren: pnpm extension:validate ${rel}`);
