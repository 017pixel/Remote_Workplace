import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router";
import { DashboardIcon, FinderIcon, InboxIcon, MenuIcon, NutzungIcon, ProjekteIcon, RemoteWorkbenchIcon, WorkbenchIcon } from "./icons";
import { workbenchQueries } from "../lib/queryOptions";
import { Tooltip, TooltipProvider } from "./ui/Tooltip";

const railItems = [
  { to: "/", label: "Dashboard", icon: DashboardIcon },
  { to: "/workbench", label: "Workbench", icon: WorkbenchIcon },
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/projects", label: "Projekte", icon: ProjekteIcon },
  { to: "/files", label: "Dateien", icon: FinderIcon },
  { to: "/usage", label: "Nutzung", icon: NutzungIcon },
] as const;

export function TabletRail({ onMore }: { onMore: () => void }) {
  const notifications = useQuery(workbenchQueries.notifications());
  return (
    <TooltipProvider>
      <aside className="tablet-rail" aria-label="Tablet Navigation">
        <NavLink to="/" className="tablet-rail-brand" aria-label="Remote Workplace"><RemoteWorkbenchIcon aria-hidden /></NavLink>
        <nav aria-label="Tablet Hauptnavigation">
          {railItems.map((item) => <Tooltip key={item.to} trigger={<NavLink to={item.to} end={item.to === "/"} className={({ isActive }) => isActive ? "active" : undefined} aria-label={item.label}><item.icon aria-hidden />{item.to === "/inbox" && (notifications.data?.unreadCount ?? 0) > 0 ? <small>{Math.min(99, notifications.data!.unreadCount)}</small> : null}</NavLink>}>{item.label}</Tooltip>)}
        </nav>
        <Tooltip trigger={<button type="button" onClick={onMore} aria-label="Weitere Bereiche"><MenuIcon aria-hidden /></button>}>Weitere Bereiche</Tooltip>
      </aside>
    </TooltipProvider>
  );
}
