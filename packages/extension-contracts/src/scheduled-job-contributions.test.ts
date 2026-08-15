import { describe, expect, it } from "vitest";
import {
  SCHEDULED_JOB_CONTRIBUTIONS_MAX_COUNT,
  scheduledJobContributionSchema,
  scheduledJobContributionsSchema,
} from "./scheduled-job-contributions.js";

const job = {
  id: "workbench.agent-tasks.scheduled-job.sync",
  title: "Agent Tasks synchronisieren",
  description: "Synchronisiert Agent Tasks regelmäßig.",
  provider: "workbench.agent-tasks.scheduled-job-provider.sync",
  enabledByDefault: true,
  schedule: {
    type: "interval",
    everyMilliseconds: 300_000,
    initialDelayMilliseconds: 1_000,
  },
  timeoutMilliseconds: 30_000,
  concurrency: { mode: "skip" },
  missedRuns: { mode: "run-once" },
  retries: {
    maxAttempts: 3,
    initialBackoffMilliseconds: 1_000,
    maximumBackoffMilliseconds: 30_000,
    multiplier: 2,
  },
  idempotency: "host-key",
  cancellationTimeoutMilliseconds: 5_000,
  historyLimit: 100,
} as const;

describe("Scheduled Job Contributions V1", () => {
  it("akzeptiert Interval-, Cron-, One-shot- und Event-Zeitpläne", () => {
    for (const schedule of [
      job.schedule,
      {
        type: "cron",
        expression: "0 6 * * MON-FRI",
        timeZone: "Europe/Berlin",
      },
      { type: "one-shot", runAt: "2026-08-16T10:00:00+02:00" },
      {
        type: "event-triggered",
        event: "workbench.project.changed",
        debounceMilliseconds: 500,
      },
    ] as const) {
      expect(
        scheduledJobContributionSchema.safeParse({ ...job, schedule }).success,
      ).toBe(true);
    }
  });

  it("weist freie Cron-Systeme und Runtime-State im Manifest ab", () => {
    expect(
      scheduledJobContributionSchema.safeParse({
        ...job,
        schedule: { type: "cron", expression: "@daily", timeZone: "UTC" },
      }).success,
    ).toBe(false);
    expect(
      scheduledJobContributionSchema.safeParse({
        ...job,
        nextRun: "2026-08-16T10:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("begrenzt Concurrency, Missed Runs und Retry Backoff", () => {
    expect(
      scheduledJobContributionSchema.safeParse({
        ...job,
        concurrency: { mode: "parallel", maxRuns: 1 },
      }).success,
    ).toBe(false);
    expect(
      scheduledJobContributionSchema.safeParse({
        ...job,
        missedRuns: { mode: "catch-up", maxRuns: 101 },
      }).success,
    ).toBe(false);
    expect(
      scheduledJobContributionSchema.safeParse({
        ...job,
        retries: {
          ...job.retries,
          initialBackoffMilliseconds: 30_001,
          maximumBackoffMilliseconds: 30_000,
        },
      }).success,
    ).toBe(false);
  });

  it("weist doppelte IDs und übergroße Listen ab", () => {
    expect(
      scheduledJobContributionsSchema.safeParse([job, job]).success,
    ).toBe(false);
    expect(
      scheduledJobContributionsSchema.safeParse(
        Array.from(
          { length: SCHEDULED_JOB_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...job,
            id: `workbench.agent-tasks.scheduled-job.sync-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
