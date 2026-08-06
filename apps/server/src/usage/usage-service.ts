import type { UsageDashboardResponse, UsageForecast, UsageMonitoring, UsageRange, UsageResponse } from "@workbench/contracts";
import type { CodexbarClient } from "../adapters/codexbar/codexbar-client.js";
import type { CodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import type { CodexbarPayload } from "../adapters/codexbar/codexbar-schemas.js";
import type { UsageDatabase } from "./database.js";
import { readOpenCodeUsage } from "../adapters/opencode/opencode-usage.js";

export function enrichAndDeduplicateForecasts(forecasts: UsageForecast[], live: UsageResponse): UsageForecast[] {
  const deduplicated = new Map<string, { forecast: UsageForecast; score: number }>();
  for (const forecast of forecasts) {
    const provider = live.providers.find((candidate) => candidate.providerId === forecast.providerId);
    const account = provider?.accounts.find((candidate) => candidate.email === forecast.accountId || candidate.id === forecast.accountId)
      ?? (provider?.accounts.length === 1 ? provider.accounts[0] : undefined);
    const window = account?.windows.find((candidate) => candidate.id === forecast.windowId);
    const enriched = {
      ...forecast,
      accountLabel: account?.email ?? account?.label ?? forecast.accountLabel,
      windowLabel: window?.label ?? forecast.windowLabel,
    };
    const identity = `${forecast.providerId}|${account?.id ?? forecast.accountId}|${forecast.windowId}`;
    const exactAccount = account?.email === forecast.accountId || account?.id === forecast.accountId;
    const exactReset = window?.resetsAt === forecast.resetsAt;
    const score = (exactAccount ? 10_000 : 0) + (exactReset ? 1_000 : 0) + forecast.sampleCount;
    const current = deduplicated.get(identity);
    if (!current || score > current.score) deduplicated.set(identity, { forecast: enriched, score });
  }
  return [...deduplicated.values()].map((entry) => entry.forecast);
}

export class UsageAnalyticsService {
  private timer?: NodeJS.Timeout;
  private syncing: Promise<void> | undefined;
  constructor(private readonly options: { database: UsageDatabase; client: CodexbarClient; live: CodexbarUsageService; intervalMilliseconds: number; monitoring: () => UsageMonitoring; opencodeUsagePath?: string }) {}

  start() { void this.sync(); this.timer = setInterval(() => void this.sync(), this.options.intervalMilliseconds); this.timer.unref(); }
  async stop() { if (this.timer) clearInterval(this.timer); await this.syncing; }
  async sync() {
    if (this.syncing) return this.syncing;
    this.syncing = this.runSync().finally(() => { this.syncing = undefined; });
    return this.syncing;
  }
  private async runSync() {
    const capturedAt = new Date().toISOString();
    const monitoring = this.options.monitoring();
    // Für deaktivierte Anbieter werden keine Limitfenster mehr abgefragt oder gespeichert.
    // Kosten und Token bleiben davon unberührt — das ist Nutzungsanalyse, keine Limitüberwachung.
    const [codexUsage, openCodeUsage, claudeUsage, codexCost, openCodeCost, claudeCost, codexProjectCost, claudeProjectCost] = await Promise.allSettled([
      monitoring.codex ? this.options.client.getUsage("codex") : Promise.resolve<CodexbarPayload[]>([]),
      monitoring.opencode ? this.options.client.getUsage("opencodego") : Promise.resolve<CodexbarPayload[]>([]),
      monitoring.claude ? this.options.client.getUsage("claude") : Promise.resolve<CodexbarPayload[]>([]),
      this.options.client.getCost("codex"), this.options.client.getCost("opencodego"), this.options.client.getCost("claude"),
      this.options.client.getProjectCost("codex"), this.options.client.getProjectCost("claude"),
    ]);
    if (monitoring.codex && codexUsage.status === "fulfilled") this.options.database.importUsage("codex", codexUsage.value, capturedAt);
    if (monitoring.opencode && openCodeUsage.status === "fulfilled") this.options.database.importUsage("opencode", openCodeUsage.value, capturedAt);
    if (monitoring.claude && claudeUsage.status === "fulfilled") this.options.database.importUsage("claude", claudeUsage.value, capturedAt);
    if (codexCost.status === "fulfilled") this.options.database.importCost(codexCost.value, "daily");
    if (openCodeCost.status === "fulfilled") this.options.database.importCost(openCodeCost.value, "daily");
    if (claudeCost.status === "fulfilled") this.options.database.importCost(claudeCost.value, "daily");
    if (codexProjectCost.status === "fulfilled") this.options.database.importCost(codexProjectCost.value, "projects");
    if (claudeProjectCost.status === "fulfilled") this.options.database.importCost(claudeProjectCost.value, "projects");
    // OpenCode Go liefert in CodexBar keine Kosten- und Projektstatistik. Die
    // lokale OpenCode-Datenbank führt stattdessen Sessiondaten mit Modell,
    // Tokens und Kosten; daraus wird die gleiche Aufschlüsselung gespeist.
    if (this.options.opencodeUsagePath) {
      const openCodeLocal = readOpenCodeUsage(this.options.opencodeUsagePath);
      if (openCodeLocal) this.options.database.importCost([openCodeLocal], "both");
    }
  }
  async dashboard(range: UsageRange): Promise<UsageDashboardResponse> {
    const live: UsageResponse = await this.options.live.getUsage();
    const history = this.options.database.dashboard(range);
    const monitoring = this.options.monitoring();
    // Prognosen ausgelaufener Limitfenster gehören zur Limitüberwachung. Für pauschal
    // deaktivierte Anbieter bleiben sie ausgeblendet, statt aus alten Messreihen weiterzulaufen.
    const forecasts = enrichAndDeduplicateForecasts(this.options.database.forecasts(), live)
      .filter((forecast) => monitoring[forecast.providerId]);
    return { live, range, ...history, forecasts, resetCredits: this.options.database.resetCredits() };
  }
}
