import { useEffect, useState } from "react";

/**
 * Geteilter Minuten-Tick für die Quota-Timeline. Ein gemeinsamer Timer statt
 * eines Timers pro Lane; Sekundenauflösung ist unnötig. Mit `now` als fester
 * Zahl (Tests) wird der Timer komplett übersprungen.
 */
export function useNow(fixedNow?: number, intervalMilliseconds = 30_000): number {
  const [now, setNow] = useState(() => fixedNow ?? Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMilliseconds);
    return () => clearInterval(timer);
  }, [fixedNow, intervalMilliseconds]);
  return fixedNow ?? now;
}
