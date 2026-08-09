import type { Project } from "@workbench/contracts";
import { useWorkspaceStore } from "../stores/workspace";
import { useTerminalStore } from "../stores/terminals";
import type { ProjectToolOption } from "./projectTools";

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

/**
 * Öffnet ein Projekt in einem Werkzeug der passenden Standalone-Seite: Das
 * Projekt wird als aktives Projekt gesetzt, bei Terminal-Werkzeugen zusätzlich
 * ein Tab mit diesem Projekt angelegt, und der Zielpfad zurückgegeben.
 */
export function openProjectToolStandalone(project: Project, tool: ProjectToolOption): string {
  const workspace = useWorkspaceStore.getState();
  workspace.selectProject(project.id);
  switch (tool.type) {
    case "terminal":
      useTerminalStore.getState().addTab("standalone", project.id, "shell");
      return "/terminal";
    case "codex":
      useTerminalStore.getState().addTab("codex-standalone", project.id, "codex");
      return "/codex";
    case "opencode":
      useTerminalStore.getState().addTab("opencode-standalone", project.id, "opencode");
      return "/opencode";
    case "t3-code":
      return "/t3-code";
    case "code-server":
      return "/code-editor";
    case "browser":
      return "/browser";
    case "files":
      return "/files";
    case "preview":
      return `/previews?preview=${encodeURIComponent(tool.previewId ?? "")}`;
    default:
      return "/workbench";
  }
}
