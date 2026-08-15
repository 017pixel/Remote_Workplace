import { useMemo, useSyncExternalStore } from "react";
import { BrowserRouter, Routes } from "react-router";
import { PwaInstallProvider } from "./lib/usePwaInstall";
import { pageRouteRegistry } from "./extensions/pageRouteRegistry";
import { routeHostElements } from "./extensions/routeHost";

/**
 * Der statische Router ist durch den Route Host ersetzt: Pages und Routes
 * kommen aus der Page-/Route-Registry (Legacy Built-ins), Standalone-,
 * Shell- und 404-Flächen bleiben hostgeschützt. Eine neu registrierte
 * Extension-Route erscheint ohne Änderung an dieser Datei.
 */
export function App() {
  const snapshot = useSyncExternalStore(
    pageRouteRegistry.subscribe,
    pageRouteRegistry.getSnapshot,
  );
  const routes = useMemo(() => routeHostElements(snapshot), [snapshot]);
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
  return (
    <PwaInstallProvider>
      <BrowserRouter basename={basename}>
        <Routes>{routes}</Routes>
      </BrowserRouter>
    </PwaInstallProvider>
  );
}
