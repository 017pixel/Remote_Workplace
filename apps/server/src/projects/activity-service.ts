import { opendir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import type { ProjectActivity } from "@workbench/contracts";
import type { ProjectActivityDatabase } from "./activity-database.js";

const IGNORED_DIRECTORIES = new Set([
  ".git", ".next", ".nuxt", ".svelte-kit", ".turbo", ".vite", "build", "coverage", "dist", "node_modules", "playwright-report", "target", "test-results",
]);

interface CachedActivity {
  expiresAt: number;
  value: Omit<ProjectActivity, "lastWorkbenchUseAt" | "effectiveAt">;
}

function newest(values: Array<string | null>): string | null {
  return values.filter((value): value is string => value !== null).sort().at(-1) ?? null;
}

export class ProjectActivityService {
  private readonly cache = new Map<string, CachedActivity>();

  constructor(private readonly options: {
    database: ProjectActivityDatabase;
    cacheMilliseconds: number;
    maximumDepth: number;
  }) {}

  touch(projectId: string) {
    return this.options.database.touch(projectId);
  }

  async get(projectId: string, path: string): Promise<ProjectActivity> {
    const lastWorkbenchUseAt = this.options.database.lastUsedAt(projectId);
    const scanned = await this.scanned(path);
    return {
      lastWorkbenchUseAt,
      ...scanned,
      effectiveAt: newest([lastWorkbenchUseAt, scanned.lastFilesystemChangeAt, scanned.lastGitCommitAt]),
    };
  }

  private async scanned(path: string) {
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const [lastFilesystemChangeAt, lastGitCommitAt] = await Promise.all([
      this.latestFilesystemChange(path),
      this.latestGitCommit(path),
    ]);
    const value = { lastFilesystemChangeAt, lastGitCommitAt };
    this.cache.set(path, { expiresAt: Date.now() + this.options.cacheMilliseconds, value });
    return value;
  }

  private async latestFilesystemChange(root: string): Promise<string | null> {
    let latest = 0;
    const visit = async (directory: string, depth: number): Promise<void> => {
      let entries;
      try { entries = await opendir(directory); } catch { return; }
      for await (const entry of entries) {
        if (entry.isSymbolicLink() || (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name))) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (depth < this.options.maximumDepth) await visit(path, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        try { latest = Math.max(latest, (await stat(path)).mtimeMs); } catch { /* File changed during the scan. */ }
      }
    };
    await visit(root, 0);
    return latest > 0 ? new Date(latest).toISOString() : null;
  }

  private async latestGitCommit(path: string): Promise<string | null> {
    try {
      const result = await execa("git", ["-C", path, "log", "-1", "--format=%cI"], { timeout: 3_000, reject: false });
      const value = result.exitCode === 0 ? result.stdout.trim() : "";
      return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
    } catch { return null; }
  }
}
