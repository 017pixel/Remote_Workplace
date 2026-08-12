import { useCallback, useEffect, useState } from "react";

const SIDEBAR_LAYOUT_STORAGE_KEY = "remote-workplace.sidebar.v1";
const MIN_SIDEBAR_WIDTH = 208;
const MAX_SIDEBAR_WIDTH = 360;
const DEFAULT_SIDEBAR_WIDTH = 236;

interface SidebarLayoutState {
  collapsed: boolean;
  width: number;
}

function clampWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));
}

function readLayout(): SidebarLayoutState {
  try {
    const raw = localStorage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY);
    if (!raw) return { collapsed: false, width: DEFAULT_SIDEBAR_WIDTH };
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "collapsed" in parsed &&
      "width" in parsed &&
      typeof parsed.collapsed === "boolean" &&
      typeof parsed.width === "number"
    ) {
      return { collapsed: parsed.collapsed, width: clampWidth(parsed.width) };
    }
  } catch {
    // Ungültige lokale Präferenzen fallen sicher auf das Standardlayout zurück.
  }
  return { collapsed: false, width: DEFAULT_SIDEBAR_WIDTH };
}

export function useSidebarLayout() {
  const [layout, setLayout] = useState<SidebarLayoutState>(readLayout);

  useEffect(() => {
    const save = window.setTimeout(() => {
      localStorage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    }, 180);
    // Wird der Tab während des Debounce-Fensters geschlossen (z. B. direkt nach
    // dem Ziehen), sichert pagehide den letzten Stand synchron (F04-10).
    const flush = () => {
      window.clearTimeout(save);
      localStorage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(save);
      window.removeEventListener("pagehide", flush);
    };
  }, [layout]);

  const toggleCollapsed = useCallback(() => {
    setLayout((current) => ({ ...current, collapsed: !current.collapsed }));
  }, []);

  const setWidth = useCallback((width: number) => {
    setLayout((current) => ({ ...current, width: clampWidth(width) }));
  }, []);

  return { ...layout, toggleCollapsed, setWidth };
}
