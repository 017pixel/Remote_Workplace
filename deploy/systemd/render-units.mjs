#!/usr/bin/env node
// Rendert die systemd-Unit-Templates aus deploy/systemd/units/ in
// deploy/systemd/generated/ und füllt dabei die __TOKEN__-Platzhalter mit
// den Werten aus config/workbench.local.json (Fallback: workbench.example.json)
// sowie dem aktuellen Benutzer/Home und dem gefundenen pnpm-Pfad.
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const configDir = join(repoRoot, "config");

function loadConfig() {
  for (const name of ["workbench.local.json", "workbench.example.json"]) {
    try {
      return JSON.parse(readFileSync(join(configDir, name), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error("config/workbench.local.json oder .example.json fehlt.");
}

function which(binary, fallback) {
  try {
    return execSync(`command -v ${binary}`, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const config = loadConfig();
const user = process.env.SUDO_USER || userInfo().username;
const home = config.system?.homeDirectory || process.env.HOME || `/home/${user}`;

const tokens = {
  __USER__: user,
  __GROUP__: user,
  __HOME__: home,
  __REPO_ROOT__: repoRoot,
  __PNPM_BIN__: which("pnpm", "/usr/bin/pnpm"),
  __CODEXBAR_BIN__: config.cli?.codexbar || which("codexbar", `${home}/.local/bin/codexbar`),
  __CODE_SERVER_BIN__: which("code-server", `${home}/.local/bin/code-server`),
};

const templatesDir = join(here, "units");
const outputDir = join(here, "generated");
mkdirSync(outputDir, { recursive: true });

const rendered = [];
for (const file of readdirSync(templatesDir)) {
  if (!file.endsWith(".template")) continue;
  let content = readFileSync(join(templatesDir, file), "utf8");
  for (const [token, value] of Object.entries(tokens)) {
    content = content.replaceAll(token, value);
  }
  const outName = file.replace(/\.template$/, "");
  writeFileSync(join(outputDir, outName), content);
  rendered.push(outName);
}

console.log(`Gerenderte Units in deploy/systemd/generated/: ${rendered.join(", ")}`);
