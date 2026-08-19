import { access, lstat, mkdir, readFile, readlink, rename, symlink, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { UsageProviderId } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

/**
 * Serverweite Umschaltung des aktiven Accounts für Codex, Claude Code und OpenCode.
 *
 * Jedes Werkzeug behält genau ein gemeinsames Home (`~/.codex`, `~/.claude`,
 * `~/.local/share/opencode`). Dort liegen Konfiguration, Sessions und Verlauf — die bleiben
 * geteilt. Umgeschaltet wird ausschließlich die Anmeldedatei: Sie ist ein Symlink in den
 * Anmeldespeicher des aktiven Accounts und wird beim Wechsel atomar umgehängt.
 *
 * Für Codex und OpenCode ist nachgewiesen, dass die CLIs durch den Symlink hindurch schreiben
 * und ihn dabei erhalten. Claude Code entfernt ihn beim Abmelden, und wie es beim Auffrischen
 * des Tokens schreibt, lässt sich nicht erzwingen. Deshalb verlässt sich diese Klasse nicht auf
 * das Verhalten der CLIs: Findet sie an der Stelle des Symlinks wieder eine reguläre Datei,
 * übernimmt `repair` sie in den Speicher des zuletzt aktivierten Accounts und hängt den Symlink
 * neu ein. Aufgefrischte Zugangsdaten gehen so in keinem Fall verloren.
 */
export type SwitchableProvider = UsageProviderId;

export type ProviderLayout = { sharedHome: string; authFileName: string };

export type AccountIdentity = { email: string | null; accountId: string | null; plan: string | null };

export class AccountSwitch {
  constructor(private readonly layouts: Record<SwitchableProvider, ProviderLayout>) {}

  sharedHome(provider: SwitchableProvider) { return resolve(this.layouts[provider].sharedHome); }

  /** Anmeldedatei im gemeinsamen Home — der Ort, den das Werkzeug tatsächlich liest. */
  private sharedAuthPath(provider: SwitchableProvider) {
    return join(this.sharedHome(provider), this.layouts[provider].authFileName);
  }

  authPathFor(provider: SwitchableProvider, profilePath: string) {
    return join(resolve(profilePath), this.layouts[provider].authFileName);
  }

  async hasCredentials(provider: SwitchableProvider, profilePath: string) {
    try { await access(this.authPathFor(provider, profilePath)); return true; } catch { return false; }
  }

  /**
   * Wird das gemeinsame Home bereits verwaltet? Dann ist seine Anmeldedatei ein Symlink und
   * gehört einem Account — es ist selbst keiner mehr. Liegt dort noch eine reguläre Datei,
   * ist das eine eigenständige Anmeldung, die sich registrieren und übernehmen lässt.
   */
  async isManaged(provider: SwitchableProvider) {
    const current = await lstat(this.sharedAuthPath(provider)).catch(() => null);
    return current?.isSymbolicLink() ?? false;
  }

  /** Anmeldespeicher, auf den das gemeinsame Home derzeit zeigt, oder `null`. */
  async activeProfilePath(provider: SwitchableProvider): Promise<string | null> {
    const authPath = this.sharedAuthPath(provider);
    try {
      const target = await readlink(authPath);
      return dirname(resolve(dirname(authPath), target));
    } catch { return null; }
  }

  /** Kontoidentität und Tarif, soweit das Anmeldeformat des Werkzeugs sie hergibt. */
  async identity(provider: SwitchableProvider, profilePath: string): Promise<AccountIdentity | null> {
    let raw: string;
    try { raw = await readFile(this.authPathFor(provider, profilePath), "utf8"); } catch { return null; }
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }

    if (provider === "codex") {
      const tokens = parsed.tokens as { id_token?: unknown; account_id?: unknown } | undefined;
      const claims = typeof tokens?.id_token === "string" ? decodeJwtClaims(tokens.id_token) : null;
      const auth = claims?.["https://api.openai.com/auth"];
      const plan = auth && typeof auth === "object" ? (auth as Record<string, unknown>).chatgpt_plan_type : undefined;
      return {
        email: typeof claims?.email === "string" ? claims.email : null,
        accountId: typeof tokens?.account_id === "string" ? tokens.account_id : null,
        plan: typeof plan === "string" ? plan : null,
      };
    }
    if (provider === "claude") {
      // Claude Code legt keine E-Mail ab; die kommt aus `claude auth status`. Der Tarif steht hier.
      const oauth = parsed.claudeAiOauth as { subscriptionType?: unknown } | undefined;
      return { email: null, accountId: null, plan: typeof oauth?.subscriptionType === "string" ? oauth.subscriptionType : null };
    }
    // OpenCode speichert eine Zuordnung von Anbieter zu Schlüssel, ohne Kontoidentität.
    // Angezeigt wird deshalb, für wie viele Anbieter Zugangsdaten hinterlegt sind.
    const providers = Object.keys(parsed).length;
    return { email: null, accountId: null, plan: providers ? `${providers} Anbieter` : null };
  }

  /**
   * Verschiebt die Anmeldedatei aus dem gemeinsamen Home in einen eigenen Speicher. Nötig für
   * Accounts, die noch direkt auf das gemeinsame Home zeigen — sonst würde der Symlink auf sich
   * selbst verweisen.
   */
  async moveSharedHomeIntoStore(provider: SwitchableProvider, storePath: string) {
    const source = this.sharedAuthPath(provider);
    const current = await lstat(source).catch(() => null);
    if (!current?.isFile()) {
      throw new AppError(409, "ACCOUNT_NOT_AUTHENTICATED", "Für dieses Werkzeug liegen keine Anmeldedaten vor. Bitte zuerst einmalig anmelden.");
    }
    await mkdir(resolve(storePath), { recursive: true, mode: 0o700 });
    const destination = this.authPathFor(provider, storePath);
    const backup = await moveAside(destination);
    try {
      await rename(source, destination);
    } catch (error) {
      if (backup) await rename(backup, destination).catch(() => undefined);
      throw error;
    }
  }

  /** Schaltet den serverweit aktiven Account um. */
  async activate(provider: SwitchableProvider, profilePath: string, candidates: string[]): Promise<{ adoptedInto: string | null; backupPath: string | null }> {
    const target = resolve(profilePath);
    if (target === this.sharedHome(provider)) {
      throw new AppError(400, "PROFILE_IS_SHARED_HOME", "Das gemeinsame Home kann nicht selbst als Account aktiviert werden.");
    }
    if (!await this.hasCredentials(provider, target)) {
      throw new AppError(409, "ACCOUNT_NOT_AUTHENTICATED", "Für diesen Account liegen keine Anmeldedaten vor. Bitte zuerst einmalig anmelden.");
    }
    await mkdir(this.sharedHome(provider), { recursive: true, mode: 0o700 });
    const adopted = await this.adoptSharedAuth(provider, candidates);
    await this.link(provider, target);
    return adopted;
  }

  /**
   * Stellt den Symlink wieder her, falls ein Werkzeug ihn durch eine reguläre Datei ersetzt hat.
   * Die dort liegenden Zugangsdaten sind dann die neueren und werden in den Speicher des
   * zuletzt aktivierten Accounts übernommen.
   */
  async repair(provider: SwitchableProvider, intendedProfilePath: string): Promise<boolean> {
    const target = resolve(intendedProfilePath);
    if (target === this.sharedHome(provider)) return false;
    const current = await lstat(this.sharedAuthPath(provider)).catch(() => null);
    if (current?.isSymbolicLink()) return false;
    if (current?.isFile()) {
      await mkdir(target, { recursive: true, mode: 0o700 });
      await moveAside(this.authPathFor(provider, target));
      await rename(this.sharedAuthPath(provider), this.authPathFor(provider, target));
    } else if (!await this.hasCredentials(provider, target)) {
      return false;
    }
    await this.link(provider, target);
    return true;
  }

  /** Hängt die Anmeldedatei atomar auf den Speicher des Accounts um. */
  private async link(provider: SwitchableProvider, target: string) {
    const authPath = this.sharedAuthPath(provider);
    const temporary = `${authPath}.umschaltung-${process.pid}-${Date.now()}`;
    await symlink(this.authPathFor(provider, target), temporary);
    try {
      // rename über den bestehenden Eintrag ist atomar: Es gibt keinen Moment, in dem ein
      // startender Prozess gar keine Anmeldedatei vorfindet.
      await rename(temporary, authPath);
    } catch {
      await unlink(temporary).catch(() => undefined);
      throw new AppError(500, "SWITCH_FAILED", "Der aktive Account konnte nicht umgeschaltet werden.");
    }
    if (await this.activeProfilePath(provider) !== target) {
      throw new AppError(500, "SWITCH_FAILED", "Der aktive Account konnte nicht überprüft werden.");
    }
  }

  /**
   * Übernimmt eine noch reguläre Anmeldedatei aus dem gemeinsamen Home in den Speicher des
   * Accounts, zu dem sie gehört. Ohne diesen Schritt würde die erste Umschaltung die aktuellsten
   * Zugangsdaten verdecken und beim Zurückschalten eine neue Anmeldung erzwingen.
   */
  private async adoptSharedAuth(provider: SwitchableProvider, candidates: string[]): Promise<{ adoptedInto: string | null; backupPath: string | null }> {
    const authPath = this.sharedAuthPath(provider);
    const current = await lstat(authPath).catch(() => null);
    if (!current?.isFile()) return { adoptedInto: null, backupPath: null };

    const shared = await this.identity(provider, this.sharedHome(provider));
    const stamp = timestamp();
    for (const candidate of candidates) {
      const target = resolve(candidate);
      if (target === this.sharedHome(provider)) continue;
      const identity = await this.identity(provider, target);
      const sameAccount = shared?.accountId && identity?.accountId
        ? shared.accountId === identity.accountId
        : Boolean(shared?.email && identity?.email && shared.email === identity.email);
      if (!sameAccount) continue;
      const backupPath = await moveAside(this.authPathFor(provider, target));
      await rename(authPath, this.authPathFor(provider, target));
      return { adoptedInto: target, backupPath };
    }
    // Kein passender Account registriert: Die Datei wird nur beiseitegelegt, nie gelöscht.
    const backupPath = `${authPath}.uebernommen-${stamp}`;
    await rename(authPath, backupPath);
    return { adoptedInto: null, backupPath };
  }
}

function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

async function moveAside(path: string): Promise<string | null> {
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!existing) return null;
  const backup = `${path}.ersetzt-${timestamp()}`;
  await rename(path, backup);
  return backup;
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return null; }
}
