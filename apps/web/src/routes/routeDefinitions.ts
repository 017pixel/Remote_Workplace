export const routeDefinitions = [
  { id: "dashboard", path: "/", requiresProject: false },
  { id: "workbench", path: "/workbench", requiresProject: false },
  { id: "tech-tldrs", path: "/tech-tldrs", requiresProject: false },
  { id: "t3-code", path: "/t3-code", requiresProject: false },
  { id: "code-editor", path: "/code-editor", requiresProject: true },
  { id: "previews", path: "/previews", requiresProject: false },
  { id: "browser", path: "/browser", requiresProject: false },
  { id: "terminal", path: "/terminal", requiresProject: false },
  { id: "codex", path: "/codex", requiresProject: false },
  { id: "opencode", path: "/opencode", requiresProject: false },
  { id: "projects", path: "/projects", requiresProject: false },
  { id: "gallery", path: "/gallery", requiresProject: false },
  { id: "usage", path: "/usage", requiresProject: false },
  { id: "settings", path: "/settings", requiresProject: false },
] as const;

export type WorkbenchRouteId = (typeof routeDefinitions)[number]["id"];
