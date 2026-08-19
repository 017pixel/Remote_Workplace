import type { ComponentType } from "react";
import { navigationContributionSchema } from "@wrapt/extension-contracts";
import {
  BrowserIcon,
  ClaudeCodeIcon,
  CodeServerIcon,
  CodexIcon,
  DashboardIcon,
  EinstellungenIcon,
  FinderIcon,
  HermesIcon,
  InboxIcon,
  NutzungIcon,
  OpenCodeIcon,
  PreviewsIcon,
  ProjekteIcon,
  SkillsIcon,
  T3CodeIcon,
  TechTldrsIcon,
  TerminalIcon,
  WorkbenchIcon,
} from "../components/icons";
import type { PageRouteId } from "../stores/sidebarPreferences";
import {
  navigationRegistry,
  type NavigationRegistration,
  type NavigationRegistry,
} from "./navigationRegistry";

interface LegacyNavigationDefinition {
  readonly ownerId: string;
  readonly routeId: string;
  readonly label: string;
  readonly description?: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly group: "workspace" | "tools" | "account";
  readonly order: number;
  readonly visibleByDefault: boolean;
  readonly legacyVisibilityKey: PageRouteId;
}

export interface LegacyNavigationOwner {
  readonly ownerId: string;
  readonly registrations: readonly NavigationRegistration[];
}

/**
 * Die 18 bisherigen Sidebar-Einträge als Legacy Built-in Navigation
 * Contributions. Reihenfolge, Gruppen, Labels, Beschreibungen und Icons
 * entsprechen exakt der bisherigen statischen Quelle und sind in
 * `legacyNavigation.test.ts` als Paritätserwartung festgeschrieben.
 * Die LocalStorage-Page-IDs aus Persist v2 bleiben über `legacyVisibilityKey`
 * lesbar, bis serverseitige Nutzerpräferenzen sie in Phase 3 ablösen.
 */
const legacyNavigationDefinitions: readonly LegacyNavigationDefinition[] =
  Object.freeze([
    {
      ownerId: "wrapt.dashboard",
      routeId: "wrapt.dashboard.route.main",
      label: "Dashboard",
      description: "Server, Dienste und Projekte",
      icon: DashboardIcon,
      group: "workspace",
      order: 10,
      visibleByDefault: true,
      legacyVisibilityKey: "dashboard",
    },
    {
      ownerId: "wrapt.inbox",
      routeId: "wrapt.inbox.route.main",
      label: "Inbox",
      description: "Aufgaben, Rückfragen und Fehler",
      icon: InboxIcon,
      group: "workspace",
      order: 20,
      visibleByDefault: true,
      legacyVisibilityKey: "inbox",
    },
    {
      ownerId: "wrapt.orbit",
      routeId: "wrapt.orbit.route.main",
      label: "Workbench",
      description: "Werkzeuge und Previews öffnen",
      icon: WorkbenchIcon,
      group: "workspace",
      order: 30,
      visibleByDefault: true,
      legacyVisibilityKey: "workbench",
    },
    {
      ownerId: "wrapt.tech-tldrs",
      routeId: "wrapt.tech-tldrs.route.main",
      label: "Tech TLDRs",
      description: "Tech-News lesen und verstehen",
      icon: TechTldrsIcon,
      group: "workspace",
      order: 40,
      visibleByDefault: true,
      legacyVisibilityKey: "tech-tldrs",
    },
    {
      ownerId: "wrapt.projects",
      routeId: "wrapt.projects.route.list",
      label: "Projekte",
      description: "Konfigurierte Arbeitsbereiche",
      icon: ProjekteIcon,
      group: "workspace",
      order: 50,
      visibleByDefault: true,
      legacyVisibilityKey: "projects",
    },
    {
      ownerId: "wrapt.t3-code",
      routeId: "wrapt.t3-code.route.main",
      label: "T3 Code",
      description: "Codex-Arbeitsumgebung",
      icon: T3CodeIcon,
      group: "tools",
      order: 10,
      visibleByDefault: true,
      legacyVisibilityKey: "t3-code",
    },
    {
      ownerId: "wrapt.hermes",
      routeId: "wrapt.hermes.route.main",
      label: "Hermes Agent",
      description:
        "Offizielle Hermes-SPA für Chat, Automatisierungen und Verwaltung",
      icon: HermesIcon,
      group: "tools",
      order: 20,
      visibleByDefault: true,
      legacyVisibilityKey: "hermes-agent",
    },
    {
      ownerId: "wrapt.code-server",
      routeId: "wrapt.code-server.route.main",
      label: "Code-Server",
      description: "VS Code im Browser",
      icon: CodeServerIcon,
      group: "tools",
      order: 30,
      visibleByDefault: true,
      legacyVisibilityKey: "code-editor",
    },
    {
      ownerId: "wrapt.terminal",
      routeId: "wrapt.terminal.route.main",
      label: "Terminal",
      description: "Interaktive Server-Shell",
      icon: TerminalIcon,
      group: "tools",
      order: 40,
      visibleByDefault: true,
      legacyVisibilityKey: "terminal",
    },
    {
      ownerId: "wrapt.opencode",
      routeId: "wrapt.opencode.route.main",
      label: "OpenCode",
      description: "OpenCode Web",
      icon: OpenCodeIcon,
      group: "tools",
      order: 50,
      visibleByDefault: true,
      legacyVisibilityKey: "opencode",
    },
    {
      ownerId: "wrapt.codex",
      routeId: "wrapt.codex.route.main",
      label: "Codex",
      description: "Codex CLI im Browser",
      icon: CodexIcon,
      group: "tools",
      order: 60,
      visibleByDefault: false,
      legacyVisibilityKey: "codex",
    },
    {
      ownerId: "wrapt.claude",
      routeId: "wrapt.claude.route.main",
      label: "Claude Code",
      description: "Claude Code CLI im Browser",
      icon: ClaudeCodeIcon,
      group: "tools",
      order: 70,
      visibleByDefault: false,
      legacyVisibilityKey: "claude",
    },
    {
      ownerId: "wrapt.previews",
      routeId: "wrapt.previews.route.main",
      label: "Previews",
      description: "Lokale Apps und laufende Ports",
      icon: PreviewsIcon,
      group: "tools",
      order: 80,
      visibleByDefault: true,
      legacyVisibilityKey: "previews",
    },
    {
      ownerId: "wrapt.files",
      routeId: "wrapt.files.route.main",
      label: "Dateien",
      description: "Server-Dateien verwalten und durchsuchen",
      icon: FinderIcon,
      group: "tools",
      order: 90,
      visibleByDefault: true,
      legacyVisibilityKey: "files",
    },
    {
      ownerId: "wrapt.browser",
      routeId: "wrapt.browser.route.main",
      label: "Browser",
      description: "Chromium für Recherche und lokale Apps",
      icon: BrowserIcon,
      group: "tools",
      order: 100,
      visibleByDefault: true,
      legacyVisibilityKey: "browser",
    },
    {
      ownerId: "wrapt.skills",
      routeId: "wrapt.skills.route.main",
      label: "KI-Skills",
      description: "Globale Skills und Agenten-Regeln bearbeiten",
      icon: SkillsIcon,
      group: "tools",
      order: 110,
      visibleByDefault: true,
      legacyVisibilityKey: "ki-skills",
    },
    {
      ownerId: "wrapt.usage",
      routeId: "wrapt.usage.route.main",
      label: "Nutzung",
      description: "Codex und OpenCode Go",
      icon: NutzungIcon,
      group: "account",
      order: 10,
      visibleByDefault: true,
      legacyVisibilityKey: "usage",
    },
    {
      ownerId: "wrapt.settings",
      routeId: "wrapt.settings.route.main",
      label: "Einstellungen",
      description: "Lokaler Workspace und Sicherheit",
      icon: EinstellungenIcon,
      group: "account",
      order: 20,
      visibleByDefault: true,
      legacyVisibilityKey: "settings",
    },
  ]);

export const legacyNavigationOwners: readonly LegacyNavigationOwner[] =
  Object.freeze(
    legacyNavigationDefinitions.map((definition) =>
      Object.freeze({
        ownerId: definition.ownerId,
        registrations: Object.freeze([
          Object.freeze({
            contribution: navigationContributionSchema.parse({
              id: `${definition.ownerId}.navigation.main`,
              routeId: definition.routeId,
              label: definition.label,
              ...(definition.description === undefined
                ? {}
                : { description: definition.description }),
              icon: "extension",
              group: definition.group,
              order: definition.order,
              visibleByDefault: definition.visibleByDefault,
            }),
            runtime: Object.freeze({
              icon: definition.icon,
              legacyVisibilityKey: definition.legacyVisibilityKey,
            }),
          }),
        ]),
      }),
    ),
  );

export function registerLegacyNavigation(registry: NavigationRegistry): void {
  for (const builtIn of legacyNavigationOwners) {
    registry.replaceOwner(builtIn.ownerId, builtIn.registrations);
  }
}

let defaultRegistryBootstrapped = false;

export function bootstrapLegacyNavigation(): NavigationRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacyNavigation(navigationRegistry);
    defaultRegistryBootstrapped = true;
  }
  return navigationRegistry;
}
