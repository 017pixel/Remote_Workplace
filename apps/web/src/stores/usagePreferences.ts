import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { UsageProviderId } from "@workbench/contracts";

/**
 * Darstellungspräferenzen für "Nutzung & Limits".
 *
 * Nur UI-Einstellungen — keine Credentials, keine Tokens, keine Quota-Daten.
 * Wird lokal im Browser persistiert und übersteht Neustarts. Jede neue Option
 * braucht einen Default; unbekannte oder ungültige persistierte Werte werden
 * beim Laden verworfen statt zu crashen.
 */

export const USAGE_PREFERENCES_VERSION = 1;
export const USAGE_PREFERENCES_STORAGE_KEY = "remote-workplace.usage-preferences.v1";

export type UsagePreset = "custom" | "compact" | "standard" | "analysis";
export type LimitsView = "list" | "timeline" | "both";
export type UsageDensity = "compact" | "normal";
export type UsageSortBy = "default" | "provider" | "name" | "lowest" | "nextReset" | "status";
export type UsageProviderFilter = "all" | UsageProviderId;

/** Reine Präferenzdaten (ohne Store-Funktionen). */
export type UsagePreferencesData = Omit<UsagePreferences, "resetAll" | "applyPreset" | "set">;

export interface UsagePreferences {
  version: number;
  /** Zuletzt angewendetes Preset; "custom", sobald der Nutzer etwas ändert. */
  preset: UsagePreset;
  /** Ansicht der Limits: Liste, Timeline oder beides. */
  limitsView: LimitsView;
  /** Dichte der Timeline und der Account-Liste. */
  density: UsageDensity;
  /** Breite der linken Account-Spalte in der Timeline. */
  accountColumn: UsageDensity;

  // Sichtbarkeit einzelner Bereiche der Seite.
  showUsageKpis: boolean;
  showLimitSummary: boolean;
  showAccountOverview: boolean;
  showTimeline: boolean;
  showDetailedProviderCards: boolean;
  showForecasts: boolean;
  showResetCredits: boolean;
  showTimelineLegend: boolean;

  // Timeline-Darstellung.
  showPastWindows: boolean;
  showProjections: boolean;
  showNowLine: boolean;
  showWeekends: boolean;
  showResetCreditMarkers: boolean;
  showWindowLabels: boolean;
  showAccountsWithoutReset: boolean;

  // Account-Spalte / Liste.
  showEmail: boolean;
  showPlan: boolean;
  showProvider: boolean;
  showActiveBadge: boolean;
  showDataStatus: boolean;
  showLimitChips: boolean;

  // Filter und Sortierung.
  providerFilter: UsageProviderFilter;
  onlyActive: boolean;
  onlyProblematic: boolean;
  hideAccountsWithoutData: boolean;
  /** Account-Sichtbarkeit über stabile Account-IDs; entfernte IDs verfallen. */
  hiddenAccountIds: string[];
  sortBy: UsageSortBy;
  groupByProvider: boolean;

  /** Warnschwelle in Prozent (beeinflusst Farben, "niedrige Accounts", Filter). */
  warningThreshold: 10 | 20 | 30;

  resetAll: () => void;
  applyPreset: (preset: Exclude<UsagePreset, "custom">) => void;
  set: (patch: Partial<Omit<UsagePreferences, "resetAll" | "applyPreset" | "set">>) => void;
}

export function defaultUsagePreferences(): UsagePreferencesData {
  return {
    version: USAGE_PREFERENCES_VERSION,
    preset: "standard",
    limitsView: "both",
    density: "compact",
    accountColumn: "normal",
    // Standardansicht: bewusst sauber — KPIs, große Provider-Cards, Prognosen
    // und die Timeline-Legende sind Detailbereiche und bleiben aus.
    showUsageKpis: false,
    showLimitSummary: true,
    showAccountOverview: true,
    showTimeline: true,
    showDetailedProviderCards: false,
    showForecasts: false,
    showResetCredits: true,
    showTimelineLegend: false,
    showPastWindows: true,
    showProjections: true,
    showNowLine: true,
    showWeekends: true,
    showResetCreditMarkers: true,
    showWindowLabels: true,
    showAccountsWithoutReset: true,
    showEmail: false,
    showPlan: false,
    showProvider: true,
    showActiveBadge: true,
    showDataStatus: false,
    showLimitChips: true,
    providerFilter: "all",
    onlyActive: false,
    onlyProblematic: false,
    hideAccountsWithoutData: false,
    hiddenAccountIds: [],
    sortBy: "default",
    groupByProvider: false,
    warningThreshold: 20,
  };
}

const presets: Record<Exclude<UsagePreset, "custom">, Partial<UsagePreferencesData>> = {
  compact: {
    limitsView: "list",
    density: "compact",
    showUsageKpis: false,
    showLimitSummary: true,
    showAccountOverview: true,
    showTimeline: false,
    showDetailedProviderCards: false,
    showForecasts: false,
    showResetCredits: false,
    showTimelineLegend: false,
  },
  standard: {
    limitsView: "both",
    density: "compact",
    showUsageKpis: false,
    showLimitSummary: true,
    showAccountOverview: true,
    showTimeline: true,
    showDetailedProviderCards: false,
    showForecasts: false,
    showResetCredits: true,
    showTimelineLegend: false,
  },
  analysis: {
    limitsView: "both",
    density: "normal",
    showUsageKpis: true,
    showLimitSummary: true,
    showAccountOverview: true,
    showTimeline: true,
    showDetailedProviderCards: true,
    showForecasts: true,
    showResetCredits: true,
    showTimelineLegend: true,
    showPastWindows: true,
    showProjections: true,
  },
};

const providerIds: UsageProviderId[] = ["codex", "claude", "opencode"];

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isString = (value: unknown): value is string => typeof value === "string";

function validStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isString);
}

/** Validierte Darstellungspräferenzen aus beliebigem persistiertem Wert. */
export function sanitizeUsagePreferences(raw: unknown): UsagePreferencesData {
  const defaults = defaultUsagePreferences();
  if (typeof raw !== "object" || raw === null) return defaults;
  const value = raw as Record<string, unknown>;
  // Fehlt die Version oder weicht sie ab, gelten die Defaults (Migration).
  if (typeof value.version !== "number" || value.version !== USAGE_PREFERENCES_VERSION) return defaults;

  const pick = <K extends keyof UsagePreferencesData>(key: K): UsagePreferencesData[K] => {
    const candidate = value[key];
    const fallback = defaults[key];
    if (typeof fallback === "boolean" && isBoolean(candidate)) return candidate as UsagePreferencesData[K];
    if (typeof fallback === "number" && typeof candidate === "number") {
      if (key === "warningThreshold") {
        return ([10, 20, 30].includes(candidate) ? candidate : fallback) as UsagePreferencesData[K];
      }
      return candidate as UsagePreferencesData[K];
    }
    if (typeof fallback === "string" && isString(candidate)) {
      if (key === "limitsView" && ["list", "timeline", "both"].includes(candidate)) return candidate as UsagePreferencesData[K];
      if (key === "density" && ["compact", "normal"].includes(candidate)) return candidate as UsagePreferencesData[K];
      if (key === "accountColumn" && ["compact", "normal"].includes(candidate)) return candidate as UsagePreferencesData[K];
      if (key === "preset" && ["custom", "compact", "standard", "analysis"].includes(candidate)) return candidate as UsagePreferencesData[K];
      if (key === "sortBy" && ["default", "provider", "name", "lowest", "nextReset", "status"].includes(candidate)) return candidate as UsagePreferencesData[K];
      if (key === "providerFilter" && (candidate === "all" || providerIds.includes(candidate as UsageProviderId))) return candidate as UsagePreferencesData[K];
      return fallback;
    }
    if (Array.isArray(fallback) && Array.isArray(candidate)) return validStrings(candidate) as UsagePreferencesData[K];
    return fallback;
  };

  const keys: Array<keyof UsagePreferencesData> = [
    "version", "preset", "limitsView", "density", "accountColumn",
    "showUsageKpis", "showLimitSummary", "showAccountOverview", "showTimeline",
    "showDetailedProviderCards", "showForecasts", "showResetCredits", "showTimelineLegend",
    "showPastWindows", "showProjections", "showNowLine", "showWeekends",
    "showResetCreditMarkers", "showWindowLabels", "showAccountsWithoutReset",
    "showEmail", "showPlan", "showProvider", "showActiveBadge", "showDataStatus", "showLimitChips",
    "providerFilter", "onlyActive", "onlyProblematic", "hideAccountsWithoutData", "hiddenAccountIds",
    "sortBy", "groupByProvider", "warningThreshold",
  ];
  return Object.fromEntries(keys.map((key) => [key, pick(key)])) as UsagePreferencesData;
}

/** Fallback für Umgebungen ohne localStorage (Headless, Tests): No-op. */
const memoryOnlyStorage: Storage = {
  get length() { return 0; },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

export const useUsagePreferences = create<UsagePreferences>()(
  persist(
    (setState, getState) => ({
      ...defaultUsagePreferences(),
      resetAll: () => setState({ ...defaultUsagePreferences() }),
      applyPreset: (preset) => {
        const defaults = defaultUsagePreferences();
        setState({ ...defaults, ...presets[preset], preset });
      },
      set: (patch) => {
        // Jede manuelle Änderung macht das Preset zu "custom".
        const next = { ...getState(), ...patch, preset: "custom" as const };
        setState(next);
      },
    }),
    {
      name: USAGE_PREFERENCES_STORAGE_KEY,
      version: USAGE_PREFERENCES_VERSION,
      // localStorage kann in Headless-/Testumgebungen fehlen; dann läuft der
      // Store trotzdem mit Defaults weiter, statt beim Import zu crashen.
      storage: createJSONStorage(() => {
        try {
          const storage = window.localStorage;
          return storage ?? memoryOnlyStorage;
        } catch {
          return memoryOnlyStorage;
        }
      }),
      partialize: (state) => {
        // Nur die Daten persistieren, keine Store-Funktionen.
        const { resetAll, applyPreset, set, ...rest } = state;
        void resetAll; void applyPreset; void set;
        return rest;
      },
      merge: (persisted, current) => {
        const clean = sanitizeUsagePreferences(persisted);
        // Erster Besuch ohne gespeicherte Präferenzen auf einem schmalen
        // Viewport: die Listenansicht bevorzugen, Timeline nur auf Wunsch.
        const hasStoredPrefs = persisted !== null && typeof persisted === "object";
        if (!hasStoredPrefs && typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches) {
          clean.limitsView = "list";
        }
        return { ...current, ...clean };
      },
    },
  ),
);
