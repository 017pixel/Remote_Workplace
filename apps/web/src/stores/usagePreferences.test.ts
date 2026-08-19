// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Der Store cached seine localStorage-Referenz beim Import. Damit die
 * Persistierung getestet werden kann, wird die Umgebung zuerst präpariert und
 * der Store danach dynamisch importiert.
 */

const STORAGE_KEY = "wrapt.usage-preferences.v1";
const VERSION = 1;

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, value); },
  } as Storage;
}

// localStorage global präparieren, BEVOR der Store importiert wird.
const storage = memoryStorage();
Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
vi.stubGlobal("localStorage", storage);

import type { StoreApi, UseBoundStore } from "zustand";
import type { UsagePreferencesData } from "./usagePreferences";

type UsagePreferencesStore = UsagePreferencesData & {
  resetAll: () => void;
  applyPreset: (preset: "compact" | "standard" | "analysis") => void;
  set: (patch: Partial<UsagePreferencesData>) => void;
};

let usagePreferences: UseUsagePreferencesModule;
let useStore: UseBoundStore<StoreApi<UsagePreferencesStore>>;

interface UseUsagePreferencesModule {
  defaultUsagePreferences: () => UsagePreferencesData;
  sanitizeUsagePreferences: (raw: unknown) => UsagePreferencesData;
  useUsagePreferences: UseBoundStore<StoreApi<UsagePreferencesStore>>;
}

beforeEach(async () => {
  storage.clear();
  usagePreferences = await import("./usagePreferences");
  useStore = usagePreferences.useUsagePreferences;
  useStore.setState(usagePreferences.defaultUsagePreferences());
});

afterEach(() => {
  vi.resetModules();
});

function storedState(): Record<string, unknown> | null {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null;
}

describe("usagePreferences defaults", () => {
  it("liefert sinnvolle Standardwerte für die kompakte Ansicht", () => {
    const prefs = usagePreferences.defaultUsagePreferences();
    expect(prefs.version).toBe(VERSION);
    // Standardansicht: Liste + Timeline, ohne KPI-Karten und große Provider-Cards.
    expect(prefs.limitsView).toBe("both");
    expect(prefs.showUsageKpis).toBe(false);
    expect(prefs.showAccountOverview).toBe(true);
    expect(prefs.showTimeline).toBe(true);
    expect(prefs.showDetailedProviderCards).toBe(false);
    expect(prefs.showForecasts).toBe(false);
    expect(prefs.showTimelineLegend).toBe(false);
    expect(prefs.showEmail).toBe(false);
    expect(prefs.showPlan).toBe(false);
    expect(prefs.showProvider).toBe(true);
    expect(prefs.showActiveBadge).toBe(true);
    expect(prefs.warningThreshold).toBe(20);
    expect(prefs.providerFilter).toBe("all");
    expect(prefs.sortBy).toBe("default");
  });
});

describe("usagePreferences Persistierung", () => {
  it("persistiert Änderungen lokal", async () => {
    useStore.getState().set({ showForecasts: true, warningThreshold: 10 });
    await vi.waitFor(() => {
      expect(storedState()).toMatchObject({ showForecasts: true, warningThreshold: 10 });
    });
  });

  it("überlebt eine Neuinitialisierung (simulierter Reload)", async () => {
    useStore.getState().set({ limitsView: "list", showEmail: true });
    await vi.waitFor(() => expect(storedState()).toBeDefined());
    // Reload: Store-Modul neu laden — der merge liest den persistierten Wert.
    vi.resetModules();
    const reloaded = await import("./usagePreferences");
    expect(reloaded.useUsagePreferences.getState().limitsView).toBe("list");
    expect(reloaded.useUsagePreferences.getState().showEmail).toBe(true);
  });
});

describe("usagePreferences Validierung und Migration", () => {
  it("verwirft ungültige persistierte Werte zugunsten der Defaults", () => {
    const cleaned = usagePreferences.sanitizeUsagePreferences({
      version: VERSION,
      limitsView: "unsichtbar",
      showEmail: "ja",
      warningThreshold: 99,
      sortBy: 42,
      hiddenAccountIds: [123, "echt"],
    });
    expect(cleaned.limitsView).toBe("both");
    expect(cleaned.showEmail).toBe(false);
    expect(cleaned.warningThreshold).toBe(20);
    expect(cleaned.sortBy).toBe("default");
    // Nur gültige Strings bleiben erhalten.
    expect(cleaned.hiddenAccountIds).toEqual(["echt"]);
  });

  it("behandelt eine fremde Version als ungültig (Migration → Defaults)", () => {
    const cleaned = usagePreferences.sanitizeUsagePreferences({
      version: VERSION + 1,
      limitsView: "list",
      showEmail: true,
    });
    expect(cleaned.limitsView).toBe("both");
    expect(cleaned.showEmail).toBe(false);
  });

  it("behandelt fehlende oder kaputte Daten als Defaults", () => {
    expect(usagePreferences.sanitizeUsagePreferences(null)).toEqual(usagePreferences.defaultUsagePreferences());
    expect(usagePreferences.sanitizeUsagePreferences("kaputt")).toEqual(usagePreferences.defaultUsagePreferences());
    expect(usagePreferences.sanitizeUsagePreferences({})).toEqual(usagePreferences.defaultUsagePreferences());
  });

  it("akzeptiert alle erlaubten Enum-Werte", () => {
    const cleaned = usagePreferences.sanitizeUsagePreferences({
      version: VERSION,
      limitsView: "timeline",
      density: "normal",
      accountColumn: "compact",
      sortBy: "lowest",
      providerFilter: "claude",
      warningThreshold: 30,
      preset: "analysis",
    });
    expect(cleaned.limitsView).toBe("timeline");
    expect(cleaned.density).toBe("normal");
    expect(cleaned.accountColumn).toBe("compact");
    expect(cleaned.sortBy).toBe("lowest");
    expect(cleaned.providerFilter).toBe("claude");
    expect(cleaned.warningThreshold).toBe(30);
    expect(cleaned.preset).toBe("analysis");
  });
});

describe("usagePreferences Presets", () => {
  it("wendet das Kompakt-Preset an", () => {
    useStore.getState().applyPreset("compact");
    const state = useStore.getState();
    expect(state.preset).toBe("compact");
    expect(state.limitsView).toBe("list");
    expect(state.showTimeline).toBe(false);
    expect(state.showForecasts).toBe(false);
  });

  it("wendet das Analyse-Preset an und erlaubt anschließend manuelle Änderungen", () => {
    useStore.getState().applyPreset("analysis");
    expect(useStore.getState().showDetailedProviderCards).toBe(true);
    expect(useStore.getState().showForecasts).toBe(true);
    // Manuelle Änderung setzt das Preset auf custom.
    useStore.getState().set({ showForecasts: false });
    expect(useStore.getState().preset).toBe("custom");
    expect(useStore.getState().showForecasts).toBe(false);
  });

  it("stellt Standardwerte wieder her", () => {
    useStore.getState().set({ showEmail: true, limitsView: "timeline", warningThreshold: 10 });
    useStore.getState().resetAll();
    const state = useStore.getState();
    expect(state.showEmail).toBe(false);
    expect(state.limitsView).toBe("both");
    expect(state.warningThreshold).toBe(20);
    expect(state.preset).toBe("standard");
  });
});
