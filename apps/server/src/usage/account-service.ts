import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { execa } from "execa";
import { z } from "zod";
import type { CreateAccountRequest, DiscoveredAccount, ManagedAccount, UpdateAccountRequest, UsageProviderId } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { AccountSwitch, type ProviderLayout } from "./account-switch.js";
import type { UsageDatabase } from "./database.js";

export class AccountService {
  private readonly switcher: AccountSwitch;
  private readonly providerQueues = new Map<UsageProviderId, Promise<void>>();

  constructor(private readonly options: { database: UsageDatabase; allowedRoots: string[]; profilesRoot: string; codexbarConfigPath: string; codexbarCliPath?: string; claudeCliPath?: string; homeDirectory?: string; sharedHomes: Record<UsageProviderId, ProviderLayout> }) {
    this.switcher = new AccountSwitch(options.sharedHomes);
  }

  list() { return this.options.database.listAccounts(); }

  /** Registrierte Accounts samt Identität und serverweit aktivem Account je Werkzeug. */
  async listWithState(): Promise<ManagedAccount[]> {
    await this.reconcileActivationJournal();
    await this.repairActiveLinks();
    const accounts = this.list();
    const activeProfiles = new Map<UsageProviderId, string | null>();
    for (const provider of new Set(accounts.map((account) => account.provider))) {
      activeProfiles.set(provider, await this.switcher.activeProfilePath(provider));
    }
    return Promise.all(accounts.map(async (account) => {
      const identity = await this.switcher.identity(account.provider, account.profilePath);
      const claudeEmail = account.provider === "claude" ? (await this.claudeStatus(account.profilePath))?.email : undefined;
      return {
        ...account,
        email: identity?.email ?? claudeEmail ?? account.email,
        plan: identity?.plan ?? null,
        active: activeProfiles.get(account.provider) === resolve(account.profilePath),
      };
    }));
  }

  /**
   * Schaltet den serverweit aktiven Account des Werkzeugs um. Zeigt der Account noch direkt auf
   * das gemeinsame Home — so waren Claude Code und OpenCode ursprünglich registriert —, bekommt
   * er zuerst einen eigenen Anmeldespeicher, damit der Symlink nicht auf sich selbst zeigt.
   */
  async activate(id: string) {
    let account: ManagedAccount;
    try { account = this.options.database.getAccount(id); } catch { throw new AppError(404, "ACCOUNT_NOT_FOUND", "Der Account wurde nicht gefunden."); }
    return this.serialized(account.provider, () => this.activateUnlocked(account));
  }

  private async activateUnlocked(initialAccount: ManagedAccount) {
    let account = initialAccount;
    if (!this.allowed(account.profilePath)) throw new AppError(400, "INVALID_PROFILE_PATH", "Der Profilpfad liegt außerhalb der erlaubten Bereiche.");
    this.options.database.setActivationJournal(account.provider, account.id, "requested");

    try {
      let migratedTo: string | null = null;
      if (resolve(account.profilePath) === this.switcher.sharedHome(account.provider)) {
        // Labels sind nicht eindeutig und veränderlich. Die persistierte
        // Account-ID ist deshalb der kollisionsfreie Speichername.
        const store = resolve(this.options.profilesRoot, account.provider, account.id);
        if (!this.allowed(store)) throw new AppError(400, "INVALID_PROFILE_PATH", "Der Anmeldespeicher liegt außerhalb der erlaubten Bereiche.");
        await this.switcher.moveSharedHomeIntoStore(account.provider, store);
        if (account.provider === "codex") {
          await this.setCodexProfile(account.profilePath, false);
          await this.setCodexProfile(store, true);
        }
        account = this.options.database.setAccountProfilePath(account.id, store);
        migratedTo = store;
      }

      const candidates = this.list().filter((item) => item.provider === account.provider).map((item) => item.profilePath);
      const result = await this.switcher.activate(account.provider, account.profilePath, candidates);
      this.options.database.setActivationJournal(account.provider, account.id, "filesystem-switched");
      this.options.database.setActiveAccount(account.provider, account.id);
      this.options.database.clearActivationJournal(account.provider);
      const identity = await this.switcher.identity(account.provider, account.profilePath);
      return { ...result, migratedTo, account: { ...account, email: identity?.email ?? account.email, plan: identity?.plan ?? null, active: true } };
    } catch (error) {
      const activePath = await this.switcher.activeProfilePath(account.provider).catch(() => null);
      this.options.database.setActivationJournal(
        account.provider,
        account.id,
        activePath === resolve(account.profilePath) ? "filesystem-switched" : "failed",
        error instanceof Error ? error.message.slice(0, 500) : "Unbekannter Fehler",
      );
      throw error;
    }
  }

  private async serialized<T>(provider: UsageProviderId, operation: () => Promise<T>): Promise<T> {
    const previous = this.providerQueues.get(provider) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.providerQueues.set(provider, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.providerQueues.get(provider) === queued) this.providerQueues.delete(provider);
    }
  }

  /**
   * Stellt Symlinks wieder her, die ein CLI durch eine reguläre Datei ersetzt hat. Ohne diesen
   * Schritt würden dort aufgefrischte Zugangsdaten am Anmeldespeicher des Accounts vorbeilaufen.
   */
  private async repairActiveLinks() {
    const intended = this.options.database.listActiveAccounts();
    for (const [provider, accountId] of Object.entries(intended) as Array<[UsageProviderId, string]>) {
      const account = this.list().find((item) => item.id === accountId);
      if (!account || !this.allowed(account.profilePath)) continue;
      try {
        await this.switcher.repair(provider, account.profilePath);
      } catch {
        throw new AppError(
          503,
          "ACCOUNT_CREDENTIAL_LINK_DIVERGED",
          "Die aktive Anmeldedatei konnte nicht sicher mit dem Accountspeicher abgeglichen werden.",
          { provider },
          true,
        );
      }
    }
  }

  /** Schließt nach einem Prozessabbruch eine begonnene Umschaltung deterministisch ab. */
  private async reconcileActivationJournal() {
    for (const entry of this.options.database.listActivationJournal()) {
      await this.serialized(entry.provider, async () => {
        let account: ManagedAccount;
        try {
          account = this.options.database.getAccount(entry.accountId);
        } catch {
          this.options.database.clearActivationJournal(entry.provider);
          return;
        }
        const activePath = await this.switcher.activeProfilePath(entry.provider);
        if (activePath === resolve(account.profilePath)) {
          this.options.database.setActiveAccount(entry.provider, account.id);
          this.options.database.clearActivationJournal(entry.provider);
          return;
        }
        // Eine fehlgeschlagene Operation wird nicht bei jedem Read endlos
        // wiederholt. Angefangene, nicht als fehlgeschlagen markierte Sagas
        // werden dagegen beim nächsten Start/Read abgeschlossen.
        if (entry.phase === "failed") return;
        await this.activateUnlocked(account);
      });
    }
  }

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
    const activeProfiles = new Map<UsageProviderId, string | null>();
    for (const provider of ["codex", "claude", "opencode"] as const) activeProfiles.set(provider, await this.switcher.activeProfilePath(provider));
    // Sobald ein gemeinsames Home verwaltet wird, ist seine Anmeldedatei nur noch ein Symlink
    // auf einen Account — dann ist es selbst keiner mehr und taucht nicht auf. Liegt dort noch
    // eine eigenständige Anmeldung, bleibt sie sichtbar und lässt sich registrieren; beim
    // Aktivieren bekommt sie einen eigenen Anmeldespeicher.
    const managed = new Map<UsageProviderId, boolean>();
    for (const provider of ["codex", "claude", "opencode"] as const) managed.set(provider, await this.switcher.isManaged(provider));
    const selectable = candidates.filter((item) => this.allowed(item.path)
      && (registeredByProfile.has(`${item.provider}:${item.path}`)
        || resolve(item.path) !== this.switcher.sharedHome(item.provider)
        || !managed.get(item.provider)));
    const accounts = await Promise.all([...new Map(selectable.map((item) => [`${item.provider}:${item.path}`, item])).values()]
      .map(async (item) => {
        const account = registeredByProfile.get(`${item.provider}:${item.path}`);
        const claudeStatus = item.provider === "claude" ? await this.claudeStatus(item.path) : null;
        const identity = await this.switcher.identity(item.provider, item.path);
        return {
          accountId: account?.id ?? null,
          provider: item.provider,
          profilePath: item.path,
          label: account?.label ?? claudeStatus?.email ?? basename(item.path),
          registered: Boolean(account),
          authenticated: claudeStatus?.loggedIn ?? await this.authenticated(item.provider, item.path),
          enabled: account?.enabled ?? null,
          source: account?.source ?? null,
          active: activeProfiles.get(item.provider) === resolve(item.path),
          email: identity?.email ?? claudeStatus?.email ?? null,
          plan: identity?.plan ?? null,
        };
      }));
    return accounts.filter((account) => account.registered || account.authenticated);
  }

  async create(input: CreateAccountRequest): Promise<ManagedAccount> {
    return this.serialized(input.provider, async () => {
      const profilePath = input.profilePath ?? resolve(this.options.profilesRoot, input.provider, `${slug(input.label)}-${randomUUID()}`);
      if (!this.allowed(profilePath)) throw new AppError(400, "INVALID_PROFILE_PATH", "Der Profilpfad liegt außerhalb der erlaubten Bereiche.");
      if (resolve(profilePath) === this.switcher.sharedHome(input.provider)) {
        throw new AppError(400, "PROFILE_IS_SHARED_HOME", "Das gemeinsame Home ist kein Account. Bitte einen eigenen Anmeldespeicher verwenden.");
      }
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
    });
  }

  update(id: string, input: UpdateAccountRequest) { try { return this.options.database.updateAccount(id, { ...(input.label === undefined ? {} : {label:input.label}), ...(input.enabled === undefined ? {} : {enabled:input.enabled}) }); } catch { throw new AppError(404, "ACCOUNT_NOT_FOUND", "Der Account wurde nicht gefunden."); } }

  async remove(id: string) {
    let account: ManagedAccount; try { account = this.options.database.getAccount(id); } catch { throw new AppError(404, "ACCOUNT_NOT_FOUND", "Der Account wurde nicht gefunden."); }
    return this.serialized(account.provider, async () => {
      if (account.provider === "codex") await this.setCodexProfile(account.profilePath, false);
      if (account.provider === "claude" && this.list().filter((item) => item.provider === "claude" && item.id !== id).length === 0) await this.setProviderEnabled("claude", false);
      this.options.database.deleteAccount(id);
    });
  }

  loginCommand(account: ManagedAccount) { return account.provider === "codex" ? "codex login --device-auth" : account.provider === "claude" ? "claude auth login" : "opencode auth login"; }

  private async authenticated(provider: UsageProviderId, profilePath: string): Promise<boolean> {
    // Jedes Werkzeug hat eine eigene Anmeldedatei: auth.json bei Codex und OpenCode,
    // .credentials.json bei Claude Code.
    return this.switcher.hasCredentials(provider, profilePath);
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
