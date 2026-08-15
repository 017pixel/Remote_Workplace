import { z } from "zod";

export const EXTENSION_ID_MAX_LENGTH = 128;
export const CONTRIBUTION_ID_MAX_LENGTH = 192;
export const ID_SEGMENT_MAX_LENGTH = 64;

const idSegmentSource = `[a-z0-9](?:[a-z0-9-]{0,${ID_SEGMENT_MAX_LENGTH - 2}}[a-z0-9])?`;

export const extensionIdPattern = new RegExp(
  `^${idSegmentSource}\\.${idSegmentSource}(?:\\.${idSegmentSource})*$`,
);

export const contributionIdPattern = new RegExp(
  `^${idSegmentSource}\\.${idSegmentSource}\\.${idSegmentSource}(?:\\.${idSegmentSource})*$`,
);

export const extensionIdSchema = z
  .string()
  .max(EXTENSION_ID_MAX_LENGTH)
  .regex(
    extensionIdPattern,
    "Extension IDs müssen aus mindestens zwei kleingeschriebenen, punktgetrennten Segmenten bestehen.",
  )
  .brand<"ExtensionId">();

export type ExtensionId = z.infer<typeof extensionIdSchema>;

export const contributionIdSchema = z
  .string()
  .max(CONTRIBUTION_ID_MAX_LENGTH)
  .regex(
    contributionIdPattern,
    "Contribution IDs müssen vollständig namespaced und kleingeschrieben sein.",
  )
  .brand<"ContributionId">();

export type ContributionId = z.infer<typeof contributionIdSchema>;

export function contributionBelongsToExtension(
  extensionId: ExtensionId | string,
  contributionId: ContributionId | string,
): boolean {
  const parsedExtensionId = extensionIdSchema.safeParse(extensionId);
  const parsedContributionId = contributionIdSchema.safeParse(contributionId);
  if (!parsedExtensionId.success || !parsedContributionId.success) return false;
  return parsedContributionId.data.startsWith(`${parsedExtensionId.data}.`);
}
