import type { ProviderUsage } from "@workbench/contracts";

export interface OrbitUsageWindow {
  id: string;
  label: string;
  remaining: number;
  resetsAt: string | null;
}

export function orbitProviderWindows(provider: ProviderUsage | undefined): OrbitUsageWindow[] {
  return provider?.accounts.flatMap((account) => account.windows.map((window) => ({
    id: `${account.id}-${window.id}`,
    label: `${account.email ?? account.label} · ${window.label}`,
    remaining: window.remainingPercent,
    resetsAt: window.resetsAt,
  }))) ?? [];
}

export function formatUsageReset(resetsAt: string | null): string {
  if (!resetsAt) return "Resetzeit nicht verfügbar";
  return `Reset ${new Date(resetsAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`;
}
