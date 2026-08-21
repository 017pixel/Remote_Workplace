import { describe, expect, it, vi } from "vitest";
import type { TerminalEntry, TerminalSession, TerminalWorkspaceOperation } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";
import { closeNormalTerminalEntries, normalTerminalEntries } from "./terminalBulkClose";

function entry(id: string, flags: Partial<Pick<TerminalEntry, "pinned" | "persistent">> = {}): TerminalEntry {
  return { id, runtimeId: `${id}-runtime`, name: id, parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null, ...flags };
}

function session(runtimeId: string): TerminalSession {
  return { id: `${runtimeId}-session`, runtimeId, kind: "shell", mode: "agent", projectId: null, cwd: "/tmp", pid: 1, cols: 80, rows: 24, status: "running", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", exitCode: null, exitSignal: null, supervisor: "direct", managed: false, connectedClients: 0 };
}

describe("terminalBulkClose", () => {
  it("filtert angepinnte und persistente Einträge aus", () => {
    expect(normalTerminalEntries([entry("normal"), entry("pin", { pinned: true }), entry("persistent", { persistent: true })]).map((candidate) => candidate.id)).toEqual(["normal"]);
  });

  it("entfernt erfolgreiche Sessions und lässt fehlgeschlagene Einträge stehen", async () => {
    const close = vi.spyOn(apiClient, "closeTerminalSession").mockImplementation(async (id) => {
      if (id.startsWith("failed")) throw new Error("offline");
      return null;
    });
    const operations: TerminalWorkspaceOperation[] = [];
    const result = await closeNormalTerminalEntries([entry("ok"), entry("failed")], [session("ok-runtime"), { ...session("failed-runtime"), id: "failed-session" }], (next) => operations.push(...next));
    expect(result.closedNames).toEqual(["ok"]);
    expect(result.failedNames).toEqual(["failed"]);
    expect(operations).toEqual([{ type: "deleteEntry", id: "ok" }]);
    close.mockRestore();
  });
});
