import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { apiClient } from "./apiClient";

export const workbenchQueries = {
  dashboardConfig: () =>
    queryOptions({ queryKey: ["system", "dashboard-config"], queryFn: ({ signal }) => apiClient.dashboardConfig(signal), staleTime: Infinity }),
  health: (refetchInterval = 5_000) =>
    queryOptions({ queryKey: ["health"], queryFn: ({ signal }) => apiClient.health(signal), refetchInterval }),
  readiness: (refetchInterval = 30_000) =>
    queryOptions({ queryKey: ["health", "readiness"], queryFn: ({ signal }) => apiClient.readiness(signal), refetchInterval }),
  operationalMetrics: (refetchInterval = 5_000) =>
    queryOptions({ queryKey: ["system", "operational-metrics"], queryFn: ({ signal }) => apiClient.operationalMetrics(signal), refetchInterval, staleTime: Math.min(refetchInterval, 5_000) }),
  t3Channel: () =>
    queryOptions({ queryKey: ["system", "t3-channel"], queryFn: ({ signal }) => apiClient.t3Channel(signal), staleTime: 5_000 }),
  usageMonitoring: () =>
    queryOptions({ queryKey: ["system", "usage-monitoring"], queryFn: ({ signal }) => apiClient.usageMonitoring(signal), staleTime: 15_000 }),
  hermesStatus: () => queryOptions({ queryKey: ["hermes", "status"], queryFn: ({ signal }) => apiClient.hermesStatus(signal), refetchInterval: 30_000, staleTime: 10_000 }),
  hermesTasks: () => queryOptions({ queryKey: ["hermes", "tasks"], queryFn: ({ signal }) => apiClient.hermesTasks(signal), refetchInterval: 6_000, staleTime: 2_000, refetchIntervalInBackground: false }),
  hermesCron: () => queryOptions({ queryKey: ["hermes", "cron"], queryFn: ({ signal }) => apiClient.hermesCron(signal), refetchInterval: 60_000, staleTime: 15_000, refetchIntervalInBackground: false }),
  hermesResults: (source?: string, status?: string) => queryOptions({ queryKey: ["hermes", "results", source ?? "all", status ?? "all"], queryFn: ({ signal }) => apiClient.hermesResults({ ...(source ? { source } : {}), ...(status ? { status } : {}) }, signal), refetchInterval: 20_000, staleTime: 5_000, refetchIntervalInBackground: false }),
  notifications: (unreadOnly = false) => queryOptions({ queryKey: ["notifications", unreadOnly], queryFn: ({ signal }) => apiClient.notifications({ unreadOnly }, signal), refetchInterval: 15_000, staleTime: 2_000 }),
  notificationSettings: () => queryOptions({ queryKey: ["notifications", "settings"], queryFn: ({ signal }) => apiClient.notificationSettings(signal), staleTime: 30_000 }),
  serverSummary: (refetchInterval = 30_000) =>
    queryOptions({
      queryKey: ["server", "summary"],
      queryFn: ({ signal }) => apiClient.serverSummary(signal),
      refetchInterval,
    }),
  serverMetrics: (refetchInterval = 5_000) =>
    queryOptions({
      queryKey: ["server", "metrics"],
      queryFn: ({ signal }) => apiClient.serverMetrics(signal),
      refetchInterval,
      staleTime: 5_000,
    }),
  services: (refetchInterval = 5_000) =>
    queryOptions({
      queryKey: ["services"],
      queryFn: ({ signal }) => apiClient.services(signal),
      refetchInterval,
    }),
  localPorts: (refetchInterval = 5_000) =>
    queryOptions({
      queryKey: ["local-ports"],
      queryFn: ({ signal }) => apiClient.localPorts(signal),
      refetchInterval,
      staleTime: 5_000,
    }),
  previewSlots: () =>
    queryOptions({
      queryKey: ["preview-slots"],
      queryFn: ({ signal }) => apiClient.previewSlots(signal),
      staleTime: 2_000,
    }),
  previewDevicePreference: () =>
    queryOptions({
      queryKey: ["preview-device-preference"],
      queryFn: ({ signal }) => apiClient.previewDevicePreference(signal),
      staleTime: 60_000,
    }),
  previewHubPreference: () =>
    queryOptions({
      queryKey: ["preview-hub-preference"],
      queryFn: ({ signal }) => apiClient.previewHubPreference(signal),
      staleTime: 60_000,
    }),
  previewDevServer: (projectId: string | null, refetchInterval = 2_000) =>
    queryOptions({
      queryKey: ["preview-dev-server", projectId],
      queryFn: ({ signal }) => apiClient.previewDevServer(projectId!, signal),
      enabled: projectId !== null,
      refetchInterval,
      staleTime: 1_000,
    }),
  previewDevServerLogs: (projectId: string | null, refetchInterval = 1_500) =>
    queryOptions({
      queryKey: ["preview-dev-server", projectId, "logs"],
      queryFn: ({ signal }) => apiClient.previewDevServerLogs(projectId!, signal),
      enabled: projectId !== null,
      refetchInterval,
      staleTime: 500,
    }),
  previewServiceCandidates: (projectId: string | null) =>
    queryOptions({
      queryKey: ["preview-service-candidates", projectId],
      queryFn: ({ signal }) => apiClient.previewServiceCandidates(projectId, signal),
      staleTime: 15_000,
    }),
  previewServiceGraph: (projectId: string, primaryServiceId: string) =>
    queryOptions({
      queryKey: ["preview-service-graph", projectId, primaryServiceId],
      queryFn: ({ signal }) => apiClient.previewServiceGraph(projectId, primaryServiceId, signal),
      staleTime: 15_000,
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
      // Der 1-Minuten-Takt der Statusleiste soll auch laufen, wenn der Tab
      // nicht im Fokus ist, und beim Zurückkehren sofort aktualisieren.
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    }),
  // `keepPreviousData`: Beim Wechsel des Zeitraums bleibt die alte Auswertung
  // stehen, statt die Seite für die Dauer der Anfrage zu leeren.
  usageDashboard: (range: string, refetchInterval = 60_000) => queryOptions({ queryKey: ["usage", "dashboard", range], queryFn: ({signal}) => apiClient.usageDashboard(range, signal), refetchInterval, staleTime: 30_000, placeholderData: keepPreviousData }),
  usageTimeline: (refetchInterval = 60_000) => queryOptions({ queryKey: ["usage", "timeline"], queryFn: ({signal}) => apiClient.usageTimeline(signal), refetchInterval, staleTime: 30_000, placeholderData: keepPreviousData }),
  accounts: () => queryOptions({ queryKey: ["accounts"], queryFn: ({signal}) => apiClient.accounts(signal), staleTime: 15_000 }),
  discoveredAccounts: () => queryOptions({ queryKey: ["accounts", "discovered"], queryFn: ({signal}) => apiClient.discoverAccounts(signal), staleTime: 15_000 }),
  orbit: () => queryOptions({ queryKey: ["orbit"], queryFn: ({signal}) => apiClient.orbit(signal), staleTime: 1_000 }),
  terminalSessions: (refetchInterval = 3_000) => queryOptions({ queryKey: ["terminal", "sessions"], queryFn: ({ signal }) => apiClient.terminalSessions(signal), refetchInterval, staleTime: 1_000 }),
  terminalWorkspace: () => queryOptions({ queryKey: ["terminal", "workspace"], queryFn: ({ signal }) => apiClient.terminalWorkspace(signal), staleTime: 1_000 }),
  news: (params:URLSearchParams, refetchInterval = 60_000) => queryOptions({queryKey:["news",params.toString()],queryFn:({signal})=>apiClient.news(params,signal),refetchInterval,staleTime:60_000}),
  newsItem:(id:string)=>queryOptions({queryKey:["news","item",id],queryFn:({signal})=>apiClient.newsItem(id,signal),staleTime:60_000}),
  newsCollections:()=>queryOptions({queryKey:["news","collections"],queryFn:({signal})=>apiClient.newsCollections(signal),staleTime:15_000}),
};
