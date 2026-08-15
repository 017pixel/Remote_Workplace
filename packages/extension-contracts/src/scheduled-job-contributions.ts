import { z } from "zod";
import { extensionEventIdSchema } from "./activation-events.js";
import {
  contributionDescriptionSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contributionIdSchema } from "./ids.js";

export const SCHEDULED_JOB_CONTRIBUTIONS_MAX_COUNT = 128;
export const SCHEDULED_JOB_MAX_INTERVAL_MILLISECONDS = 2_592_000_000;
export const SCHEDULED_JOB_MAX_TIMEOUT_MILLISECONDS = 3_600_000;
export const SCHEDULED_JOB_MAX_CONCURRENT_RUNS = 16;
export const SCHEDULED_JOB_MAX_PENDING_RUNS = 100;
export const SCHEDULED_JOB_MAX_CATCH_UP_RUNS = 100;
export const SCHEDULED_JOB_MAX_ATTEMPTS = 10;
export const SCHEDULED_JOB_MAX_RETRY_BACKOFF_MILLISECONDS = 300_000;
export const SCHEDULED_JOB_MAX_CANCELLATION_TIMEOUT_MILLISECONDS = 60_000;
export const SCHEDULED_JOB_MAX_HISTORY_ENTRIES = 1_000;

export const cronExpressionSchema = z
  .string()
  .min(9)
  .max(120)
  .regex(
    /^[A-Za-z0-9*?,/#L-]+(?: [A-Za-z0-9*?,/#L-]+){4}$/,
    "Ein fünfstelliges Cron-Schema mit einzelnen Leerzeichen wird erwartet.",
  );

export const timeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^(?:UTC|[A-Za-z]+(?:[_-][A-Za-z]+)*(?:\/[A-Za-z0-9_+-]+)+)$/,
    "UTC oder eine IANA-Zeitzone wird erwartet.",
  );

export const scheduledJobScheduleSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("interval"),
    everyMilliseconds: z
      .number()
      .int()
      .min(1_000)
      .max(SCHEDULED_JOB_MAX_INTERVAL_MILLISECONDS),
    initialDelayMilliseconds: z
      .number()
      .int()
      .min(0)
      .max(SCHEDULED_JOB_MAX_INTERVAL_MILLISECONDS),
  }),
  z.strictObject({
    type: z.literal("cron"),
    expression: cronExpressionSchema,
    timeZone: timeZoneSchema,
  }),
  z.strictObject({
    type: z.literal("one-shot"),
    runAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    type: z.literal("event-triggered"),
    event: extensionEventIdSchema,
    debounceMilliseconds: z.number().int().min(0).max(3_600_000),
  }),
]);

export type ScheduledJobSchedule = z.infer<typeof scheduledJobScheduleSchema>;

export const scheduledJobConcurrencyPolicySchema = z.discriminatedUnion(
  "mode",
  [
    z.strictObject({ mode: z.literal("skip") }),
    z.strictObject({
      mode: z.literal("queue"),
      maxPending: z
        .number()
        .int()
        .min(1)
        .max(SCHEDULED_JOB_MAX_PENDING_RUNS),
    }),
    z.strictObject({
      mode: z.literal("parallel"),
      maxRuns: z
        .number()
        .int()
        .min(2)
        .max(SCHEDULED_JOB_MAX_CONCURRENT_RUNS),
    }),
  ],
);

export type ScheduledJobConcurrencyPolicy = z.infer<
  typeof scheduledJobConcurrencyPolicySchema
>;

export const scheduledJobMissedRunPolicySchema = z.discriminatedUnion(
  "mode",
  [
    z.strictObject({ mode: z.literal("skip") }),
    z.strictObject({ mode: z.literal("run-once") }),
    z.strictObject({
      mode: z.literal("catch-up"),
      maxRuns: z
        .number()
        .int()
        .min(1)
        .max(SCHEDULED_JOB_MAX_CATCH_UP_RUNS),
    }),
  ],
);

export type ScheduledJobMissedRunPolicy = z.infer<
  typeof scheduledJobMissedRunPolicySchema
>;

export const scheduledJobRetryPolicySchema = z
  .strictObject({
    maxAttempts: z.number().int().min(1).max(SCHEDULED_JOB_MAX_ATTEMPTS),
    initialBackoffMilliseconds: z
      .number()
      .int()
      .min(100)
      .max(SCHEDULED_JOB_MAX_RETRY_BACKOFF_MILLISECONDS),
    maximumBackoffMilliseconds: z
      .number()
      .int()
      .min(100)
      .max(SCHEDULED_JOB_MAX_RETRY_BACKOFF_MILLISECONDS),
    multiplier: z.number().min(1).max(10),
  })
  .superRefine((policy, context) => {
    if (
      policy.initialBackoffMilliseconds <= policy.maximumBackoffMilliseconds
    ) {
      return;
    }
    context.addIssue({
      code: "custom",
      message: "Der initiale Retry Backoff darf den maximalen Backoff nicht überschreiten.",
      path: ["initialBackoffMilliseconds"],
    });
  });

export type ScheduledJobRetryPolicy = z.infer<
  typeof scheduledJobRetryPolicySchema
>;

export const scheduledJobIdempotencyModes = ["none", "host-key"] as const;
export const scheduledJobIdempotencyModeSchema = z.enum(
  scheduledJobIdempotencyModes,
);
export type ScheduledJobIdempotencyMode = z.infer<
  typeof scheduledJobIdempotencyModeSchema
>;

export const scheduledJobContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema,
  provider: contributionIdSchema,
  enabledByDefault: z.boolean(),
  schedule: scheduledJobScheduleSchema,
  timeoutMilliseconds: z
    .number()
    .int()
    .min(100)
    .max(SCHEDULED_JOB_MAX_TIMEOUT_MILLISECONDS),
  concurrency: scheduledJobConcurrencyPolicySchema,
  missedRuns: scheduledJobMissedRunPolicySchema,
  retries: scheduledJobRetryPolicySchema,
  idempotency: scheduledJobIdempotencyModeSchema,
  cancellationTimeoutMilliseconds: z
    .number()
    .int()
    .min(250)
    .max(SCHEDULED_JOB_MAX_CANCELLATION_TIMEOUT_MILLISECONDS),
  historyLimit: z
    .number()
    .int()
    .min(1)
    .max(SCHEDULED_JOB_MAX_HISTORY_ENTRIES),
});

export type ScheduledJobContribution = z.infer<
  typeof scheduledJobContributionSchema
>;

export const scheduledJobContributionsSchema = z
  .array(scheduledJobContributionSchema)
  .min(1)
  .max(SCHEDULED_JOB_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((jobs, context) => {
    const ids = new Set<string>();
    for (const [index, job] of jobs.entries()) {
      if (ids.has(job.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Scheduled Job Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(job.id);
    }
  })
  .meta({ uniqueItems: true });

export type ScheduledJobContributions = z.infer<
  typeof scheduledJobContributionsSchema
>;
