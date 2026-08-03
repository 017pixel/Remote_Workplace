import { create } from "zustand";

/** Ein Messpunkt des Dashboards. Wird im Takt der Metrik-Queries erzeugt. */
export interface MetricsSample {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  rssBytes: number;
  activeRequests: number;
  totalRequests: number;
  serverErrorRatePercent: number;
  clientErrorRatePercent: number;
  eventLoopP99: number;
}

/** 60 Punkte × 5 s Aktualisierung ≈ 5 Minuten Verlauf. */
const MAX_SAMPLES = 60;

interface MetricsHistoryState {
  samples: MetricsSample[];
  push: (sample: MetricsSample) => void;
  clear: () => void;
}

/**
 * Der Verlauf liegt bewusst in einem globalen Store statt in einem Ref pro
 * Panel: mehrere Panels teilen sich dieselben Punkte, und beim Wechsel auf eine
 * andere Seite und zurück bleibt der Verlauf erhalten.
 */
export const useMetricsHistory = create<MetricsHistoryState>()((set) => ({
  samples: [],
  push: (sample) =>
    set((state) => {
      const last = state.samples[state.samples.length - 1];
      // Identische Zeitstempel entstehen, wenn React denselben Datenstand erneut rendert.
      if (last && sample.timestamp - last.timestamp < 500) return state;
      const next = [...state.samples, sample];
      return { samples: next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next };
    }),
  clear: () => set({ samples: [] }),
}));

export type TrendDirection = "up" | "down" | "stable";

export interface Trend {
  direction: TrendDirection;
  /** Differenz zwischen jüngerem und älterem Mittel in der Einheit der Reihe. */
  delta: number;
}

/**
 * Vergleicht das Mittel der letzten fünf Punkte mit dem der fünf davor.
 * `threshold` verhindert, dass normales Rauschen als Trend gemeldet wird.
 */
export function computeTrend(values: readonly number[], threshold = 1): Trend {
  if (values.length < 6) return { direction: "stable", delta: 0 };
  const recent = values.slice(-5);
  const older = values.slice(-10, -5);
  if (older.length === 0) return { direction: "stable", delta: 0 };
  const average = (list: readonly number[]) => list.reduce((total, value) => total + value, 0) / list.length;
  const delta = average(recent) - average(older);
  if (delta > threshold) return { direction: "up", delta };
  if (delta < -threshold) return { direction: "down", delta };
  return { direction: "stable", delta };
}
