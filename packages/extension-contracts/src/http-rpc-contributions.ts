import { z } from "zod";
import {
  contributionDescriptionSchema,
  routePathCollisionKey,
  routePathSchema,
} from "./contributions.js";
import { contributionIdSchema } from "./ids.js";
import { extensionJsonPathSchema } from "./package-paths.js";

export const HTTP_CONTRIBUTIONS_MAX_COUNT = 128;
export const RPC_CONTRIBUTIONS_MAX_COUNT = 128;
export const EXTENSION_API_MAX_REQUEST_BYTES = 10_000_000;
export const EXTENSION_API_MAX_RESPONSE_BYTES = 20_000_000;
export const EXTENSION_API_MAX_TIMEOUT_MILLISECONDS = 120_000;
export const EXTENSION_API_MAX_RATE_REQUESTS = 1_000;
export const EXTENSION_API_MAX_RATE_WINDOW_MILLISECONDS = 3_600_000;

export const extensionApiRateLimitSchema = z.strictObject({
  maxRequests: z.number().int().min(1).max(EXTENSION_API_MAX_RATE_REQUESTS),
  windowMilliseconds: z
    .number()
    .int()
    .min(1_000)
    .max(EXTENSION_API_MAX_RATE_WINDOW_MILLISECONDS),
});

export type ExtensionApiRateLimit = z.infer<
  typeof extensionApiRateLimitSchema
>;

const extensionApiHandlerShape = {
  id: contributionIdSchema,
  description: contributionDescriptionSchema,
  provider: contributionIdSchema,
  requestSchema: extensionJsonPathSchema,
  responseSchema: extensionJsonPathSchema,
  maxRequestBytes: z.number().int().min(1).max(EXTENSION_API_MAX_REQUEST_BYTES),
  maxResponseBytes: z
    .number()
    .int()
    .min(1)
    .max(EXTENSION_API_MAX_RESPONSE_BYTES),
  timeoutMilliseconds: z
    .number()
    .int()
    .min(100)
    .max(EXTENSION_API_MAX_TIMEOUT_MILLISECONDS),
  rateLimit: extensionApiRateLimitSchema,
};

export const extensionHttpMethods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export const extensionHttpMethodSchema = z.enum(extensionHttpMethods);
export type ExtensionHttpMethod = z.infer<typeof extensionHttpMethodSchema>;

export const httpContributionSchema = z.strictObject({
  ...extensionApiHandlerShape,
  method: extensionHttpMethodSchema,
  path: routePathSchema,
});

export type HttpContribution = z.infer<typeof httpContributionSchema>;

export const httpContributionsSchema = z
  .array(httpContributionSchema)
  .min(1)
  .max(HTTP_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((endpoints, context) => {
    const ids = new Set<string>();
    const routes = new Set<string>();
    for (const [index, endpoint] of endpoints.entries()) {
      if (ids.has(endpoint.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede HTTP Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(endpoint.id);

      const pathKey = routePathCollisionKey(endpoint.path);
      const routeKey = pathKey === null ? null : `${endpoint.method} ${pathKey}`;
      if (routeKey !== null && routes.has(routeKey)) {
        context.addIssue({
          code: "custom",
          message:
            "HTTP Contributions derselben Methode dürfen keine kollidierenden Pfade besitzen.",
          path: [index, "path"],
        });
      }
      if (routeKey !== null) routes.add(routeKey);
    }
  })
  .meta({ uniqueItems: true });

export type HttpContributions = z.infer<typeof httpContributionsSchema>;

export const extensionRpcKinds = ["query", "mutation"] as const;
export const extensionRpcKindSchema = z.enum(extensionRpcKinds);
export type ExtensionRpcKind = z.infer<typeof extensionRpcKindSchema>;

export const rpcContributionSchema = z.strictObject({
  ...extensionApiHandlerShape,
  kind: extensionRpcKindSchema,
});

export type RpcContribution = z.infer<typeof rpcContributionSchema>;

export const rpcContributionsSchema = z
  .array(rpcContributionSchema)
  .min(1)
  .max(RPC_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((procedures, context) => {
    const ids = new Set<string>();
    for (const [index, procedure] of procedures.entries()) {
      if (ids.has(procedure.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede RPC Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(procedure.id);
    }
  })
  .meta({ uniqueItems: true });

export type RpcContributions = z.infer<typeof rpcContributionsSchema>;
