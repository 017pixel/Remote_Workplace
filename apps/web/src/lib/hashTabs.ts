import { useCallback, useEffect, useState } from "react";

/**
 * Aktiver Bereich einer Seite mit Registerkarten. Der Stand steckt im
 * URL-Hash (z. B. "#einstellungen:system"), damit direkte Links funktionieren
 * und ein Neuladen den Bereich nicht zurücksetzt.
 */
export function useHashTab<T extends string>(tabs: readonly T[], prefix: string, fallback: T): [T, (tab: T) => void] {
  const readFromHash = useCallback((): T => {
    const value = window.location.hash.replace(/^#/, "");
    if (!value.startsWith(prefix)) return fallback;
    const id = value.slice(prefix.length) as T;
    return tabs.includes(id) ? id : fallback;
  }, [fallback, prefix, tabs]);
  const [tab, setTabState] = useState<T>(() => readFromHash());

  useEffect(() => {
    const onHashChange = () => setTabState(readFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [readFromHash]);

  const setTab = (next: T) => {
    window.location.hash = `${prefix}${next}`;
    setTabState(next);
  };
  return [tab, setTab];
}
