import { createContext, useContext, type ReactNode } from "react";

const RouteActivityContext = createContext(true);

export function RouteActivityProvider({ active, children }: { active: boolean; children: ReactNode }) {
  return <RouteActivityContext.Provider value={active}>{children}</RouteActivityContext.Provider>;
}

/**
 * Liefert, ob die Route aktuell sichtbar und interaktiv ist. Komponenten in
 * geparkten Routen bleiben gemountet, können aber nicht-funktionale Polls und
 * Renderarbeit bis zur Rückkehr aussetzen.
 */
export function useRouteActivity(): boolean {
  return useContext(RouteActivityContext);
}
