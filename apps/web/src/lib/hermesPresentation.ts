import type { HermesSessionSource } from "@workbench/contracts";

export const hermesSourceLabels: Record<HermesSessionSource, string> = {
  web: "Web",
  cli: "CLI",
  telegram: "Telegram",
  cron: "Cron",
  acp: "Chat",
  other: "Sonstiges",
};
