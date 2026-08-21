import type { TerminalEntry, TerminalSession, TerminalWorkspaceOperation } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";

export function isNormalTerminalEntry(entry: TerminalEntry): boolean {
  return !entry.pinned && !entry.persistent;
}

export function normalTerminalEntries(entries: readonly TerminalEntry[]): TerminalEntry[] {
  return entries.filter(isNormalTerminalEntry);
}

export async function closeNormalTerminalEntries(
  entries: readonly TerminalEntry[],
  sessions: readonly TerminalSession[],
  queueOps: (operations: TerminalWorkspaceOperation[]) => void,
): Promise<{ closedNames: string[]; failedNames: string[] }> {
  const candidates = normalTerminalEntries(entries);
  const sessionsByRuntime = new Map(sessions.map((session) => [session.runtimeId, session]));
  const results = await Promise.all(candidates.map(async (entry) => {
    const session = entry.runtimeId ? sessionsByRuntime.get(entry.runtimeId) : undefined;
    if (!session) return { entry, closed: true };
    try {
      await apiClient.closeTerminalSession(session.id);
      return { entry, closed: true };
    } catch {
      return { entry, closed: false };
    }
  }));
  const closed = results.filter((result) => result.closed).map((result) => result.entry);
  if (closed.length > 0) queueOps(closed.map((entry) => ({ type: "deleteEntry", id: entry.id })));
  return {
    closedNames: closed.map((entry) => entry.name),
    failedNames: results.filter((result) => !result.closed).map((result) => result.entry.name),
  };
}
