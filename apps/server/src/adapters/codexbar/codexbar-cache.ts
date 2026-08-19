import type { ProviderUsage, UsageMonitoring, UsageResponse } from "@wrapt/contracts";
import type { CodexbarClient } from "./codexbar-client.js";
import { CodexbarError } from "./codexbar-errors.js";
import { mergeCodexPrimaryWindows } from "./codex-oauth-primary-window.js";
import type { CodexOAuthPrimaryWindowFallback } from "./codex-oauth-primary-window.js";
import { disabledUsage, normalizeProviderUsage, unavailableUsage } from "./normalize-usage.js";
import type { CodexbarPayload } from "./codexbar-schemas.js";

interface CodexbarCacheOptions {
  ttlMilliseconds: number;
  client: CodexbarClient;
  primaryWindowFallback?: CodexOAuthPrimaryWindowFallback;
  monitoring?: () => UsageMonitoring;
}

export interface CodexbarUsageService {
  getUsage(): Promise<UsageResponse>;
  invalidate(): void;
}

function staleProvider(provider: ProviderUsage): ProviderUsage {
  if (provider.status === "unavailable" || provider.status === "disabled") return provider;
  return {
    ...provider,
    status: "partial",
    error: { code: "CACHED_DATA", message: "Die zuletzt erfolgreichen Daten werden angezeigt." },
  };
}

export function createCodexbarUsageService(options: CodexbarCacheOptions): CodexbarUsageService {
  let expiresAt = 0;
  let cached: UsageResponse | undefined;
  let pending: Promise<UsageResponse> | undefined;

  const startRefresh = (): Promise<UsageResponse> => {
    pending = refresh()
      .then((fresh) => {
        cached = fresh;
        expiresAt = Date.now() + options.ttlMilliseconds;
        return fresh;
      })
      .catch((error: unknown) => {
        if (cached) {
          // Fehler bei vorhandenen Daten: letzten erfolgreichen Stand mit
          // stale-Markierung liefern, statt den Cache zu verwerfen.
          return { ...cached, providers: cached.providers.map(staleProvider), cached: true };
        }
        const code = errorCode(error);
        const now = new Date().toISOString();
        const monitoring = options.monitoring?.() ?? { codex: true, opencode: true, claude: true };
        const unavailable = (provider: "codex" | "opencode" | "claude") => monitoring[provider]
          ? unavailableUsage(provider, code, "CodexBar ist momentan nicht erreichbar.")
          : disabledUsage(provider);
        const allUnavailable: UsageResponse = {
          providers: [unavailable("codex"), unavailable("opencode"), unavailable("claude")],
          fetchedAt: now,
          lastSuccessfulFetchAt: null,
          cached: false,
        };
        cached = allUnavailable;
        expiresAt = Date.now() + options.ttlMilliseconds;
        return allUnavailable;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };

  const refresh = async (): Promise<UsageResponse> => {
    const monitoring = options.monitoring?.() ?? { codex: true, opencode: true, claude: true };
    // Deaktivierte Anbieter werden gar nicht erst abgefragt und als "disabled" gemeldet.
    const codex = monitoring.codex
      ? options.client.getUsage("codex")
          .then(async (payloads) => enrichCodexPrimaryWindow(payloads, options.primaryWindowFallback))
          .then((payloads) => normalizeProviderUsage("codex", payloads))
          .catch((reason: unknown) => unavailableUsage("codex", errorCode(reason), "CodexBar ist für Codex momentan nicht erreichbar."))
      : Promise.resolve(disabledUsage("codex"));
    const opencode = monitoring.opencode
      ? options.client.getUsage("opencodego")
          .then((payloads) => normalizeProviderUsage("opencode", payloads))
          .catch((reason: unknown) => unavailableUsage("opencode", errorCode(reason), "CodexBar ist für OpenCode Go momentan nicht erreichbar."))
      : Promise.resolve(disabledUsage("opencode"));
    const claude = monitoring.claude
      ? options.client.getUsage("claude")
          .then((payloads) => normalizeProviderUsage("claude", payloads))
          .catch((reason: unknown) => unavailableUsage("claude", errorCode(reason), "CodexBar ist für Claude Code momentan nicht erreichbar."))
      : Promise.resolve(disabledUsage("claude"));
    const providers = await Promise.all([codex, opencode, claude]);
    // Nur nicht-deaktivierte Anbieter zählen für den Ausfall. Sind alle drei bewusst
    // deaktiviert, ist das kein CodexBar-Fehler.
    const active = providers.filter((provider) => provider.status !== "disabled");
    if (active.length > 0 && active.every((provider) => provider.status === "unavailable")) {
      throw new CodexbarError("CODEXBAR_UNAVAILABLE", "CodexBar ist momentan nicht erreichbar.");
    }
    const now = new Date().toISOString();
    return { providers, fetchedAt: now, lastSuccessfulFetchAt: now, cached: false };
  };

  return {
    invalidate() {
      // Cache als abgelaufen markieren und sofort im Hintergrund aktualisieren.
      // Vorhandene Daten bleiben erhalten, damit kein aufrufender Request wartet.
      expiresAt = 0;
      if (cached && !pending) void startRefresh();
    },
    async getUsage() {
      // Stale-while-revalidate: Liegt ein Cache vor, wird er sofort geliefert.
      // Ein abgelaufener Cache stößt den Refresh im Hintergrund an, statt den
      // Request zu blockieren. Nur ohne jede Vorgeschichte wird einmal geladen.
      if (cached) {
        if (Date.now() >= expiresAt && !pending) void startRefresh();
        return { ...cached, cached: true };
      }
      if (pending) return pending;
      return startRefresh();
    },
  };
}

function errorCode(error: unknown): string {
  return error instanceof CodexbarError ? error.code : "CODEXBAR_UNAVAILABLE";
}

async function enrichCodexPrimaryWindow(
  payloads: CodexbarPayload[],
  fallback: CodexOAuthPrimaryWindowFallback | undefined,
): Promise<CodexbarPayload[]> {
  if (!fallback || payloads.every((payload) => payload.usage?.primary?.usedPercent !== undefined)) return payloads;
  try {
    return mergeCodexPrimaryWindows(payloads, await fallback.getPrimaryWindows());
  } catch {
    return payloads;
  }
}
