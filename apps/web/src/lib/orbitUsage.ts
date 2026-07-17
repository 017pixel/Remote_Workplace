import type { ProviderUsage } from "@workbench/contracts";

export interface OrbitUsageWindow {
  id: string;
  label: string;
  remaining: number;
}

export function orbitProviderWindows(provider: ProviderUsage | undefined): OrbitUsageWindow[] {
  return provider?.accounts.flatMap((account) => account.windows.map((window) => ({
    id: `${account.id}-${window.id}`,
    label: `${account.email ?? account.label} · ${window.label}`,
    remaining: window.remainingPercent,
  }))) ?? [];
}
