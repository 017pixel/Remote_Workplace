import { DatabaseSync } from "node:sqlite";
import type { CodexbarCostPayload } from "../codexbar/codexbar-schemas.js";

/**
 * Liest die lokale OpenCode-SQLite-Datenbank (komplette Session-Historie) und
 * überführt Modell- und Projektnutzung in das gemeinsame Kostenformat. Die
 * Datenbank gehört dem laufenden OpenCode-Prozess und wird deshalb read-only
 * geöffnet. Fehlt die Datenbank oder ist sie gesperrt, liefert der Aufruf null,
 * damit der Sync nicht bricht.
 */
export function readOpenCodeUsage(databasePath: string): CodexbarCostPayload | null {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(databasePath, { readOnly: true, timeout: 3_000 });
  } catch {
    return null;
  }
  try {
    const breakdowns = db.prepare(`
      SELECT date(time_created / 1000, 'unixepoch') AS date,
             json_extract(model, '$.id') AS model,
             SUM(tokens_input) AS inputTokens,
             SUM(tokens_output) AS outputTokens,
             SUM(tokens_cache_read) AS cacheReadTokens,
             SUM(tokens_cache_write) AS cacheCreationTokens,
             SUM(tokens_input + tokens_output + tokens_reasoning + tokens_cache_read + tokens_cache_write) AS totalTokens,
             SUM(cost) AS totalCost
      FROM session
      WHERE model IS NOT NULL AND model != ''
      GROUP BY date, model
      ORDER BY date
    `).all() as Array<{
      date: string; model: string; inputTokens: number; outputTokens: number;
      cacheReadTokens: number; cacheCreationTokens: number; totalTokens: number; totalCost: number;
    }>;
    const projectRows = db.prepare(`
      SELECT directory AS projectPath,
             SUM(tokens_input + tokens_output + tokens_reasoning + tokens_cache_read + tokens_cache_write) AS totalTokens,
             SUM(cost) AS totalCost
      FROM session
      WHERE directory IS NOT NULL AND directory != ''
      GROUP BY directory
      HAVING totalTokens > 0 OR totalCost > 0
      ORDER BY totalTokens DESC
    `).all() as Array<{ projectPath: string; totalTokens: number; totalCost: number }>;

    const dailyByDate = new Map<string, { date: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; totalTokens: number; totalCost: number; modelBreakdowns: Array<{ modelName: string; totalTokens: number; cost: number }> }>();
    for (const row of breakdowns) {
      const day = dailyByDate.get(row.date) ?? { date: row.date, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0, totalCost: 0, modelBreakdowns: [] };
      day.inputTokens += row.inputTokens;
      day.outputTokens += row.outputTokens;
      day.cacheReadTokens += row.cacheReadTokens;
      day.cacheCreationTokens += row.cacheCreationTokens;
      day.totalTokens += row.totalTokens;
      day.totalCost += row.totalCost;
      day.modelBreakdowns.push({ modelName: row.model, totalTokens: row.totalTokens, cost: row.totalCost });
      dailyByDate.set(row.date, day);
    }

    return {
      provider: "opencode",
      source: "local",
      updatedAt: new Date().toISOString(),
      daily: [...dailyByDate.values()],
      projects: projectRows.map((row) => ({
        project: row.projectPath,
        projectPath: row.projectPath,
        name: row.projectPath.split("/").filter(Boolean).at(-1) ?? row.projectPath,
        totalTokens: row.totalTokens,
        totalCost: row.totalCost,
      })),
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}
