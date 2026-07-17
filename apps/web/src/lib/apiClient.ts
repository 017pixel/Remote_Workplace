import {
  commandsResponseSchema,
  healthResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
  serverMetricsSchema,
  serverSummarySchema,
  servicesResponseSchema,
  localPortsResponseSchema,
  usageResponseSchema,
  usageDashboardResponseSchema,
  accountsResponseSchema,
  discoveredAccountsResponseSchema,
  accountResponseSchema,
  loginSessionResponseSchema,
  orbitDocumentResponseSchema,
  projectFileResponseSchema,
  newsListResponseSchema, newsItemResponseSchema, newsCollectionsResponseSchema, newsCollectionResponseSchema,
  newsSyncResponseSchema, newsChatResponseSchema,
  type CreateAccountRequest,
  type UpdateAccountRequest,
  type SaveOrbitDocumentRequest,
  type CreateProjectFileRequest,
  type ApiError,
  type CreateNewsCollectionRequest, type SaveNewsItemRequest, type MarkNewsReadRequest, type NewsChatRequest,
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
  const response = await fetch(`/api/v1${path}`, { method, cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Workbench-Sync-Version": WORKBENCH_SYNC_VERSION }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) { let payload: ApiError | undefined; try { payload = await response.json() as ApiError; } catch { payload = undefined; } throw new ApiClientError(response.status, payload?.error.code ?? "REQUEST_FAILED", payload?.error.message ?? "Die Änderung konnte nicht gespeichert werden."); }
  if (!schema || response.status === 204) return undefined;
  return schema.parse(await response.json());
}

export const apiClient = {
  health: (signal?: AbortSignal) => request("/health", healthResponseSchema, signal),
  serverSummary: (signal?: AbortSignal) => request("/server/summary", serverSummarySchema, signal),
  serverMetrics: (signal?: AbortSignal) => request("/server/metrics", serverMetricsSchema, signal),
  services: (signal?: AbortSignal) => request("/services", servicesResponseSchema, signal),
  localPorts: (signal?: AbortSignal) => request("/local-ports", localPortsResponseSchema, signal),
  projects: (signal?: AbortSignal) => request("/projects", projectsResponseSchema, signal),
  project: (projectId: string, signal?: AbortSignal) =>
    request(`/projects/${encodeURIComponent(projectId)}`, projectResponseSchema, signal),
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
  orbit: (signal?: AbortSignal) => request("/orbit", orbitDocumentResponseSchema, signal),
  saveOrbit: (body: SaveOrbitDocumentRequest) => mutate("/orbit", "PUT", orbitDocumentResponseSchema, body),
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
