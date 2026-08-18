import type { ComponentType } from "react";
import {
  extensionIdSchema,
  navigationContributionSchema,
  type ExtensionId,
} from "@workbench/extension-contracts";
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
} from "../../components/icons";
import type { PageRouteId } from "../../stores/sidebarPreferences";
import type { NavigationRegistration } from "../navigationRegistry";

interface BuiltinNavigationDefinition {
  readonly extensionId: string;
  readonly routeId: string;
  readonly label: string;
  readonly description?: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly group: "workspace" | "tools" | "account";
  readonly order: number;
  readonly visibleByDefault: boolean;
  readonly preferenceKey: PageRouteId;
}

export interface BuiltinNavigationOwner {
  readonly extensionId: ExtensionId;
  readonly registrations: readonly NavigationRegistration[];
}

const definitions: readonly BuiltinNavigationDefinition[] = Object.freeze([
  { extensionId: "workbench.dashboard", routeId: "workbench.dashboard.route.main", label: "Dashboard", description: "Server, Dienste und Projekte", icon: DashboardIcon, group: "workspace", order: 10, visibleByDefault: true, preferenceKey: "dashboard" },
  { extensionId: "workbench.inbox", routeId: "workbench.inbox.route.main", label: "Inbox", description: "Aufgaben, Rückfragen und Fehler", icon: InboxIcon, group: "workspace", order: 20, visibleByDefault: true, preferenceKey: "inbox" },
  { extensionId: "workbench.orbit", routeId: "workbench.orbit.route.main", label: "Workbench", description: "Werkzeuge und Previews öffnen", icon: WorkbenchIcon, group: "workspace", order: 30, visibleByDefault: true, preferenceKey: "workbench" },
  { extensionId: "workbench.tech-tldrs", routeId: "workbench.tech-tldrs.route.main", label: "Tech TLDRs", description: "Tech-News lesen und verstehen", icon: TechTldrsIcon, group: "workspace", order: 40, visibleByDefault: true, preferenceKey: "tech-tldrs" },
  { extensionId: "workbench.projects", routeId: "workbench.projects.route.list", label: "Projekte", description: "Konfigurierte Arbeitsbereiche", icon: ProjekteIcon, group: "workspace", order: 50, visibleByDefault: true, preferenceKey: "projects" },
  { extensionId: "workbench.t3-code", routeId: "workbench.t3-code.route.main", label: "T3 Code", description: "Codex-Arbeitsumgebung", icon: T3CodeIcon, group: "tools", order: 10, visibleByDefault: true, preferenceKey: "t3-code" },
  { extensionId: "workbench.hermes", routeId: "workbench.hermes.route.main", label: "Hermes Agent", description: "Offizielle Hermes-SPA für Chat, Automatisierungen und Verwaltung", icon: HermesIcon, group: "tools", order: 20, visibleByDefault: true, preferenceKey: "hermes-agent" },
  { extensionId: "workbench.code-server", routeId: "workbench.code-server.route.main", label: "Code-Server", description: "VS Code im Browser", icon: CodeServerIcon, group: "tools", order: 30, visibleByDefault: true, preferenceKey: "code-editor" },
  { extensionId: "workbench.terminal", routeId: "workbench.terminal.route.main", label: "Terminal", description: "Interaktive Server-Shell", icon: TerminalIcon, group: "tools", order: 40, visibleByDefault: true, preferenceKey: "terminal" },
  { extensionId: "workbench.opencode", routeId: "workbench.opencode.route.main", label: "OpenCode", description: "OpenCode Web", icon: OpenCodeIcon, group: "tools", order: 50, visibleByDefault: true, preferenceKey: "opencode" },
  { extensionId: "workbench.codex", routeId: "workbench.codex.route.main", label: "Codex", description: "Codex CLI im Browser", icon: CodexIcon, group: "tools", order: 60, visibleByDefault: false, preferenceKey: "codex" },
  { extensionId: "workbench.claude", routeId: "workbench.claude.route.main", label: "Claude Code", description: "Claude Code CLI im Browser", icon: ClaudeCodeIcon, group: "tools", order: 70, visibleByDefault: false, preferenceKey: "claude" },
  { extensionId: "workbench.previews", routeId: "workbench.previews.route.main", label: "Previews", description: "Lokale Apps und laufende Ports", icon: PreviewsIcon, group: "tools", order: 80, visibleByDefault: true, preferenceKey: "previews" },
  { extensionId: "workbench.files", routeId: "workbench.files.route.main", label: "Dateien", description: "Server-Dateien verwalten und durchsuchen", icon: FinderIcon, group: "tools", order: 90, visibleByDefault: true, preferenceKey: "files" },
  { extensionId: "workbench.browser", routeId: "workbench.browser.route.main", label: "Browser", description: "Chromium für Recherche und lokale Apps", icon: BrowserIcon, group: "tools", order: 100, visibleByDefault: true, preferenceKey: "browser" },
  { extensionId: "workbench.skills", routeId: "workbench.skills.route.main", label: "KI-Skills", description: "Globale Skills und Agenten-Regeln bearbeiten", icon: SkillsIcon, group: "tools", order: 110, visibleByDefault: true, preferenceKey: "ki-skills" },
  { extensionId: "workbench.usage", routeId: "workbench.usage.route.main", label: "Nutzung", description: "Codex und OpenCode Go", icon: NutzungIcon, group: "account", order: 10, visibleByDefault: true, preferenceKey: "usage" },
  { extensionId: "workbench.settings", routeId: "workbench.settings.route.main", label: "Einstellungen", description: "Lokaler Workspace und Sicherheit", icon: EinstellungenIcon, group: "account", order: 20, visibleByDefault: true, preferenceKey: "settings" },
]);

export const builtinNavigationOwners: readonly BuiltinNavigationOwner[] = Object.freeze(
  definitions.map((definition) => {
    const extensionId = extensionIdSchema.parse(definition.extensionId);
    return Object.freeze({
      extensionId,
      registrations: Object.freeze([
        Object.freeze({
          contribution: navigationContributionSchema.parse({
            id: `${extensionId}.navigation.main`,
            routeId: definition.routeId,
            label: definition.label,
            ...(definition.description === undefined ? {} : { description: definition.description }),
            icon: "extension",
            group: definition.group,
            order: definition.order,
            visibleByDefault: definition.visibleByDefault,
          }),
          runtime: Object.freeze({
            icon: definition.icon,
            preferenceKey: definition.preferenceKey,
          }),
        }),
      ]),
    });
  }),
);
