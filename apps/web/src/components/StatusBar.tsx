import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import type { ProviderUsage } from "@workbench/contracts";
import { useWorkspaceStore } from "../stores/workspace";
import { workbenchQueries } from "../lib/queryOptions";
import { Spinner, StateDot } from "./primitives";
import { useOrbitStore } from "../stores/orbit";

const panelTypeLabels: Record<string, string> = {
  "t3-code": "T3 Code",
  "code-server": "Editor",
  preview: "Preview",
  browser: "Browser",
  terminal: "Terminal",
};

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
  const panels = useWorkspaceStore((state) => state.panels);
  const focusedPanelId = useWorkspaceStore((state) => state.focusedPanelId);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const health = useQuery(workbenchQueries.health());
  const projects = useQuery(workbenchQueries.projects());
  const usage = useQuery(workbenchQueries.usage());
  const selectedProject = projects.data?.projects.find((project) => project.id === selectedProjectId);
  const focusedPanel = panels.find((panel) => panel.id === focusedPanelId);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeOrbitBoard = orbitDocument.boards.find((board) => board.id === orbitDocument.activeBoardId);
  const isOrbit = location.pathname === "/workbench";
  const codex = usage.data?.providers.find((provider) => provider.providerId === "codex");
  const opencode = usage.data?.providers.find((provider) => provider.providerId === "opencode");
  const claude = usage.data?.providers.find((provider) => provider.providerId === "claude");

  return (
    <footer className="status-bar hidden md:flex">
      <span className="status-bar-item">
        {health.isLoading ? <Spinner /> : <StateDot state={health.isError ? "error" : "active"} />}
        <span>Workbench</span>
        <span className="status-bar-value font-mono">v{health.data?.version ?? "—"}</span>
      </span>
      <span className="status-bar-divider" />
      {isOrbit ? <>
        <span className="status-bar-item min-w-0"><span>Orbit</span><span className="status-bar-value truncate">{activeOrbitBoard?.name ?? "Arbeitsfläche"}</span></span>
        <span className="status-bar-divider" />
        <span className="status-bar-item"><span>{activeOrbitBoard?.nodes.length ?? 0} Knoten</span><span>{activeOrbitBoard?.edges.length ?? 0} Verbindungen</span><span className="status-bar-value">{orbitSaving ? "speichert…" : orbitDirty ? "ungespeichert" : "synchron"}</span></span>
      </> : <>
        <span className="status-bar-item min-w-0"><span>Projekt</span><span className="status-bar-value truncate">{selectedProject?.name ?? "keines"}</span></span>
        <span className="status-bar-divider" />
        <span className="status-bar-item"><span>{activeWorkspace?.name ?? "Arbeitsfläche"}</span><span>{panels.length} {panels.length === 1 ? "Tool" : "Tools"}</span>{focusedPanel ? <span className="status-bar-value">{panelTypeLabels[focusedPanel.type]}</span> : null}</span>
      </>}
      <Link to="/usage" className="status-limits" aria-label="Nutzung und Limits öffnen" title={`Codex: ${providerLimit(codex)}\nOpenCode: ${providerLimit(opencode)}\nClaude Code: ${providerLimit(claude)}`}>
        <span><strong>Codex</strong> {usage.isLoading ? "lädt…" : providerLimit(codex, true)}</span>
        <span className="status-bar-divider" />
        <span><strong>OpenCode</strong> {usage.isLoading ? "lädt…" : providerLimit(opencode, true)}</span>
        <span className="status-bar-divider" />
        <span><strong>Claude</strong> {usage.isLoading ? "lädt…" : providerLimit(claude, true)}</span>
      </Link>
    </footer>
  );
}
