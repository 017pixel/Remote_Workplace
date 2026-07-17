import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { CodexbarPayload } from "./codexbar-schemas.js";

const authSchema = z.object({
  tokens: z.object({ access_token: z.string().min(1) }),
});

const usageResponseSchema = z.object({
  email: z.string().email(),
  rate_limit: z.object({
    primary_window: z.object({
      used_percent: z.number().min(0).max(100),
      limit_window_seconds: z.number().positive(),
      reset_at: z.number().positive(),
    }).nullable(),
  }),
});

export interface CodexPrimaryWindow {
  email: string;
  usedPercent: number;
  windowMinutes: number;
  resetsAt: string;
}

interface CodexOAuthPrimaryWindowFallbackOptions {
  profileHomes: string[];
  configPath?: string;
  timeoutMilliseconds: number;
  fetchImplementation?: typeof fetch;
}

export class CodexOAuthPrimaryWindowFallback {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: CodexOAuthPrimaryWindowFallbackOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async getPrimaryWindows(): Promise<CodexPrimaryWindow[]> {
    const profileHomes = new Set(this.options.profileHomes);
    if (this.options.configPath) {
      try {
        const config = JSON.parse(await readFile(this.options.configPath, "utf8")) as { providers?: Array<{ id?: string; codexProfileHomePaths?: unknown }> };
        const configured = config.providers?.find((provider) => provider.id === "codex")?.codexProfileHomePaths;
        if (Array.isArray(configured)) for (const path of configured) if (typeof path === "string") profileHomes.add(path);
      } catch { /* The explicitly configured homes remain available. */ }
    }
    const results = await Promise.allSettled([...profileHomes].map((profileHome) => this.getPrimaryWindow(profileHome)));
    return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  }

  private async getPrimaryWindow(profileHome: string): Promise<CodexPrimaryWindow | undefined> {
    const authContents = await readFile(`${profileHome}/auth.json`, "utf8");
    const auth = authSchema.parse(JSON.parse(authContents));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMilliseconds);
    try {
      const response = await this.fetchImplementation("https://chatgpt.com/backend-api/wham/usage", {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${auth.tokens.access_token}` },
        signal: controller.signal,
      });
      if (!response.ok) return undefined;
      const payload = usageResponseSchema.safeParse(await response.json());
      if (!payload.success || payload.data.rate_limit.primary_window === null) return undefined;
      const primary = payload.data.rate_limit.primary_window;
      const windowMinutes = Math.round(primary.limit_window_seconds / 60);
      if (windowMinutes !== 300) return undefined;
      return {
        email: payload.data.email,
        usedPercent: primary.used_percent,
        windowMinutes,
        resetsAt: new Date(primary.reset_at * 1_000).toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function mergeCodexPrimaryWindows(
  payloads: CodexbarPayload[],
  primaryWindows: CodexPrimaryWindow[],
): CodexbarPayload[] {
  const byEmail = new Map(primaryWindows.map((window) => [window.email.toLowerCase(), window]));
  return payloads.map((payload) => {
    if (payload.provider !== "codex" || !payload.usage || payload.usage.primary?.usedPercent !== undefined) return payload;
    const email = payload.usage.accountEmail ?? payload.usage.identity?.accountEmail ?? payload.account;
    const primary = email ? byEmail.get(email.toLowerCase()) : undefined;
    if (!primary) return payload;
    return {
      ...payload,
      usage: {
        ...payload.usage,
        primary: {
          usedPercent: primary.usedPercent,
          windowMinutes: primary.windowMinutes,
          resetsAt: primary.resetsAt,
        },
      },
    };
  });
}
