import type { Project } from "@workbench/contracts";
import { useWorkspaceStore } from "../stores/workspace";

const ORBIT_INTENTS_KEY = "workbench-orbit-open-intents";

export interface OrbitOpenIntent {
  type: "project" | "tool";
  title: string;
  projectId: string;
  toolType?: "t3-code" | "code-server" | "preview";
  previewId?: string;
}

function queueOrbitIntents(intents: OrbitOpenIntent[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ORBIT_INTENTS_KEY, JSON.stringify(intents));
}

export function consumeOrbitIntents(): OrbitOpenIntent[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(ORBIT_INTENTS_KEY);
  window.sessionStorage.removeItem(ORBIT_INTENTS_KEY);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((item): item is OrbitOpenIntent =>
      typeof item === "object" && item !== null &&
      ((item as OrbitOpenIntent).type === "project" || (item as OrbitOpenIntent).type === "tool") &&
      typeof (item as OrbitOpenIntent).title === "string" &&
      typeof (item as OrbitOpenIntent).projectId === "string",
    ) : [];
  } catch {
    return [];
  }
}

export function openProjectDefault(project: Project): void {
  const store = useWorkspaceStore.getState();
  store.selectProject(project.id);
  const intents: OrbitOpenIntent[] = [{ type: "project", title: project.name, projectId: project.id }];
  if (project.links.t3Code !== null) {
    intents.push({ type: "tool", title: "T3 Code", projectId: project.id, toolType: "t3-code" });
  } else if (project.previews.length > 0) {
    intents.push({ type: "tool", title: project.previews[0]!.name, projectId: project.id, toolType: "preview", previewId: project.previews[0]!.id });
  } else if (project.links.codeServer !== null) {
    intents.push({ type: "tool", title: "Code-Server", projectId: project.id, toolType: "code-server" });
  }
  queueOrbitIntents(intents);
}

export function openToolForProject(
  project: Project,
  type: "t3-code" | "code-server",
): void {
  void type;
  useWorkspaceStore.getState().selectProject(project.id);
}

export function openPreviewForProject(project: Project, previewId: string): void {
  void previewId;
  useWorkspaceStore.getState().selectProject(project.id);
}
