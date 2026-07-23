import { useEffect, useMemo, useState } from "react";

export type ShellMode = "compact" | "tablet" | "desktop";
export type ShellOrientation = "portrait" | "landscape";

interface ResponsiveShellState {
  width: number;
  height: number;
  coarsePointer: boolean;
  finePointer: boolean;
}

function readShellState(): ResponsiveShellState {
  if (typeof window === "undefined") {
    return { width: 1440, height: 900, coarsePointer: false, finePointer: true };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    finePointer: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  };
}

/**
 * Central responsive policy for the application shell. Width alone is not
 * enough: phone landscape and touch-first tablets need the touch shell even
 * when their CSS width looks like a small desktop window.
 */
export function useResponsiveShell() {
  const [state, setState] = useState(readShellState);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setState(readShellState());

    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    coarse.addEventListener("change", update);
    fine.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      coarse.removeEventListener("change", update);
      fine.removeEventListener("change", update);
    };
  }, []);

  return useMemo(() => {
    const phoneLandscape = state.height <= 600 && state.width <= 960;
    const compact = state.width <= 767 || phoneLandscape;
    const tablet = !compact && (state.width <= 1180 || (state.coarsePointer && state.width <= 1366));
    const mode: ShellMode = compact ? "compact" : tablet ? "tablet" : "desktop";

    return {
      mode,
      orientation: (state.width > state.height ? "landscape" : "portrait") as ShellOrientation,
      shortHeight: state.height <= 600,
      isTouchShell: mode !== "desktop",
      inputMode: state.coarsePointer || !state.finePointer ? "touch" : "fine",
      ...state,
    };
  }, [state]);
}

/** Keeps fixed shells usable while an iOS/Android software keyboard is open. */
export function useVisualViewportVariables() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const keyboardInset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      root.style.setProperty("--app-viewport-height", `${Math.round(height)}px`);
      root.style.setProperty("--keyboard-inset", `${Math.round(keyboardInset)}px`);
      root.style.setProperty("--visual-viewport-offset", `${Math.round(viewport?.offsetTop ?? 0)}px`);
    };

    update();
    window.addEventListener("resize", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update, { passive: true });
    window.visualViewport?.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--keyboard-inset");
      root.style.removeProperty("--visual-viewport-offset");
    };
  }, []);
}
