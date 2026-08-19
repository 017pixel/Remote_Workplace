import { commandsResponseSchema, type CommandsResponse } from "@wrapt/contracts";
import type { z } from "zod";
import type { commandsConfigSchema } from "../config/schemas.js";

type CommandsConfig = z.infer<typeof commandsConfigSchema>;

export function createCommandService(config: CommandsConfig) {
  const response: CommandsResponse = commandsResponseSchema.parse({ commands: config.commands });
  return {
    list: async () => response,
  };
}

