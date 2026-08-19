import {
  extensionIdSchema,
  pageContributionSchema,
  routeContributionSchema,
  type ExtensionId,
  type RouteContribution,
} from "@wrapt/extension-contracts";
import { Dashboard } from "../../views/Dashboard";
import {
  loadCliTerminal,
  loadFileManager,
  loadHermes,
  loadInbox,
  loadPreviewGroup,
  loadPreviewLive,
  loadProjectDetail,
  loadProjects,
  loadRouteWithRecovery,
  loadSettings,
  loadSkillEditor,
  loadTechTldrs,
  loadTerminal,
  loadToolRoute,
  loadUsage,
  loadWorkbench,
} from "../../lib/routeModules";
import type {
  PageModuleLoader,
  PageRouteOwnerBatch,
  PageRuntimeBinding,
  RouteRuntimeBinding,
} from "../pageRouteRegistry";

interface BuiltinPageRouteDefinition {
  readonly page: {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
  };
  readonly route: RouteContribution;
  readonly pageRuntime: PageRuntimeBinding;
  readonly routeRuntime: RouteRuntimeBinding;
}

export interface BuiltinPageRouteOwner {
  readonly extensionId: ExtensionId;
  readonly batch: PageRouteOwnerBatch;
}

export interface HostRouteDefinition {
  readonly id: "app-shell" | "not-found";
  readonly kind: "layout" | "fallback";
  readonly path: null | "*";
  readonly boundary: "app-shell" | "deferred-route";
}

const dashboardModule = Object.freeze({ Dashboard });

function eagerPageRuntime(exportName: string): PageRuntimeBinding {
  return Object.freeze({
    chunkId: "dashboard",
    exportName,
    loading: "eager",
    recovery: "none",
    load: () => Promise.resolve(dashboardModule),
    eagerModule: dashboardModule,
  });
}

function lazyPageRuntime(
  chunkId: string,
  exportName: string,
  sourceLoader: PageModuleLoader,
): PageRuntimeBinding {
  return Object.freeze({
    chunkId,
    exportName,
    loading: "lazy",
    recovery: "stale-chunk",
    load: () => loadRouteWithRecovery(sourceLoader),
  });
}

function routeRuntime(
  prefetchPathPrefix?: string,
  aliasBehavior: RouteRuntimeBinding["aliasBehavior"] = "render",
): RouteRuntimeBinding {
  return Object.freeze({
    boundary: "deferred-route",
    aliasBehavior,
    ...(prefetchPathPrefix === undefined ? {} : { prefetchPathPrefix }),
  });
}

function standardRoute(
  id: string,
  pageId: string,
  path: string,
  overrides: Partial<
    Omit<RouteContribution, "id" | "pageId" | "path" | "aliases">
  > & { readonly aliases?: readonly string[] } = {},
): RouteContribution {
  return routeContributionSchema.parse({
    id,
    pageId,
    path,
    shell: "standard",
    persistent: true,
    prefetch: "idle",
    projectContext: false,
    topbar: true,
    breadcrumbs: true,
    standaloneActions: false,
    mobileNavigation: false,
    ...overrides,
  });
}

function standaloneRoute(
  id: string,
  pageId: string,
  path: string,
): RouteContribution {
  return routeContributionSchema.parse({
    id,
    pageId,
    path,
    shell: "standalone",
    persistent: false,
    prefetch: "idle",
    projectContext: false,
    topbar: false,
    breadcrumbs: false,
    standaloneActions: false,
    mobileNavigation: false,
  });
}

function owner(
  extensionId: string,
  definitions: readonly BuiltinPageRouteDefinition[],
): BuiltinPageRouteOwner {
  return Object.freeze({
    extensionId: extensionIdSchema.parse(extensionId),
    batch: Object.freeze({
      pages: Object.freeze(
        definitions.map((definition) =>
          Object.freeze({
            contribution: pageContributionSchema.parse(definition.page),
            runtime: definition.pageRuntime,
          }),
        ),
      ),
      routes: Object.freeze(
        definitions.map((definition) =>
          Object.freeze({
            contribution: definition.route,
            runtime: definition.routeRuntime,
          }),
        ),
      ),
    }),
  });
}

export const hostRoutes: readonly HostRouteDefinition[] = Object.freeze([
  Object.freeze({
    id: "app-shell",
    kind: "layout",
    path: null,
    boundary: "app-shell",
  }),
  Object.freeze({
    id: "not-found",
    kind: "fallback",
    path: "*",
    boundary: "deferred-route",
  }),
]);

export const builtinPageRouteOwners: readonly BuiltinPageRouteOwner[] =
  Object.freeze([
    owner("wrapt.dashboard", [
      {
        page: {
          id: "wrapt.dashboard.page.main",
          title: "Dashboard",
          description: "Server, Dienste und Projekte",
        },
        route: standardRoute(
          "wrapt.dashboard.route.main",
          "wrapt.dashboard.page.main",
          "/",
          { prefetch: "none", mobileNavigation: true },
        ),
        pageRuntime: eagerPageRuntime("Dashboard"),
        routeRuntime: routeRuntime(),
      },
    ]),
    owner("wrapt.orbit", [
      {
        page: {
          id: "wrapt.orbit.page.main",
          title: "Workbench",
          description: "Werkzeuge und Previews öffnen",
        },
        route: standardRoute(
          "wrapt.orbit.route.main",
          "wrapt.orbit.page.main",
          "/workbench",
          {
            shell: "full-bleed",
            topbar: false,
            breadcrumbs: false,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "workbench",
          "Workbench",
          loadWorkbench,
        ),
        routeRuntime: routeRuntime("/workbench"),
      },
    ]),
    owner("wrapt.inbox", [
      {
        page: {
          id: "wrapt.inbox.page.main",
          title: "Inbox",
          description: "Aufgaben, Rückfragen und Fehler",
        },
        route: standardRoute(
          "wrapt.inbox.route.main",
          "wrapt.inbox.page.main",
          "/inbox",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("inbox", "Inbox", loadInbox),
        routeRuntime: routeRuntime("/inbox"),
      },
    ]),
    owner("wrapt.tech-tldrs", [
      {
        page: {
          id: "wrapt.tech-tldrs.page.main",
          title: "Tech TLDRs",
          description: "Tech-News lesen und verstehen",
        },
        route: standardRoute(
          "wrapt.tech-tldrs.route.main",
          "wrapt.tech-tldrs.page.main",
          "/tech-tldrs",
          {
            shell: "full-bleed",
            topbar: false,
            breadcrumbs: false,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "tech-tldrs",
          "TechTldrs",
          loadTechTldrs,
        ),
        routeRuntime: routeRuntime("/tech-tldrs"),
      },
    ]),
    owner("wrapt.projects", [
      {
        page: {
          id: "wrapt.projects.page.list",
          title: "Projekte",
          description: "Konfigurierte Arbeitsbereiche",
        },
        route: standardRoute(
          "wrapt.projects.route.list",
          "wrapt.projects.page.list",
          "/projects",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("projects", "Projects", loadProjects),
        routeRuntime: routeRuntime("/projects"),
      },
      {
        page: {
          id: "wrapt.projects.page.detail",
          title: "Projektdetail",
        },
        route: standardRoute(
          "wrapt.projects.route.detail",
          "wrapt.projects.page.detail",
          "/projects/:projectId",
        ),
        pageRuntime: lazyPageRuntime(
          "project-detail",
          "ProjectDetail",
          loadProjectDetail,
        ),
        routeRuntime: routeRuntime("/projects/"),
      },
    ]),
    owner("wrapt.files", [
      {
        page: {
          id: "wrapt.files.page.main",
          title: "Dateien",
          description: "Server-Dateien verwalten und durchsuchen",
        },
        route: standardRoute(
          "wrapt.files.route.main",
          "wrapt.files.page.main",
          "/files",
          {
            aliases: ["/gallery"],
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "file-manager",
          "FileManagerView",
          loadFileManager,
        ),
        routeRuntime: routeRuntime("/files", "redirect-to-canonical"),
      },
    ]),
    owner("wrapt.skills", [
      {
        page: {
          id: "wrapt.skills.page.main",
          title: "KI-Skills",
          description: "Globale Skills und Agenten-Regeln bearbeiten",
        },
        route: standardRoute(
          "wrapt.skills.route.main",
          "wrapt.skills.page.main",
          "/ki-skills",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime(
          "skill-editor",
          "SkillEditor",
          loadSkillEditor,
        ),
        routeRuntime: routeRuntime("/ki-skills"),
      },
    ]),
    owner("wrapt.settings", [
      {
        page: {
          id: "wrapt.settings.page.main",
          title: "Einstellungen",
          description: "Lokaler Workspace und Sicherheit",
        },
        route: standardRoute(
          "wrapt.settings.route.main",
          "wrapt.settings.page.main",
          "/settings",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("settings", "Settings", loadSettings),
        routeRuntime: routeRuntime("/settings"),
      },
    ]),
    owner("wrapt.usage", [
      {
        page: {
          id: "wrapt.usage.page.main",
          title: "Nutzung",
          description: "Codex und OpenCode Go",
        },
        route: standardRoute(
          "wrapt.usage.route.main",
          "wrapt.usage.page.main",
          "/usage",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("usage", "Usage", loadUsage),
        routeRuntime: routeRuntime("/usage"),
      },
    ]),
    owner("wrapt.t3-code", [
      {
        page: {
          id: "wrapt.t3-code.page.main",
          title: "T3 Code",
          description: "Codex-Arbeitsumgebung",
        },
        route: standardRoute(
          "wrapt.t3-code.route.main",
          "wrapt.t3-code.page.main",
          "/t3-code",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("tool-route", "T3Code", loadToolRoute),
        routeRuntime: routeRuntime("/t3-code"),
      },
    ]),
    owner("wrapt.hermes", [
      {
        page: {
          id: "wrapt.hermes.page.main",
          title: "Hermes Agent",
          description:
            "Offizielle Hermes-SPA für Chat, Automatisierungen und Verwaltung",
        },
        route: standardRoute(
          "wrapt.hermes.route.main",
          "wrapt.hermes.page.main",
          "/hermes-agent",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("hermes", "HermesRoute", loadHermes),
        routeRuntime: routeRuntime("/hermes-agent"),
      },
    ]),
    owner("wrapt.code-server", [
      {
        page: {
          id: "wrapt.code-server.page.main",
          title: "Code-Server",
          description: "VS Code im Browser",
        },
        route: standardRoute(
          "wrapt.code-server.route.main",
          "wrapt.code-server.page.main",
          "/code-editor",
          { projectContext: true, mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime(
          "tool-route",
          "CodeEditor",
          loadToolRoute,
        ),
        routeRuntime: routeRuntime("/code-editor"),
      },
    ]),
    owner("wrapt.previews", [
      {
        page: {
          id: "wrapt.previews.page.main",
          title: "Previews",
          description: "Lokale Apps und laufende Ports",
        },
        route: standardRoute(
          "wrapt.previews.route.main",
          "wrapt.previews.page.main",
          "/previews",
          { projectContext: true, mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("tool-route", "Previews", loadToolRoute),
        routeRuntime: routeRuntime("/previews"),
      },
      {
        page: {
          id: "wrapt.previews.page.group",
          title: "Preview-Gruppe",
        },
        route: standardRoute(
          "wrapt.previews.route.group",
          "wrapt.previews.page.group",
          "/previews/gruppe/:groupId",
        ),
        pageRuntime: lazyPageRuntime(
          "preview-group",
          "PreviewGroupRoute",
          loadPreviewGroup,
        ),
        routeRuntime: routeRuntime("/previews/gruppe/"),
      },
      {
        page: {
          id: "wrapt.previews.page.window",
          title: "Preview-Fenster",
        },
        route: standaloneRoute(
          "wrapt.previews.route.window",
          "wrapt.previews.page.window",
          "/previews/fenster/:groupId",
        ),
        pageRuntime: lazyPageRuntime(
          "preview-group",
          "PreviewGroupWindowRoute",
          loadPreviewGroup,
        ),
        routeRuntime: routeRuntime("/previews/fenster/"),
      },
      {
        page: {
          id: "wrapt.previews.page.live",
          title: "Live-Preview",
        },
        route: standaloneRoute(
          "wrapt.previews.route.live",
          "wrapt.previews.page.live",
          "/previews/live",
        ),
        pageRuntime: lazyPageRuntime(
          "preview-live",
          "PreviewLiveWindowRoute",
          loadPreviewLive,
        ),
        routeRuntime: routeRuntime("/previews/live"),
      },
    ]),
    owner("wrapt.browser", [
      {
        page: {
          id: "wrapt.browser.page.main",
          title: "Browser",
          description: "Chromium für Recherche und lokale Apps",
        },
        route: standardRoute(
          "wrapt.browser.route.main",
          "wrapt.browser.page.main",
          "/browser",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("tool-route", "Browser", loadToolRoute),
        routeRuntime: routeRuntime("/browser"),
      },
    ]),
    owner("wrapt.terminal", [
      {
        page: {
          id: "wrapt.terminal.page.main",
          title: "Terminal",
          description: "Interaktive Server-Shell",
        },
        route: standardRoute(
          "wrapt.terminal.route.main",
          "wrapt.terminal.page.main",
          "/terminal",
          {
            projectContext: true,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "terminal",
          "TerminalView",
          loadTerminal,
        ),
        routeRuntime: routeRuntime("/terminal"),
      },
      {
        page: {
          id: "wrapt.terminal.page.window",
          title: "Terminalfenster",
        },
        route: standaloneRoute(
          "wrapt.terminal.route.window",
          "wrapt.terminal.page.window",
          "/terminal/fenster/:runtimeId",
        ),
        pageRuntime: lazyPageRuntime(
          "terminal",
          "TerminalWindowRoute",
          loadTerminal,
        ),
        routeRuntime: routeRuntime("/terminal"),
      },
    ]),
    owner("wrapt.codex", [
      {
        page: {
          id: "wrapt.codex.page.main",
          title: "Codex",
          description: "Codex CLI im Browser",
        },
        route: standardRoute(
          "wrapt.codex.route.main",
          "wrapt.codex.page.main",
          "/codex",
          {
            projectContext: true,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "cli-terminal",
          "CodexTerminal",
          loadCliTerminal,
        ),
        routeRuntime: routeRuntime("/codex"),
      },
    ]),
    owner("wrapt.opencode", [
      {
        page: {
          id: "wrapt.opencode.page.main",
          title: "OpenCode",
          description: "OpenCode Web",
        },
        route: standardRoute(
          "wrapt.opencode.route.main",
          "wrapt.opencode.page.main",
          "/opencode",
          {
            projectContext: false,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "tool-route",
          "OpenCodeWeb",
          loadToolRoute,
        ),
        routeRuntime: routeRuntime("/opencode"),
      },
    ]),
    owner("wrapt.claude", [
      {
        page: {
          id: "wrapt.claude.page.main",
          title: "Claude Code",
          description: "Claude Code CLI im Browser",
        },
        route: standardRoute(
          "wrapt.claude.route.main",
          "wrapt.claude.page.main",
          "/claude",
          {
            projectContext: true,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "cli-terminal",
          "ClaudeCodeTerminal",
          loadCliTerminal,
        ),
        routeRuntime: routeRuntime("/claude"),
      },
    ]),
  ]);

/**
 * Persistierte v2 Preference Keys bleiben absichtlich stabil. Sie sind Daten,
 * keine Runtime Ownership und werden auf die aktuellen Extension Pages abgebildet.
 */
export const pagePreferenceAliases = Object.freeze({
  dashboard: "wrapt.dashboard.page.main",
  inbox: "wrapt.inbox.page.main",
  workbench: "wrapt.orbit.page.main",
  "tech-tldrs": "wrapt.tech-tldrs.page.main",
  projects: "wrapt.projects.page.list",
  "t3-code": "wrapt.t3-code.page.main",
  "hermes-agent": "wrapt.hermes.page.main",
  codex: "wrapt.codex.page.main",
  opencode: "wrapt.opencode.page.main",
  claude: "wrapt.claude.page.main",
  "code-editor": "wrapt.code-server.page.main",
  previews: "wrapt.previews.page.main",
  browser: "wrapt.browser.page.main",
  terminal: "wrapt.terminal.page.main",
  files: "wrapt.files.page.main",
  "ki-skills": "wrapt.skills.page.main",
  usage: "wrapt.usage.page.main",
  settings: "wrapt.settings.page.main",
});
