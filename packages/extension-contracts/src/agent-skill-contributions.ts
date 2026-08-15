import { z } from "zod";
import { contributionDescriptionSchema } from "./contributions.js";
import { contributionIdSchema } from "./ids.js";
import { EXTENSION_LOCAL_PATH_MAX_LENGTH } from "./package-paths.js";

export const AGENT_SKILL_CONTRIBUTIONS_MAX_COUNT = 128;
export const AGENT_SKILL_NAME_MAX_LENGTH = 64;

export const agentSkillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const agentSkillNameSchema = z
  .string()
  .min(1)
  .max(AGENT_SKILL_NAME_MAX_LENGTH)
  .regex(
    agentSkillNamePattern,
    "Agent Skill Namen verwenden Kleinbuchstaben, Ziffern und einzelne Bindestriche.",
  );

export const extensionSkillPathSchema = z
  .string()
  .max(EXTENSION_LOCAL_PATH_MAX_LENGTH)
  .regex(
    /^\.\/skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/SKILL\.md$/,
    "Ein lokaler Skill-Pfad im Format ./skills/<name>/SKILL.md wird erwartet.",
  );

export const agentSkillTargets = [
  "codex",
  "claude-code",
  "opencode",
  "hermes",
] as const;
export const agentSkillTargetSchema = z.enum(agentSkillTargets);
export type AgentSkillTarget = z.infer<typeof agentSkillTargetSchema>;

export const agentSkillTargetsSchema = z
  .array(agentSkillTargetSchema)
  .min(1)
  .max(agentSkillTargets.length)
  .refine(
    (targets) => new Set(targets).size === targets.length,
    "Agent Skill Targets dürfen nicht doppelt vorkommen.",
  )
  .meta({ uniqueItems: true });

export const agentSkillContributionSchema = z
  .strictObject({
    id: contributionIdSchema,
    name: agentSkillNameSchema,
    description: contributionDescriptionSchema,
    path: extensionSkillPathSchema,
    targets: agentSkillTargetsSchema,
    enabledByDefault: z.boolean(),
  })
  .superRefine((skill, context) => {
    if (skill.path === `./skills/${skill.name}/SKILL.md`) return;
    context.addIssue({
      code: "custom",
      message: "Der Skill-Pfad muss den deklarierten Skill-Namen verwenden.",
      path: ["path"],
    });
  });

export type AgentSkillContribution = z.infer<
  typeof agentSkillContributionSchema
>;

export const agentSkillContributionsSchema = z
  .array(agentSkillContributionSchema)
  .min(1)
  .max(AGENT_SKILL_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((skills, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const paths = new Set<string>();
    for (const [index, skill] of skills.entries()) {
      for (const [value, seen, field, message] of [
        [
          skill.id,
          ids,
          "id",
          "Jede Agent Skill Contribution ID darf nur einmal vorkommen.",
        ],
        [
          skill.name,
          names,
          "name",
          "Jeder Agent Skill Name darf nur einmal vorkommen.",
        ],
        [
          skill.path,
          paths,
          "path",
          "Jeder Agent Skill Pfad darf nur einmal vorkommen.",
        ],
      ] as const) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            message,
            path: [index, field],
          });
        }
        seen.add(value);
      }
    }
  })
  .meta({ uniqueItems: true });

export type AgentSkillContributions = z.infer<
  typeof agentSkillContributionsSchema
>;

export function agentSkillNameBelongsToExtension(
  extensionId: string,
  skillName: string,
): boolean {
  const prefix = `${extensionId.replaceAll(".", "-")}-`;
  return skillName.startsWith(prefix) && skillName.length > prefix.length;
}
