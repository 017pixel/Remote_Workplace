/**
 * Führt eine Zustandsänderung aus, die das Layout umbaut, und lässt den Browser
 * den Übergang animieren. Panels mit eigenem `view-transition-name` wandern und
 * wachsen dabei weich, statt zu springen.
 *
 * Ohne Unterstützung — oder wenn der Nutzer weniger Bewegung wünscht — läuft die
 * Änderung unverändert sofort durch.
 */
export function runWithViewTransition(update: () => void): void {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || typeof document.startViewTransition !== "function") {
    update();
    return;
  }
  document.startViewTransition(update);
}
