import {
  extensionIdSchema,
  pageContributionSchema,
  routeContributionSchema,
  type ExtensionId,
  type RouteContribution,
} from "@workbench/extension-contracts";
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
    owner("workbench.dashboard", [
      {
        page: {
          id: "workbench.dashboard.page.main",
          title: "Dashboard",
          description: "Server, Dienste und Projekte",
        },
        route: standardRoute(
          "workbench.dashboard.route.main",
          "workbench.dashboard.page.main",
          "/",
          { prefetch: "none", mobileNavigation: true },
        ),
        pageRuntime: eagerPageRuntime("Dashboard"),
        routeRuntime: routeRuntime(),
      },
    ]),
    owner("workbench.orbit", [
      {
        page: {
          id: "workbench.orbit.page.main",
          title: "Workbench",
          description: "Werkzeuge und Previews öffnen",
        },
        route: standardRoute(
          "workbench.orbit.route.main",
          "workbench.orbit.page.main",
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
    owner("workbench.inbox", [
      {
        page: {
          id: "workbench.inbox.page.main",
          title: "Inbox",
          description: "Aufgaben, Rückfragen und Fehler",
        },
        route: standardRoute(
          "workbench.inbox.route.main",
          "workbench.inbox.page.main",
          "/inbox",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("inbox", "Inbox", loadInbox),
        routeRuntime: routeRuntime("/inbox"),
      },
    ]),
    owner("workbench.tech-tldrs", [
      {
        page: {
          id: "workbench.tech-tldrs.page.main",
          title: "Tech TLDRs",
          description: "Tech-News lesen und verstehen",
        },
        route: standardRoute(
          "workbench.tech-tldrs.route.main",
          "workbench.tech-tldrs.page.main",
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
    owner("workbench.projects", [
      {
        page: {
          id: "workbench.projects.page.list",
          title: "Projekte",
          description: "Konfigurierte Arbeitsbereiche",
        },
        route: standardRoute(
          "workbench.projects.route.list",
          "workbench.projects.page.list",
          "/projects",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("projects", "Projects", loadProjects),
        routeRuntime: routeRuntime("/projects"),
      },
      {
        page: {
          id: "workbench.projects.page.detail",
          title: "Projektdetail",
        },
        route: standardRoute(
          "workbench.projects.route.detail",
          "workbench.projects.page.detail",
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
    owner("workbench.files", [
      {
        page: {
          id: "workbench.files.page.main",
          title: "Dateien",
          description: "Server-Dateien verwalten und durchsuchen",
        },
        route: standardRoute(
          "workbench.files.route.main",
          "workbench.files.page.main",
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
    owner("workbench.skills", [
      {
        page: {
          id: "workbench.skills.page.main",
          title: "KI-Skills",
          description: "Globale Skills und Agenten-Regeln bearbeiten",
        },
        route: standardRoute(
          "workbench.skills.route.main",
          "workbench.skills.page.main",
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
    owner("workbench.settings", [
      {
        page: {
          id: "workbench.settings.page.main",
          title: "Einstellungen",
          description: "Lokaler Workspace und Sicherheit",
        },
        route: standardRoute(
          "workbench.settings.route.main",
          "workbench.settings.page.main",
          "/settings",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("settings", "Settings", loadSettings),
        routeRuntime: routeRuntime("/settings"),
      },
    ]),
    owner("workbench.usage", [
      {
        page: {
          id: "workbench.usage.page.main",
          title: "Nutzung",
          description: "Codex und OpenCode Go",
        },
        route: standardRoute(
          "workbench.usage.route.main",
          "workbench.usage.page.main",
          "/usage",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("usage", "Usage", loadUsage),
        routeRuntime: routeRuntime("/usage"),
      },
    ]),
    owner("workbench.t3-code", [
      {
        page: {
          id: "workbench.t3-code.page.main",
          title: "T3 Code",
          description: "Codex-Arbeitsumgebung",
        },
        route: standardRoute(
          "workbench.t3-code.route.main",
          "workbench.t3-code.page.main",
          "/t3-code",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("tool-route", "T3Code", loadToolRoute),
        routeRuntime: routeRuntime("/t3-code"),
      },
    ]),
    owner("workbench.hermes", [
      {
        page: {
          id: "workbench.hermes.page.main",
          title: "Hermes Agent",
          description:
            "Offizielle Hermes-SPA für Chat, Automatisierungen und Verwaltung",
        },
        route: standardRoute(
          "workbench.hermes.route.main",
          "workbench.hermes.page.main",
          "/hermes-agent",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("hermes", "HermesRoute", loadHermes),
        routeRuntime: routeRuntime("/hermes-agent"),
      },
    ]),
    owner("workbench.code-server", [
      {
        page: {
          id: "workbench.code-server.page.main",
          title: "Code-Server",
          description: "VS Code im Browser",
        },
        route: standardRoute(
          "workbench.code-server.route.main",
          "workbench.code-server.page.main",
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
    owner("workbench.previews", [
      {
        page: {
          id: "workbench.previews.page.main",
          title: "Previews",
          description: "Lokale Apps und laufende Ports",
        },
        route: standardRoute(
          "workbench.previews.route.main",
          "workbench.previews.page.main",
          "/previews",
          { projectContext: true, mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("tool-route", "Previews", loadToolRoute),
        routeRuntime: routeRuntime("/previews"),
      },
      {
        page: {
          id: "workbench.previews.page.group",
          title: "Preview-Gruppe",
        },
        route: standardRoute(
          "workbench.previews.route.group",
          "workbench.previews.page.group",
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
          id: "workbench.previews.page.window",
          title: "Preview-Fenster",
        },
        route: standaloneRoute(
          "workbench.previews.route.window",
          "workbench.previews.page.window",
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
          id: "workbench.previews.page.live",
          title: "Live-Preview",
        },
        route: standaloneRoute(
          "workbench.previews.route.live",
          "workbench.previews.page.live",
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
    owner("workbench.browser", [
      {
        page: {
          id: "workbench.browser.page.main",
          title: "Browser",
          description: "Chromium für Recherche und lokale Apps",
        },
        route: standardRoute(
          "workbench.browser.route.main",
          "workbench.browser.page.main",
          "/browser",
          { mobileNavigation: true },
        ),
        pageRuntime: lazyPageRuntime("tool-route", "Browser", loadToolRoute),
        routeRuntime: routeRuntime("/browser"),
      },
    ]),
    owner("workbench.terminal", [
      {
        page: {
          id: "workbench.terminal.page.main",
          title: "Terminal",
          description: "Interaktive Server-Shell",
        },
        route: standardRoute(
          "workbench.terminal.route.main",
          "workbench.terminal.page.main",
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
          id: "workbench.terminal.page.window",
          title: "Terminalfenster",
        },
        route: standaloneRoute(
          "workbench.terminal.route.window",
          "workbench.terminal.page.window",
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
    owner("workbench.codex", [
      {
        page: {
          id: "workbench.codex.page.main",
          title: "Codex",
          description: "Codex CLI im Browser",
        },
        route: standardRoute(
          "workbench.codex.route.main",
          "workbench.codex.page.main",
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
    owner("workbench.opencode", [
      {
        page: {
          id: "workbench.opencode.page.main",
          title: "OpenCode",
          description: "OpenCode CLI im Browser",
        },
        route: standardRoute(
          "workbench.opencode.route.main",
          "workbench.opencode.page.main",
          "/opencode",
          {
            projectContext: true,
            standaloneActions: true,
            mobileNavigation: true,
          },
        ),
        pageRuntime: lazyPageRuntime(
          "cli-terminal",
          "OpenCodeTerminal",
          loadCliTerminal,
        ),
        routeRuntime: routeRuntime("/opencode"),
      },
    ]),
    owner("workbench.claude", [
      {
        page: {
          id: "workbench.claude.page.main",
          title: "Claude Code",
          description: "Claude Code CLI im Browser",
        },
        route: standardRoute(
          "workbench.claude.route.main",
          "workbench.claude.page.main",
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
  dashboard: "workbench.dashboard.page.main",
  inbox: "workbench.inbox.page.main",
  workbench: "workbench.orbit.page.main",
  "tech-tldrs": "workbench.tech-tldrs.page.main",
  projects: "workbench.projects.page.list",
  "t3-code": "workbench.t3-code.page.main",
  "hermes-agent": "workbench.hermes.page.main",
  codex: "workbench.codex.page.main",
  opencode: "workbench.opencode.page.main",
  claude: "workbench.claude.page.main",
  "code-editor": "workbench.code-server.page.main",
  previews: "workbench.previews.page.main",
  browser: "workbench.browser.page.main",
  terminal: "workbench.terminal.page.main",
  files: "workbench.files.page.main",
  "ki-skills": "workbench.skills.page.main",
  usage: "workbench.usage.page.main",
  settings: "workbench.settings.page.main",
});
