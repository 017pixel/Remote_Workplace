import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Im CI gibt es keine workbench.local.json; der Server lädt dann die
// Beispiel-Config mit dem Platzhalterpfad /home/your-user, der dort nicht
// existiert. Alle Datenpfade werden für die Unit-Tests deshalb auf ein
// frisches Temp-Verzeichnis gelegt, bevor die Settings geladen werden.
const base = mkdtempSync(join(tmpdir(), "remote-workplace-unit-"));
process.env.DATA_DIR = join(base, "data");
process.env.DATABASE_PATH = join(base, "workbench.sqlite");
process.env.ORBIT_BACKUP_DIR = join(base, "orbit-backups");
process.env.ORBIT_ASSET_DIR = join(base, "orbit-assets");
process.env.FILE_GALLERY_DIR = join(base, "file-gallery");
process.env.BROWSER_PROFILES_ROOT = join(base, "browser-profiles");
process.env.WORKBENCH_PROFILES_ROOT = join(base, "profiles");
process.env.CODEXBAR_CONFIG_PATH = join(base, "codexbar.json");
process.env.CODEX_SHARED_HOME = join(base, "shared-codex");
process.env.CLAUDE_SHARED_HOME = join(base, "shared-claude");
process.env.OPENCODE_SHARED_HOME = join(base, "shared-opencode");
process.env.ORBIT_PROJECT_BROWSER_ROOT = base;
// Projekt-Root mit zwei erkennbaren Projekten, die app.test.ts erwartet.
const projectsRoot = join(base, "projects");
mkdirSync(projectsRoot, { recursive: true });
mkdirSync(join(projectsRoot, "chappie"), { recursive: true });
mkdirSync(join(projectsRoot, "remote-workplace"), { recursive: true });
process.env.PROJECTS_ROOT = projectsRoot;
