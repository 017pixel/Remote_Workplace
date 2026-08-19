import {
  fileManagerOperationResponseSchema,
  fileManagerSearchResponseSchema,
  fileManagerStateResponseSchema,
  fileManagerTextPreviewResponseSchema,
  filesystemEntrySchema,
  filesystemTreeResponseSchema,
  type FileManagerState,
  type FilesystemEntry,
} from "@wrapt/contracts";
import { ApiClientError, errorPayload, mutate, request, requestSignal } from "./transport.js";

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

export const filesystemApi = {
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
};
