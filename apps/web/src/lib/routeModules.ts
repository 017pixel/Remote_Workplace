type RouteLoader<T> = () => Promise<T>;

const STALE_CHUNK_RETRY_PARAM = "__workbench_chunk_retry";
const DYNAMIC_IMPORT_ERROR_PATTERN = /(?:dynamically imported module|module script failed|failed to fetch dynamically imported module)/i;

function clearStaleChunkRetryMarker() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(STALE_CHUNK_RETRY_PARAM)) return;
  url.searchParams.delete(STALE_CHUNK_RETRY_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function requestFreshAppLoad(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  // Ein zweiter Fehlschlag nach dem Reload darf keine Endlosschleife auslösen.
  if (url.searchParams.has(STALE_CHUNK_RETRY_PARAM)) return false;
  url.searchParams.set(STALE_CHUNK_RETRY_PARAM, "1");
  window.location.replace(url.toString());
  return true;
}

export function isDynamicImportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return DYNAMIC_IMPORT_ERROR_PATTERN.test(message);
}

/**
 * Lädt einen Route-Chunk und stellt bei einem veralteten laufenden App-Build
 * einmalig die aktuelle HTML/Asset-Kombination wieder her.
 */
export function loadRouteWithRecovery<T>(load: RouteLoader<T>): Promise<T> {
  return load().then((module) => {
    clearStaleChunkRetryMarker();
    return module;
  }).catch((error: unknown) => {
    if (isDynamicImportFailure(error) && requestFreshAppLoad()) {
      return new Promise<T>(() => {
        // Der Browser lädt die App über location.replace neu.
      });
    }
    throw error;
  });
}

const routeLoaders = {
  workbench: () => import("../views/OrbitWorkbench"),
  inbox: () => import("../views/Inbox"),
  projects: () => import("../views/Projects"),
  projectDetail: () => import("../views/ProjectDetail"),
  settings: () => import("../views/Settings"),
  usage: () => import("../views/Usage"),
  toolRoute: () => import("../views/ToolRoute"),
  hermes: () => import("../views/HermesRoute"),
  terminal: () => import("../views/Terminal"),
  cliTerminal: () => import("../views/CliTerminal"),
  techTldrs: () => import("../views/TechTldrs"),
  fileManager: () => import("../views/FileManagerView"),
  previewGroup: () => import("../views/PreviewGroupRoute"),
  previewLive: () => import("../views/PreviewLiveWindow"),
  skillEditor: () => import("../views/SkillEditor"),
} as const;

export const loadWorkbench = routeLoaders.workbench;
export const loadInbox = routeLoaders.inbox;
export const loadProjects = routeLoaders.projects;
export const loadProjectDetail = routeLoaders.projectDetail;
export const loadSettings = routeLoaders.settings;
export const loadUsage = routeLoaders.usage;
export const loadToolRoute = routeLoaders.toolRoute;
export const loadHermes = routeLoaders.hermes;
export const loadTerminal = routeLoaders.terminal;
export const loadCliTerminal = routeLoaders.cliTerminal;
export const loadTechTldrs = routeLoaders.techTldrs;
export const loadFileManager = routeLoaders.fileManager;
export const loadPreviewGroup = routeLoaders.previewGroup;
export const loadPreviewLive = routeLoaders.previewLive;
export const loadSkillEditor = routeLoaders.skillEditor;

const pathLoaders: Array<[prefix: string, load: () => Promise<unknown>]> = [
  ["/workbench", loadWorkbench],
  ["/inbox", loadInbox],
  ["/tech-tldrs", loadTechTldrs],
  ["/projects/", loadProjectDetail],
  ["/projects", loadProjects],
  ["/files", loadFileManager],
  ["/ki-skills", loadSkillEditor],
  ["/settings", loadSettings],
  ["/usage", loadUsage],
  ["/terminal", loadTerminal],
  ["/codex", loadCliTerminal],
  ["/opencode", loadCliTerminal],
  ["/claude", loadCliTerminal],
  ["/t3-code", loadToolRoute],
  ["/hermes-agent", loadHermes],
  ["/code-editor", loadToolRoute],
  ["/previews/gruppe/", loadPreviewGroup],
  ["/previews/fenster/", loadPreviewGroup],
  ["/previews/live", loadPreviewLive],
  ["/previews", loadToolRoute],
  ["/browser", loadToolRoute],
];

export function prefetchRoute(path: string): void {
  const match = pathLoaders.find(([prefix]) => path === prefix || path.startsWith(prefix));
  if (match) void match[1]().catch(() => undefined);
}
