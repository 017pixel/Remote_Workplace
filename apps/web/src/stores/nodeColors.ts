import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Pastelltöne für Orbit-Knoten. Gedeckt genug, dass mehrere davon nebeneinander
 * auf der fast schwarzen Fläche nicht streiten, und hell genug, dass die daraus
 * gezeichneten Verbindungslinien lesbar bleiben.
 *
 * Diese Farben sind Inhaltdaten, keine UI-Farben: Sie werden vom Nutzer über
 * den Farbwähler frei gewählt und im localStorage des Knotens gespeichert.
 * Deshalb gehören sie nicht in den @theme-Block der Design-Tokens.
 */
export const PASTEL_NODE_COLORS = [
  "#a8c7fa", "#b3a4f7", "#d3a4e8", "#f0a6c4",
  "#f5a9a0", "#f7c59f", "#f2dfa0", "#d7e5a0",
  "#a8e6b8", "#9fdfd0", "#a3d9e8", "#bfc7d4",
] as const;

const MAX_CUSTOM_COLORS = 12;
const STORAGE_KEY = "wrapt.node-colors.v1";

const isHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

interface NodeColorState {
  /** Selbst gemischte Farben, zuletzt hinzugefügte zuerst. */
  customColors: string[];
  addCustomColor: (color: string) => void;
  removeCustomColor: (color: string) => void;
}

export const useNodeColors = create<NodeColorState>()(
  persist(
    (set) => ({
      customColors: [],
      addCustomColor: (color) => set((state) => {
        const normalized = color.toLowerCase();
        if (!isHexColor(normalized)) return state;
        const withoutDuplicate = state.customColors.filter((candidate) => candidate !== normalized);
        return { customColors: [normalized, ...withoutDuplicate].slice(0, MAX_CUSTOM_COLORS) };
      }),
      removeCustomColor: (color) => set((state) => ({
        customColors: state.customColors.filter((candidate) => candidate !== color),
      })),
    }),
    {
      name: STORAGE_KEY,
      merge: (persisted, current) => {
        const raw = persisted as Partial<{ customColors: unknown }> | undefined;
        const stored = Array.isArray(raw?.customColors) ? raw.customColors : [];
        return {
          ...current,
          customColors: stored.filter((value): value is string => typeof value === "string" && isHexColor(value)).slice(0, MAX_CUSTOM_COLORS),
        };
      },
    },
  ),
);
