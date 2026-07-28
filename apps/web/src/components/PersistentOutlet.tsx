import { Fragment, useRef, type ReactNode } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { WORKBENCH_LIMITS } from "@workbench/contracts";

/**
 * Hält besuchte Routen im Baum, damit iframes, xterm-Instanzen und WebSockets
 * einen Seitenwechsel überleben: Inaktive Routen werden geparkt statt entfernt.
 * Damit ist jeder Bereich nach dem ersten Öffnen sofort wieder da — bis zum
 * nächsten harten Neuladen der Seite.
 *
 * **Die Reihenfolge der gerenderten Routen darf sich nie ändern.** React ordnet
 * die DOM-Knoten sonst um, und ein umgehängtes `iframe` lädt sein Dokument neu —
 * genau das, was hier verhindert werden soll. Die Verdrängungsreihenfolge steht
 * deshalb in einer zweiten Map und nicht in der Renderreihenfolge.
 */
export function PersistentOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const routes = useRef(new Map<string, ReactNode>());
  const lastVisited = useRef(new Map<string, number>());
  const visitCounter = useRef(0);
  const routeKey = location.pathname;

  // Die aktive Ansicht gleitet auf Touch-Shells von rechts herein. Der erste
  // Aufbau nach dem Laden bleibt bewusst ruhig — animiert wird erst, sobald
  // wirklich gewechselt wurde.
  const previousKey = useRef(routeKey);
  const navigated = useRef(false);
  if (previousKey.current !== routeKey) {
    previousKey.current = routeKey;
    navigated.current = true;
  }

  // Das Element wird je Route genau einmal festgehalten und danach nie ersetzt.
  // Beim Zurückwechseln liefert `useOutlet()` ein frisches Element; würde man das
  // übernehmen, hängt React den Teilbaum neu ein und iframe, xterm und WebSocket
  // starten von vorn. Da der Schlüssel der volle Pfad ist, kann sich hinter einem
  // Schlüssel ohnehin nichts anderes verbergen.
  if (!routes.current.has(routeKey)) routes.current.set(routeKey, outlet);
  lastVisited.current.set(routeKey, ++visitCounter.current);

  while (routes.current.size > WORKBENCH_LIMITS.maxCachedRoutes) {
    let oldestKey: string | null = null;
    let oldestVisit = Number.POSITIVE_INFINITY;
    for (const key of routes.current.keys()) {
      const visit = lastVisited.current.get(key) ?? 0;
      if (key !== routeKey && visit < oldestVisit) {
        oldestVisit = visit;
        oldestKey = key;
      }
    }
    if (oldestKey === null) break;
    routes.current.delete(oldestKey);
    lastVisited.current.delete(oldestKey);
  }

  return (
    <Fragment>
      {[...routes.current.entries()].map(([key, element]) => {
        const active = key === routeKey;
        return (
          <div
            key={key}
            className={`persistent-route ${active ? "is-active" : "is-parked"}${active && navigated.current ? " is-entering" : ""}`}
            aria-hidden={!active}
            inert={!active}
            data-route-cache-key={key}
          >
            {element}
          </div>
        );
      })}
    </Fragment>
  );
}
