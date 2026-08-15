import { describe, expect, it } from "vitest";
import {
  AGENT_TOOL_CONTRIBUTIONS_MAX_COUNT,
  agentToolContributionSchema,
  agentToolContributionsSchema,
} from "./agent-tool-contributions.js";

const providerTool = {
  id: "workbench.agent-tasks.agent-tool.create",
  kind: "provider",
  title: "Aufgabe erstellen",
  description: "Erstellt eine Aufgabe im aktuellen Projekt.",
  inputSchema: "./schemas/create-task-input.json",
  outputSchema: "./schemas/task-output.json",
  projectContext: true,
  approval: "host-policy",
  provider: "workbench.agent-tasks.agent-tool-provider.create",
} as const;

describe("Agent Tool Contributions V1", () => {
  it("akzeptiert Provider mit lokalen Ein- und Ausgabeschemas", () => {
    expect(agentToolContributionSchema.safeParse(providerTool).success).toBe(
      true,
    );
  });

  it("akzeptiert Commands mit verstärkter Approval Policy", () => {
    expect(
      agentToolContributionSchema.safeParse({
        id: "workbench.agent-tasks.agent-tool.list",
        kind: "command",
        title: "Aufgaben auflisten",
        description: "Liest Aufgaben aus dem aktuellen Projekt.",
        inputSchema: "./schemas/list-tasks-input.json",
        projectContext: true,
        approval: "always",
        commandId: "workbench.agent-tasks.command.list",
      }).success,
    ).toBe(true);
  });

  it("weist Inline-Schemas, Hostpfade, freie Handler und schwache Approvals ab", () => {
    expect(
      agentToolContributionSchema.safeParse({
        ...providerTool,
        inputSchema: { type: "object" },
      }).success,
    ).toBe(false);
    expect(
      agentToolContributionSchema.safeParse({
        ...providerTool,
        inputSchema: "/tmp/create-task-input.json",
      }).success,
    ).toBe(false);
    expect(
      agentToolContributionSchema.safeParse({
        ...providerTool,
        execute: "./dist/tool.js",
      }).success,
    ).toBe(false);
    expect(
      agentToolContributionSchema.safeParse({
        ...providerTool,
        approval: "never",
      }).success,
    ).toBe(false);
  });

  it("weist doppelte IDs und übergroße Listen ab", () => {
    expect(
      agentToolContributionsSchema.safeParse([providerTool, providerTool])
        .success,
    ).toBe(false);
    expect(
      agentToolContributionsSchema.safeParse(
        Array.from(
          { length: AGENT_TOOL_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...providerTool,
            id: `workbench.agent-tasks.agent-tool.create-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
