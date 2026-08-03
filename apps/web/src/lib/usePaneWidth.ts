import { useCallback, useEffect, useState } from "react";

interface PaneWidthOptions {
  /** Eigener Schlüssel je Bereich, damit sich Breiten nicht gegenseitig überschreiben. */
  storageKey: string;
  initial: number;
  min: number;
  max: number;
}

/**
 * Merkt sich die Breite eines verstellbaren Seitenbereichs (Dateibaum,
 * Skill-Baum) lokal im Browser. Bewusst dieselbe Mechanik wie bei der
 * Hauptnavigation: entprellt speichern und beim Verlassen der Seite den
 * letzten Stand synchron sichern.
 */
export function usePaneWidth({ storageKey, initial, min, max }: PaneWidthOptions) {
  const clamp = useCallback(
    (value: number) => Math.min(max, Math.max(min, Math.round(value))),
    [max, min],
  );

  const [width, setWidthState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    const save = () => {
      try { localStorage.setItem(storageKey, String(width)); } catch { /* Private Modes verbieten das Speichern. */ }
    };
    const handle = window.setTimeout(save, 180);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearTimeout(handle);
      window.removeEventListener("pagehide", save);
    };
  }, [storageKey, width]);

  const setWidth = useCallback((value: number) => setWidthState(clamp(value)), [clamp]);

  /** Ziehen mit Maus, Stift oder Finger. Die Breite wächst nach rechts. */
  const startResize = useCallback((event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    const move = (moveEvent: PointerEvent) => setWidth(startWidth + moveEvent.clientX - startX);
    const stop = () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  }, [setWidth, width]);

  /** Tastaturbedienung des Griffs, damit der Bereich ohne Maus nutzbar bleibt. */
  const resizeWithKeyboard = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 32 : 8;
    const next = event.key === "ArrowLeft" ? width - step
      : event.key === "ArrowRight" ? width + step
        : event.key === "Home" ? min
          : event.key === "End" ? max
            : null;
    if (next === null) return;
    event.preventDefault();
    setWidth(next);
  }, [max, min, setWidth, width]);

  return { width, min, max, setWidth, startResize, resizeWithKeyboard };
}
