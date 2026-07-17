import { codexbarCostResponseSchema, codexbarUsageResponseSchema, type CodexbarCostPayload, type CodexbarPayload } from "./codexbar-schemas.js";
import { CodexbarError } from "./codexbar-errors.js";
import { execa } from "execa";

export type CodexbarProvider = "codex" | "opencodego";

interface CodexbarClientOptions {
  baseUrl: string;
  timeoutMilliseconds: number;
  fetchImplementation?: typeof fetch;
  cliPath?: string;
  configPath?: string;
}

export class CodexbarClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: CodexbarClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async getUsage(provider: CodexbarProvider): Promise<CodexbarPayload[]> {
    if (provider === "codex" && this.options.cliPath) {
      try {
        const payloads = await this.getFromCli(
          ["usage", "--provider", provider, "--all-accounts", "--format", "json"],
          codexbarUsageResponseSchema,
          "CodexBar konnte die Nutzungsdaten nicht direkt für alle Codex-Accounts laden.",
        );
        if (payloads.length === 0) throw new Error("no Codex accounts returned");
        return payloads;
      } catch {
        return this.get("/usage", provider, codexbarUsageResponseSchema);
      }
    }
    try {
      return await this.get("/usage", provider, codexbarUsageResponseSchema);
    } catch (httpError) {
      if (!this.options.cliPath) throw httpError;
      return this.getFromCli(
        ["usage", "--provider", provider, "--format", "json"],
        codexbarUsageResponseSchema,
        "CodexBar konnte die Nutzungsdaten weder über den lokalen Dienst noch direkt über die CLI laden.",
      );
    }
  }

  async getCost(provider: CodexbarProvider): Promise<CodexbarCostPayload[]> {
    try {
      return await this.get("/cost", provider, codexbarCostResponseSchema);
    } catch (httpError) {
      if (!this.options.cliPath) throw httpError;
      return this.getFromCli(
        ["cost", "--provider", provider, "--days", "365", "--format", "json"],
        codexbarCostResponseSchema,
        "CodexBar konnte die Kosten weder über den lokalen Dienst noch direkt über die CLI laden.",
      );
    }
  }

  async getProjectCost(provider: CodexbarProvider): Promise<CodexbarCostPayload[]> {
    if (!this.options.cliPath) return [];
    try {
      const result = await execa(this.options.cliPath, ["cost", "--provider", provider, "--group-by", "project", "--days", "365", "--format", "json"], { timeout: this.options.timeoutMilliseconds * 2, env: this.cliEnvironment(), reject: false });
      const parsed = codexbarCostResponseSchema.safeParse(JSON.parse(result.stdout));
      if (!parsed.success) throw new Error("invalid payload");
      return parsed.data;
    } catch { throw new CodexbarError("CODEXBAR_INVALID_RESPONSE", "CodexBar konnte die Projektstatistik nicht laden."); }
  }

  private cliEnvironment() {
    return this.options.configPath
      ? { ...process.env, CODEXBAR_CONFIG_PATH: this.options.configPath }
      : process.env;
  }

  private async getFromCli<T>(
    args: string[],
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    message: string,
  ): Promise<T> {
    try {
      const result = await execa(this.options.cliPath!, args, { timeout: this.options.timeoutMilliseconds * 2, env: this.cliEnvironment(), reject: false });
      const parsed = schema.safeParse(JSON.parse(result.stdout));
      if (!parsed.success) throw new Error("invalid payload");
      return parsed.data;
    } catch {
      throw new CodexbarError("CODEXBAR_UNAVAILABLE", message);
    }
  }

  private async get<T>(path: string, provider: CodexbarProvider, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMilliseconds);
    try {
      const url = new URL(path, this.options.baseUrl);
      url.searchParams.set("provider", provider);
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new CodexbarError("CODEXBAR_UNAVAILABLE", "CodexBar hat keine Nutzungsdaten geliefert.");
      }
      const payload: unknown = await response.json();
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new CodexbarError("CODEXBAR_INVALID_RESPONSE", "CodexBar hat ein ungültiges Datenformat geliefert.");
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof CodexbarError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new CodexbarError("CODEXBAR_TIMEOUT", "CodexBar hat nicht rechtzeitig geantwortet.");
      }
      throw new CodexbarError("CODEXBAR_UNAVAILABLE", "CodexBar ist momentan nicht erreichbar.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
