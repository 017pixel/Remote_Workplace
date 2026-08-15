import { describe, expect, it } from "vitest";
import {
  REALTIME_CONTRIBUTIONS_MAX_COUNT,
  realtimeContributionSchema,
  realtimeContributionsSchema,
} from "./realtime-contributions.js";

const channelBase = {
  id: "workbench.agent-tasks.realtime.tasks",
  description: "Synchronisiert Agent Tasks in Echtzeit.",
  provider: "workbench.agent-tasks.realtime-provider.tasks",
  scope: "project",
  maxMessageBytes: 64_000,
  maxConnectionsPerUser: 4,
  queue: {
    delivery: "reliable",
    highWaterMarkBytes: 128_000,
    maxQueueBytes: 1_000_000,
  },
  rateLimit: { maxMessages: 120, windowMilliseconds: 60_000 },
  heartbeat: { intervalMilliseconds: 30_000, timeoutMilliseconds: 10_000 },
  closeTimeoutMilliseconds: 2_000,
} as const;

const channel = {
  ...channelBase,
  direction: "bidirectional",
  clientMessageSchema: "./schemas/task-client-message.json",
  serverMessageSchema: "./schemas/task-server-message.json",
} as const;

describe("Realtime Contributions V1", () => {
  it("akzeptiert gerichtete und bidirektionale JSON-Kanäle", () => {
    expect(realtimeContributionSchema.safeParse(channel).success).toBe(true);
    expect(
      realtimeContributionSchema.safeParse({
        ...channelBase,
        direction: "server-to-client",
        serverMessageSchema: channel.serverMessageSchema,
      }).success,
    ).toBe(true);
    expect(
      realtimeContributionSchema.safeParse({
        ...channelBase,
        direction: "client-to-server",
        clientMessageSchema: channel.clientMessageSchema,
      }).success,
    ).toBe(true);
  });

  it("verlangt Richtungsschemas und weist rohe WebSocket-Felder ab", () => {
    expect(
      realtimeContributionSchema.safeParse({
        ...channel,
        serverMessageSchema: undefined,
      }).success,
    ).toBe(false);
    expect(
      realtimeContributionSchema.safeParse({
        ...channel,
        path: "/raw-socket",
        binary: true,
      }).success,
    ).toBe(false);
  });

  it("begrenzt Queue, Nachrichtengröße und Heartbeat", () => {
    expect(
      realtimeContributionSchema.safeParse({
        ...channel,
        queue: {
          ...channel.queue,
          highWaterMarkBytes: channel.queue.maxQueueBytes,
        },
      }).success,
    ).toBe(false);
    expect(
      realtimeContributionSchema.safeParse({
        ...channel,
        maxMessageBytes: channel.queue.maxQueueBytes + 1,
      }).success,
    ).toBe(false);
    expect(
      realtimeContributionSchema.safeParse({
        ...channel,
        heartbeat: {
          intervalMilliseconds: 30_000,
          timeoutMilliseconds: 30_000,
        },
      }).success,
    ).toBe(false);
  });

  it("weist doppelte IDs und übergroße Listen ab", () => {
    expect(realtimeContributionsSchema.safeParse([channel, channel]).success)
      .toBe(false);
    expect(
      realtimeContributionsSchema.safeParse(
        Array.from(
          { length: REALTIME_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...channel,
            id: `workbench.agent-tasks.realtime.tasks-${index}`,
            provider: `workbench.agent-tasks.realtime-provider.tasks-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
