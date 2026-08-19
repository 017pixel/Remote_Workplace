import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Im CI gibt es keine wrapt.local.json; der Server lädt dann die
// Beispiel-Config mit dem Platzhalterpfad /home/your-user, der dort nicht
// existiert. Alle Datenpfade werden für die Unit-Tests deshalb auf ein
// frisches Temp-Verzeichnis gelegt, bevor die Settings geladen werden.
const base = mkdtempSync(join(tmpdir(), "wrapt-unit-"));
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const testConfigDirectory = join(base, "config");
mkdirSync(testConfigDirectory, { recursive: true });
for (const name of ["wrapt.example.json", "projects.example.json", "services.example.json", "commands.example.json"]) {
  copyFileSync(join(repositoryRoot, `config/${name}`), join(testConfigDirectory, name));
}
process.env.CONFIG_DIR = testConfigDirectory;
process.env.DATA_DIR = join(base, "data");
process.env.DATABASE_PATH = join(base, "wrapt.sqlite");
process.env.ORBIT_BACKUP_DIR = join(base, "orbit-backups");
process.env.ORBIT_ASSET_DIR = join(base, "orbit-assets");
process.env.FILE_GALLERY_DIR = join(base, "file-gallery");
process.env.BROWSER_PROFILES_ROOT = join(base, "browser-profiles");
process.env.WRAPT_PROFILES_ROOT = join(base, "profiles");
process.env.CODEXBAR_CONFIG_PATH = join(base, "codexbar.json");
process.env.CODEX_SHARED_HOME = join(base, "shared-codex");
process.env.CLAUDE_SHARED_HOME = join(base, "shared-claude");
process.env.OPENCODE_SHARED_HOME = join(base, "shared-opencode");
process.env.ORBIT_PROJECT_BROWSER_ROOT = base;
// Projekt-Root mit zwei erkennbaren Projekten, die app.test.ts erwartet.
const projectsRoot = join(base, "projects");
mkdirSync(projectsRoot, { recursive: true });
mkdirSync(join(projectsRoot, "chappie"), { recursive: true });
mkdirSync(join(projectsRoot, "wrapt"), { recursive: true });
process.env.PROJECTS_ROOT = projectsRoot;
