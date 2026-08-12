import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink } from "react-router";
import { FinderIcon, InboxIcon, MenuIcon, WorkbenchIcon, DashboardIcon } from "./icons";
import { prefetchRouteTarget } from "../lib/routePrefetch";
import { workbenchQueries } from "../lib/queryOptions";
import type { RefObject } from "react";

const tabs = [
  { to: "/", label: "Start", icon: DashboardIcon },
  { to: "/workbench", label: "Workbench", icon: WorkbenchIcon },
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/files", label: "Dateien", icon: FinderIcon },
] as const;

export function MobileBottomNav({ onMore, moreRef }: { onMore: () => void; moreRef?: RefObject<HTMLButtonElement | null> }) {
  const client = useQueryClient();
  const notifications = useQuery(workbenchQueries.notifications());
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Hauptnavigation">
      {tabs.map((tab) => {
        const prefetch = () => prefetchRouteTarget(client, tab.to);
        return (
          <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className={({ isActive }) => isActive ? "active" : undefined} onPointerDown={prefetch} onPointerEnter={prefetch} onFocus={prefetch}>
            {({ isActive }) => <><tab.icon aria-hidden className={isActive ? "is-active" : undefined} /><span>{tab.label}</span>{tab.to === "/inbox" && (notifications.data?.unreadCount ?? 0) > 0 ? <small aria-label={`${notifications.data!.unreadCount} ungelesen`}>{Math.min(99, notifications.data!.unreadCount)}</small> : null}</>}
          </NavLink>
        );
      })}
      <button ref={moreRef} type="button" onClick={onMore} aria-label="Weitere Bereiche öffnen"><MenuIcon aria-hidden /><span>Mehr</span></button>
    </nav>
  );
}
