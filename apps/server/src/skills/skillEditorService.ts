import type { Dirent, Stats } from "node:fs";
import { chmod, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import {
  skillEditorCreateResponseSchema,
  skillEditorGitResponseSchema,
  skillEditorReadResponseSchema,
  skillEditorStatusResponseSchema,
  skillEditorTreeResponseSchema,
  type SkillEditorCreateRequest,
  type SkillEditorCreateResponse,
  type SkillEditorFile,
  type SkillEditorGitChange,
  type SkillEditorGitResponse,
  type SkillEditorNode,
  type SkillEditorReadResponse,
  type SkillEditorStatusResponse,
  type SkillEditorTreeResponse,
} from "@wrapt/contracts";
import { execa } from "execa";
import { AppError } from "../utils/errors.js";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NESTED_KEY_PATTERN = /^[A-Za-z0-9_-]+\s*:/;
const MAXIMUM_TREE_DEPTH = 8;
const GIT_ERROR_TAIL_LINES = 40;

export interface SkillEditorOptions {
  /** Ordner, der im Baum erscheint (globales Harness-Verzeichnis). */
  rootDirectory: string;
  /** Weitere Harness-Ordner, in die neue Skills per Symlink verteilt werden. */
  propagateDirectories: string[];
  /** Git-Repository mit den echten Skill-Ordnern; ohne Angabe entfällt der Git-Teil. */
  repositoryDirectory: string | null;
  autosaveDebounceMilliseconds: number;
  maxFileBytes: number;
}

function contained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

function filesystemFailure(error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") throw new AppError(404, "SKILLS_PATH_NOT_FOUND", "Diese Datei wurde nicht gefunden.");
  if (code === "EACCES" || code === "EPERM") throw new AppError(403, "SKILLS_PATH_INACCESSIBLE", "Diese Datei ist nicht lesbar.");
  throw error;
}

/** `stat` mit Symlink-Auflösung; `null` steht für einen Verweis ins Leere. */
async function statOrNull(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Liest den Frontmatter-Kopf einer `SKILL.md`. Bewusst ein schlanker Zeilenparser
 * statt einer YAML-Abhängigkeit: gebraucht werden nur die flachen Schlüssel
 * `name`, `description` und `license` aus dem Block zwischen den `---`-Markern.
 */
export function parseSkillFrontmatter(content: string): Record<string, string> {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const result: Record<string, string> = {};
  let continuedKey: string | null = null;
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") break;
    if (/^\s/.test(line)) {
      // Eingerückte Zeilen setzen einen leer begonnenen Wert fort (YAML-Blockschreibweise).
      // Verschachtelte Schlüssel wie unter `metadata:` bleiben außen vor.
      const text = line.trim();
      if (continuedKey && text && !NESTED_KEY_PATTERN.test(text)) {
        result[continuedKey] = `${result[continuedKey] ?? ""} ${text}`.trim();
      }
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) { continuedKey = null; continue; }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    continuedKey = value ? null : key;
    if (key && value) result[key] = value;
  }
  return result;
}

/** Ersetzt die `name:`-Zeile im Frontmatter — der Name muss dem Ordner entsprechen. */
export function withFrontmatterName(content: string, name: string): string {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return content;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") break;
    if (/^name\s*:/.test(lines[index] ?? "")) {
      lines[index] = `name: ${name}`;
      return lines.join("\n");
    }
  }
  return content;
}

function escapeTableCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/** Hängt eine Zeile an die letzte Markdown-Tabelle der README an. */
export function readmeWithRow(content: string, name: string, description: string): string | null {
  const lines = content.split("\n");
  let lastTableLine = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trimStart().startsWith("|")) lastTableLine = index;
  }
  if (lastTableLine < 0) return null;
  lines.splice(lastTableLine + 1, 0, `| ${name} | ${escapeTableCell(description)} |`);
  return lines.join("\n");
}

function tableRowPattern(name: string): RegExp {
  return new RegExp(`^\\s*\\|\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|`);
}

export function readmeWithRenamedRow(content: string, name: string, newName: string): string | null {
  const lines = content.split("\n");
  const pattern = tableRowPattern(name);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) return null;
  lines[index] = lines[index]!.replace(name, newName);
  return lines.join("\n");
}

export function readmeWithoutRow(content: string, name: string): string | null {
  const lines = content.split("\n");
  const pattern = tableRowPattern(name);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) return null;
  lines.splice(index, 1);
  return lines.join("\n");
}

/**
 * Baut die Commit-Nachricht aus den geänderten Skills. Deutsch, imperativ und
 * ohne Emojis — bewusst rein regelbasiert, damit kein Modell nötig ist.
 */
export function buildCommitMessage(changes: SkillEditorGitChange[], globalRulesChanged: boolean): { title: string; body: string | null } {
  const added = changes.filter((change) => change.action === "hinzugefuegt").map((change) => change.name);
  const removed = changes.filter((change) => change.action === "entfernt").map((change) => change.name);
  const changed = changes.filter((change) => change.action === "geaendert").map((change) => change.name);
  const rulesMessage = "update: globale Agenten-Regeln aktualisiert";

  if (changes.length === 0) return { title: rulesMessage, body: null };

  let title: string;
  if (added.length > 0 && removed.length === 0 && changed.length === 0) {
    title = `feat: skill ${added.join(", ")} hinzugefuegt`;
  } else if (removed.length > 0 && added.length === 0 && changed.length === 0) {
    title = `chore: skill ${removed.join(", ")} entfernt`;
  } else if (changed.length > 0 && added.length === 0 && removed.length === 0) {
    title = `update: skills ${changed.join(", ")} aktualisiert`;
  } else {
    title = `update: skills ${changes.map((change) => change.name).join(", ")} aktualisiert`;
  }
  return { title, body: globalRulesChanged ? rulesMessage : null };
}

/** Wertet `git status --porcelain` aus und ordnet die Pfade den Skills zu. */
export function parseGitStatus(output: string): { changes: SkillEditorGitChange[]; globalRulesChanged: boolean } {
  const states = new Map<string, Set<string>>();
  let globalRulesChanged = false;
  for (const line of output.split("\n")) {
    if (line.trim() === "") continue;
    const code = line.slice(0, 2).trim();
    let path = line.slice(3).trim().replace(/^"|"$/g, "");
    // Umbenennungen melden „alt -> neu"; entscheidend ist das Ziel.
    const renameSeparator = path.indexOf(" -> ");
    if (renameSeparator >= 0) path = path.slice(renameSeparator + 4);
    const skillMatch = /^skills\/([^/]+)/.exec(path);
    if (!skillMatch) {
      if (path === "AGENTS.md" || path === "README.md") globalRulesChanged = true;
      continue;
    }
    const name = skillMatch[1]!;
    const bucket = states.get(name) ?? new Set<string>();
    bucket.add(code);
    states.set(name, bucket);
  }

  const changes: SkillEditorGitChange[] = [...states.entries()]
    .map(([name, codes]) => {
      const all = [...codes];
      if (all.every((code) => code === "??" || code === "A")) return { name, action: "hinzugefuegt" as const };
      if (all.every((code) => code === "D")) return { name, action: "entfernt" as const };
      return { name, action: "geaendert" as const };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
  return { changes, globalRulesChanged };
}

function tail(value: string, lines = GIT_ERROR_TAIL_LINES): string {
  return value.trim().split("\n").slice(-lines).join("\n");
}

export class SkillEditorService {
  private readonly allowedRoots: string[];

  constructor(private readonly options: SkillEditorOptions) {
    this.allowedRoots = [
      options.rootDirectory,
      ...options.propagateDirectories,
      ...(options.repositoryDirectory ? [options.repositoryDirectory] : []),
    ].map((path) => resolve(path));
  }

  get skillsDirectory(): string {
    return join(this.options.rootDirectory, "skills");
  }

  // --- Pfadprüfung ----------------------------------------------------------

  /**
   * Der angeforderte Pfad muss vor der Auflösung innerhalb des Root-Ordners liegen.
   * Anders als der Dateimanager folgt der Skill-Editor Symlinks bewusst — die Skills
   * *sind* Verweise ins Repository —, das Ziel muss aber in einem erlaubten Bereich landen.
   */
  private requestedPath(input: string): string {
    const value = input.trim();
    if (!value) throw new AppError(400, "SKILLS_PATH_REQUIRED", "Es wurde kein Pfad angegeben.");
    const requested = isAbsolute(value) ? normalize(value) : resolve(this.options.rootDirectory, value);
    if (!contained(this.options.rootDirectory, requested)) {
      throw new AppError(403, "SKILLS_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des Skill-Ordners.");
    }
    return requested;
  }

  private assertAllowedTarget(canonical: string): void {
    if (this.allowedRoots.some((root) => contained(root, canonical))) return;
    throw new AppError(403, "SKILLS_PATH_OUTSIDE_ROOT", "Der Verweis führt aus den erlaubten Skill-Ordnern heraus.");
  }

  /** Pfad auflösen und auf Datei/Ordner prüfen; kaputte Verweise werden benannt. */
  private async resolveExisting(input: string, expect: "file" | "directory"): Promise<{ requested: string; canonical: string; details: Stats }> {
    const requested = this.requestedPath(input);
    let details: Stats;
    try {
      details = await stat(requested);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && await exists(requested)) {
        throw new AppError(409, "SKILLS_SYMLINK_BROKEN", "Dieser Verweis zeigt ins Leere. Das Ziel wurde verschoben oder gelöscht.");
      }
      filesystemFailure(error);
    }
    if (expect === "file" && !details.isFile()) throw new AppError(400, "SKILLS_PATH_NOT_FILE", "Der angegebene Pfad ist keine Datei.");
    if (expect === "directory" && !details.isDirectory()) throw new AppError(400, "SKILLS_PATH_NOT_DIRECTORY", "Der angegebene Pfad ist kein Ordner.");
    const canonical = await realpath(requested).catch(filesystemFailure);
    this.assertAllowedTarget(canonical);
    return { requested, canonical, details };
  }

  // --- Baum -----------------------------------------------------------------

  private async fileEntry(path: string, name = basename(path)): Promise<SkillEditorFile | null> {
    let link: Stats;
    try {
      link = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const isSymbolicLink = link.isSymbolicLink();
    // Kaputter Verweis: bleibt im Baum sichtbar, ist aber nicht bearbeitbar.
    const details = await statOrNull(path);
    if (details && !details.isFile() && !details.isDirectory()) return null;
    const kind: SkillEditorFile["kind"] = details?.isDirectory() ? "directory" : "file";
    return {
      name,
      path,
      kind,
      sizeBytes: details?.isFile() ? details.size : null,
      modifiedAt: details ? details.mtime.toISOString() : null,
      symlink: isSymbolicLink,
      broken: details === null,
      editable: Boolean(details?.isFile() && details.size <= this.options.maxFileBytes),
    };
  }

  private async walk(directory: string, depth: number): Promise<SkillEditorFile[]> {
    if (depth >= MAXIMUM_TREE_DEPTH) return [];
    let dirents: Dirent[];
    try {
      dirents = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }
    dirents.sort((left, right) => {
      // `SKILL.md` gehört nach oben: sie ist die Datei, die fast immer gemeint ist.
      if (depth === 0 && (left.name === "SKILL.md" || right.name === "SKILL.md")) {
        return Number(right.name === "SKILL.md") - Number(left.name === "SKILL.md");
      }
      return left.name.localeCompare(right.name, "de", { sensitivity: "base" });
    });
    const files: SkillEditorFile[] = [];
    for (const dirent of dirents) {
      if (dirent.name === ".git" || dirent.name === "node_modules") continue;
      const path = join(directory, dirent.name);
      const entry = await this.fileEntry(path, dirent.name);
      if (!entry) continue;
      files.push(entry);
      if (entry.kind === "directory" && !entry.broken) files.push(...await this.walk(path, depth + 1));
    }
    return files;
  }

  async list(): Promise<SkillEditorTreeResponse> {
    const agentsFile = await this.fileEntry(join(this.options.rootDirectory, "AGENTS.md"));
    let dirents: Dirent[] = [];
    try {
      dirents = await readdir(this.skillsDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    dirents.sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));

    const skills: SkillEditorNode[] = [];
    for (const dirent of dirents) {
      if (dirent.name.startsWith(".")) continue;
      const path = join(this.skillsDirectory, dirent.name);
      const details = await statOrNull(path);
      // Nur Skill-Ordner (und kaputte Verweise, die einmal Ordner waren) gehören in den Baum.
      if (details && !details.isDirectory()) continue;
      const broken = details === null;
      let description: string | null = null;
      if (!broken) {
        const frontmatter = await readFile(join(path, "SKILL.md"), "utf8").then(parseSkillFrontmatter).catch(() => ({} as Record<string, string>));
        description = frontmatter.description ?? null;
      }
      skills.push({
        name: dirent.name,
        path,
        description,
        modifiedAt: details ? details.mtime.toISOString() : null,
        symlink: dirent.isSymbolicLink(),
        broken,
        files: broken ? [] : await this.walk(path, 0),
      });
    }
    return skillEditorTreeResponseSchema.parse({ rootDirectory: this.options.rootDirectory, agentsFile, skills });
  }

  async status(): Promise<SkillEditorStatusResponse> {
    return skillEditorStatusResponseSchema.parse({
      rootDirectory: this.options.rootDirectory,
      repositoryConfigured: this.options.repositoryDirectory !== null,
      repository: await this.repositoryStatus(),
      propagationTargets: this.options.propagateDirectories,
      autosaveDebounceMs: this.options.autosaveDebounceMilliseconds,
      maxFileBytes: this.options.maxFileBytes,
    });
  }

  private async repositoryStatus(): Promise<{ branch: string; dirtyCount: number } | null> {
    const repository = this.options.repositoryDirectory;
    if (!repository) return null;
    const [branch, changes] = await Promise.all([
      execa("git", ["-C", repository, "branch", "--show-current"], { reject: false, timeout: 5_000 }),
      execa("git", ["-C", repository, "status", "--porcelain"], { reject: false, timeout: 10_000 }),
    ]);
    if (branch.exitCode !== 0 || changes.exitCode !== 0) return null;
    const dirtyCount = changes.stdout.split("\n").filter((line) => line.trim() !== "").length;
    return { branch: branch.stdout.trim() || "HEAD", dirtyCount };
  }

  // --- Lesen und Schreiben --------------------------------------------------

  async readFile(input: { path: string }): Promise<SkillEditorReadResponse> {
    const { requested, canonical, details } = await this.resolveExisting(input.path, "file");
    if (details.size > this.options.maxFileBytes) {
      throw new AppError(413, "SKILLS_FILE_TOO_LARGE", "Diese Datei ist zu groß für den Editor.", { limitBytes: this.options.maxFileBytes });
    }
    const buffer = await readFile(canonical).catch(filesystemFailure);
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new AppError(415, "SKILLS_NOT_TEXT", "Diese Datei ist kein Textdokument und kann nicht bearbeitet werden.");
    }
    return skillEditorReadResponseSchema.parse({
      path: requested,
      name: basename(requested),
      content,
      modifiedAt: details.mtime.toISOString(),
      sizeBytes: details.size,
    });
  }

  /**
   * Atomar schreiben: Temp-Datei im Zielverzeichnis, dann `rename`. Ein paralleler
   * Fremdzugriff (etwa `git pull`) wird über die erwartete mtime erkannt und mit 409
   * beantwortet, statt die fremde Fassung still zu überschreiben.
   */
  async writeFile(input: { path: string; content: string; expectedModifiedAt: string | null }): Promise<SkillEditorReadResponse> {
    const { requested, canonical, details } = await this.resolveExisting(input.path, "file");
    if (input.content.length > this.options.maxFileBytes) {
      throw new AppError(413, "SKILLS_FILE_TOO_LARGE", "Der Inhalt überschreitet das Größenlimit.", { limitBytes: this.options.maxFileBytes });
    }
    const serverModifiedAt = details.mtime.toISOString();
    if (input.expectedModifiedAt !== null && input.expectedModifiedAt !== serverModifiedAt) {
      throw new AppError(409, "SKILLS_CONFLICT", "Diese Datei wurde zwischenzeitlich außerhalb der Workbench geändert.", { serverModifiedAt });
    }
    const temporary = join(dirname(canonical), `.wrapt-skill-${process.pid}-${Date.now()}.tmp`);
    try {
      await writeFile(temporary, input.content, { encoding: "utf8", mode: 0o600 });
      // Bestehende Rechte übernehmen, damit eine Bearbeitung keine Datei-Rechte verschiebt.
      await chmod(temporary, details.mode & 0o777);
      await rename(temporary, canonical);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      filesystemFailure(error);
    }
    return this.readFile({ path: requested });
  }

  // --- Skills anlegen, umbenennen, löschen ----------------------------------

  private assertName(name: string): void {
    if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
      throw new AppError(400, "SKILLS_NAME_INVALID", "Der Name darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.");
    }
  }

  /** Alle Orte, an denen ein Skill mit diesem Namen sichtbar wird. */
  private linkTargets(name: string): string[] {
    return [join(this.skillsDirectory, name), ...this.options.propagateDirectories.map((directory) => join(directory, name))];
  }

  private physicalPath(name: string): string {
    const repository = this.options.repositoryDirectory;
    return repository ? join(repository, "skills", name) : join(this.skillsDirectory, name);
  }

  private async physicalBase(): Promise<string> {
    const repository = this.options.repositoryDirectory;
    // Ohne vorhandenes `skills/` im Repo entsteht der Ordner lokal — das Repo bleibt unberührt.
    if (repository && await exists(join(repository, "skills"))) return join(repository, "skills");
    return this.skillsDirectory;
  }

  private async assertNameFree(name: string): Promise<void> {
    for (const path of [this.physicalPath(name), ...this.linkTargets(name)]) {
      if (await exists(path)) {
        throw new AppError(409, "SKILLS_NAME_TAKEN", `Ein Skill mit dem Namen „${name}" existiert bereits.`);
      }
    }
  }

  async createSkill(input: SkillEditorCreateRequest): Promise<SkillEditorCreateResponse> {
    this.assertName(input.name);
    await this.assertNameFree(input.name);

    const base = await this.physicalBase();
    const physical = join(base, input.name);
    const linkPath = join(this.skillsDirectory, input.name);
    const created: string[] = [];
    const propagated: string[] = [];

    try {
      await mkdir(physical, { recursive: true });
      created.push(physical);
      const frontmatter = [
        "---",
        `name: ${input.name}`,
        `description: ${input.description.replace(/\r?\n/g, " ")}`,
        ...(input.license ? [`license: ${input.license}`] : []),
        "---",
        "",
        `# ${input.name}`,
        "",
      ].join("\n");
      await writeFile(join(physical, "SKILL.md"), frontmatter, { encoding: "utf8", mode: 0o644 });

      if (physical !== linkPath) {
        await mkdir(this.skillsDirectory, { recursive: true });
        await symlink(physical, linkPath, "dir");
        created.push(linkPath);
      }
      // Die weiteren Harnesses zeigen auf den Ordner im Root — genau wie das bestehende Setup.
      for (const directory of this.options.propagateDirectories) {
        await mkdir(directory, { recursive: true });
        const target = join(directory, input.name);
        await symlink(linkPath, target, "dir");
        created.push(target);
        propagated.push(target);
      }
    } catch (error) {
      for (const path of created.reverse()) await rm(path, { recursive: true, force: true }).catch(() => undefined);
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }

    const readme = await this.updateReadme((content) => readmeWithRow(content, input.name, input.description));
    return skillEditorCreateResponseSchema.parse({
      path: join(linkPath, "SKILL.md"),
      name: input.name,
      propagated,
      readmeUpdated: readme.updated,
      notice: readme.notice,
    });
  }

  async renameSkill(input: { name: string; newName: string }): Promise<SkillEditorCreateResponse> {
    this.assertName(input.name);
    this.assertName(input.newName);
    if (input.name === input.newName) throw new AppError(400, "SKILLS_SAME_NAME", "Der Name ist unverändert.");
    await this.assertNameFree(input.newName);

    const linkPath = join(this.skillsDirectory, input.name);
    if (!await exists(linkPath)) throw new AppError(404, "SKILLS_NOT_FOUND", "Dieser Skill wurde nicht gefunden.");
    const physical = await realpath(linkPath).catch(filesystemFailure);
    this.assertAllowedTarget(physical);

    const newPhysical = join(dirname(physical), input.newName);
    const newLinkPath = join(this.skillsDirectory, input.newName);
    await rename(physical, newPhysical).catch(filesystemFailure);

    // Der Verweis im Root zeigt nach dem Verschieben ins Leere und wird neu gesetzt.
    if (physical !== linkPath) {
      await unlink(linkPath).catch(() => undefined);
      await symlink(newPhysical, newLinkPath, "dir");
    }
    const propagated: string[] = [];
    for (const directory of this.options.propagateDirectories) {
      const previous = join(directory, input.name);
      if (!await exists(previous)) continue;
      await unlink(previous).catch(() => undefined);
      const target = join(directory, input.newName);
      await symlink(newLinkPath, target, "dir");
      propagated.push(target);
    }

    // Der Frontmatter-Name muss dem Ordnernamen entsprechen, sonst lädt der Agent den Skill nicht.
    const skillFile = join(newPhysical, "SKILL.md");
    const content = await readFile(skillFile, "utf8").catch(() => null);
    if (content !== null) await writeFile(skillFile, withFrontmatterName(content, input.newName), "utf8");

    const readme = await this.updateReadme((value) => readmeWithRenamedRow(value, input.name, input.newName));
    return skillEditorCreateResponseSchema.parse({
      path: join(newLinkPath, "SKILL.md"),
      name: input.newName,
      propagated,
      readmeUpdated: readme.updated,
      notice: readme.notice,
    });
  }

  async deleteSkill(input: { name: string }): Promise<void> {
    this.assertName(input.name);
    const linkPath = join(this.skillsDirectory, input.name);
    if (!await exists(linkPath)) throw new AppError(404, "SKILLS_NOT_FOUND", "Dieser Skill wurde nicht gefunden.");

    // Erst die Verweise entfernen (nur den Link, nie das Ziel), dann den echten Ordner.
    for (const directory of this.options.propagateDirectories) {
      const target = join(directory, input.name);
      if (await exists(target)) await unlink(target).catch(() => undefined);
    }
    const physical = await realpath(linkPath).catch(() => null);
    const isLink = (await lstat(linkPath)).isSymbolicLink();
    if (isLink) await unlink(linkPath).catch(() => undefined);
    if (physical) {
      this.assertAllowedTarget(physical);
      await rm(physical, { recursive: true, force: true }).catch(filesystemFailure);
    }
    await this.updateReadme((content) => readmeWithoutRow(content, input.name));
  }

  private async updateReadme(transform: (content: string) => string | null): Promise<{ updated: boolean; notice: string | null }> {
    const repository = this.options.repositoryDirectory;
    if (!repository) return { updated: false, notice: null };
    const path = join(repository, "README.md");
    const content = await readFile(path, "utf8").catch(() => null);
    if (content === null) return { updated: false, notice: "Die README des Skill-Repos wurde nicht gefunden; die Skill-Tabelle bleibt unverändert." };
    const next = transform(content);
    if (next === null) return { updated: false, notice: "In der README wurde keine passende Tabellenzeile gefunden; bitte manuell prüfen." };
    await writeFile(path, next, "utf8");
    return { updated: true, notice: null };
  }

  // --- Git ------------------------------------------------------------------

  async gitCommitPush(): Promise<SkillEditorGitResponse> {
    const repository = this.options.repositoryDirectory;
    if (!repository) throw new AppError(400, "SKILLS_REPOSITORY_MISSING", "Es ist kein Skill-Repository konfiguriert.");
    const run = (args: string[]) => execa("git", ["-C", repository, ...args], { reject: false, timeout: 120_000 });

    const statusResult = await run(["status", "--porcelain"]);
    if (statusResult.exitCode !== 0) {
      return skillEditorGitResponseSchema.parse({
        committed: false, pushed: false, message: null, changedSkills: [],
        errorTail: tail(`${statusResult.stdout}\n${statusResult.stderr}`),
        notice: "Der Ordner ist kein lesbares Git-Repository.",
      });
    }
    const { changes, globalRulesChanged } = parseGitStatus(statusResult.stdout);
    if (changes.length === 0 && !globalRulesChanged) {
      return skillEditorGitResponseSchema.parse({ committed: false, pushed: false, message: null, changedSkills: [], errorTail: null, notice: "Es gibt nichts zu committen." });
    }

    const { title, body } = buildCommitMessage(changes, globalRulesChanged);
    const add = await run(["add", "-A"]);
    if (add.exitCode !== 0) {
      return skillEditorGitResponseSchema.parse({ committed: false, pushed: false, message: null, changedSkills: changes, errorTail: tail(`${add.stdout}\n${add.stderr}`), notice: "Die Änderungen konnten nicht vorgemerkt werden." });
    }
    const commit = await run(["commit", "-m", title, ...(body ? ["-m", body] : [])]);
    if (commit.exitCode !== 0) {
      return skillEditorGitResponseSchema.parse({ committed: false, pushed: false, message: null, changedSkills: changes, errorTail: tail(`${commit.stdout}\n${commit.stderr}`), notice: "Der Commit ist fehlgeschlagen." });
    }
    const push = await run(["push"]);
    if (push.exitCode !== 0) {
      return skillEditorGitResponseSchema.parse({
        committed: true, pushed: false, message: title, changedSkills: changes,
        errorTail: tail(`${push.stdout}\n${push.stderr}`),
        notice: "Der Commit liegt lokal vor, das Pushen ist fehlgeschlagen.",
      });
    }
    return skillEditorGitResponseSchema.parse({ committed: true, pushed: true, message: title, changedSkills: changes, errorTail: null, notice: null });
  }
}
