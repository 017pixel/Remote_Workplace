import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contributionIdSchema } from "./ids.js";

export const BACKGROUND_SERVICE_CONTRIBUTIONS_MAX_COUNT = 128;
export const BACKGROUND_SERVICE_MAX_RESTART_ATTEMPTS = 10;
export const BACKGROUND_SERVICE_MAX_RESTART_WINDOW_MILLISECONDS = 86_400_000;
export const BACKGROUND_SERVICE_MAX_BACKOFF_MILLISECONDS = 60_000;
export const BACKGROUND_SERVICE_MAX_HEALTH_INTERVAL_MILLISECONDS = 300_000;
export const BACKGROUND_SERVICE_MAX_HEALTH_TIMEOUT_MILLISECONDS = 30_000;
export const BACKGROUND_SERVICE_MAX_HEALTH_FAILURE_THRESHOLD = 10;
export const BACKGROUND_SERVICE_MAX_SHUTDOWN_TIMEOUT_MILLISECONDS = 60_000;

export const backgroundServiceRestartPolicySchema = z.discriminatedUnion(
  "mode",
  [
    z.strictObject({ mode: z.literal("never") }),
    z
      .strictObject({
        mode: z.literal("on-failure"),
        maxAttempts: z
          .number()
          .int()
          .min(1)
          .max(BACKGROUND_SERVICE_MAX_RESTART_ATTEMPTS),
        windowMilliseconds: z
          .number()
          .int()
          .min(1_000)
          .max(BACKGROUND_SERVICE_MAX_RESTART_WINDOW_MILLISECONDS),
        backoffMilliseconds: z
          .number()
          .int()
          .min(100)
          .max(BACKGROUND_SERVICE_MAX_BACKOFF_MILLISECONDS),
      })
      .superRefine((policy, context) => {
        if (policy.backoffMilliseconds < policy.windowMilliseconds) return;
        context.addIssue({
          code: "custom",
          message: "Der Restart Backoff muss kleiner als das Restart-Fenster sein.",
          path: ["backoffMilliseconds"],
        });
      }),
  ],
);

export type BackgroundServiceRestartPolicy = z.infer<
  typeof backgroundServiceRestartPolicySchema
>;

export const backgroundServiceHealthPolicySchema = z
  .strictObject({
    intervalMilliseconds: z
      .number()
      .int()
      .min(1_000)
      .max(BACKGROUND_SERVICE_MAX_HEALTH_INTERVAL_MILLISECONDS),
    timeoutMilliseconds: z
      .number()
      .int()
      .min(100)
      .max(BACKGROUND_SERVICE_MAX_HEALTH_TIMEOUT_MILLISECONDS),
    failureThreshold: z
      .number()
      .int()
      .min(1)
      .max(BACKGROUND_SERVICE_MAX_HEALTH_FAILURE_THRESHOLD),
  })
  .superRefine((policy, context) => {
    if (policy.timeoutMilliseconds < policy.intervalMilliseconds) return;
    context.addIssue({
      code: "custom",
      message: "Der Health Timeout muss kleiner als das Prüfintervall sein.",
      path: ["timeoutMilliseconds"],
    });
  });

export type BackgroundServiceHealthPolicy = z.infer<
  typeof backgroundServiceHealthPolicySchema
>;

export const backgroundServiceContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema,
  provider: contributionIdSchema,
  enabledByDefault: z.boolean(),
  restart: backgroundServiceRestartPolicySchema,
  health: backgroundServiceHealthPolicySchema,
  shutdownTimeoutMilliseconds: z
    .number()
    .int()
    .min(250)
    .max(BACKGROUND_SERVICE_MAX_SHUTDOWN_TIMEOUT_MILLISECONDS),
});

export type BackgroundServiceContribution = z.infer<
  typeof backgroundServiceContributionSchema
>;

export const backgroundServiceContributionsSchema = z
  .array(backgroundServiceContributionSchema)
  .min(1)
  .max(BACKGROUND_SERVICE_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((services, context) => {
    const ids = new Set<string>();
    const providers = new Set<string>();
    for (const [index, service] of services.entries()) {
      if (ids.has(service.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Background Service Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      ids.add(service.id);
      if (providers.has(service.provider)) {
        context.addIssue({
          code: "custom",
          message: "Jeder Background Service Provider darf nur einmal vorkommen.",
          path: [index, "provider"],
        });
      }
      providers.add(service.provider);
    }
  })
  .meta({ uniqueItems: true });

export type BackgroundServiceContributions = z.infer<
  typeof backgroundServiceContributionsSchema
>;
