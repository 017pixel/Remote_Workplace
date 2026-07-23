import { createHash } from "node:crypto";
import type { AccountUsage, ProviderUsage, UsageWindow } from "@workbench/contracts";
import type { CodexbarPayload } from "./codexbar-schemas.js";

type WorkbenchProvider = "codex" | "opencode" | "claude";

const providerMetadata: Record<WorkbenchProvider, { name: string; codexbarProvider: string }> = {
  codex: { name: "Codex", codexbarProvider: "codex" },
  opencode: { name: "OpenCode Go", codexbarProvider: "opencodego" },
  claude: { name: "Claude Code", codexbarProvider: "claude" },
};

function accountId(provider: WorkbenchProvider, email: string | undefined, position: number): string {
  const source = email ?? `${provider}-${position}`;
  return `${provider}-${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
}

function windowsFor(payload: CodexbarPayload): UsageWindow[] {
  const usage = payload.usage;
  if (!usage) return [];
  return (["primary", "secondary", "tertiary"] as const).flatMap((id) => {
    const window = usage[id];
    if (!window || window.usedPercent === undefined) return [];
    return [{
      id,
      label: windowLabel(id, window.windowMinutes),
      usedPercent: window.usedPercent,
      remainingPercent: Math.max(0, 100 - window.usedPercent),
      windowMinutes: window.windowMinutes ?? null,
      resetsAt: window.resetsAt ?? null,
    }];
  });
}

function windowLabel(id: UsageWindow["id"], windowMinutes: number | undefined): string {
  if (windowMinutes === 300) return "5-Stunden-Limit";
  if (windowMinutes === 10_080) return "Wochenlimit";
  if (windowMinutes === 43_200) return "Monatslimit";
  if (id === "primary") return "Aktuelles Zeitfenster";
  if (id === "secondary") return "Längerer Zeitraum";
  return "Zusätzliches Zeitfenster";
}

function unavailableProvider(providerId: WorkbenchProvider, code: string, message: string): ProviderUsage {
  const metadata = providerMetadata[providerId];
  return {
    providerId,
    providerName: metadata.name,
    status: "unavailable",
    updatedAt: null,
    accounts: [],
    error: { code, message },
  };
}

export function unavailableUsage(providerId: WorkbenchProvider, code: string, message: string): ProviderUsage {
  return unavailableProvider(providerId, code, message);
}

export function normalizeProviderUsage(providerId: WorkbenchProvider, payloads: CodexbarPayload[]): ProviderUsage {
  const metadata = providerMetadata[providerId];
  const matching = payloads.filter((payload) => payload.provider === metadata.codexbarProvider);
  if (matching.length === 0) {
    return unavailableProvider(providerId, "PROVIDER_NOT_DETECTED", "Für diesen Anbieter sind keine Nutzungsdaten verfügbar.");
  }

  const successfulRaw = matching.filter((payload) => payload.usage !== undefined && (
    payload.usage.primary?.usedPercent !== undefined
    || payload.usage.secondary?.usedPercent !== undefined
    || payload.usage.tertiary?.usedPercent !== undefined
  ));
  const successfulByIdentity = new Map<string, CodexbarPayload>();
  successfulRaw.forEach((payload, index) => {
    const identity = payload.usage?.accountEmail ?? payload.usage?.identity?.accountEmail ?? payload.account ?? `position-${index}`;
    const existing = successfulByIdentity.get(identity.toLowerCase());
    const populatedWindows = (candidate: CodexbarPayload) => [candidate.usage?.primary, candidate.usage?.secondary, candidate.usage?.tertiary]
      .filter((window) => window?.usedPercent !== undefined).length;
    if (!existing || populatedWindows(payload) > populatedWindows(existing) || (existing.error && !payload.error)) {
      successfulByIdentity.set(identity.toLowerCase(), payload);
    }
  });
  const successful = [...successfulByIdentity.values()];
  if (successful.length === 0) {
    return unavailableProvider(providerId, "PROVIDER_UNAVAILABLE", "Für diesen Anbieter konnten keine Nutzungsdaten geladen werden.");
  }

  const accounts: AccountUsage[] = successful.map((payload, index) => {
    const email = payload.usage?.accountEmail ?? payload.usage?.identity?.accountEmail ?? payload.account;
    const plan = payload.usage?.loginMethod ?? payload.usage?.identity?.loginMethod ?? null;
    return {
      id: accountId(providerId, email, index),
      label: successful.length === 1 ? "Account" : `Account ${index + 1}`,
      email: email ?? null,
      plan,
      windows: windowsFor(payload),
    };
  });
  const updatedAt = successful
    .map((payload) => payload.usage?.updatedAt ?? null)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? null;
  const isPartial = accounts.some((account) => account.windows.length === 0) || successfulRaw.length !== matching.length;

  return {
    providerId,
    providerName: metadata.name,
    status: isPartial ? "partial" : "available",
    updatedAt,
    accounts,
    error: isPartial ? { code: "PARTIAL_DATA", message: "Ein Teil der Nutzungsdaten ist nicht verfügbar." } : null,
  };
}
