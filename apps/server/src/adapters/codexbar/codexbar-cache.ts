import type { ProviderUsage, UsageResponse } from "@workbench/contracts";
import type { CodexbarClient } from "./codexbar-client.js";
import { CodexbarError } from "./codexbar-errors.js";
import { mergeCodexPrimaryWindows } from "./codex-oauth-primary-window.js";
import type { CodexOAuthPrimaryWindowFallback } from "./codex-oauth-primary-window.js";
import { normalizeProviderUsage, unavailableUsage } from "./normalize-usage.js";
import type { CodexbarPayload } from "./codexbar-schemas.js";

interface CodexbarCacheOptions {
  ttlMilliseconds: number;
  client: CodexbarClient;
  primaryWindowFallback?: CodexOAuthPrimaryWindowFallback;
}

export interface CodexbarUsageService {
  getUsage(): Promise<UsageResponse>;
  invalidate(): void;
}

function staleProvider(provider: ProviderUsage): ProviderUsage {
  if (provider.status === "unavailable") return provider;
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

  const refresh = async (): Promise<UsageResponse> => {
    const [codex, opencode] = await Promise.allSettled([
      options.client.getUsage("codex"),
      options.client.getUsage("opencodego"),
    ]);
    const codexPayloads = codex.status === "fulfilled"
      ? await enrichCodexPrimaryWindow(codex.value, options.primaryWindowFallback)
      : undefined;
    const providers = [
      codex.status === "fulfilled"
        ? normalizeProviderUsage("codex", codexPayloads ?? codex.value)
        : unavailableUsage("codex", errorCode(codex.reason), "CodexBar ist für Codex momentan nicht erreichbar."),
      opencode.status === "fulfilled"
        ? normalizeProviderUsage("opencode", opencode.value)
        : unavailableUsage("opencode", errorCode(opencode.reason), "CodexBar ist für OpenCode Go momentan nicht erreichbar."),
    ];
    if (providers.every((provider) => provider.status === "unavailable")) {
      throw new CodexbarError("CODEXBAR_UNAVAILABLE", "CodexBar ist momentan nicht erreichbar.");
    }
    const now = new Date().toISOString();
    return { providers, fetchedAt: now, lastSuccessfulFetchAt: now, cached: false };
  };

  return {
    invalidate() {
      expiresAt = 0;
    },
    async getUsage() {
      if (cached && Date.now() < expiresAt) return { ...cached, cached: true };
      if (pending) return pending;
      pending = refresh()
        .then((fresh) => {
          cached = fresh;
          expiresAt = Date.now() + options.ttlMilliseconds;
          return fresh;
        })
        .catch((error: unknown) => {
          if (cached) {
            return { ...cached, providers: cached.providers.map(staleProvider), cached: true };
          }
          const code = errorCode(error);
          const now = new Date().toISOString();
          const unavailable: UsageResponse = {
            providers: [
              unavailableUsage("codex", code, "CodexBar ist momentan nicht erreichbar."),
              unavailableUsage("opencode", code, "CodexBar ist momentan nicht erreichbar."),
            ],
            fetchedAt: now,
            lastSuccessfulFetchAt: null,
            cached: false,
          };
          cached = unavailable;
          expiresAt = Date.now() + options.ttlMilliseconds;
          return unavailable;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
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
