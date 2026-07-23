import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { execa } from "execa";
import { z } from "zod";
import type { CreateAccountRequest, DiscoveredAccount, ManagedAccount, UpdateAccountRequest, UsageProviderId } from "@workbench/contracts";
import { AppError } from "../utils/errors.js";
import type { UsageDatabase } from "./database.js";

export class AccountService {
  constructor(private readonly options: { database: UsageDatabase; allowedRoots: string[]; profilesRoot: string; codexbarConfigPath: string; codexbarCliPath?: string; claudeCliPath?: string; homeDirectory?: string }) {}

  list() { return this.options.database.listAccounts(); }

  async discover(): Promise<DiscoveredAccount[]> {
    const candidates: Array<{provider: UsageProviderId; path: string}> = [];
    const home = this.options.homeDirectory ?? homedir();
    try {
      for (const name of await readdir(home)) if (name === ".codex" || name.startsWith(".codex-")) candidates.push({ provider: "codex", path: resolve(home, name) });
    } catch { /* Discovery is best effort. */ }
    const openCodePaths = [resolve(home, ".local/share/opencode"), resolve(home, ".config/opencode")];
    for (const path of openCodePaths) { try { await access(path); candidates.push({ provider: "opencode", path }); } catch { /* optional */ } }
    const claudePath = resolve(home, ".claude");
    try { await access(claudePath); candidates.push({ provider: "claude", path: claudePath }); } catch { /* optional */ }
    try {
      const config = JSON.parse(await readFile(this.options.codexbarConfigPath, "utf8")) as {providers?: Array<{id?:string;codexProfileHomePaths?:string[]}>};
      for (const path of config.providers?.find((item) => item.id === "codex")?.codexProfileHomePaths ?? []) candidates.push({provider:"codex",path});
    } catch { /* Missing CodexBar config is valid. */ }
    const registered = this.list();
    for (const account of registered) candidates.push({ provider: account.provider, path: account.profilePath });
    const registeredByProfile = new Map(registered.map((account) => [`${account.provider}:${account.profilePath}`, account]));
    const accounts = await Promise.all([...new Map(candidates.filter((item) => this.allowed(item.path)).map((item) => [`${item.provider}:${item.path}`, item])).values()]
      .map(async (item) => {
        const account = registeredByProfile.get(`${item.provider}:${item.path}`);
        const claudeStatus = item.provider === "claude" ? await this.claudeStatus(item.path) : null;
        return {
          accountId: account?.id ?? null,
          provider: item.provider,
          profilePath: item.path,
          label: account?.label ?? claudeStatus?.email ?? basename(item.path),
          registered: Boolean(account),
          authenticated: claudeStatus?.loggedIn ?? await this.authenticated(item.provider, item.path),
          enabled: account?.enabled ?? null,
          source: account?.source ?? null,
        };
      }));
    return accounts.filter((account) => account.registered || account.authenticated);
  }

  async create(input: CreateAccountRequest): Promise<ManagedAccount> {
    const profilePath = input.profilePath ?? resolve(this.options.profilesRoot, input.provider, `${slug(input.label)}-${Date.now()}`);
    if (!this.allowed(profilePath)) throw new AppError(400, "INVALID_PROFILE_PATH", "Der Profilpfad liegt außerhalb der erlaubten Bereiche.");
    if (input.source === "login") await mkdir(profilePath, { recursive: true, mode: 0o700 });
    try {
      const account = this.options.database.createAccount({ ...input, profilePath });
      if (input.provider === "codex") {
        try { await this.setCodexProfile(profilePath, true); } catch (error) { this.options.database.deleteAccount(account.id); throw error; }
      }
      if (input.provider === "claude") {
        try { await this.setProviderEnabled("claude", true); } catch (error) { this.options.database.deleteAccount(account.id); throw error; }
      }
      return account;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(409, "ACCOUNT_EXISTS", "Dieses lokale Profil ist bereits registriert.");
    }
  }

  update(id: string, input: UpdateAccountRequest) { try { return this.options.database.updateAccount(id, { ...(input.label === undefined ? {} : {label:input.label}), ...(input.enabled === undefined ? {} : {enabled:input.enabled}) }); } catch { throw new AppError(404, "ACCOUNT_NOT_FOUND", "Der Account wurde nicht gefunden."); } }

  async remove(id: string) {
    let account: ManagedAccount; try { account = this.options.database.getAccount(id); } catch { throw new AppError(404, "ACCOUNT_NOT_FOUND", "Der Account wurde nicht gefunden."); }
    if (account.provider === "codex") await this.setCodexProfile(account.profilePath, false);
    if (account.provider === "claude" && this.list().filter((item) => item.provider === "claude" && item.id !== id).length === 0) await this.setProviderEnabled("claude", false);
    this.options.database.deleteAccount(id);
  }

  loginCommand(account: ManagedAccount) { return account.provider === "codex" ? "codex login --device-auth" : account.provider === "claude" ? "claude auth login" : "opencode auth login"; }

  private async authenticated(_provider: UsageProviderId, profilePath: string): Promise<boolean> {
    const authPath = join(profilePath, "auth.json");
    try { await access(authPath); return true; } catch { return false; }
  }

  private async claudeStatus(profilePath: string): Promise<{loggedIn:boolean;email:string|undefined} | null> {
    if (!this.options.claudeCliPath) return null;
    try {
      const result = await execa(this.options.claudeCliPath, ["auth", "status", "--json"], {
        timeout: 10_000,
        reject: false,
        env: resolve(profilePath) === resolve(this.options.homeDirectory ?? homedir(), ".claude")
          ? process.env
          : { ...process.env, CLAUDE_CONFIG_DIR: profilePath },
      });
      const parsed = z.object({ loggedIn: z.boolean(), email: z.string().email().optional() }).safeParse(JSON.parse(result.stdout));
      return parsed.success ? { loggedIn: parsed.data.loggedIn, email: parsed.data.email } : null;
    } catch {
      return null;
    }
  }

  private async setProviderEnabled(provider: "claude", enabled: boolean) {
    if (!this.options.codexbarCliPath) return;
    const result = await execa(this.options.codexbarCliPath, ["config", enabled ? "enable" : "disable", "--provider", provider], {
      timeout: 10_000,
      reject: false,
      env: { ...process.env, CODEXBAR_CONFIG_PATH: this.options.codexbarConfigPath },
    });
    if (result.exitCode !== 0) throw new AppError(500, "CODEXBAR_CONFIG_INVALID", "Claude Code konnte in CodexBar nicht aktiviert werden.");
  }

  private allowed(path: string) {
    if (!isAbsolute(path)) return false;
    const resolved = resolve(path);
    return this.options.allowedRoots.some((root) => { const part = relative(root, resolved); return part === "" || (!part.startsWith("..") && !isAbsolute(part)); });
  }

  private async setCodexProfile(profilePath: string, enabled: boolean) {
    let original: string | undefined;
    let config: {version?:number;providers?:Array<Record<string,unknown>>} = { version: 1, providers: [] };
    try { original = await readFile(this.options.codexbarConfigPath, "utf8"); config = JSON.parse(original) as typeof config; } catch { /* create a minimal config */ }
    const providers = config.providers ?? [];
    let codex = providers.find((item) => item.id === "codex");
    if (!codex) { codex = { id: "codex", enabled: true, codexProfileHomePaths: [] }; providers.push(codex); }
    const paths = new Set(Array.isArray(codex.codexProfileHomePaths) ? codex.codexProfileHomePaths.filter((item): item is string => typeof item === "string") : []);
    if (enabled) paths.add(profilePath); else paths.delete(profilePath);
    codex.codexProfileHomePaths = [...paths]; config.providers = providers;
    await mkdir(dirname(this.options.codexbarConfigPath), { recursive: true, mode: 0o700 });
    const temporary = `${this.options.codexbarConfigPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.options.codexbarConfigPath);
    try {
      const verified = JSON.parse(await readFile(this.options.codexbarConfigPath, "utf8")) as typeof config;
      const verifiedPaths = verified.providers?.find((item) => item.id === "codex")?.codexProfileHomePaths;
      if (!Array.isArray(verifiedPaths) || !verifiedPaths.every((item) => typeof item === "string" && isAbsolute(item))) throw new Error("invalid paths");
    } catch {
      if (original !== undefined) await writeFile(this.options.codexbarConfigPath, original, { mode: 0o600 });
      throw new AppError(500, "CODEXBAR_CONFIG_INVALID", "Die lokale CodexBar-Accountkonfiguration ist ungültig.");
    }
  }
}

function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "account"; }
