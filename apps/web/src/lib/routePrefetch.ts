import type { QueryClient } from "@tanstack/react-query";
import { wraptQueries } from "./queryOptions";
import { prefetchRoute } from "./routeModules";

/**
 * Zu einer Route gehört nicht nur ihr JavaScript-Bündel, sondern auch ihr
 * erster Datenabruf. Ohne Vorladen passiert beides nacheinander: erst lädt der
 * Chunk, dann wird die Ansicht eingehängt, und erst dann startet die Anfrage.
 * Auf dem Handy summiert sich das zu einer spürbaren Wartezeit.
 *
 * `prefetchQuery` beachtet die `staleTime` der jeweiligen Abfrage — ein
 * frischer Cache löst also keine zusätzliche Anfrage aus.
 */
const dataLoaders: Array<[prefix: string, warm: (client: QueryClient) => Promise<unknown>]> = [
  ["/usage", (client) => client.prefetchQuery(wraptQueries.usageDashboard("30d"))],
  ["/tech-tldrs", (client) => client.prefetchQuery(wraptQueries.newsCollections())],
  ["/projects", (client) => client.prefetchQuery(wraptQueries.projects())],
];

/** Lädt Bündel und Startdaten der Zielroute vor. Fehler bleiben absichtlich still. */
export function prefetchRouteTarget(client: QueryClient, path: string): void {
  prefetchRoute(path);
  const match = dataLoaders.find(([prefix]) => path === prefix || path.startsWith(prefix));
  const promise = match?.[1](client);
  if (promise) void promise.catch(() => undefined);
}
