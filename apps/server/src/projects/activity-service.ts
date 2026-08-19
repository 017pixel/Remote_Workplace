import { opendir, stat } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import type { ProjectActivity } from "@wrapt/contracts";
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
  private readonly inFlight = new Map<string, Promise<Omit<ProjectActivity, "lastWorkbenchUseAt" | "effectiveAt">>>();

  constructor(private readonly options: {
    database: ProjectActivityDatabase;
    cacheMilliseconds: number;
    maximumDepth: number;
    maximumFiles: number;
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
    const existing = this.inFlight.get(path);
    if (existing) return existing;
    const pending = Promise.all([
      this.latestFilesystemChange(path),
      this.latestGitCommit(path),
    ]).then(([lastFilesystemChangeAt, lastGitCommitAt]) => {
      const value = { lastFilesystemChangeAt, lastGitCommitAt };
      this.cache.set(path, { expiresAt: Date.now() + this.options.cacheMilliseconds, value });
      return value;
    }).finally(() => this.inFlight.delete(path));
    this.inFlight.set(path, pending);
    return pending;
  }

  private async latestFilesystemChange(root: string): Promise<string | null> {
    let latest = 0;
    let inspectedFiles = 0;
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (inspectedFiles >= this.options.maximumFiles) return;
      let entries;
      try { entries = await opendir(directory); } catch { return; }
      for await (const entry of entries) {
        if (inspectedFiles >= this.options.maximumFiles) break;
        if (entry.isSymbolicLink() || (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name))) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (depth < this.options.maximumDepth) await visit(path, depth + 1);
          continue;
        }
        if (!entry.isFile()) continue;
        inspectedFiles += 1;
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
