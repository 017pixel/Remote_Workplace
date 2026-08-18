import {
  newsChatResponseSchema,
  newsCollectionResponseSchema,
  newsCollectionsResponseSchema,
  newsItemResponseSchema,
  newsListResponseSchema,
  newsSyncResponseSchema,
  type CreateNewsCollectionRequest,
  type MarkNewsReadRequest,
  type NewsChatRequest,
  type SaveNewsItemRequest,
} from "@workbench/contracts";
import { mutate, request } from "./transport.js";

export const newsApi = {
  news: (params: URLSearchParams, signal?: AbortSignal) => request(`/news?${params.toString()}`, newsListResponseSchema, signal),
  newsItem: (id: string, signal?: AbortSignal) => request(`/news/${encodeURIComponent(id)}`, newsItemResponseSchema, signal),
  newsCollections: (signal?: AbortSignal) => request("/news/collections", newsCollectionsResponseSchema, signal),
  createNewsCollection: (body: CreateNewsCollectionRequest) => mutate("/news/collections", "POST", newsCollectionResponseSchema, body),
  deleteNewsCollection: (id: string) => mutate(`/news/collections/${encodeURIComponent(id)}`, "DELETE", null),
  saveNewsItem: (id: string, body: SaveNewsItemRequest) => mutate(`/news/${encodeURIComponent(id)}/collections`, "PUT", newsItemResponseSchema, body),
  markNewsRead: (id: string, body: MarkNewsReadRequest) => mutate(`/news/${encodeURIComponent(id)}/read`, "PATCH", newsItemResponseSchema, body),
  syncNews: () => mutate("/news/sync", "POST", newsSyncResponseSchema),
  chatNews: (body: NewsChatRequest) => mutate("/news/chat", "POST", newsChatResponseSchema, body),
};
