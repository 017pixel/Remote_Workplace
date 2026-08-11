import type { HermesSession, HermesSessionSource } from "@workbench/contracts";

export type HermesSurface = "chat" | "tasks" | "history" | "cron" | "admin";

export const hermesSurfaces = ["chat", "tasks", "history", "cron", "admin"] as const satisfies readonly HermesSurface[];

export const hermesSourceLabels: Record<HermesSessionSource, string> = {
  web: "Web",
  cli: "CLI",
  telegram: "Telegram",
  cron: "Cron",
  acp: "Chat",
  other: "Sonstiges",
};

export function normalizeHermesSurface(value: unknown, fallback: HermesSurface = "chat"): HermesSurface {
  return typeof value === "string" && hermesSurfaces.includes(value as HermesSurface) ? value as HermesSurface : fallback;
}

export function resolveHermesSurface(options: {
  urlSurface: string | null;
  sessionId: string | null;
  panelSurface?: string | null | undefined;
  storedSurface: HermesSurface;
}): HermesSurface {
  if (options.sessionId) return "chat";
  return normalizeHermesSurface(options.urlSurface ?? options.panelSurface ?? options.storedSurface);
}

export function formatHermesDateTime(value: string | null): string {
  if (!value) return "–";
  const date = new Date(value);
  return `${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}

export function formatHermesShortDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

export function hermesSessionStatusLabel(status: HermesSession["status"]): string {
  if (status === "failed") return "fehlgeschlagen";
  if (status === "running") return "läuft";
  if (status === "idle") return "abgeschlossen";
  return "unbekannt";
}
