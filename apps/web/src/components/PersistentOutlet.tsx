import { Fragment, useRef, type ReactNode } from "react";
import { useLocation, useOutlet } from "react-router-dom";

/**
 * Keeps every route visited during the browser session mounted. Heavy iframe,
 * xterm and WebSocket clients therefore survive sidebar navigation; inactive
 * routes are parked in-place instead of being removed from the React tree.
 */
export function PersistentOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const routes = useRef(new Map<string, ReactNode>());
  const routeKey = location.pathname;

  routes.current.set(routeKey, outlet);

  return (
    <Fragment>
      {[...routes.current.entries()].map(([key, element]) => {
        const active = key === routeKey;
        return (
          <div
            key={key}
            className={`persistent-route ${active ? "is-active" : "is-parked"}`}
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
