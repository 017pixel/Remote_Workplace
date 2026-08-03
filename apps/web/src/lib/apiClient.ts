import {
  apiErrorSchema,
  dashboardConfigSchema,
  commandsResponseSchema,
  healthResponseSchema,
  operationalMetricsSchema,
  readinessResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  serverMetricsSchema,
  serverSummarySchema,
  servicesResponseSchema,
  localPortsResponseSchema,
  previewSlotsResponseSchema,
  previewDependenciesResponseSchema,
  previewSessionResponseSchema,
  usageResponseSchema,
  usageDashboardResponseSchema,
  accountsResponseSchema,
  discoveredAccountsResponseSchema,
  accountResponseSchema,
  activateAccountResponseSchema,
  loginSessionResponseSchema,
  orbitDocumentResponseSchema,
  orbitAssetResponseSchema,
  orbitAssetListResponseSchema,
  galleryFileResponseSchema,
  galleryFileListResponseSchema,
  galleryFolderResponseSchema,
  galleryFolderListResponseSchema,
  projectFileResponseSchema,
  newsListResponseSchema, newsItemResponseSchema, newsCollectionsResponseSchema, newsCollectionResponseSchema,
  newsSyncResponseSchema, newsChatResponseSchema,
  terminalSessionsResponseSchema,
  terminalWorkspaceResponseSchema,
  filesystemTreeResponseSchema,
  fileManagerStateResponseSchema,
  fileManagerTextPreviewResponseSchema,
  fileManagerOperationResponseSchema,
  fileManagerSearchResponseSchema,
  filesystemEntrySchema,
  skillEditorStatusResponseSchema,
  skillEditorTreeResponseSchema,
  skillEditorReadResponseSchema,
  skillEditorCreateResponseSchema,
  skillEditorGitResponseSchema,
  type SkillEditorCreateRequest,
  type SkillEditorWriteRequest,
  registerProjectResponseSchema,
  projectActivityTouchResponseSchema,
  restartResponseSchema,
  restartStatusResponseSchema,
  t3ChannelStatusResponseSchema,
  usageMonitoringResponseSchema,
  hermesStatusSchema,
  hermesSessionsResponseSchema,
  hermesTasksResponseSchema,
  hermesCronResponseSchema,
  hermesResultsResponseSchema,
  hermesModelsResponseSchema,
  hermesDiagnosticsResponseSchema,
  hermesUpdateStateSchema,
  notificationListResponseSchema,
  notificationSchema,
  notificationPreferencesSchema,
  notificationReportSchema,
  notificationSettingsResponseSchema,
  pushSubscriptionSchema,
  type NotificationPresence,
  type RestartTarget,
  type T3Channel,
  type UsageMonitoring,
  type CreateAccountRequest,
  type UpdateAccountRequest,
  type SaveOrbitDocumentRequest,
  type OrbitAsset,
  type GalleryFile,
  type CreateProjectFileRequest,
  type ApiError,
  type CreateNewsCollectionRequest, type SaveNewsItemRequest, type MarkNewsReadRequest, type NewsChatRequest,
  type SaveTerminalWorkspaceRequest,
  type RegisterProjectRequest,
  type UpdateGalleryFileRequest,
  type FileManagerState,
  type FilesystemEntry,
  type PreviewSlotAssignmentRequest,
  type PreviewDependenciesResponse,
  type PreviewSessionRequest,
  previewDevicePreferenceSchema,
  previewDiagnosticsResponseSchema,
  previewLocalStorageRestoreResponseSchema,
  previewLocalStorageStateSchema,
  previewRepairJobSchema,
  previewServiceCandidatesResponseSchema,
  previewServiceGraphResponseSchema,
  previewSlotResetResponseSchema,
  previewSlotResetVerificationResponseSchema,
  type PreviewDevicePreferenceRequest,
  type PreviewDiagnosticBatch,
  type PreviewLocalStorageEntry,
  type PreviewRepairRequest,
  type PreviewServiceEdge,
  type PreviewSlotResetReport,
} from "@workbench/contracts";
import type { ZodType } from "zod";
import { z } from "zod";

const WORKBENCH_SYNC_VERSION = "2";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null = null,
    readonly retryable = false,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const API_TIMEOUT_MS = 30_000;

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function errorPayload(response: Response): Promise<ApiError | undefined> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function request<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "X-Workbench-Sync-Version": WORKBENCH_SYNC_VERSION },
    signal: requestSignal(signal),
  });

  if (!response.ok) {
    const payload = await errorPayload(response);
    throw new ApiClientError(
      response.status,
      payload?.error.code ?? "REQUEST_FAILED",
      payload?.error.message ?? "Die Workbench API ist momentan nicht erreichbar.",
      payload?.error.requestId ?? response.headers.get("x-request-id"),
      payload?.error.retryable ?? response.status >= 500,
      payload?.error.details ?? null,
    );
  }

  return schema.parse(await response.json());
}

async function mutate<T>(path: string, method: "POST"|"PUT"|"PATCH"|"DELETE", schema: ZodType<T> | null, body?: unknown): Promise<T | undefined> {
  const response = await fetch(`/api/v1${path}`, { method, cache: "no-store", credentials: "same-origin", signal: requestSignal(), headers: { Accept: "application/json", "X-Workbench-Sync-Version": WORKBENCH_SYNC_VERSION, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) { const payload = await errorPayload(response); throw new ApiClientError(response.status, payload?.error.code ?? "REQUEST_FAILED", payload?.error.message ?? "Die Änderung konnte nicht gespeichert werden.", payload?.error.requestId ?? response.headers.get("x-request-id"), payload?.error.retryable ?? response.status >= 500, payload?.error.details ?? null); }
  if (!schema || response.status === 204) return undefined;
  return schema.parse(await response.json());
}

async function uploadOrbitAsset(file: File, folderId?: string | null): Promise<OrbitAsset> {
  const form = new FormData(); form.append("file", file, file.name);
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  const response = await fetch(`/api/v1/orbit/assets${query}`, { method: "POST", credentials: "same-origin", signal: requestSignal(), headers: { Accept: "application/json" }, body: form });
  if (!response.ok) { const payload = await errorPayload(response); throw new ApiClientError(response.status, payload?.error.code ?? "ORBIT_ASSET_UPLOAD_FAILED", payload?.error.message ?? "Die Datei konnte nicht archiviert werden.", payload?.error.requestId ?? response.headers.get("x-request-id"), payload?.error.retryable ?? false, payload?.error.details ?? null); }
  return orbitAssetResponseSchema.parse(await response.json()).asset;
}

async function listOrbitAssets(cursor?: string, signal?: AbortSignal, folderId?: string | null) {
  const query = new URLSearchParams({ limit: "100" });
  if (cursor) query.set("cursor", cursor);
  if (folderId) query.set("folderId", folderId);
  return request(`/orbit/assets?${query}`, orbitAssetListResponseSchema, signal);
}

async function uploadGalleryFile(file: File, folderId?: string | null): Promise<GalleryFile> {
  const form = new FormData(); form.append("file", file, file.name);
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  const response = await fetch(`/api/v1/files${query}`, { method: "POST", credentials: "same-origin", signal: requestSignal(), headers: { Accept: "application/json" }, body: form });
  if (!response.ok) { const payload = await errorPayload(response); throw new ApiClientError(response.status, payload?.error.code ?? "FILE_GALLERY_UPLOAD_FAILED", payload?.error.message ?? "Die Datei konnte nicht hochgeladen werden.", payload?.error.requestId ?? response.headers.get("x-request-id"), payload?.error.retryable ?? false, payload?.error.details ?? null); }
  return galleryFileResponseSchema.parse(await response.json()).file;
}

async function listGalleryFiles(cursor?: string, signal?: AbortSignal, folderId?: string | null) {
  const query = new URLSearchParams({ limit: "100" });
  if (cursor) query.set("cursor", cursor);
  if (folderId) query.set("folderId", folderId);
  return request(`/files?${query}`, galleryFileListResponseSchema, signal);
}

async function filesystemTree(path?: string, cursor?: string, signal?: AbortSignal, limit?: number) {
  const query = new URLSearchParams();
  if (path) query.set("path", path);
  if (cursor) query.set("cursor", cursor);
  if (limit) query.set("limit", String(limit));
  return request(`/filesystem/tree${query.size ? `?${query}` : ""}`, filesystemTreeResponseSchema, signal);
}

async function filesystemTreeAll(path?: string, signal?: AbortSignal) {
  let cursor: string | undefined;
  let firstPage: Awaited<ReturnType<typeof filesystemTree>> | null = null;
  const entries: Awaited<ReturnType<typeof filesystemTree>>["entries"] = [];
  do {
    const page = await filesystemTree(path, cursor, signal, 500);
    firstPage ??= page;
    entries.push(...page.entries);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { ...firstPage!, entries, nextCursor: null };
}

async function fileManagerUpload(directoryPath: string, file: File): Promise<FilesystemEntry> {
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch(`/api/v1/filesystem/upload?path=${encodeURIComponent(directoryPath)}`, {
    method: "POST",
    credentials: "same-origin",
    signal: requestSignal(),
    headers: { Accept: "application/json" },
    body: form,
  });
  if (!response.ok) {
    const payload = await errorPayload(response);
    throw new ApiClientError(
      response.status,
      payload?.error.code ?? "FILESYSTEM_UPLOAD_FAILED",
      payload?.error.message ?? "Die Datei konnte nicht hochgeladen werden.",
      payload?.error.requestId ?? response.headers.get("x-request-id"),
      payload?.error.retryable ?? false,
      payload?.error.details ?? null,
    );
  }
  return filesystemEntrySchema.parse(await response.json());
}

async function fileManagerDownload(path: string): Promise<void> {
  const response = await fetch(`/api/v1/filesystem/download?path=${encodeURIComponent(path)}`, {
    credentials: "same-origin",
    signal: requestSignal(),
  });
  if (!response.ok) {
    const payload = await errorPayload(response);
    throw new ApiClientError(
      response.status,
      payload?.error.code ?? "FILESYSTEM_DOWNLOAD_FAILED",
      payload?.error.message ?? "Die Datei konnte nicht heruntergeladen werden.",
      payload?.error.requestId ?? response.headers.get("x-request-id"),
      payload?.error.retryable ?? false,
      payload?.error.details ?? null,
    );
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plainName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  let name = plainName ?? "datei";
  if (encodedName) {
    try { name = decodeURIComponent(encodedName); } catch { /* beschädigten Header ignorieren */ }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Letzte Rettung beim Schließen der Seite: `keepalive` lässt den Browser die
 * Anfrage auch nach dem Entladen des Dokuments zu Ende senden. Fehler bleiben
 * hier bewusst still — sichtbar wäre die Meldung ohnehin nicht mehr.
 */
function saveSkillEditorFileOnUnload(body: SkillEditorWriteRequest): void {
  void fetch("/api/v1/skills/file", {
    method: "PUT",
    keepalive: true,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Workbench-Sync-Version": WORKBENCH_SYNC_VERSION },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

export const apiClient = {
  health: (signal?: AbortSignal) => request("/health", healthResponseSchema, signal),
  dashboardConfig: (signal?: AbortSignal) => request("/system/dashboard-config", dashboardConfigSchema, signal),
  readiness: (signal?: AbortSignal) => request("/health/readiness", readinessResponseSchema, signal),
  operationalMetrics: (signal?: AbortSignal) => request("/system/operational-metrics", operationalMetricsSchema, signal),
  restartSystem: (target: RestartTarget) => mutate("/system/restart", "POST", restartResponseSchema, { target }),
  restartStatus: (signal?: AbortSignal) => request("/system/restart/status", restartStatusResponseSchema, signal),
  t3Channel: (signal?: AbortSignal) => request("/system/t3-channel", t3ChannelStatusResponseSchema, signal),
  setT3Channel: (channel: T3Channel) => mutate("/system/t3-channel", "POST", t3ChannelStatusResponseSchema, { channel }),
  usageMonitoring: (signal?: AbortSignal) => request("/system/usage-monitoring", usageMonitoringResponseSchema, signal),
  saveUsageMonitoring: (monitoring: UsageMonitoring) => mutate("/system/usage-monitoring", "PUT", usageMonitoringResponseSchema, { monitoring }),
  hermesStatus: (signal?: AbortSignal) => request("/hermes/status", hermesStatusSchema, signal),
  hermesSessions: (params: { limit?: number; offset?: number; q?: string; source?: string } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    if (params.q) query.set("q", params.q);
    if (params.source) query.set("source", params.source);
    return request(`/hermes/sessions${query.size ? `?${query}` : ""}`, hermesSessionsResponseSchema, signal);
  },
  hermesSessionMessages: (sessionId: string, signal?: AbortSignal) => request(`/hermes/sessions/${encodeURIComponent(sessionId)}/messages`, z.unknown(), signal),
  deleteHermesSession: (sessionId: string) => mutate(`/hermes/sessions/${encodeURIComponent(sessionId)}`, "DELETE", null),
  hermesTasks: (signal?: AbortSignal) => request("/hermes/tasks", hermesTasksResponseSchema, signal),
  cancelHermesTask: (sessionId: string) => mutate(`/hermes/tasks/${encodeURIComponent(sessionId)}/cancel`, "POST", null),
  hermesCron: (signal?: AbortSignal) => request("/hermes/cron", hermesCronResponseSchema, signal),
  hermesResults: (params: { source?: string; status?: string } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (params.source) query.set("source", params.source);
    if (params.status) query.set("status", params.status);
    return request(`/hermes/results${query.size ? `?${query}` : ""}`, hermesResultsResponseSchema, signal);
  },
  hermesModels: (signal?: AbortSignal) => request("/hermes/models", hermesModelsResponseSchema, signal),
  selectHermesModel: (model: string) => mutate("/hermes/models/select", "POST", hermesModelsResponseSchema, { model }),
  hermesDiagnostics: (signal?: AbortSignal) => request("/hermes/diagnostics", hermesDiagnosticsResponseSchema, signal),
  runHermesDiagnostics: () => mutate("/hermes/diagnostics/run", "POST", hermesDiagnosticsResponseSchema),
  hermesServiceAction: (target: "dashboard" | "gateway", action: "start" | "stop" | "restart") => mutate("/hermes/services/action", "POST", null, { target, action }),
  hermesUpdateStatus: (signal?: AbortSignal) => request("/hermes/update/status", hermesUpdateStateSchema, signal),
  hermesUpdateCheck: () => mutate("/hermes/update/check", "POST", null),
  hermesUpdateRun: () => mutate("/hermes/update/run", "POST", hermesUpdateStateSchema),
  notifications: (params: { unreadOnly?: boolean; source?: string; category?: string; severity?: string; cursor?: string; limit?: number } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    if (params.unreadOnly) query.set("unreadOnly", "true");
    if (params.source) query.set("source", params.source);
    if (params.category) query.set("category", params.category);
    if (params.severity) query.set("severity", params.severity);
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    return request(`/notifications${query.size ? `?${query}` : ""}`, notificationListResponseSchema, signal);
  },
  patchNotification: (id: string, body: { read?: boolean; acknowledged?: boolean }) => mutate(`/notifications/${encodeURIComponent(id)}`, "PATCH", notificationSchema.nullable(), body),
  updatePresence: (presence: NotificationPresence | null) => mutate("/notifications/presence", "PUT", z.object({ updated: z.number().int().nonnegative() }), presence),
  markAllNotificationsRead: (category?: string) => mutate("/notifications/mark-all-read", "POST", notificationListResponseSchema, category ? { category } : {}),
  deleteAllNotifications: () => mutate("/notifications", "DELETE", null),
  deleteNotification: (id: string) => mutate(`/notifications/${encodeURIComponent(id)}`, "DELETE", null),
  notificationReport: (id: string, signal?: AbortSignal) => request(`/notifications/${encodeURIComponent(id)}/report`, z.object({ report: notificationReportSchema }), signal),
  notificationSettings: (signal?: AbortSignal) => request("/notifications/settings", notificationSettingsResponseSchema, signal),
  saveNotificationSettings: (preferences: unknown) => mutate("/notifications/settings", "PUT", notificationSettingsResponseSchema, notificationPreferencesSchema.parse(preferences)),
  subscribePush: (subscription: unknown) => mutate("/notifications/push-subscription", "POST", z.object({ subscribed: z.boolean() }), pushSubscriptionSchema.parse(subscription)),
  unsubscribePush: (endpoint?: string) => mutate("/notifications/push-subscription", "DELETE", null, endpoint ? { endpoint } : {}),
  createCrashNotification: (body: unknown) => mutate("/notifications/report", "POST", notificationSchema, body),
  serverSummary: (signal?: AbortSignal) => request("/server/summary", serverSummarySchema, signal),
  serverMetrics: (signal?: AbortSignal) => request("/server/metrics", serverMetricsSchema, signal),
  services: (signal?: AbortSignal) => request("/services", servicesResponseSchema, signal),
  localPorts: (signal?: AbortSignal) => request("/local-ports", localPortsResponseSchema, signal),
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
  beginPreviewSlotReset: (slotId: number, body: { expectedGeneration: number; storageProfileId: string }) =>
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
  projects: (signal?: AbortSignal) => request("/projects", projectsResponseSchema, signal),
  project: (projectId: string, signal?: AbortSignal) =>
    request(`/projects/${encodeURIComponent(projectId)}`, projectResponseSchema, signal),
  touchProject: (projectId: string) => mutate(`/projects/${encodeURIComponent(projectId)}/activity`, "POST", projectActivityTouchResponseSchema),
  filesystemTree,
  filesystemTreeAll,
  fileManagerState: (signal?: AbortSignal) => request("/filesystem/state", fileManagerStateResponseSchema, signal),
  saveFileManagerState: (document: FileManagerState, expectedRevision: number | null) =>
    mutate("/filesystem/state", "PUT", fileManagerStateResponseSchema, { document, expectedRevision }),
  fileManagerPreview: (path: string, signal?: AbortSignal) =>
    request(`/filesystem/file?path=${encodeURIComponent(path)}`, fileManagerTextPreviewResponseSchema, signal),
  fileManagerMediaUrl: (path: string) => `/api/v1/filesystem/media?path=${encodeURIComponent(path)}`,
  fileManagerDownloadUrl: (path: string) => `/api/v1/filesystem/download?path=${encodeURIComponent(path)}`,
  fileManagerUpload,
  fileManagerDownload,
  fileManagerRename: (path: string, name: string) => mutate("/filesystem/rename", "POST", fileManagerOperationResponseSchema, { path, name }),
  fileManagerMove: (path: string, targetDirectory: string) => mutate("/filesystem/move", "POST", fileManagerOperationResponseSchema, { path, targetDirectory }),
  fileManagerDelete: (path: string) => mutate("/filesystem/delete", "POST", fileManagerOperationResponseSchema, { path, confirmed: true }),
  fileManagerMkdir: (path: string, name: string) => mutate("/filesystem/mkdir", "POST", fileManagerOperationResponseSchema, { path, name }),
  fileManagerSearch: (query: string, signal?: AbortSignal) =>
    request(`/filesystem/search?q=${encodeURIComponent(query)}`, fileManagerSearchResponseSchema, signal),
  skillEditorStatus: (signal?: AbortSignal) => request("/skills/status", skillEditorStatusResponseSchema, signal),
  skillEditorTree: (signal?: AbortSignal) => request("/skills/tree", skillEditorTreeResponseSchema, signal),
  skillEditorRead: (path: string, signal?: AbortSignal) =>
    request(`/skills/file?path=${encodeURIComponent(path)}`, skillEditorReadResponseSchema, signal),
  saveSkillEditorFile: (body: SkillEditorWriteRequest) => mutate("/skills/file", "PUT", skillEditorReadResponseSchema, body),
  saveSkillEditorFileOnUnload,
  createSkill: (body: SkillEditorCreateRequest) => mutate("/skills", "POST", skillEditorCreateResponseSchema, body),
  renameSkill: (name: string, newName: string) => mutate("/skills/rename", "POST", skillEditorCreateResponseSchema, { name, newName }),
  deleteSkill: (name: string) => mutate(`/skills/${encodeURIComponent(name)}`, "DELETE", null),
  commitSkills: () => mutate("/skills/git", "POST", skillEditorGitResponseSchema),
  registerProject: (body: RegisterProjectRequest) => mutate("/projects/register", "POST", registerProjectResponseSchema, body),
  commands: (signal?: AbortSignal) => request("/commands", commandsResponseSchema, signal),
  usage: (signal?: AbortSignal) => request("/usage", usageResponseSchema, signal),
  usageDashboard: (range: string, signal?: AbortSignal) => request(`/usage/dashboard?range=${encodeURIComponent(range)}`, usageDashboardResponseSchema, signal),
  syncUsage: () => mutate("/usage/sync", "POST", usageDashboardResponseSchema),
  accounts: (signal?: AbortSignal) => request("/accounts", accountsResponseSchema, signal),
  discoverAccounts: (signal?: AbortSignal) => request("/accounts/discover", discoveredAccountsResponseSchema, signal),
  createAccount: (body: CreateAccountRequest) => mutate("/accounts", "POST", accountResponseSchema, body),
  startLogin: (body: Omit<CreateAccountRequest, "source">) => mutate("/accounts/login-session", "POST", loginSessionResponseSchema, body),
  updateAccount: (id: string, body: UpdateAccountRequest) => mutate(`/accounts/${encodeURIComponent(id)}`, "PATCH", accountResponseSchema, body),
  deleteAccount: (id: string) => mutate(`/accounts/${encodeURIComponent(id)}`, "DELETE", null),
  activateAccount: (id: string) => mutate(`/accounts/${encodeURIComponent(id)}/activate`, "POST", activateAccountResponseSchema),
  orbit: (signal?: AbortSignal) => request("/orbit", orbitDocumentResponseSchema, signal),
  saveOrbit: (body: SaveOrbitDocumentRequest) => mutate("/orbit", "PUT", orbitDocumentResponseSchema, body),
  uploadOrbitAsset,
  listOrbitAssets,
  orbitAssetUrl: (assetId: string) => `/api/v1/orbit/assets/${encodeURIComponent(assetId)}`,
  updateOrbitAsset: (id: string, body: UpdateGalleryFileRequest) => mutate(`/orbit/assets/${encodeURIComponent(id)}`, "PATCH", orbitAssetResponseSchema, body),
  deleteOrbitAsset: (id: string) => mutate(`/orbit/assets/${encodeURIComponent(id)}`, "DELETE", null),
  listOrbitAssetFolders: (signal?: AbortSignal) => request("/orbit/assets/folders", galleryFolderListResponseSchema, signal),
  createOrbitAssetFolder: (name: string) => mutate("/orbit/assets/folders", "POST", galleryFolderResponseSchema, { name }),
  updateOrbitAssetFolder: (id: string, name: string) => mutate(`/orbit/assets/folders/${encodeURIComponent(id)}`, "PATCH", galleryFolderResponseSchema, { name }),
  deleteOrbitAssetFolder: (id: string) => mutate(`/orbit/assets/folders/${encodeURIComponent(id)}`, "DELETE", null),
  uploadGalleryFile,
  listGalleryFiles,
  galleryFileUrl: (fileId: string) => `/api/v1/files/${encodeURIComponent(fileId)}`,
  updateGalleryFile: (id: string, body: UpdateGalleryFileRequest) => mutate(`/files/${encodeURIComponent(id)}`, "PATCH", galleryFileResponseSchema, body),
  deleteGalleryFile: (id: string) => mutate(`/files/${encodeURIComponent(id)}`, "DELETE", null),
  listGalleryFolders: (signal?: AbortSignal) => request("/files/folders", galleryFolderListResponseSchema, signal),
  createGalleryFolder: (name: string) => mutate("/files/folders", "POST", galleryFolderResponseSchema, { name }),
  updateGalleryFolder: (id: string, name: string) => mutate(`/files/folders/${encodeURIComponent(id)}`, "PATCH", galleryFolderResponseSchema, { name }),
  deleteGalleryFolder: (id: string) => mutate(`/files/folders/${encodeURIComponent(id)}`, "DELETE", null),
  terminalSessions: (signal?: AbortSignal) => request("/terminal/sessions", terminalSessionsResponseSchema, signal),
  terminalWorkspace: (signal?: AbortSignal) => request("/terminal/workspace", terminalWorkspaceResponseSchema, signal),
  saveTerminalWorkspace: (body: SaveTerminalWorkspaceRequest) => mutate("/terminal/workspace", "PUT", terminalWorkspaceResponseSchema, body),
  restartTerminalSession: (id: string) => mutate(`/terminal/sessions/${encodeURIComponent(id)}/restart`, "POST", null),
  closeTerminalSession: (id: string) => mutate(`/terminal/sessions/${encodeURIComponent(id)}`, "DELETE", null),
  createProjectFile: (projectId: string, body: CreateProjectFileRequest) =>
    mutate(`/projects/${encodeURIComponent(projectId)}/files`, "POST", projectFileResponseSchema, body),
  news: (params: URLSearchParams, signal?:AbortSignal) => request(`/news?${params.toString()}`, newsListResponseSchema, signal),
  newsItem: (id:string,signal?:AbortSignal)=>request(`/news/${encodeURIComponent(id)}`,newsItemResponseSchema,signal),
  newsCollections: (signal?:AbortSignal)=>request("/news/collections",newsCollectionsResponseSchema,signal),
  createNewsCollection:(body:CreateNewsCollectionRequest)=>mutate("/news/collections","POST",newsCollectionResponseSchema,body),
  deleteNewsCollection:(id:string)=>mutate(`/news/collections/${encodeURIComponent(id)}`,"DELETE",null),
  saveNewsItem:(id:string,body:SaveNewsItemRequest)=>mutate(`/news/${encodeURIComponent(id)}/collections`,"PUT",newsItemResponseSchema,body),
  markNewsRead:(id:string,body:MarkNewsReadRequest)=>mutate(`/news/${encodeURIComponent(id)}/read`,"PATCH",newsItemResponseSchema,body),
  syncNews:()=>mutate("/news/sync","POST",newsSyncResponseSchema),
  chatNews:(body:NewsChatRequest)=>mutate("/news/chat","POST",newsChatResponseSchema,body),
};
