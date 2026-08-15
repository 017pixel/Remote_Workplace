import { describe, expect, it } from "vitest";
import {
  BACKGROUND_SERVICE_CONTRIBUTIONS_MAX_COUNT,
  backgroundServiceContributionSchema,
  backgroundServiceContributionsSchema,
} from "./background-service-contributions.js";

const service = {
  id: "workbench.agent-tasks.background-service.sync",
  title: "Agent Tasks synchronisieren",
  description: "Synchronisiert Agent Tasks im Hintergrund.",
  provider: "workbench.agent-tasks.background-service-provider.sync",
  enabledByDefault: true,
  restart: {
    mode: "on-failure",
    maxAttempts: 3,
    windowMilliseconds: 300_000,
    backoffMilliseconds: 1_000,
  },
  health: {
    intervalMilliseconds: 30_000,
    timeoutMilliseconds: 5_000,
    failureThreshold: 3,
  },
  shutdownTimeoutMilliseconds: 10_000,
} as const;

describe("Background Service Contributions V1", () => {
  it("akzeptiert einen begrenzt neu startenden hostverwalteten Provider", () => {
    expect(backgroundServiceContributionSchema.safeParse(service).success)
      .toBe(true);
    expect(
      backgroundServiceContributionSchema.safeParse({
        ...service,
        restart: { mode: "never" },
      }).success,
    ).toBe(true);
  });

  it("weist ungebundene Prozesse und ungültige Zeitgrenzen ab", () => {
    expect(
      backgroundServiceContributionSchema.safeParse({
        ...service,
        command: "node worker.js",
      }).success,
    ).toBe(false);
    expect(
      backgroundServiceContributionSchema.safeParse({
        ...service,
        restart: {
          ...service.restart,
          backoffMilliseconds: service.restart.windowMilliseconds,
        },
      }).success,
    ).toBe(false);
    expect(
      backgroundServiceContributionSchema.safeParse({
        ...service,
        health: {
          ...service.health,
          timeoutMilliseconds: service.health.intervalMilliseconds,
        },
      }).success,
    ).toBe(false);
  });

  it("weist doppelte IDs und Provider ab", () => {
    expect(
      backgroundServiceContributionsSchema.safeParse([service, service])
        .success,
    ).toBe(false);
    expect(
      backgroundServiceContributionsSchema.safeParse([
        service,
        {
          ...service,
          id: "workbench.agent-tasks.background-service.other",
        },
      ]).success,
    ).toBe(false);
  });

  it("weist übergroße Contribution-Listen ab", () => {
    expect(
      backgroundServiceContributionsSchema.safeParse(
        Array.from(
          { length: BACKGROUND_SERVICE_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...service,
            id: `workbench.agent-tasks.background-service.sync-${index}`,
            provider: `workbench.agent-tasks.background-service-provider.sync-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
