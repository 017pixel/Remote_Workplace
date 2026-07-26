import { t3ChannelStatusResponseSchema, type T3Channel, type T3ChannelStatusResponse } from "@workbench/contracts";
import { execa } from "execa";
import { persistT3Channel, readConfiguredT3Channel } from "../config/workbench-config.js";
import { settings } from "../config/settings.js";
import { createAsyncCache } from "../utils/cache.js";
import { AppError } from "../utils/errors.js";

// npm veröffentlicht Nightlies als Vorabversion (z. B. 0.0.29-nightly.20260725.899).
// Der Kanal lässt sich damit ohne Registry-Abfrage aus der installierten Version ableiten —
// wichtig, weil der Status auch offline stimmen muss.
export function channelFromVersion(version: string): T3Channel {
  return /-nightly\b/i.test(version) ? "nightly" : "stable";
}

// Aus "t3 v0.0.28" bzw. "0.0.29-nightly.20260725.899" die reine Version herausziehen.
const versionPattern = /\d+\.\d+\.\d+[\w.-]*/;

export function parseVersionOutput(output: string): string | null {
  return versionPattern.exec(output.trim())?.[0] ?? null;
}

const VERSION_TIMEOUT_MS = 10_000;

async function readInstalledVersion(): Promise<string | null> {
  try {
    const result = await execa(settings.t3CliPath, ["--version"], {
      reject: false,
      shell: false,
      timeout: VERSION_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) return null;
    return parseVersionOutput(`${result.stdout}\n${result.stderr}`);
  } catch {
    // Nicht installiert oder nicht ausführbar — beides ist ein gültiger Zustand.
    return null;
  }
}

async function probeReachable(): Promise<boolean> {
  try {
    const response = await fetch(`http://${settings.t3Host}:${settings.t3Port}/`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(settings.requestTimeoutMilliseconds),
    });
    // Jede HTTP-Antwort belegt, dass die Instanz läuft — auch 401 oder 404.
    return response.status > 0;
  } catch {
    return false;
  }
}

// Der Versionsaufruf startet einen Node-Prozess; kurz cachen reicht völlig aus.
const versionCache = createAsyncCache<string | null>(settings.serviceCacheMilliseconds, readInstalledVersion);

async function status(): Promise<T3ChannelStatusResponse> {
  const [activeVersion, reachable] = await Promise.all([versionCache.get(), probeReachable()]);
  const activeChannel = activeVersion === null ? null : channelFromVersion(activeVersion);
  const configuredChannel = readConfiguredT3Channel(settings.configDirectory);
  return t3ChannelStatusResponseSchema.parse({
    configuredChannel,
    activeChannel,
    activeVersion,
    installed: activeVersion !== null,
    reachable,
    // Auch "nicht installiert" verlangt einen Neustart — dabei wird T3 installiert.
    restartRequired: activeChannel !== configuredChannel,
    serviceUnit: settings.t3ServiceUnit,
    port: settings.t3Port,
    checkedAt: new Date().toISOString(),
  });
}

// Speichert nur die Auswahl. Paketwechsel und Prozess-Neustart übernimmt der
// bestehende Neustart-Flow (scripts/sync-t3-channel.sh) — bewusst kein Auto-Neustart.
async function setChannel(channel: T3Channel): Promise<T3ChannelStatusResponse> {
  try {
    persistT3Channel(settings.configDirectory, channel);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      500,
      "T3_CHANNEL_NOT_SAVED",
      `Der Kanal konnte nicht in config/workbench.local.json gespeichert werden: ${message}`,
    );
  }
  return status();
}

export const t3ChannelService = {
  status,
  setChannel,
  // Nach einem Kanalwechsel per Neustart ist die gecachte Version veraltet.
  clearVersionCache: () => versionCache.clear(),
};
