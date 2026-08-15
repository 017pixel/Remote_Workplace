import { z } from "zod";
import {
  CONTRIBUTION_ID_MAX_LENGTH,
  ID_SEGMENT_PATTERN_SOURCE,
  contributionBelongsToExtension,
  contributionIdPattern,
  contributionIdSchema,
  extensionIdSchema,
} from "./ids.js";
import type { ContributionId, ExtensionId } from "./ids.js";

export const EXTENSION_EVENT_ID_MAX_LENGTH = 192;
export const ACTIVATION_EVENTS_MAX_COUNT = 128;
export const ACTIVATION_EVENT_MAX_LENGTH = CONTRIBUTION_ID_MAX_LENGTH + "onOrbitNode:".length;

export const extensionEventIdPattern = new RegExp(
  "^" +
    ID_SEGMENT_PATTERN_SOURCE +
    "\\." +
    ID_SEGMENT_PATTERN_SOURCE +
    "(?:\\." +
    ID_SEGMENT_PATTERN_SOURCE +
    ")*$",
);

export const extensionEventIdSchema = z
  .string()
  .max(EXTENSION_EVENT_ID_MAX_LENGTH)
  .regex(extensionEventIdPattern, "Eine stabile, punktgetrennte Event ID wird erwartet.")
  .brand<"ExtensionEventId">();

export type ExtensionEventId = z.infer<typeof extensionEventIdSchema>;

export const staticActivationEvents = ["onStartup", "onProject", "onGitRepository", "onAgent"] as const;
export const staticActivationEventSchema = z.enum(staticActivationEvents);

export const contributionActivationEventPrefixes = [
  "onCommand",
  "onRoute",
  "onOrbitNode",
  "onSchedule",
] as const;

export type ContributionActivationEventPrefix = (typeof contributionActivationEventPrefixes)[number];

const contributionIdPatternSource = contributionIdPattern.source.slice(1, -1);
const extensionEventIdPatternSource = extensionEventIdPattern.source.slice(1, -1);

function referencedActivationEventSchema(prefix: ContributionActivationEventPrefix) {
  return z
    .string()
    .max(prefix.length + 1 + CONTRIBUTION_ID_MAX_LENGTH)
    .regex(
      new RegExp("^" + prefix + ":" + contributionIdPatternSource + "$"),
      prefix + " benötigt eine vollständig namespaced Contribution ID.",
    );
}

export const onCommandActivationEventSchema = referencedActivationEventSchema("onCommand");
export const onRouteActivationEventSchema = referencedActivationEventSchema("onRoute");
export const onOrbitNodeActivationEventSchema = referencedActivationEventSchema("onOrbitNode");
export const onScheduleActivationEventSchema = referencedActivationEventSchema("onSchedule");

export const onEventActivationEventSchema = z
  .string()
  .max("onEvent:".length + EXTENSION_EVENT_ID_MAX_LENGTH)
  .regex(
    new RegExp("^onEvent:" + extensionEventIdPatternSource + "$"),
    "onEvent benötigt eine stabile, punktgetrennte Event ID.",
  );

export const activationEventSchema = z
  .union([
    staticActivationEventSchema,
    onCommandActivationEventSchema,
    onRouteActivationEventSchema,
    onOrbitNodeActivationEventSchema,
    onEventActivationEventSchema,
    onScheduleActivationEventSchema,
  ])
  .brand<"ActivationEvent">();

export type ActivationEvent = z.infer<typeof activationEventSchema>;

export const activationEventsV1Schema = z
  .array(activationEventSchema)
  .max(ACTIVATION_EVENTS_MAX_COUNT)
  .superRefine((events, context) => {
    const seen = new Set<ActivationEvent>();
    for (const [index, event] of events.entries()) {
      if (seen.has(event)) {
        context.addIssue({
          code: "custom",
          message: "Activation Events dürfen nicht doppelt vorkommen.",
          path: [index],
        });
      }
      seen.add(event);
    }
  })
  .meta({ uniqueItems: true });

export type ActivationEventsV1 = z.infer<typeof activationEventsV1Schema>;

export function activationEventContributionId(event: ActivationEvent | string): ContributionId | null {
  const parsedEvent = activationEventSchema.safeParse(event);
  if (!parsedEvent.success) return null;

  for (const prefix of contributionActivationEventPrefixes) {
    const marker = prefix + ":";
    if (!parsedEvent.data.startsWith(marker)) continue;
    const parsedContributionId = contributionIdSchema.safeParse(parsedEvent.data.slice(marker.length));
    return parsedContributionId.success ? parsedContributionId.data : null;
  }

  return null;
}

export function activationEventBelongsToExtension(
  extensionId: ExtensionId | string,
  event: ActivationEvent | string,
): boolean {
  const parsedExtensionId = extensionIdSchema.safeParse(extensionId);
  if (!parsedExtensionId.success) return false;
  const parsedEvent = activationEventSchema.safeParse(event);
  if (!parsedEvent.success) return false;
  const contributionId = activationEventContributionId(parsedEvent.data);
  return contributionId === null || contributionBelongsToExtension(parsedExtensionId.data, contributionId);
}
