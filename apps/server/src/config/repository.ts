import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ZodType } from "zod";
import { commandsConfigSchema, projectsConfigSchema, servicesConfigSchema } from "./schemas.js";
import { settings } from "./settings.js";

async function readConfig<T>(basename: string, schema: ZodType<T>): Promise<T> {
  const candidates = [`${basename}.local.json`, `${basename}.example.json`];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const content = await readFile(join(settings.configDirectory, candidate), "utf8");
      return schema.parse(JSON.parse(content) as unknown);
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  throw lastError ?? new Error(`Konfiguration ${basename} fehlt.`);
}

export const loadProjectsConfig = () => readConfig("projects", projectsConfigSchema);
export const loadServicesConfig = () => readConfig("services", servicesConfigSchema);
export const loadCommandsConfig = () => readConfig("commands", commandsConfigSchema);
