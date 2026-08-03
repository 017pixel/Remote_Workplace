import { mkdir, mkdtemp, readFile, readdir, lstat, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import {
  SkillEditorService,
  buildCommitMessage,
  parseGitStatus,
  parseSkillFrontmatter,
  readmeWithRow,
  readmeWithoutRow,
  readmeWithRenamedRow,
  withFrontmatterName,
} from "./skillEditorService.js";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const remove of cleanup.splice(0).reverse()) await remove();
});

const readme = [
  "# skills",
  "",
  "## Enthaltene Skills",
  "",
  "| Skill | Beschreibung |",
  "|-------|-------------|",
  "| alpha | Erster Skill |",
  "",
  "Ende.",
].join("\n");

function skillFile(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

/** Baut das echte Setup nach: Repo mit Skills, Root mit Symlinks, zwei Verteilziele. */
async function fixture(options: { withRepository?: boolean } = {}) {
  const base = await mkdtemp(join(tmpdir(), "workbench-skills-"));
  cleanup.push(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "opencode");
  const repository = join(base, "repo");
  const claude = join(base, "claude/skills");
  const codex = join(base, "codex/skills");
  const withRepository = options.withRepository !== false;

  await mkdir(join(root, "skills"), { recursive: true });
  await mkdir(claude, { recursive: true });
  await mkdir(codex, { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# Globale Regeln\n", "utf8");

  if (withRepository) {
    await mkdir(join(repository, "skills/alpha"), { recursive: true });
    await writeFile(join(repository, "README.md"), readme, "utf8");
    await writeFile(join(repository, "skills/alpha/SKILL.md"), skillFile("alpha", "Erster Skill"), "utf8");
    await symlink(join(repository, "skills/alpha"), join(root, "skills/alpha"), "dir");
    await symlink(join(root, "skills/alpha"), join(claude, "alpha"), "dir");
    await symlink(join(root, "skills/alpha"), join(codex, "alpha"), "dir");
  }

  const service = new SkillEditorService({
    rootDirectory: root,
    propagateDirectories: [claude, codex],
    repositoryDirectory: withRepository ? repository : null,
    autosaveDebounceMilliseconds: 2_500,
    maxFileBytes: 4_096,
  });
  return { base, root, repository, claude, codex, service };
}

async function initGitRepository(repository: string) {
  await execa("git", ["-C", repository, "init", "-b", "main"]);
  await execa("git", ["-C", repository, "config", "user.email", "test@example.com"]);
  await execa("git", ["-C", repository, "config", "user.name", "Test"]);
  await execa("git", ["-C", repository, "add", "-A"]);
  await execa("git", ["-C", repository, "commit", "-m", "init"]);
}

describe("Frontmatter und README", () => {
  it("liest flache Frontmatter-Schlüssel und überspringt verschachtelte Werte", () => {
    const parsed = parseSkillFrontmatter("---\nname: alpha\ndescription: Ein Skill\nmetadata:\n  type: user\n---\n\n# alpha\n");
    // `metadata:` hat keinen eigenen Wert, `type:` ist eingerückt — beide bleiben außen vor.
    expect(parsed).toEqual({ name: "alpha", description: "Ein Skill" });
  });

  it("setzt einen eingerückten Blockwert fort", () => {
    const parsed = parseSkillFrontmatter("---\nname: convex\ndescription:\n  Erste Zeile\n  zweite Zeile\nmetadata:\n  type: user\n---\n");
    expect(parsed.description).toBe("Erste Zeile zweite Zeile");
    expect(parsed.type).toBeUndefined();
  });

  it("liefert nichts ohne Frontmatter-Block", () => {
    expect(parseSkillFrontmatter("# alpha\n")).toEqual({});
  });

  it("ersetzt den Frontmatter-Namen", () => {
    expect(withFrontmatterName(skillFile("alpha", "x"), "beta")).toContain("name: beta");
  });

  it("fügt eine Tabellenzeile hinter der letzten Zeile ein", () => {
    const next = readmeWithRow(readme, "beta", "Zweiter | Skill")!;
    expect(next).toContain("| beta | Zweiter \\| Skill |");
    expect(next.split("\n").at(-1)).toBe("Ende.");
  });

  it("meldet eine fehlende Tabelle", () => {
    expect(readmeWithRow("# skills\n\nOhne Tabelle.\n", "beta", "x")).toBeNull();
    expect(readmeWithoutRow(readme, "gamma")).toBeNull();
  });

  it("benennt eine Zeile um und entfernt sie", () => {
    expect(readmeWithRenamedRow(readme, "alpha", "beta")).toContain("| beta | Erster Skill |");
    expect(readmeWithoutRow(readme, "alpha")).not.toContain("alpha");
  });
});

describe("Commit-Nachrichten", () => {
  it("erkennt neue, geänderte und entfernte Skills", () => {
    const status = ["?? skills/neu/", " M skills/alpha/SKILL.md", " D skills/weg/SKILL.md", " M README.md"].join("\n");
    const { changes, globalRulesChanged } = parseGitStatus(status);
    expect(changes).toEqual([
      { name: "alpha", action: "geaendert" },
      { name: "neu", action: "hinzugefuegt" },
      { name: "weg", action: "entfernt" },
    ]);
    expect(globalRulesChanged).toBe(true);
  });

  it("wertet Umbenennungen über das Ziel aus", () => {
    expect(parseGitStatus("R  skills/alt/SKILL.md -> skills/neu/SKILL.md").changes).toEqual([{ name: "neu", action: "geaendert" }]);
  });

  it("formuliert je nach Art der Änderung", () => {
    expect(buildCommitMessage([{ name: "a", action: "hinzugefuegt" }, { name: "b", action: "hinzugefuegt" }], false).title).toBe("feat: skill a, b hinzugefuegt");
    expect(buildCommitMessage([{ name: "a", action: "entfernt" }], false).title).toBe("chore: skill a entfernt");
    expect(buildCommitMessage([{ name: "a", action: "geaendert" }], false).title).toBe("update: skills a aktualisiert");
    expect(buildCommitMessage([], true).title).toBe("update: globale Agenten-Regeln aktualisiert");
    expect(buildCommitMessage([{ name: "a", action: "geaendert" }], true).body).toBe("update: globale Agenten-Regeln aktualisiert");
  });
});

describe("Baum", () => {
  it("listet die globalen Regeln und die Skills mit Beschreibung", async () => {
    const { service, root } = await fixture();
    const tree = await service.list();
    expect(tree.rootDirectory).toBe(root);
    expect(tree.agentsFile?.name).toBe("AGENTS.md");
    expect(tree.agentsFile?.editable).toBe(true);
    expect(tree.skills).toHaveLength(1);
    expect(tree.skills[0]).toMatchObject({ name: "alpha", description: "Erster Skill", symlink: true, broken: false });
    expect(tree.skills[0]?.files.map((file) => file.name)).toEqual(["SKILL.md"]);
  });

  it("zeigt Unterordner und markiert kaputte Verweise", async () => {
    const { service, root, repository } = await fixture();
    await mkdir(join(repository, "skills/alpha/references"), { recursive: true });
    await writeFile(join(repository, "skills/alpha/references/notiz.md"), "Hinweis\n", "utf8");
    await symlink(join(root, "gibt-es-nicht"), join(root, "skills/kaputt"), "dir");

    const tree = await service.list();
    const alpha = tree.skills.find((skill) => skill.name === "alpha")!;
    expect(alpha.files.map((file) => file.name)).toContain("notiz.md");
    const broken = tree.skills.find((skill) => skill.name === "kaputt")!;
    expect(broken.broken).toBe(true);
    expect(broken.files).toEqual([]);
  });

  it("kommt ohne skills-Ordner zurecht", async () => {
    const { service, root } = await fixture({ withRepository: false });
    await rm(join(root, "skills"), { recursive: true, force: true });
    await expect(service.list()).resolves.toMatchObject({ skills: [] });
  });
});

describe("Lesen und Schreiben", () => {
  it("liest den vollständigen Inhalt über den Symlink", async () => {
    const { service, root } = await fixture();
    const file = await service.readFile({ path: join(root, "skills/alpha/SKILL.md") });
    expect(file.content).toContain("name: alpha");
    expect(file.name).toBe("SKILL.md");
  });

  it("schreibt in die Repo-Datei hinter dem Verweis", async () => {
    const { service, root, repository } = await fixture();
    const path = join(root, "skills/alpha/SKILL.md");
    const before = await service.readFile({ path });
    const saved = await service.writeFile({ path, content: skillFile("alpha", "Neu beschrieben"), expectedModifiedAt: before.modifiedAt });
    expect(saved.content).toContain("Neu beschrieben");
    await expect(readFile(join(repository, "skills/alpha/SKILL.md"), "utf8")).resolves.toContain("Neu beschrieben");
  });

  it("lehnt einen Schreibvorgang auf eine fremd geänderte Datei ab", async () => {
    const { service, root } = await fixture();
    const path = join(root, "skills/alpha/SKILL.md");
    await expect(service.writeFile({ path, content: "x", expectedModifiedAt: new Date(0).toISOString() }))
      .rejects.toMatchObject({ statusCode: 409, code: "SKILLS_CONFLICT" });
  });

  it("lehnt Binärdateien und zu große Dateien ab", async () => {
    const { service, root, repository } = await fixture();
    await writeFile(join(repository, "skills/alpha/bild.bin"), Buffer.from([0xff, 0xfe, 0x00, 0x80]));
    await expect(service.readFile({ path: join(root, "skills/alpha/bild.bin") }))
      .rejects.toMatchObject({ statusCode: 415, code: "SKILLS_NOT_TEXT" });

    await writeFile(join(repository, "skills/alpha/gross.md"), "x".repeat(5_000), "utf8");
    await expect(service.readFile({ path: join(root, "skills/alpha/gross.md") }))
      .rejects.toMatchObject({ statusCode: 413, code: "SKILLS_FILE_TOO_LARGE" });
  });

  it("meldet kaputte Verweise beim Öffnen", async () => {
    const { service, root } = await fixture();
    await symlink(join(root, "fehlt.md"), join(root, "skills/alpha/tot.md"));
    await expect(service.readFile({ path: join(root, "skills/alpha/tot.md") }))
      .rejects.toMatchObject({ statusCode: 409, code: "SKILLS_SYMLINK_BROKEN" });
  });
});

describe("Containment", () => {
  it("weist Pfade außerhalb des Root-Ordners ab", async () => {
    const { service, base } = await fixture();
    for (const path of [join(base, "geheim.md"), "/etc/passwd", "../../etc/passwd"]) {
      await expect(service.readFile({ path })).rejects.toMatchObject({ code: "SKILLS_PATH_OUTSIDE_ROOT" });
    }
  });

  it("weist Verweise ab, die aus den erlaubten Bereichen führen", async () => {
    const { service, root, base } = await fixture();
    await writeFile(join(base, "aussen.md"), "geheim\n", "utf8");
    await symlink(join(base, "aussen.md"), join(root, "skills/alpha-flucht.md"));
    await expect(service.readFile({ path: join(root, "skills/alpha-flucht.md") }))
      .rejects.toMatchObject({ statusCode: 403, code: "SKILLS_PATH_OUTSIDE_ROOT" });
  });
});

describe("Skills anlegen, umbenennen und löschen", () => {
  it("legt Ordner, Scaffold, Symlinks und README-Zeile an", async () => {
    const { service, root, repository, claude, codex } = await fixture();
    const result = await service.createSkill({ name: "beta", description: "Zweiter Skill", license: "MIT" });

    expect(result.readmeUpdated).toBe(true);
    expect(result.propagated).toEqual([join(claude, "beta"), join(codex, "beta")]);
    const content = await readFile(join(repository, "skills/beta/SKILL.md"), "utf8");
    expect(content).toBe("---\nname: beta\ndescription: Zweiter Skill\nlicense: MIT\n---\n\n# beta\n");
    expect((await lstat(join(root, "skills/beta"))).isSymbolicLink()).toBe(true);
    expect((await lstat(join(claude, "beta"))).isSymbolicLink()).toBe(true);
    await expect(readFile(join(repository, "README.md"), "utf8")).resolves.toContain("| beta | Zweiter Skill |");
    await expect(service.readFile({ path: result.path })).resolves.toMatchObject({ name: "SKILL.md" });
  });

  it("legt ohne Repository direkt im Root an", async () => {
    const { service, root, claude } = await fixture({ withRepository: false });
    const result = await service.createSkill({ name: "lokal", description: "Nur lokal" });
    expect(result.readmeUpdated).toBe(false);
    expect((await lstat(join(root, "skills/lokal"))).isDirectory()).toBe(true);
    expect((await lstat(join(claude, "lokal"))).isSymbolicLink()).toBe(true);
  });

  it("lehnt belegte Namen und ungültige Namen ab", async () => {
    const { service } = await fixture();
    await expect(service.createSkill({ name: "alpha", description: "x" })).rejects.toMatchObject({ statusCode: 409, code: "SKILLS_NAME_TAKEN" });
    await expect(service.createSkill({ name: "Gross Falsch", description: "x" })).rejects.toMatchObject({ statusCode: 400, code: "SKILLS_NAME_INVALID" });
  });

  it("benennt Ordner, Verweise, Frontmatter und README um", async () => {
    const { service, root, repository, claude, codex } = await fixture();
    const result = await service.renameSkill({ name: "alpha", newName: "gamma" });

    expect(result.name).toBe("gamma");
    await expect(readdir(join(repository, "skills"))).resolves.toEqual(["gamma"]);
    await expect(readdir(join(root, "skills"))).resolves.toEqual(["gamma"]);
    await expect(readdir(claude)).resolves.toEqual(["gamma"]);
    await expect(readdir(codex)).resolves.toEqual(["gamma"]);
    await expect(readFile(join(repository, "skills/gamma/SKILL.md"), "utf8")).resolves.toContain("name: gamma");
    await expect(readFile(join(repository, "README.md"), "utf8")).resolves.toContain("| gamma | Erster Skill |");
    await expect(service.readFile({ path: join(root, "skills/gamma/SKILL.md") })).resolves.toMatchObject({ name: "SKILL.md" });
  });

  it("löscht Ordner, Verweise und README-Zeile", async () => {
    const { service, root, repository, claude, codex } = await fixture();
    await service.deleteSkill({ name: "alpha" });

    await expect(readdir(join(repository, "skills"))).resolves.toEqual([]);
    await expect(readdir(join(root, "skills"))).resolves.toEqual([]);
    await expect(readdir(claude)).resolves.toEqual([]);
    await expect(readdir(codex)).resolves.toEqual([]);
    await expect(readFile(join(repository, "README.md"), "utf8")).resolves.not.toContain("alpha");
  });

  it("löscht einen kaputten Verweis, ohne das Ziel zu berühren", async () => {
    const { service, root, base } = await fixture();
    await symlink(join(base, "weg"), join(root, "skills/tot"), "dir");
    await service.deleteSkill({ name: "tot" });
    await expect(readdir(join(root, "skills"))).resolves.toEqual(["alpha"]);
  });

  it("meldet einen unbekannten Skill", async () => {
    const { service } = await fixture();
    await expect(service.deleteSkill({ name: "gibtsnicht" })).rejects.toMatchObject({ statusCode: 404, code: "SKILLS_NOT_FOUND" });
  });
});

describe("Git", () => {
  it("meldet Branch und Anzahl der Änderungen", async () => {
    const { service, repository } = await fixture();
    await initGitRepository(repository);
    await service.createSkill({ name: "beta", description: "Zweiter Skill" });

    const status = await service.status();
    expect(status.repositoryConfigured).toBe(true);
    expect(status.repository?.branch).toBe("main");
    expect(status.repository?.dirtyCount).toBeGreaterThan(0);
  });

  it("committet mit generierter Nachricht und meldet den fehlenden Remote", async () => {
    const { service, repository } = await fixture();
    await initGitRepository(repository);
    await service.createSkill({ name: "beta", description: "Zweiter Skill" });

    const result = await service.gitCommitPush();
    expect(result.committed).toBe(true);
    expect(result.pushed).toBe(false);
    expect(result.message).toBe("feat: skill beta hinzugefuegt");
    expect(result.changedSkills).toEqual([{ name: "beta", action: "hinzugefuegt" }]);
    expect(result.errorTail).toBeTruthy();

    const log = await execa("git", ["-C", repository, "log", "-1", "--pretty=%s"]);
    expect(log.stdout).toBe("feat: skill beta hinzugefuegt");
  });

  it("meldet einen sauberen Arbeitsstand", async () => {
    const { service, repository } = await fixture();
    await initGitRepository(repository);
    await expect(service.gitCommitPush()).resolves.toMatchObject({ committed: false, notice: "Es gibt nichts zu committen." });
  });

  it("lehnt Git ohne konfiguriertes Repository ab", async () => {
    const { service } = await fixture({ withRepository: false });
    await expect(service.gitCommitPush()).rejects.toBeInstanceOf(AppError);
    await expect(service.status()).resolves.toMatchObject({ repositoryConfigured: false, repository: null });
  });
});
