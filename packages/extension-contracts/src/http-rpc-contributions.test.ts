import { describe, expect, it } from "vitest";
import {
  HTTP_CONTRIBUTIONS_MAX_COUNT,
  httpContributionSchema,
  httpContributionsSchema,
  rpcContributionSchema,
  rpcContributionsSchema,
} from "./http-rpc-contributions.js";

const endpoint = {
  id: "workbench.agent-tasks.http.task",
  description: "Liest einen Agent Task.",
  provider: "workbench.agent-tasks.http-provider.task",
  requestSchema: "./schemas/task-request.json",
  responseSchema: "./schemas/task-response.json",
  maxRequestBytes: 64_000,
  maxResponseBytes: 256_000,
  timeoutMilliseconds: 10_000,
  rateLimit: { maxRequests: 60, windowMilliseconds: 60_000 },
  method: "GET",
  path: "/tasks/:taskId",
} as const;

const procedure = {
  id: "workbench.agent-tasks.rpc.create",
  description: "Erstellt einen Agent Task.",
  provider: "workbench.agent-tasks.rpc-provider.create",
  requestSchema: "./schemas/create-task-request.json",
  responseSchema: "./schemas/create-task-response.json",
  maxRequestBytes: 64_000,
  maxResponseBytes: 256_000,
  timeoutMilliseconds: 10_000,
  rateLimit: { maxRequests: 30, windowMilliseconds: 60_000 },
  kind: "mutation",
} as const;

describe("HTTP/RPC Contributions V1", () => {
  it("akzeptiert typisierte HTTP-Endpunkte und RPC-Prozeduren", () => {
    expect(httpContributionSchema.safeParse(endpoint).success).toBe(true);
    expect(rpcContributionSchema.safeParse(procedure).success).toBe(true);
  });

  it("weist Pfadkollisionen derselben Methode ab", () => {
    expect(
      httpContributionsSchema.safeParse([
        endpoint,
        {
          ...endpoint,
          id: "workbench.agent-tasks.http.other",
          provider: "workbench.agent-tasks.http-provider.other",
          path: "/tasks/:otherId",
        },
      ]).success,
    ).toBe(false);
    expect(
      httpContributionsSchema.safeParse([
        endpoint,
        {
          ...endpoint,
          id: "workbench.agent-tasks.http.update",
          provider: "workbench.agent-tasks.http-provider.update",
          method: "PUT",
        },
      ]).success,
    ).toBe(true);
  });

  it("weist unsichere HTTP-Felder und übergroße Limits ab", () => {
    expect(
      httpContributionSchema.safeParse({
        ...endpoint,
        path: "/tasks/*",
      }).success,
    ).toBe(false);
    expect(
      httpContributionSchema.safeParse({
        ...endpoint,
        public: true,
      }).success,
    ).toBe(false);
    expect(
      httpContributionSchema.safeParse({
        ...endpoint,
        rateLimit: { maxRequests: 1_001, windowMilliseconds: 60_000 },
      }).success,
    ).toBe(false);
  });

  it("weist doppelte RPC-IDs und rohe Handler ab", () => {
    expect(rpcContributionsSchema.safeParse([procedure, procedure]).success)
      .toBe(false);
    expect(
      rpcContributionSchema.safeParse({
        ...procedure,
        handler: "return process.env",
      }).success,
    ).toBe(false);
  });

  it("weist übergroße HTTP-Listen ab", () => {
    expect(
      httpContributionsSchema.safeParse(
        Array.from(
          { length: HTTP_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...endpoint,
            id: `workbench.agent-tasks.http.task-${index}`,
            provider: `workbench.agent-tasks.http-provider.task-${index}`,
            path: `/tasks/task-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
