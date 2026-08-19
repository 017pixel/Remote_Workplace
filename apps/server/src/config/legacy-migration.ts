import { chmodSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const WRAPT_LOCAL_CONFIG = "wrapt.local.json";
export const LEGACY_LOCAL_CONFIG = "workbench.local.json";
export const WRAPT_EXAMPLE_CONFIG = "wrapt.example.json";

const legacyDataRoot = "/.local/share/remote-workplace";
const wraptDataRoot = "/.local/share/wrapt";

function replaceKnownPath(value: string): string {
  let next = value;
  if (next.endsWith("/.workbench-profiles")) {
    next = next.slice(0, -"/.workbench-profiles".length) + "/.wrapt-profiles";
  }
  if (next.includes(legacyDataRoot)) next = next.replaceAll(legacyDataRoot, wraptDataRoot);
  if (next.includes("remote-workplace-browser-profiles")) next = next.replaceAll("remote-workplace-browser-profiles", "wrapt-browser-profiles");
  if (next.endsWith("/workbench.sqlite")) next = `${next.slice(0, -"/workbench.sqlite".length)}/wrapt.sqlite`;
  return next;
}

function migrateValue(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (key === "appName") return "Wrapt";
    if (key === "shortName") return "Wrapt";
    return replaceKnownPath(value);
  }
  if (Array.isArray(value)) return value.map((item) => migrateValue(item));
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (entryKey === "workbench" && key === "sources") {
      result.wrapt = migrateValue(entryValue, entryKey);
      continue;
    }
    if (entryKey === "workbenchProfilesRoot") {
      result.wraptProfilesRoot = migrateValue(entryValue, entryKey);
      continue;
    }
    result[entryKey] = migrateValue(entryValue, entryKey);
  }
  return result;
}

function writePrivateJson(path: string, value: unknown): void {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export interface ConfigMigrationResult {
  readonly path: string;
  readonly migrated: boolean;
  readonly conflict: boolean;
}

/**
 * Migriert die alte persönliche Config nur dann, wenn keine kanonische Datei
 * existiert. Beide Dateien bleiben bei einem Konflikt erhalten, die neue Datei
 * gewinnt nach einem Hinweis. Secrets werden als undurchsichtige JSON-Werte
 * übernommen und nie geloggt.
 */
export function ensureWraptLocalConfig(configDirectory: string, validate: (value: unknown) => unknown): ConfigMigrationResult {
  const target = join(configDirectory, WRAPT_LOCAL_CONFIG);
  const legacy = join(configDirectory, LEGACY_LOCAL_CONFIG);
  const hasTarget = existsSync(target);
  const hasLegacy = existsSync(legacy);

  if (hasTarget) {
    const targetValue = migrateValue(readJson(target));
    validate(targetValue);
    // Die kanonische Datei bleibt maßgeblich. Nur bekannte Branding- und
    // Pfadfelder werden darin atomar normalisiert; persönliche Werte und
    // Secrets werden nicht aus der Legacy-Datei übernommen.
    if (JSON.stringify(targetValue) !== JSON.stringify(readJson(target))) writePrivateJson(target, targetValue);
    if (!hasLegacy) return { path: target, migrated: false, conflict: false };

    const legacyValue = validate(migrateValue(readJson(legacy)));
    const conflict = JSON.stringify(targetValue) !== JSON.stringify(legacyValue);
    if (conflict) console.warn("Wrapt: wrapt.local.json und die alte workbench.local.json unterscheiden sich. Die kanonische Wrapt-Datei bleibt maßgeblich.");
    return { path: target, migrated: false, conflict };
  }
  if (!hasLegacy) return { path: target, migrated: false, conflict: false };

  const migratedValue = migrateValue(readJson(legacy));
  validate(migratedValue);
  writePrivateJson(target, migratedValue);
  return { path: target, migrated: true, conflict: false };
}

export function migrateLegacyConfigValue(value: unknown): unknown {
  return migrateValue(value);
}

function moveIfAbsent(source: string, target: string): boolean {
  if (!existsSync(source) || existsSync(target)) return false;
  try {
    renameSync(source, target);
    return true;
  } catch {
    // Ein unsicherer oder geräteübergreifender Move wird nicht durch Kopieren
    // ersetzt: Der nächste Start kann ihn erneut versuchen, ohne Daten zu löschen.
    return false;
  }
}

function moveDirectoryContentsIfAbsent(source: string, target: string): void {
  if (!existsSync(source)) return;
  try {
    for (const name of readdirSync(source)) moveIfAbsent(join(source, name), join(target, name));
  } catch {
    // Best effort; ein nicht zugänglicher Legacy-Ordner bleibt erhalten.
  }
}

function migrateDatabaseName(directory: string): void {
  const oldPath = join(directory, "workbench.sqlite");
  const newPath = join(directory, "wrapt.sqlite");
  if (moveIfAbsent(oldPath, newPath)) {
    for (const suffix of ["-wal", "-shm"]) moveIfAbsent(`${oldPath}${suffix}`, `${newPath}${suffix}`);
  }
}

function legacyEquivalentPath(path: string): string {
  return path
    .replaceAll("wrapt-browser-profiles", "remote-workplace-browser-profiles")
    .replace(/\/wrapt\.sqlite$/, "/workbench.sqlite");
}

function migrateDatabasePath(path: string): void {
  const oldPath = legacyEquivalentPath(path);
  if (oldPath === path || !moveIfAbsent(oldPath, path)) return;
  for (const suffix of ["-wal", "-shm"]) moveIfAbsent(`${oldPath}${suffix}`, `${path}${suffix}`);
}

/**
 * Verschiebt persistente Produktdaten beim ersten Start in den Wrapt-Pfad.
 * Es wird nur in eindeutig sichere, nicht überschreibende Ziele verschoben;
 * bei Konflikten bleiben beide Bestände erhalten und der nächste Start kann
 * erneut prüfen. SQLite wird inklusive WAL/SHM umbenannt.
 */
export function migrateLegacyPersistentData(
  homeDirectory: string,
  dataDirectory: string,
  profilesDirectory: string,
  browserProfilesDirectory?: string,
  databasePath?: string,
): void {
  const legacyDataDirectory = join(homeDirectory, ".local/share/remote-workplace");
  const legacyProfilesDirectory = join(homeDirectory, ".workbench-profiles");
  if (!existsSync(dataDirectory)) moveIfAbsent(legacyDataDirectory, dataDirectory);
  else moveDirectoryContentsIfAbsent(legacyDataDirectory, dataDirectory);
  migrateDatabaseName(dataDirectory);
  if (databasePath) migrateDatabasePath(databasePath);
  if (browserProfilesDirectory) {
    const legacyBrowserProfiles = legacyEquivalentPath(browserProfilesDirectory);
    if (!existsSync(browserProfilesDirectory)) moveIfAbsent(legacyBrowserProfiles, browserProfilesDirectory);
    else moveDirectoryContentsIfAbsent(legacyBrowserProfiles, browserProfilesDirectory);
  }
  if (!existsSync(profilesDirectory)) moveIfAbsent(legacyProfilesDirectory, profilesDirectory);
  else moveDirectoryContentsIfAbsent(legacyProfilesDirectory, profilesDirectory);
}
