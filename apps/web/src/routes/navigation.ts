import type { ComponentType } from "react";
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

export interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  routeId?: string;
}

export const primaryNavItems: NavItem[] = [
  { to: "/", label: "Dashboard", description: "Server, Dienste und Projekte", icon: DashboardIcon },
  { to: "/inbox", label: "Inbox", description: "Aufgaben, Rückfragen und Fehler", icon: InboxIcon },
  { to: "/workbench", label: "Workbench", description: "Werkzeuge und Previews öffnen", icon: WorkbenchIcon },
  { to: "/tech-tldrs", label: "Tech TLDRs", description: "Tech-News lesen und verstehen", icon: TechTldrsIcon },
  { to: "/projects", label: "Projekte", description: "Konfigurierte Arbeitsbereiche", icon: ProjekteIcon },
];

export const toolRouteItems: NavItem[] = [
  { to: "/t3-code", label: "T3 Code", description: "Codex-Arbeitsumgebung", icon: T3CodeIcon },
  { to: "/hermes-agent", label: "Hermes Agent", description: "Offizielle Hermes-SPA für Chat, Automatisierungen und Verwaltung", icon: HermesIcon },
  { to: "/code-editor", label: "Code-Server", description: "VS Code im Browser", icon: CodeServerIcon },
  { to: "/terminal", label: "Terminal", description: "Interaktive Server-Shell", icon: TerminalIcon },
  { to: "/opencode", label: "OpenCode", description: "OpenCode CLI im Browser", icon: OpenCodeIcon },
  { to: "/codex", label: "Codex", description: "Codex CLI im Browser", icon: CodexIcon },
  { to: "/claude", label: "Claude Code", description: "Claude Code CLI im Browser", icon: ClaudeCodeIcon },
  { to: "/previews", label: "Previews", description: "Lokale Apps und laufende Ports", icon: PreviewsIcon },
  { to: "/files", label: "Dateien", description: "Server-Dateien verwalten und durchsuchen", icon: FinderIcon },
  { to: "/browser", label: "Browser", description: "Chromium für Recherche und lokale Apps", icon: BrowserIcon },
  { to: "/ki-skills", label: "KI-Skills", description: "Globale Skills und Agenten-Regeln bearbeiten", icon: SkillsIcon },
];

export const footerNavItems: NavItem[] = [
  { to: "/usage", label: "Nutzung", description: "Codex und OpenCode Go", icon: NutzungIcon },
  { to: "/settings", label: "Einstellungen", description: "Lokaler Workspace und Sicherheit", icon: EinstellungenIcon },
];

export const navItems = [...primaryNavItems, ...toolRouteItems, ...footerNavItems];

export const navSections: Array<{ kicker: string; items: NavItem[] }> = [
  { kicker: "Workspace", items: primaryNavItems },
  { kicker: "Werkzeuge", items: toolRouteItems },
  { kicker: "Account und System", items: footerNavItems },
];
