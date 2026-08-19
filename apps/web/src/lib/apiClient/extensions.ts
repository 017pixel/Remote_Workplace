import {
  catalogEntrySchema,
  catalogProviderIdSchema,
  extensionManagementAcceptedSchema,
  extensionRegistryDetailSchema,
  extensionRegistrySnapshotSchema,
  sha256IntegritySchema,
  type ExtensionManagementRequest,
} from "@wrapt/extension-contracts";
import { z } from "zod";
import { mutate, request } from "./transport.js";

const extensionCatalogResponseSchema = z.strictObject({
  providerId: catalogProviderIdSchema,
  revision: sha256IntegritySchema,
  entries: z.array(catalogEntrySchema),
});

export const extensionsApi = {
  extensionCatalog: (signal?: AbortSignal) => request("/extensions/catalog", extensionCatalogResponseSchema, signal),
  extensionRegistry: (signal?: AbortSignal) => request("/extensions", extensionRegistrySnapshotSchema, signal),
  extensionDetail: (id: string, signal?: AbortSignal) => request(`/extensions/${encodeURIComponent(id)}`, extensionRegistryDetailSchema, signal),
  dispatchExtensionOperation: (body: ExtensionManagementRequest) => mutate(`/extensions/${encodeURIComponent(body.extensionId)}/operations`, "POST", extensionManagementAcceptedSchema, body),
};
