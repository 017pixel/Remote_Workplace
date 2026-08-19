import {
  previewDependenciesResponseSchema,
  previewDevicePreferenceSchema,
  previewDevServerLogsSchema,
  previewDevServerStatusSchema,
  previewDevServersResponseSchema,
  previewDiagnosticsResponseSchema,
  previewHubPreferenceSchema,
  previewLocalStorageRestoreResponseSchema,
  previewLocalStorageStateSchema,
  previewRepairJobSchema,
  previewRuntimeLaunchSchema,
  previewRuntimeProfileSchema,
  previewServiceCandidatesResponseSchema,
  previewServiceGraphResponseSchema,
  previewSessionResponseSchema,
  previewSlotResetResponseSchema,
  previewSlotResetVerificationResponseSchema,
  previewSlotsResponseSchema,
  type PreviewDependenciesResponse,
  type PreviewDevicePreferenceRequest,
  type PreviewDiagnosticBatch,
  type PreviewExternalOpenMode,
  type PreviewLocalStorageEntry,
  type PreviewRepairRequest,
  type PreviewServiceEdge,
  type PreviewSessionRequest,
  type PreviewSlotAssignmentRequest,
  type PreviewSlotResetReport,
} from "@wrapt/contracts";
import { mutate, request } from "./transport.js";

export const previewsApi = {
  previewSlots: (signal?: AbortSignal) => request("/previews/slots", previewSlotsResponseSchema, signal),
  assignPreviewSlot: (body: PreviewSlotAssignmentRequest) => mutate("/previews/slots", "PUT", previewSlotsResponseSchema, body),
  previewDependencies: (projectId: string, primaryPort: number, signal?: AbortSignal) =>
    request(`/previews/dependencies?projectId=${encodeURIComponent(projectId)}&primaryPort=${primaryPort}`, previewDependenciesResponseSchema, signal),
  savePreviewDependencies: (body: PreviewDependenciesResponse) => mutate("/previews/dependencies", "PUT", previewDependenciesResponseSchema, body),
  openPreviewSession: (body: PreviewSessionRequest) => mutate("/previews/sessions", "POST", previewSessionResponseSchema, body),
  renewPreviewSession: (sessionId: string) => mutate(`/previews/sessions/${encodeURIComponent(sessionId)}/lease`, "PUT", previewSessionResponseSchema),
  closePreviewSession: (sessionId: string) => mutate(`/previews/sessions/${encodeURIComponent(sessionId)}`, "DELETE", null),
  closePreviewSessionByKey: (sessionKey: string) => mutate(`/previews/sessions/by-key/${encodeURIComponent(sessionKey)}`, "DELETE", null),
  previewDevicePreference: (signal?: AbortSignal) => request("/previews/device-preference", previewDevicePreferenceSchema, signal),
  savePreviewDevicePreference: (body: PreviewDevicePreferenceRequest) => mutate("/previews/device-preference", "PUT", previewDevicePreferenceSchema, body),
  previewHubPreference: (signal?: AbortSignal) => request("/previews/hub-preference", previewHubPreferenceSchema, signal),
  savePreviewHubPreference: (externalOpenMode: PreviewExternalOpenMode) => mutate("/previews/hub-preference", "PUT", previewHubPreferenceSchema, { externalOpenMode }),
  previewDevServer: (projectId: string, signal?: AbortSignal) => request(`/previews/dev-servers/${encodeURIComponent(projectId)}`, previewDevServerStatusSchema, signal),
  previewDevServers: (signal?: AbortSignal) => request("/previews/dev-servers", previewDevServersResponseSchema, signal),
  previewRuntimeProfile: (projectId: string, signal?: AbortSignal) => request(`/previews/dev-servers/${encodeURIComponent(projectId)}/profile`, previewRuntimeProfileSchema, signal),
  previewDevServerLogs: (projectId: string, signal?: AbortSignal) => request(`/previews/dev-servers/${encodeURIComponent(projectId)}/logs`, previewDevServerLogsSchema, signal),
  startPreviewDevServer: (projectId: string) => mutate(`/previews/dev-servers/${encodeURIComponent(projectId)}/start`, "POST", previewDevServerStatusSchema),
  launchPreviewRuntime: (projectId: string) => mutate(`/previews/dev-servers/${encodeURIComponent(projectId)}/launch`, "POST", previewRuntimeLaunchSchema),
  stopPreviewDevServer: (projectId: string) => mutate(`/previews/dev-servers/${encodeURIComponent(projectId)}/stop`, "POST", previewDevServerStatusSchema),
  restartPreviewDevServer: (projectId: string) => mutate(`/previews/dev-servers/${encodeURIComponent(projectId)}/restart`, "POST", previewDevServerStatusSchema),
  savePreviewDevServerMainPort: (projectId: string, mainPort: number | null) => mutate(`/previews/dev-servers/${encodeURIComponent(projectId)}/main-port`, "PUT", previewDevServerStatusSchema, { mainPort }),
  reclaimPreviewSlot: () => mutate("/previews/slots/reclaim", "POST", previewSlotResetResponseSchema),
  beginPreviewSlotReset: (slotId: number, body: { expectedGeneration: number; storageProfileId: string | null }) =>
    mutate(`/previews/slots/${slotId}/reset`, "POST", previewSlotResetResponseSchema, body),
  verifyPreviewSlotReset: (slotId: number, body: PreviewSlotResetReport) =>
    mutate(`/previews/slots/${slotId}/reset/verify`, "POST", previewSlotResetVerificationResponseSchema, body),
  previewServiceCandidates: (projectId: string | null, signal?: AbortSignal) =>
    request(`/previews/service-candidates${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, previewServiceCandidatesResponseSchema, signal),
  scanPreviewServiceCandidates: () => mutate("/previews/service-candidates/scan", "POST", previewServiceCandidatesResponseSchema),
  previewServiceGraph: (projectId: string, primaryServiceId: string, signal?: AbortSignal) =>
    request(`/previews/service-graphs/${encodeURIComponent(projectId)}/${encodeURIComponent(primaryServiceId)}`, previewServiceGraphResponseSchema, signal),
  savePreviewServiceGraph: (projectId: string, primaryServiceId: string, edges: PreviewServiceEdge[]) =>
    mutate(`/previews/service-graphs/${encodeURIComponent(projectId)}/${encodeURIComponent(primaryServiceId)}`, "PUT", previewServiceGraphResponseSchema, { edges }),
  sendPreviewDiagnostics: (body: PreviewDiagnosticBatch) => mutate("/previews/diagnostics/batches", "POST", previewDiagnosticsResponseSchema, body),
  previewDiagnostics: (query: { previewNodeId?: string; since?: string; severity?: string }, signal?: AbortSignal) => {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined));
    return request(`/previews/diagnostics?${search.toString()}`, previewDiagnosticsResponseSchema, signal);
  },
  previewDiagnosticsLog: (query: { previewNodeId?: string; since?: string; severity?: string }, signal?: AbortSignal) => {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined));
    return request(`/previews/diagnostics/log-tail?${search.toString()}`, previewDiagnosticsResponseSchema, signal);
  },
  previewStorageState: (storageProfileId: string, signal?: AbortSignal) =>
    request(`/previews/storage/${encodeURIComponent(storageProfileId)}`, previewLocalStorageStateSchema, signal),
  setPreviewStorageEnabled: (storageProfileId: string, enabled: boolean) =>
    mutate(`/previews/storage/${encodeURIComponent(storageProfileId)}`, "PUT", previewLocalStorageStateSchema, { enabled }),
  savePreviewStorageSnapshot: (storageProfileId: string, body: { expectedRevision: number | null; hash: string; bridgeVersion: string; entries: PreviewLocalStorageEntry[] }) =>
    mutate(`/previews/storage/${encodeURIComponent(storageProfileId)}/snapshots`, "POST", previewLocalStorageStateSchema, body),
  restorePreviewStorage: (storageProfileId: string, expectedRevision: number) =>
    mutate(`/previews/storage/${encodeURIComponent(storageProfileId)}/restore`, "POST", previewLocalStorageRestoreResponseSchema, { expectedRevision }),
  clearPreviewStorage: (storageProfileId: string) => mutate(`/previews/storage/${encodeURIComponent(storageProfileId)}`, "DELETE", null),
  repairPreview: (body: PreviewRepairRequest) => mutate("/previews/repair", "POST", previewRepairJobSchema, body),
};
