import { type UsageMonitoring } from "@wrapt/contracts";
import { persistUsageMonitoring, readUsageMonitoring } from "../config/wrapt-config.js";
import { settings } from "../config/settings.js";
import { AppError } from "../utils/errors.js";

/**
 * Laufzeit-Halter der Limitüberwachung. Der Wert kommt aus der zentralen Config und kann
 * sich zur Laufzeit ändern (Einstellungen → Limitüberwachung), ohne dass `settings` (beim
 * Serverstart eingefroren) neu geladen werden muss. Der Analytics-Sync und der Live-Cache
 * lesen über `get()` immer den aktuellen Stand.
 */
class UsageMonitoringService {
  private cached: UsageMonitoring | null = null;

  get(): UsageMonitoring {
    if (this.cached) return this.cached;
    this.cached = readUsageMonitoring(settings.configDirectory);
    return this.cached;
  }

  update(next: UsageMonitoring): UsageMonitoring {
    try {
      persistUsageMonitoring(settings.configDirectory, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError(
        500,
        "USAGE_MONITORING_NOT_SAVED",
        `Die Limitüberwachung konnte nicht in config/wrapt.local.json gespeichert werden: ${message}`,
      );
    }
    this.cached = next;
    return next;
  }
}

export const usageMonitoringService = new UsageMonitoringService();
