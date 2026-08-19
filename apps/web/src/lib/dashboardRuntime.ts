import type { LocalPort, Project, TerminalSession } from "@wrapt/contracts";

export interface DashboardRuntimeGroup {
  key: string;
  projectId: string | null;
  projectName: string;
  ports: LocalPort[];
  sessions: TerminalSession[];
}

const UNASSIGNED_KEY = "__unassigned__";

export function groupDashboardRuntime(
  ports: readonly LocalPort[],
  sessions: readonly TerminalSession[],
  projects: readonly Project[],
): DashboardRuntimeGroup[] {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const groups = new Map<string, DashboardRuntimeGroup>();

  const ensure = (projectId: string | null, fallbackName?: string | null): DashboardRuntimeGroup => {
    const key = projectId ?? UNASSIGNED_KEY;
    const existing = groups.get(key);
    if (existing) return existing;
    const projectName = projectId
      ? projectNames.get(projectId) ?? fallbackName ?? "Unbekanntes Projekt"
      : "Ohne Projekt";
    const created: DashboardRuntimeGroup = { key, projectId, projectName, ports: [], sessions: [] };
    groups.set(key, created);
    return created;
  };

  for (const port of ports) ensure(port.projectId, port.projectName).ports.push(port);
  for (const session of sessions) ensure(session.projectId).sessions.push(session);

  const statusOrder: Record<TerminalSession["status"], number> = {
    running: 0,
    starting: 1,
    interrupted: 2,
    exited: 3,
    closed: 4,
  };

  return [...groups.values()]
    .map((group) => ({
      ...group,
      ports: [...group.ports].sort((left, right) => left.port - right.port),
      sessions: [...group.sessions].sort((left, right) => {
        const statusDifference = statusOrder[left.status] - statusOrder[right.status];
        return statusDifference || right.updatedAt.localeCompare(left.updatedAt);
      }),
    }))
    .sort((left, right) => {
      if (left.key === UNASSIGNED_KEY) return 1;
      if (right.key === UNASSIGNED_KEY) return -1;
      return left.projectName.localeCompare(right.projectName, "de");
    });
}

