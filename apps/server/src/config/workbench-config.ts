import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const absolutePath = z.string().startsWith("/");

export const workbenchConfigSchema = z.object({
  branding: z.object({
    appName: z.string().min(1),
    shortName: z.string().min(1),
  }),
  system: z.object({
    user: z.string().min(1),
    homeDirectory: absolutePath,
  }),
  tailscale: z.object({
    hostname: z.string().min(1),
    ip: z.string().min(1),
    httpsPort: z.number().int().positive(),
    allowedUsers: z.array(z.string().min(1)),
  }),
  paths: z.object({
    projectsRoot: absolutePath,
    orbitProjectBrowserRoot: absolutePath,
    terminalAllowedRoots: z.array(absolutePath),
    terminalDefaultCwd: absolutePath,
    dataDir: absolutePath,
    browserProfilesRoot: absolutePath,
    orbitBackupDir: absolutePath,
    orbitAssetDir: absolutePath,
    fileGalleryDir: absolutePath.optional(),
    workbenchProfilesRoot: absolutePath,
    databasePath: absolutePath,
  }),
  cli: z.object({
    codexbar: z.string().min(1),
    codex: z.string().min(1),
    opencode: z.string().min(1),
    claude: z.string().min(1),
    tmux: absolutePath,
    chromium: z.string().min(1),
  }),
  codexbar: z.object({
    configPath: absolutePath,
    oauthProfileHomes: z.array(absolutePath),
  }),
});

export type WorkbenchConfig = z.infer<typeof workbenchConfigSchema>;

/**
 * Lädt die zentrale Workbench-Konfiguration synchron: erst `workbench.local.json`
 * (persönliche Werte, gitignored), sonst Fallback auf das committete
 * `workbench.example.json`. Synchron, weil `settings.ts` die Werte bereits beim
 * Modul-Load als Defaults benötigt.
 */
export function loadWorkbenchConfig(configDirectory: string): WorkbenchConfig {
  const candidates = ["workbench.local.json", "workbench.example.json"];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const content = readFileSync(join(configDirectory, candidate), "utf8");
      return workbenchConfigSchema.parse(JSON.parse(content) as unknown);
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  throw lastError ?? new Error("Workbench-Konfiguration fehlt (config/workbench.local.json oder .example.json).");
}
