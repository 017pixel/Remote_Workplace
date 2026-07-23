import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "./apiClient";

export const workbenchQueries = {
  health: () =>
    queryOptions({ queryKey: ["health"], queryFn: ({ signal }) => apiClient.health(signal), refetchInterval: 10_000 }),
  serverSummary: () =>
    queryOptions({
      queryKey: ["server", "summary"],
      queryFn: ({ signal }) => apiClient.serverSummary(signal),
      refetchInterval: 30_000,
    }),
  serverMetrics: () =>
    queryOptions({
      queryKey: ["server", "metrics"],
      queryFn: ({ signal }) => apiClient.serverMetrics(signal),
      refetchInterval: 10_000,
      staleTime: 5_000,
    }),
  services: () =>
    queryOptions({
      queryKey: ["services"],
      queryFn: ({ signal }) => apiClient.services(signal),
      refetchInterval: 10_000,
    }),
  localPorts: () =>
    queryOptions({
      queryKey: ["local-ports"],
      queryFn: ({ signal }) => apiClient.localPorts(signal),
      refetchInterval: 10_000,
      staleTime: 5_000,
    }),
  projects: () =>
    queryOptions({ queryKey: ["projects"], queryFn: ({ signal }) => apiClient.projects(signal), staleTime: 30_000 }),
  project: (projectId: string) =>
    queryOptions({
      queryKey: ["projects", projectId],
      queryFn: ({ signal }) => apiClient.project(projectId, signal),
      staleTime: 30_000,
    }),
  commands: () =>
    queryOptions({ queryKey: ["commands"], queryFn: ({ signal }) => apiClient.commands(signal), staleTime: Infinity }),
  usage: () =>
    queryOptions({
      queryKey: ["usage"],
      queryFn: ({ signal }) => apiClient.usage(signal),
      refetchInterval: 60_000,
      staleTime: 30_000,
    }),
  usageDashboard: (range: string) => queryOptions({ queryKey: ["usage", "dashboard", range], queryFn: ({signal}) => apiClient.usageDashboard(range, signal), refetchInterval: 60_000, staleTime: 30_000 }),
  accounts: () => queryOptions({ queryKey: ["accounts"], queryFn: ({signal}) => apiClient.accounts(signal), staleTime: 15_000 }),
  discoveredAccounts: () => queryOptions({ queryKey: ["accounts", "discovered"], queryFn: ({signal}) => apiClient.discoverAccounts(signal), staleTime: 15_000 }),
  orbit: () => queryOptions({ queryKey: ["orbit"], queryFn: ({signal}) => apiClient.orbit(signal), staleTime: 1_000 }),
  terminalSessions: () => queryOptions({ queryKey: ["terminal", "sessions"], queryFn: ({ signal }) => apiClient.terminalSessions(signal), refetchInterval: 3_000, staleTime: 1_000 }),
  terminalWorkspace: () => queryOptions({ queryKey: ["terminal", "workspace"], queryFn: ({ signal }) => apiClient.terminalWorkspace(signal), staleTime: 1_000 }),
  news: (params:URLSearchParams) => queryOptions({queryKey:["news",params.toString()],queryFn:({signal})=>apiClient.news(params,signal),staleTime:60_000}),
  newsItem:(id:string)=>queryOptions({queryKey:["news","item",id],queryFn:({signal})=>apiClient.newsItem(id,signal),staleTime:60_000}),
  newsCollections:()=>queryOptions({queryKey:["news","collections"],queryFn:({signal})=>apiClient.newsCollections(signal),staleTime:15_000}),
};
