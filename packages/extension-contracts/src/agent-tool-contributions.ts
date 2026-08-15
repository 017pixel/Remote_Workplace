import { z } from "zod";
import {
  contributionDescriptionSchema,
  contributionTitleSchema,
} from "./contributions.js";
import { contributionIdSchema } from "./ids.js";
import { extensionJsonPathSchema } from "./package-paths.js";

export const AGENT_TOOL_CONTRIBUTIONS_MAX_COUNT = 128;

export const agentToolContributionKinds = ["command", "provider"] as const;
export const agentToolContributionKindSchema = z.enum(
  agentToolContributionKinds,
);
export type AgentToolContributionKind = z.infer<
  typeof agentToolContributionKindSchema
>;

export const agentToolApprovalPolicies = ["host-policy", "always"] as const;
export const agentToolApprovalPolicySchema = z.enum(
  agentToolApprovalPolicies,
);
export type AgentToolApprovalPolicy = z.infer<
  typeof agentToolApprovalPolicySchema
>;

const agentToolContributionBaseShape = {
  id: contributionIdSchema,
  title: contributionTitleSchema,
  description: contributionDescriptionSchema,
  inputSchema: extensionJsonPathSchema,
  outputSchema: extensionJsonPathSchema.optional(),
  projectContext: z.boolean(),
  approval: agentToolApprovalPolicySchema,
};

export const commandAgentToolContributionSchema = z.strictObject({
  ...agentToolContributionBaseShape,
  kind: z.literal("command"),
  commandId: contributionIdSchema,
});

export const providerAgentToolContributionSchema = z.strictObject({
  ...agentToolContributionBaseShape,
  kind: z.literal("provider"),
  provider: contributionIdSchema,
});

export const agentToolContributionSchema = z.discriminatedUnion("kind", [
  commandAgentToolContributionSchema,
  providerAgentToolContributionSchema,
]);

export type AgentToolContribution = z.infer<
  typeof agentToolContributionSchema
>;

export const agentToolContributionsSchema = z
  .array(agentToolContributionSchema)
  .min(1)
  .max(AGENT_TOOL_CONTRIBUTIONS_MAX_COUNT)
  .superRefine((tools, context) => {
    const seen = new Set<string>();
    for (const [index, tool] of tools.entries()) {
      if (seen.has(tool.id)) {
        context.addIssue({
          code: "custom",
          message: "Jede Agent Tool Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(tool.id);
    }
  })
  .meta({ uniqueItems: true });

export type AgentToolContributions = z.infer<
  typeof agentToolContributionsSchema
>;
