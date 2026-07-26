import {
  Bot,
  Braces,
  ChartNoAxesCombined,
  Code2,
  Columns2,
  Eye,
  FolderGit2,
  Globe2,
  Images,
  LayoutDashboard,
  MonitorSmartphone,
  Newspaper,
  Settings,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  routeId?: string;
}

export const primaryNavItems: NavItem[] = [
  { to: "/", label: "Dashboard", description: "Server, Dienste und Projekte", icon: LayoutDashboard },
  { to: "/workbench", label: "Workbench", description: "Werkzeuge und Previews öffnen", icon: Columns2 },
  { to: "/tech-tldrs", label: "Tech TLDRs", description: "Tech-News lesen und verstehen", icon: Newspaper },
  { to: "/projects", label: "Projekte", description: "Konfigurierte Arbeitsbereiche", icon: FolderGit2 },
];

export const toolRouteItems: NavItem[] = [
  { to: "/t3-code", label: "T3 Code", description: "Codex-Arbeitsumgebung", icon: Code2 },
  { to: "/codex", label: "Codex", description: "Codex CLI mit bis zu vier Instanzen", icon: Bot },
  { to: "/opencode", label: "OpenCode", description: "OpenCode CLI mit bis zu vier Instanzen", icon: Braces },
  { to: "/code-editor", label: "Code-Server", description: "VS Code im Browser", icon: MonitorSmartphone },
  { to: "/previews", label: "Previews", description: "Lokale Apps und laufende Ports", icon: Eye },
  { to: "/browser", label: "Browser", description: "Chromium für Recherche und lokale Apps", icon: Globe2 },
  { to: "/terminal", label: "Terminal", description: "Interaktive Server-Shell", icon: TerminalSquare },
  { to: "/gallery", label: "Galerie", description: "Medien und Dateien verwalten", icon: Images },
];

export const footerNavItems: NavItem[] = [
  { to: "/usage", label: "Nutzung", description: "Codex und OpenCode Go", icon: ChartNoAxesCombined },
  { to: "/settings", label: "Einstellungen", description: "Lokaler Workspace und Sicherheit", icon: Settings },
];

export const navItems = [...primaryNavItems, ...toolRouteItems, ...footerNavItems];

export const navSections: Array<{ kicker: string; items: NavItem[] }> = [
  { kicker: "Workspace", items: primaryNavItems },
  { kicker: "Werkzeuge", items: toolRouteItems },
  { kicker: "Account und System", items: footerNavItems },
];
