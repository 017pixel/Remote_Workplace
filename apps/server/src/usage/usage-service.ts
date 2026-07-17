import type { UsageDashboardResponse, UsageForecast, UsageRange, UsageResponse } from "@workbench/contracts";
import type { CodexbarClient } from "../adapters/codexbar/codexbar-client.js";
import type { CodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import type { UsageDatabase } from "./database.js";

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
  constructor(private readonly options: { database: UsageDatabase; client: CodexbarClient; live: CodexbarUsageService; intervalMilliseconds: number }) {}

  start() { void this.sync(); this.timer = setInterval(() => void this.sync(), this.options.intervalMilliseconds); this.timer.unref(); }
  async stop() { if (this.timer) clearInterval(this.timer); await this.syncing; }
  async sync() {
    if (this.syncing) return this.syncing;
    this.syncing = this.runSync().finally(() => { this.syncing = undefined; });
    return this.syncing;
  }
  private async runSync() {
    const capturedAt = new Date().toISOString();
    const [codexUsage, openCodeUsage, codexCost, openCodeCost, projectCost] = await Promise.allSettled([
      this.options.client.getUsage("codex"), this.options.client.getUsage("opencodego"),
      this.options.client.getCost("codex"), this.options.client.getCost("opencodego"), this.options.client.getProjectCost("codex"),
    ]);
    if (codexUsage.status === "fulfilled") this.options.database.importUsage("codex", codexUsage.value, capturedAt);
    if (openCodeUsage.status === "fulfilled") this.options.database.importUsage("opencode", openCodeUsage.value, capturedAt);
    if (codexCost.status === "fulfilled") this.options.database.importCost(codexCost.value);
    if (openCodeCost.status === "fulfilled") this.options.database.importCost(openCodeCost.value);
    if (projectCost.status === "fulfilled") this.options.database.importCost(projectCost.value);
  }
  async dashboard(range: UsageRange): Promise<UsageDashboardResponse> {
    const live: UsageResponse = await this.options.live.getUsage(); const history = this.options.database.dashboard(range);
    const forecasts = enrichAndDeduplicateForecasts(this.options.database.forecasts(), live);
    return { live, range, ...history, forecasts, resetCredits: this.options.database.resetCredits() };
  }
}
