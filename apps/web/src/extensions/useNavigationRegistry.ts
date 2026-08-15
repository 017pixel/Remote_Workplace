import { useSyncExternalStore } from "react";
import {
  navigationRegistry,
  type NavigationRegistrySnapshot,
} from "./navigationRegistry";

/** Abonniert die Navigation-Registry; der Snapshot bleibt bei unverändertem Stand referenzstabil. */
export function useNavigationRegistry(): NavigationRegistrySnapshot {
  return useSyncExternalStore(
    navigationRegistry.subscribe,
    navigationRegistry.getSnapshot,
  );
}
