import {
  galleryFileListResponseSchema,
  galleryFileResponseSchema,
  galleryFolderListResponseSchema,
  galleryFolderResponseSchema,
  orbitAssetListResponseSchema,
  orbitAssetResponseSchema,
  orbitDocumentResponseSchema,
  type GalleryFile,
  type OrbitAsset,
  type SaveOrbitDocumentRequest,
  type UpdateGalleryFileRequest,
} from "@wrapt/contracts";
import { ApiClientError, errorPayload, mutate, request, requestSignal } from "./transport.js";

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

export const orbitApi = {
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
};
