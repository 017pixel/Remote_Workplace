const routeLoaders = {
  workbench: () => import("../views/OrbitWorkbench"),
  projects: () => import("../views/Projects"),
  projectDetail: () => import("../views/ProjectDetail"),
  settings: () => import("../views/Settings"),
  usage: () => import("../views/Usage"),
  toolRoute: () => import("../views/ToolRoute"),
  terminal: () => import("../views/Terminal"),
  cliTerminal: () => import("../views/CliTerminal"),
  techTldrs: () => import("../views/TechTldrs"),
  gallery: () => import("../views/GalleryView"),
  previewGroup: () => import("../views/PreviewGroupRoute"),
} as const;

export const loadWorkbench = routeLoaders.workbench;
export const loadProjects = routeLoaders.projects;
export const loadProjectDetail = routeLoaders.projectDetail;
export const loadSettings = routeLoaders.settings;
export const loadUsage = routeLoaders.usage;
export const loadToolRoute = routeLoaders.toolRoute;
export const loadTerminal = routeLoaders.terminal;
export const loadCliTerminal = routeLoaders.cliTerminal;
export const loadTechTldrs = routeLoaders.techTldrs;
export const loadGallery = routeLoaders.gallery;
export const loadPreviewGroup = routeLoaders.previewGroup;

const pathLoaders: Array<[prefix: string, load: () => Promise<unknown>]> = [
  ["/workbench", loadWorkbench],
  ["/tech-tldrs", loadTechTldrs],
  ["/projects/", loadProjectDetail],
  ["/projects", loadProjects],
  ["/gallery", loadGallery],
  ["/settings", loadSettings],
  ["/usage", loadUsage],
  ["/terminal", loadTerminal],
  ["/codex", loadCliTerminal],
  ["/opencode", loadCliTerminal],
  ["/t3-code", loadToolRoute],
  ["/code-editor", loadToolRoute],
  ["/previews/gruppe/", loadPreviewGroup],
  ["/previews/fenster/", loadPreviewGroup],
  ["/previews", loadToolRoute],
  ["/browser", loadToolRoute],
];

export function prefetchRoute(path: string): void {
  const match = pathLoaders.find(([prefix]) => path === prefix || path.startsWith(prefix));
  if (match) void match[1]();
}

export function prefetchAllRoutes(): void {
  for (const load of Object.values(routeLoaders)) void load();
}
