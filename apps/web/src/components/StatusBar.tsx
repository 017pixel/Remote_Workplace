import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import type { ProviderUsage } from "@workbench/contracts";
import { useWorkspaceStore } from "../stores/workspace";
import { workbenchQueries } from "../lib/queryOptions";
import { Spinner, StateDot } from "./primitives";
import { useOrbitStore } from "../stores/orbit";
import { statusBarRegistry } from "../extensions/statusBarRegistry";

export type StatusBarProviderState = Pick<ProviderUsage, "providerId" | "status">;

export interface StatusBarUsageProvider {
  readonly providerId: ProviderUsage["providerId"];
  readonly label: string;
  readonly title: string;
}

/**
 * Die drei Usage Provider der Statusleiste kommen aus der Status-Bar-Registry
 * (Legacy Built-ins mit `usageProviderId`). Deaktivierte Provider gehören
 * nicht in die kompakte Limitanzeige; ohne Serverdaten bleiben alle sichtbar.
 */
export function visibleStatusBarProviders(providers: readonly StatusBarProviderState[] | undefined): StatusBarUsageProvider[] {
  const items = statusBarRegistry
    .getSnapshot()
    .right.filter(
      (item) => item.value.runtime.usageProviderId !== undefined,
    )
    .map((item) => ({
      providerId: item.value.runtime.usageProviderId as ProviderUsage["providerId"],
      label: item.value.contribution.title,
      title: item.value.runtime.usageProviderTitle ?? item.value.contribution.title,
    }));
  if (!providers) return items;
  return items.filter((definition) => providers.find((provider) => provider.providerId === definition.providerId)?.status !== "disabled");
}

export function compactAccountIdentity(value: string): string {
  const separator = value.lastIndexOf("@");
  if (separator <= 0) return value.length > 22 ? `${value.slice(0, 9)}…${value.slice(-9)}` : value;
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (local.length <= 12) return value;
  return `${local.slice(0, 4)}…${local.slice(-4)}@${domain}`;
}

function providerLimit(provider: ProviderUsage | undefined, compactAccounts = false): string {
  if (!provider || provider.accounts.length === 0) return "nicht verfügbar";
  return provider.accounts.map((account) => {
    const windows = account.windows.filter((window) => window.windowMinutes === 300 || window.windowMinutes === 10_080 || window.windowMinutes === 43_200);
    const limits = windows.map((window) => {
      const label = window.windowMinutes === 300 ? "5h" : window.windowMinutes === 10_080 ? (compactAccounts ? "W" : "Woche") : (compactAccounts ? "M" : "Monat");
      return `${label} ${window.remainingPercent}%`;
    }).join(" · ") || (account.windows[0] ? `${account.windows[0].remainingPercent}% frei` : "keine Daten");
    const identity = account.email ?? account.label;
    return provider.accounts.length > 1 ? `${compactAccounts ? compactAccountIdentity(identity) : identity}${compactAccounts ? " " : ": "}${limits}` : limits;
  }).join(" | ");
}

export function StatusBar() {
  const location = useLocation();
  const orbitDocument = useOrbitStore((state) => state.document);
  const orbitDirty = useOrbitStore((state) => state.dirty);
  const orbitSaving = useOrbitStore((state) => state.saving);
  const selectedProjectId = useWorkspaceStore((state) => state.selectedProjectId);
  const health = useQuery(workbenchQueries.health());
  const projects = useQuery(workbenchQueries.projects());
  const usage = useQuery(workbenchQueries.usage());
  const selectedProject = projects.data?.projects.find((project) => project.id === selectedProjectId);
  const activeOrbitBoard = orbitDocument.boards.find((board) => board.id === orbitDocument.activeBoardId);
  const isOrbit = location.pathname === "/workbench";
  // Auf der Standalone-T3-Seite entfällt der Projektbereich: T3 Code zeigt
  // seinen eigenen Kontext (Projekt, Branch, Thread) bereits im Panel.
  const isStandaloneT3 = location.pathname === "/t3-code";
  const codex = usage.data?.providers.find((provider) => provider.providerId === "codex");
  const opencode = usage.data?.providers.find((provider) => provider.providerId === "opencode");
  const claude = usage.data?.providers.find((provider) => provider.providerId === "claude");
  const providerById = { codex, opencode, claude } satisfies Record<ProviderUsage["providerId"], ProviderUsage | undefined>;
  const visibleProviders = visibleStatusBarProviders(usage.data?.providers);

  return (
    <footer className="status-bar hidden md:flex">
      <span className="status-bar-item">
        {health.isLoading ? <Spinner /> : <StateDot state={health.isError ? "error" : "active"} />}
        <span>Workbench</span>
        <span className="status-bar-value font-mono">v{health.data?.version ?? "—"}</span>
      </span>
      <span className="status-bar-divider" />
      <span className="status-bar-context">
      {isOrbit ? <>
        <span className="status-bar-item min-w-0"><span>Orbit</span><span className="status-bar-value truncate">{activeOrbitBoard?.name ?? "Arbeitsfläche"}</span></span>
        <span className="status-bar-divider" />
        <span className="status-bar-item"><span>{activeOrbitBoard?.nodes.length ?? 0} Knoten</span><span>{activeOrbitBoard?.edges.length ?? 0} Verbindungen</span><span className="status-bar-value">{orbitSaving ? "speichert…" : orbitDirty ? "ungespeichert" : "synchron"}</span></span>
      </> : !isStandaloneT3 ? <>
        <span className="status-bar-item min-w-0"><span>Projekt</span><span className="status-bar-value truncate">{selectedProject?.name ?? "keines"}</span></span>
      </> : null}
      </span>
      {visibleProviders.length > 0 ? (
        <Link
          to="/usage"
          className="status-limits"
          aria-label="Nutzung und Limits öffnen"
          title={visibleProviders.map((provider) => `${provider.title}: ${providerLimit(providerById[provider.providerId])}`).join("\n")}
        >
          {visibleProviders.flatMap((provider, index) => [
            ...(index > 0 ? [<span key={`${provider.providerId}-divider`} className="status-bar-divider" aria-hidden="true" />] : []),
            <span key={provider.providerId}><strong>{provider.label}</strong> {usage.isLoading ? "lädt…" : providerLimit(providerById[provider.providerId], true)}</span>,
          ])}
        </Link>
      ) : null}
    </footer>
  );
}
