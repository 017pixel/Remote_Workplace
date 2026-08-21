const legacyAliases = {
  WRAPT_PROFILES_ROOT: "WORKBENCH_PROFILES_ROOT",
  WRAPT_DEV_TAILSCALE_USER: "WORKBENCH_DEV_TAILSCALE_USER",
  WRAPT_DEV_BACKEND_URL: "WORKBENCH_DEV_BACKEND_URL",
  WRAPT_HEALTH_URL: "WORKBENCH_HEALTH_URL",
  WRAPT_BASE_URL: "WORKBENCH_BASE_URL",
  WRAPT_DATA_DIR: "WORKBENCH_DATA_DIR",
  WRAPT_API: "WORKBENCH_API",
} as const;

const legacyPathEnvironmentKeys = [
  "DATABASE_PATH",
  "DATA_DIR",
  "BROWSER_PROFILES_ROOT",
  "ORBIT_BACKUP_DIR",
  "ORBIT_ASSET_DIR",
  "FILE_GALLERY_DIR",
  "WRAPT_PROFILES_ROOT",
] as const;

function canonicalizeKnownPath(value: string): string {
  return value
    .replaceAll("/.local/share/remote-workplace", "/.local/share/wrapt")
    .replaceAll("/.workbench-profiles", "/.wrapt-profiles")
    .replaceAll("/workbench.sqlite", "/wrapt.sqlite");
}

export function canonicalizeWraptEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...input };
  for (const [canonical, legacy] of Object.entries(legacyAliases)) {
    if (result[canonical] === undefined && result[legacy as keyof NodeJS.ProcessEnv] !== undefined) {
      result[canonical] = result[legacy as keyof NodeJS.ProcessEnv];
    }
  }
  for (const key of legacyPathEnvironmentKeys) {
    const value = result[key];
    if (value !== undefined) result[key] = canonicalizeKnownPath(value);
  }
  // Die lokale Vorlage vor dem Rename kann noch den unmittelbar vorherigen
  // Produktstand enthalten. Der neue Paket-/Config-Stand ist maßgeblich.
  if (result.APP_VERSION === "0.95.0") result.APP_VERSION = "0.96.0";
  return result;
}

export const wraptEnvironmentAliases = Object.freeze({ ...legacyAliases });
