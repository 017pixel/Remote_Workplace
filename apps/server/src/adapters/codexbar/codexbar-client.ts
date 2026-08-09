import { codexbarCostResponseSchema, codexbarUsageResponseSchema, type CodexbarCostPayload, type CodexbarPayload } from "./codexbar-schemas.js";
import { CodexbarError } from "./codexbar-errors.js";
import { execa } from "execa";
import { resolve } from "node:path";
import { z } from "zod";

export type CodexbarProvider = "codex" | "opencodego" | "claude";

/** Ergebnis einer isolierten Claude-Profilabfrage: Profilpfad plus CodexBar-Payload. */
export interface ClaudeProfileUsage {
  profilePath: string;
  payload: CodexbarPayload;
}

/** Limit für parallele Prozessabfragen isolierter Claude-Profile. */
const CLAUDE_PROFILE_CONCURRENCY = 2;

interface CodexbarClientOptions {
  baseUrl: string;
  timeoutMilliseconds: number;
  fetchImplementation?: typeof fetch;
  cliPath?: string;
  claudeCliPath?: string;
  configPath?: string;
}

const claudeAuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  email: z.string().email().optional(),
  subscriptionType: z.string().min(1).optional(),
});

export class CodexbarClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: CodexbarClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async getUsage(provider: CodexbarProvider): Promise<CodexbarPayload[]> {
    if (provider === "claude" && this.options.cliPath) {
      const payloads = await this.getClaudeUsage();
      return this.enrichClaudeIdentity(payloads);
    }
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
    let payloads: CodexbarPayload[];
    try {
      payloads = await this.get("/usage", provider, codexbarUsageResponseSchema);
    } catch (httpError) {
      if (!this.options.cliPath) throw httpError;
      return this.getUsageFromCli(provider);
    }
    if (payloads.some(hasUsableUsage) || !this.options.cliPath) return payloads;
    return this.getUsageFromCli(provider);
  }

  /**
   * Liest die Quota jedes registrierten Claude-Profils isoliert. Jeder Profilpfad
   * bekommt eine eigene CodexBar-Abfrage mit CLAUDE_CONFIG_DIR und
   * CLAUDE_SECURESTORAGE_CONFIG_DIR, damit nie das aktive Claude-Profil
   * umgeschaltet oder dessen Anmeldedatei berührt wird. Ein fehlgeschlagenes
   * Profil liefert einen Fehler-Payload statt den Gesamtablauf zu brechen.
   */
  async getClaudeUsageForProfiles(profilePaths: string[], concurrency = CLAUDE_PROFILE_CONCURRENCY): Promise<ClaudeProfileUsage[]> {
    if (!this.options.cliPath) return [];
    const paths = [...new Set(profilePaths.map((path) => resolve(path)))];
    const results = new Map<string, CodexbarPayload>();
    let cursor = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, paths.length)) }, async () => {
      while (cursor < paths.length) {
        const profilePath = paths[cursor]!;
        cursor += 1;
        const payload = await this.claudeProfileUsage(profilePath);
        results.set(profilePath, payload);
      }
    });
    await Promise.all(workers);
    return paths.map((profilePath) => ({ profilePath, payload: results.get(profilePath) ?? unavailableProfilePayload("claude", "CodexBar konnte das Claude-Profil nicht lesen.") }));
  }

  /** Liest alle OpenCode-Go-Quota-Accounts; ohne Token-Accounts fällt es auf den Einzelabruf zurück. */
  async getOpenCodeGoUsage(): Promise<CodexbarPayload[]> {
    if (!this.options.cliPath) return this.get("/usage", "opencodego", codexbarUsageResponseSchema);
    try {
      const payloads = await this.getFromCli(
        ["usage", "--provider", "opencodego", "--all-accounts", "--format", "json"],
        codexbarUsageResponseSchema,
        "CodexBar konnte die OpenCode-Go-Quota nicht laden.",
      );
      if (payloads.some(hasUsableUsage)) return payloads;
    } catch {
      // Ohne Token-Accounts antwortet CodexBar mit einem Fehler-Payload; dann gilt der Einzelabruf.
    }
    return this.getUsage("opencodego");
  }

  private async claudeProfileUsage(profilePath: string): Promise<CodexbarPayload> {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: profilePath, CLAUDE_SECURESTORAGE_CONFIG_DIR: profilePath };
    for (const source of ["oauth", "cli"] as const) {
      try {
        const result = await execa(this.options.cliPath!, ["usage", "--provider", "claude", "--source", source, "--format", "json"], { timeout: this.options.timeoutMilliseconds * 2, env, reject: false });
        const parsed = codexbarUsageResponseSchema.safeParse(JSON.parse(result.stdout));
        if (!parsed.success) continue;
        const payload = parsed.data.find((item) => item.usage) ?? parsed.data[0];
        if (!payload) continue;
        if (!payload.usage && !payload.error) continue;
        return payload;
      } catch {
        // Nächste Quelle versuchen.
      }
    }
    return unavailableProfilePayload("claude", "Für dieses Claude-Profil sind keine Limitdaten verfügbar.");
  }

  private async getClaudeUsage(): Promise<CodexbarPayload[]> {
    try {
      return await this.getFromCli(
        ["usage", "--provider", "claude", "--source", "oauth", "--format", "json"],
        codexbarUsageResponseSchema,
        "CodexBar konnte die Claude-Code-Limits nicht über OAuth laden.",
      );
    } catch {
      return this.getFromCli(
        ["usage", "--provider", "claude", "--source", "cli", "--format", "json"],
        codexbarUsageResponseSchema,
        "CodexBar konnte die Claude-Code-Limits weder über OAuth noch über die lokale CLI laden.",
      );
    }
  }

  private async enrichClaudeIdentity(payloads: CodexbarPayload[]): Promise<CodexbarPayload[]> {
    if (!this.options.claudeCliPath) return payloads;
    try {
      const result = await execa(this.options.claudeCliPath, ["auth", "status", "--json"], {
        timeout: this.options.timeoutMilliseconds,
        reject: false,
      });
      const status = claudeAuthStatusSchema.safeParse(JSON.parse(result.stdout));
      if (!status.success || !status.data.loggedIn) return payloads;
      return payloads.map((payload) => {
        if (!payload.usage) return payload;
        const accountEmail = payload.usage.accountEmail ?? status.data.email;
        const loginMethod = payload.usage.loginMethod
          ?? payload.usage.identity?.loginMethod
          ?? (status.data.subscriptionType ? `Claude ${status.data.subscriptionType}` : undefined);
        return {
          ...payload,
          usage: {
            ...payload.usage,
            ...(accountEmail ? { accountEmail } : {}),
            ...(loginMethod ? { loginMethod } : {}),
            identity: {
              ...payload.usage.identity,
              ...(accountEmail ? { accountEmail } : {}),
              ...(loginMethod ? { loginMethod } : {}),
            },
          },
        };
      });
    } catch {
      return payloads;
    }
  }

  private getUsageFromCli(provider: CodexbarProvider): Promise<CodexbarPayload[]> {
    return this.getFromCli(
      ["usage", "--provider", provider, "--format", "json"],
      codexbarUsageResponseSchema,
      "CodexBar konnte die Nutzungsdaten weder über den lokalen Dienst noch direkt über die CLI laden.",
    );
  }

  async getCost(provider: CodexbarProvider): Promise<CodexbarCostPayload[]> {
    try {
      return await this.get("/cost", provider, codexbarCostResponseSchema);
    } catch (httpError) {
      if (!this.options.cliPath) throw httpError;
      return this.getFromCli(
        ["cost", "--provider", provider, "--days", "3650", "--format", "json"],
        codexbarCostResponseSchema,
        "CodexBar konnte die Kosten weder über den lokalen Dienst noch direkt über die CLI laden.",
      );
    }
  }

  async getProjectCost(provider: CodexbarProvider): Promise<CodexbarCostPayload[]> {
    if (!this.options.cliPath) return [];
    try {
      const result = await execa(this.options.cliPath, ["cost", "--provider", provider, "--group-by", "project", "--days", "3650", "--format", "json"], { timeout: this.options.timeoutMilliseconds * 2, env: this.cliEnvironment(), reject: false });
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

function hasUsableUsage(payload: CodexbarPayload): boolean {
  return [payload.usage?.primary, payload.usage?.secondary, payload.usage?.tertiary]
    .some((window) => window?.usedPercent !== undefined);
}

function unavailableProfilePayload(provider: CodexbarProvider, message: string): CodexbarPayload {
  return { provider, source: "cli", error: { code: "PROFILE_UNAVAILABLE", message } };
}
