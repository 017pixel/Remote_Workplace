import { z } from "zod";
import { contributionIdSchema } from "./ids.js";

export const CONTRIBUTION_TITLE_MAX_LENGTH = 120;
export const CONTRIBUTION_DESCRIPTION_MAX_LENGTH = 500;
export const CONTRIBUTION_CATEGORY_MAX_LENGTH = 80;
export const COMMAND_CONTRIBUTIONS_MAX_COUNT = 256;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function contributionTextSchema(maxLength: number, fieldName: string) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value === value.trim() && !containsControlCharacter(value),
      `${fieldName} darf keine äußeren Leerzeichen oder Steuerzeichen enthalten.`,
    );
}

export const contributionTitleSchema = contributionTextSchema(CONTRIBUTION_TITLE_MAX_LENGTH, "Der Titel");
export const contributionDescriptionSchema = contributionTextSchema(
  CONTRIBUTION_DESCRIPTION_MAX_LENGTH,
  "Die Beschreibung",
);
export const contributionCategorySchema = contributionTextSchema(
  CONTRIBUTION_CATEGORY_MAX_LENGTH,
  "Die Kategorie",
);

export const commandContributionSchema = z.strictObject({
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema.optional(),
  category: contributionCategorySchema.optional(),
});

export type CommandContribution = z.infer<typeof commandContributionSchema>;

export const commandContributionsSchema = z
  .array(commandContributionSchema)
  .min(1)
  .max(COMMAND_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((commands, context) => {
    const seen = new Set<string>();
    for (const [index, command] of commands.entries()) {
      if (seen.has(command.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Command Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(command.id);
    }
  })
  .meta({ uniqueItems: true });

export type CommandContributions = z.infer<typeof commandContributionsSchema>;
