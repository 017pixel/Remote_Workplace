import {
  commandsResponseSchema,
  healthResponseSchema,
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
  registerProjectResponseSchema,
  projectActivityTouchResponseSchema,
  restartResponseSchema,
  restartStatusResponseSchema,
  t3ChannelStatusResponseSchema,
  type RestartTarget,
  type T3Channel,
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
  type PreviewSlotAssignmentRequest,
  type PreviewDependenciesResponse,
  type PreviewSessionRequest,
} from "@workbench/contracts";
import type { ZodType } from "zod";

const WORKBENCH_SYNC_VERSION = "2";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "X-Workbench-Sync-Version": WORKBENCH_SYNC_VERSION },
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    let payload: ApiError | undefined;
    try {
      payload = (await response.json()) as ApiError;
    } catch {
      payload = undefined;
    }
    throw new ApiClientError(
      response.status,
      payload?.error.code ?? "REQUEST_FAILED",
      payload?.error.message ?? "Die Workbench API ist momentan nicht erreichbar.",
    );
  }

  return schema.parse(await response.json());
}

async function mutate<T>(path: string, method: "POST"|"PUT"|"PATCH"|"DELETE", schema: ZodType<T> | null, body?: unknown): Promise<T | undefined> {
  const response = await fetch(`/api/v1${path}`, { method, cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json", "X-Workbench-Sync-Version": WORKBENCH_SYNC_VERSION, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) { let payload: ApiError | undefined; try { payload = await response.json() as ApiError; } catch { payload = undefined; } throw new ApiClientError(response.status, payload?.error.code ?? "REQUEST_FAILED", payload?.error.message ?? "Die Änderung konnte nicht gespeichert werden."); }
  if (!schema || response.status === 204) return undefined;
  return schema.parse(await response.json());
}

async function uploadOrbitAsset(file: File, folderId?: string | null): Promise<OrbitAsset> {
  const form = new FormData(); form.append("file", file, file.name);
  const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
  const response = await fetch(`/api/v1/orbit/assets${query}`, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" }, body: form });
  if (!response.ok) { let payload: ApiError | undefined; try { payload = await response.json() as ApiError; } catch { /* handled below */ } throw new ApiClientError(response.status, payload?.error.code ?? "ORBIT_ASSET_UPLOAD_FAILED", payload?.error.message ?? "Die Datei konnte nicht archiviert werden."); }
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
  const response = await fetch(`/api/v1/files${query}`, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" }, body: form });
  if (!response.ok) { let payload: ApiError | undefined; try { payload = await response.json() as ApiError; } catch { /* handled below */ } throw new ApiClientError(response.status, payload?.error.code ?? "FILE_GALLERY_UPLOAD_FAILED", payload?.error.message ?? "Die Datei konnte nicht hochgeladen werden."); }
  return galleryFileResponseSchema.parse(await response.json()).file;
}

async function listGalleryFiles(cursor?: string, signal?: AbortSignal, folderId?: string | null) {
  const query = new URLSearchParams({ limit: "100" });
  if (cursor) query.set("cursor", cursor);
  if (folderId) query.set("folderId", folderId);
  return request(`/files?${query}`, galleryFileListResponseSchema, signal);
}

async function filesystemTree(path?: string, cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (path) query.set("path", path);
  if (cursor) query.set("cursor", cursor);
  return request(`/filesystem/tree${query.size ? `?${query}` : ""}`, filesystemTreeResponseSchema, signal);
}

export const apiClient = {
  health: (signal?: AbortSignal) => request("/health", healthResponseSchema, signal),
  restartSystem: (target: RestartTarget) => mutate("/system/restart", "POST", restartResponseSchema, { target }),
  restartStatus: (signal?: AbortSignal) => request("/system/restart/status", restartStatusResponseSchema, signal),
  t3Channel: (signal?: AbortSignal) => request("/system/t3-channel", t3ChannelStatusResponseSchema, signal),
  setT3Channel: (channel: T3Channel) => mutate("/system/t3-channel", "POST", t3ChannelStatusResponseSchema, { channel }),
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
  closePreviewSession: (sessionKey: string) => mutate(`/previews/sessions/${encodeURIComponent(sessionKey)}`, "DELETE", null),
  projects: (signal?: AbortSignal) => request("/projects", projectsResponseSchema, signal),
  project: (projectId: string, signal?: AbortSignal) =>
    request(`/projects/${encodeURIComponent(projectId)}`, projectResponseSchema, signal),
  touchProject: (projectId: string) => mutate(`/projects/${encodeURIComponent(projectId)}/activity`, "POST", projectActivityTouchResponseSchema),
  filesystemTree,
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
