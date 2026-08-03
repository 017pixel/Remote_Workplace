import { describe, expect, it } from "vitest";
import type { LocalPort, Project, TerminalSession } from "@workbench/contracts";
import { groupDashboardRuntime } from "./dashboardRuntime";

const port = (value: Partial<LocalPort> = {}): LocalPort => ({
  port: 3000,
  address: "127.0.0.1",
  process: "vite",
  pid: 123,
  projectId: "alpha",
  projectName: "Alpha",
  protocol: "http",
  localUrl: "http://127.0.0.1:3000/",
  proxyUrl: null,
  ...value,
});

const session = (value: Partial<TerminalSession> = {}): TerminalSession => ({
  id: "00000000-0000-4000-8000-000000000001",
  runtimeId: "00000000-0000-4000-8000-000000000002",
  kind: "shell",
  mode: "agent",
  projectId: "alpha",
  cwd: "/home/tester/projects/alpha",
  pid: 456,
  cols: 120,
  rows: 32,
  status: "running",
  createdAt: "2026-07-31T10:00:00.000Z",
  updatedAt: "2026-07-31T10:01:00.000Z",
  exitCode: null,
  exitSignal: null,
  supervisor: "tmux",
  managed: true,
  connectedClients: 1,
  ...value,
});

describe("groupDashboardRuntime", () => {
  it("groups ports and sessions by project and keeps unassigned work visible", () => {
    const groups = groupDashboardRuntime(
      [port(), port({ port: 4000, projectId: null, projectName: null })],
      [session(), session({ id: "00000000-0000-4000-8000-000000000003", projectId: null, status: "starting" })],
      [{ id: "alpha", name: "Alpha" } as Project],
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: "alpha", projectName: "Alpha", ports: [{ port: 3000 }], sessions: [{ status: "running" }] });
    expect(groups[1]).toMatchObject({ key: "__unassigned__", projectName: "Ohne Projekt", ports: [{ port: 4000 }], sessions: [{ status: "starting" }] });
  });

  it("sorts terminal sessions by active status and then by update time", () => {
    const groups = groupDashboardRuntime([], [
      session({ id: "00000000-0000-4000-8000-000000000003", status: "exited", updatedAt: "2026-07-31T10:03:00.000Z" }),
      session({ id: "00000000-0000-4000-8000-000000000004", status: "running", updatedAt: "2026-07-31T10:00:00.000Z" }),
    ], []);

    expect(groups[0]?.sessions.map((item) => item.status)).toEqual(["running", "exited"]);
  });
});
