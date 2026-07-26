import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { t3ChannelSchema, type T3Channel } from "@workbench/contracts";
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
  // T3 Code läuft als eine einzige Instanz hinter dem /t3-Proxy. Alle Werte sind optional,
  // damit ältere Konfigurationen ohne diesen Abschnitt weiter laden.
  t3: z.object({
    // Gewünschter Kanal. Wird über die Einstellungen gesetzt und beim nächsten
    // Neustart von scripts/sync-t3-channel.sh angewendet.
    channel: t3ChannelSchema.default("stable"),
    npmPackage: z.string().min(1).default("t3"),
    // Absoluter Pfad zur t3-Binary; ohne Angabe wird sie unter dem npm-Global-Prefix gesucht.
    cliPath: absolutePath.optional(),
    host: z.string().min(1).default("127.0.0.1"),
    port: z.number().int().positive().default(3773),
    serviceUnit: z.string().min(1).default("t3-code.service"),
    // Vorgänger-Start ohne systemd. Wird beim Kanalwechsel beendet, sonst blockiert er den Port.
    legacyLauncher: absolutePath.optional(),
    installTimeoutSeconds: z.number().int().positive().default(300),
    stopTimeoutSeconds: z.number().int().positive().default(20),
    portTimeoutSeconds: z.number().int().positive().default(30),
    healthTimeoutSeconds: z.number().int().positive().default(60),
    // prefault statt default: Fehlt der Abschnitt ganz, wird ein leeres Objekt geparst
    // und die Feld-Defaults greifen — sonst müsste hier jeder Wert ausgeschrieben werden.
  }).prefault({}),
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

const localConfigName = "workbench.local.json";
const exampleConfigName = "workbench.example.json";

/**
 * Liest den eingestellten T3-Kanal frisch von der Platte. Bewusst nicht aus `settings`,
 * denn der Wert kann sich zur Laufzeit ändern (Einstellungen → T3 Code Kanal), während
 * `settings` beim Serverstart eingefroren wird.
 */
export function readConfiguredT3Channel(configDirectory: string): T3Channel {
  return loadWorkbenchConfig(configDirectory).t3.channel;
}

/**
 * Schreibt den gewünschten Kanal nach `workbench.local.json` — nur dieses eine Feld,
 * alle übrigen Werte bleiben unverändert. Existiert noch keine lokale Datei, dient
 * `workbench.example.json` als Grundlage. Geschrieben wird über eine temporäre Datei
 * und `rename`, damit ein Abbruch keine halbe Konfiguration hinterlässt.
 */
export function persistT3Channel(configDirectory: string, channel: T3Channel): void {
  const localPath = join(configDirectory, localConfigName);
  let base: Record<string, unknown>;
  try {
    base = JSON.parse(readFileSync(localPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    base = JSON.parse(readFileSync(join(configDirectory, exampleConfigName), "utf8")) as Record<string, unknown>;
  }

  const previousT3 = (base.t3 ?? {}) as Record<string, unknown>;
  const next = { ...base, t3: { ...previousT3, channel } };
  // Erst prüfen, dann schreiben: eine ungültige Datei würde den nächsten Serverstart verhindern.
  workbenchConfigSchema.parse(next);

  const temporaryPath = `${localPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, localPath);
}
