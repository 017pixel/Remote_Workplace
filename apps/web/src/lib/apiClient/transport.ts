import { apiErrorSchema, type ApiError } from "@wrapt/contracts";
import type { ZodType } from "zod";

export const WRAPT_SYNC_VERSION = "2";

const API_TIMEOUT_MS = 30_000;

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

export function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function errorPayload(response: Response): Promise<ApiError | undefined> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function request<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", "X-Wrapt-Sync-Version": WRAPT_SYNC_VERSION },
    signal: requestSignal(signal),
  });

  if (!response.ok) {
    const payload = await errorPayload(response);
    throw new ApiClientError(
      response.status,
      payload?.error.code ?? "REQUEST_FAILED",
      payload?.error.message ?? "Die Wrapt-API ist momentan nicht erreichbar.",
      payload?.error.requestId ?? response.headers.get("x-request-id"),
      payload?.error.retryable ?? response.status >= 500,
      payload?.error.details ?? null,
    );
  }

  return schema.parse(await response.json());
}

export async function mutate<T>(path: string, method: "POST"|"PUT"|"PATCH"|"DELETE", schema: ZodType<T> | null, body?: unknown): Promise<T | undefined> {
  const response = await fetch(`/api/v1${path}`, { method, cache: "no-store", credentials: "same-origin", signal: requestSignal(), headers: { Accept: "application/json", "X-Wrapt-Sync-Version": WRAPT_SYNC_VERSION, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) { const payload = await errorPayload(response); throw new ApiClientError(response.status, payload?.error.code ?? "REQUEST_FAILED", payload?.error.message ?? "Die Änderung konnte nicht gespeichert werden.", payload?.error.requestId ?? response.headers.get("x-request-id"), payload?.error.retryable ?? response.status >= 500, payload?.error.details ?? null); }
  if (!schema || response.status === 204) return undefined;
  return schema.parse(await response.json());
}
