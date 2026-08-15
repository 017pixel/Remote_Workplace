import { z } from "zod";
import { contributionDescriptionSchema } from "./contributions.js";
import { contributionIdSchema } from "./ids.js";
import { extensionJsonPathSchema } from "./package-paths.js";

export const REALTIME_CONTRIBUTIONS_MAX_COUNT = 128;
export const REALTIME_MAX_MESSAGE_BYTES = 1_000_000;
export const REALTIME_MAX_QUEUE_BYTES = 8_000_000;
export const REALTIME_MAX_CONNECTIONS_PER_USER = 32;
export const REALTIME_MAX_MESSAGES_PER_WINDOW = 1_000;
export const REALTIME_MAX_RATE_WINDOW_MILLISECONDS = 3_600_000;
export const REALTIME_MAX_HEARTBEAT_INTERVAL_MILLISECONDS = 120_000;
export const REALTIME_MAX_HEARTBEAT_TIMEOUT_MILLISECONDS = 60_000;
export const REALTIME_MAX_CLOSE_TIMEOUT_MILLISECONDS = 10_000;

export const realtimeScopes = ["user", "project"] as const;
export const realtimeScopeSchema = z.enum(realtimeScopes);
export type RealtimeScope = z.infer<typeof realtimeScopeSchema>;

export const realtimeDeliveryModes = ["reliable", "latest"] as const;
export const realtimeDeliveryModeSchema = z.enum(realtimeDeliveryModes);
export type RealtimeDeliveryMode = z.infer<
  typeof realtimeDeliveryModeSchema
>;

export const realtimeQueuePolicySchema = z
  .strictObject({
    delivery: realtimeDeliveryModeSchema,
    highWaterMarkBytes: z
      .number()
      .int()
      .min(1_024)
      .max(REALTIME_MAX_QUEUE_BYTES),
    maxQueueBytes: z
      .number()
      .int()
      .min(1_024)
      .max(REALTIME_MAX_QUEUE_BYTES),
  })
  .superRefine((policy, context) => {
    if (policy.highWaterMarkBytes < policy.maxQueueBytes) return;
    context.addIssue({
      code: "custom",
      message: "Die High Water Mark muss kleiner als die maximale Queue sein.",
      path: ["highWaterMarkBytes"],
    });
  });

export type RealtimeQueuePolicy = z.infer<typeof realtimeQueuePolicySchema>;

export const realtimeRateLimitSchema = z.strictObject({
  maxMessages: z
    .number()
    .int()
    .min(1)
    .max(REALTIME_MAX_MESSAGES_PER_WINDOW),
  windowMilliseconds: z
    .number()
    .int()
    .min(1_000)
    .max(REALTIME_MAX_RATE_WINDOW_MILLISECONDS),
});

export type RealtimeRateLimit = z.infer<typeof realtimeRateLimitSchema>;

export const realtimeHeartbeatPolicySchema = z
  .strictObject({
    intervalMilliseconds: z
      .number()
      .int()
      .min(5_000)
      .max(REALTIME_MAX_HEARTBEAT_INTERVAL_MILLISECONDS),
    timeoutMilliseconds: z
      .number()
      .int()
      .min(1_000)
      .max(REALTIME_MAX_HEARTBEAT_TIMEOUT_MILLISECONDS),
  })
  .superRefine((policy, context) => {
    if (policy.timeoutMilliseconds < policy.intervalMilliseconds) return;
    context.addIssue({
      code: "custom",
      message: "Der Heartbeat Timeout muss kleiner als das Intervall sein.",
      path: ["timeoutMilliseconds"],
    });
  });

export type RealtimeHeartbeatPolicy = z.infer<
  typeof realtimeHeartbeatPolicySchema
>;

const realtimeContributionBaseShape = {
  id: contributionIdSchema,
  description: contributionDescriptionSchema,
  provider: contributionIdSchema,
  scope: realtimeScopeSchema,
  maxMessageBytes: z.number().int().min(1).max(REALTIME_MAX_MESSAGE_BYTES),
  maxConnectionsPerUser: z
    .number()
    .int()
    .min(1)
    .max(REALTIME_MAX_CONNECTIONS_PER_USER),
  queue: realtimeQueuePolicySchema,
  rateLimit: realtimeRateLimitSchema,
  heartbeat: realtimeHeartbeatPolicySchema,
  closeTimeoutMilliseconds: z
    .number()
    .int()
    .min(250)
    .max(REALTIME_MAX_CLOSE_TIMEOUT_MILLISECONDS),
};

export const serverToClientRealtimeContributionSchema = z.strictObject({
  ...realtimeContributionBaseShape,
  direction: z.literal("server-to-client"),
  serverMessageSchema: extensionJsonPathSchema,
});

export const clientToServerRealtimeContributionSchema = z.strictObject({
  ...realtimeContributionBaseShape,
  direction: z.literal("client-to-server"),
  clientMessageSchema: extensionJsonPathSchema,
});

export const bidirectionalRealtimeContributionSchema = z.strictObject({
  ...realtimeContributionBaseShape,
  direction: z.literal("bidirectional"),
  clientMessageSchema: extensionJsonPathSchema,
  serverMessageSchema: extensionJsonPathSchema,
});

export const realtimeContributionSchema = z
  .discriminatedUnion("direction", [
    serverToClientRealtimeContributionSchema,
    clientToServerRealtimeContributionSchema,
    bidirectionalRealtimeContributionSchema,
  ])
  .superRefine((channel, context) => {
    if (channel.maxMessageBytes <= channel.queue.maxQueueBytes) return;
    context.addIssue({
      code: "custom",
      message: "Eine einzelne Nachricht muss in die maximale Queue passen.",
      path: ["maxMessageBytes"],
    });
  });

export type RealtimeContribution = z.infer<typeof realtimeContributionSchema>;

export const realtimeContributionsSchema = z
  .array(realtimeContributionSchema)
  .min(1)
  .max(REALTIME_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((channels, context) => {
    const ids = new Set<string>();
    for (const [index, channel] of channels.entries()) {
      if (ids.has(channel.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Realtime Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(channel.id);
    }
  })
  .meta({ uniqueItems: true });

export type RealtimeContributions = z.infer<
  typeof realtimeContributionsSchema
>;
