// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageRouteId } from "./sidebarPreferences";

/**
 * Der Store cached seine localStorage-Referenz beim Import. Damit die
 * Persistierung getestet werden kann, wird die Umgebung zuerst präpariert und
 * der Store danach dynamisch importiert.
 */

const STORAGE_KEY = "wrapt.app-preferences.v1";

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

const storage = memoryStorage();
Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
vi.stubGlobal("localStorage", storage);

type AppPreferencesState = {
  defaultPage: PageRouteId;
  setDefaultPage: (page: PageRouteId) => void;
};

type AppPreferencesModule = {
  useAppPreferences: {
    getState: () => AppPreferencesState;
    setState: (partial: Partial<AppPreferencesState>) => void;
    persist: { rehydrate: () => void | Promise<void> };
  };
};

let appPreferences: AppPreferencesModule;

beforeEach(async () => {
  storage.clear();
  appPreferences = await import("./appPreferences");
  appPreferences.useAppPreferences.setState({ defaultPage: "dashboard" });
});

afterEach(() => {
  vi.resetModules();
});

function storedState(): Record<string, unknown> | null {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null;
}

describe("app preferences", () => {
  it("setzt die Standardseite und persistiert sie", () => {
    appPreferences.useAppPreferences.getState().setDefaultPage("inbox");
    expect(appPreferences.useAppPreferences.getState().defaultPage).toBe("inbox");
    expect(storedState()?.defaultPage).toBe("inbox");
  });

  it("fällt bei ungültigem persistiertem Wert auf das Dashboard zurück", () => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ state: { defaultPage: "nicht-vorhanden" }, version: 1 }));
    appPreferences.useAppPreferences.persist.rehydrate();
    expect(appPreferences.useAppPreferences.getState().defaultPage).toBe("dashboard");
  });
});