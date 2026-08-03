import type { ComponentType } from "react";
import type { IconProps } from "../icons";
import {
  ActivityIcon,
  BookmarkIcon,
  ClockIcon,
  CpuIcon,
  DatabaseIcon,
  EinstellungenIcon,
  FileIcon,
  FolderIcon,
  KeyIcon,
  LayersIcon,
  LibraryIcon,
  LinkIcon,
  ListIcon,
  NetworkIcon,
  NoteIcon,
  ServerIcon,
  ShieldIcon,
  UserIcon,
} from "../icons";

/**
 * Die Seiten der offiziellen Hermes-Oberfläche.
 *
 * Die Pfade spiegeln `BUILTIN_ROUTES_CORE` der Hermes-SPA
 * (`web/src/App.tsx`). Sie sind die interne Route *innerhalb* von Hermes —
 * der Proxy-Präfix `/hermes` kommt erst in `HermesAdminFrame` davor.
 *
 * `primary` steuert nur, was direkt in der Leiste steht; alles Übrige liegt
 * eine Ebene tiefer unter „Mehr“. Erreichbar ist ohnehin alles zusätzlich über
 * die Navigation der Hermes-SPA selbst, die bewusst sichtbar bleibt.
 */
export interface HermesSurfacePage {
  path: string;
  label: string;
  icon: ComponentType<IconProps>;
  primary?: boolean;
}

export const hermesSurfacePages: readonly HermesSurfacePage[] = [
  { path: "/sessions", label: "Sessions", icon: ListIcon, primary: true },
  { path: "/system", label: "System", icon: ServerIcon, primary: true },
  { path: "/cron", label: "Cron", icon: ClockIcon, primary: true },
  { path: "/analytics", label: "Auswertung", icon: ActivityIcon, primary: true },
  { path: "/logs", label: "Logs", icon: FileIcon, primary: true },
  { path: "/models", label: "Modelle", icon: CpuIcon, primary: true },
  { path: "/skills", label: "Skills", icon: LibraryIcon },
  { path: "/plugins", label: "Plugins", icon: LayersIcon },
  { path: "/mcp", label: "MCP", icon: NetworkIcon },
  { path: "/channels", label: "Kanäle", icon: LinkIcon },
  { path: "/webhooks", label: "Webhooks", icon: BookmarkIcon },
  { path: "/pairing", label: "Pairing", icon: ShieldIcon },
  { path: "/profiles", label: "Profile", icon: UserIcon },
  { path: "/files", label: "Dateien", icon: FolderIcon },
  { path: "/config", label: "Konfiguration", icon: EinstellungenIcon },
  { path: "/env", label: "Schlüssel", icon: KeyIcon },
  { path: "/docs", label: "Dokumentation", icon: NoteIcon },
] as const;

/** Fallback für Seiten, die Hermes kennt, die Leiste aber nicht auflistet. */
export const hermesFallbackPage: HermesSurfacePage = { path: "/", label: "Übersicht", icon: DatabaseIcon };

/** Findet den Eintrag, der den aktuellen SPA-Pfad abdeckt (`/profiles/new` → Profile). */
export function findHermesPage(path: string): HermesSurfacePage | undefined {
  return hermesSurfacePages.find((page) => path === page.path || path.startsWith(`${page.path}/`));
}
