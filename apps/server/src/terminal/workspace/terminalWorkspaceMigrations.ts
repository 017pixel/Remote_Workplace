import type { TerminalEntry, TerminalFolder, TerminalPaneLayout, TerminalWorkspace, TerminalWorkspaceV2 } from "@wrapt/contracts";

const DEFAULT_FOLDER_ID = "default";
const DEFAULT_FOLDER_NAME = "Terminal";

/** Bestehende Runtime-IDs der flachen Tabs bleiben erhalten: Die Tab-ID einer
 *  v1-Area ist die Runtime-ID der laufenden Session. */
function entryFromTab(tab: { id: string; projectId: string | null; kind: "shell" | "codex" | "opencode" | "claude"; initialCwd: string | null }, index: number, seen: Set<string>): TerminalEntry {
  const id = `entry-${tab.id}`;
  seen.add(id);
  const kindLabel = tab.kind === "codex" ? "Codex" : tab.kind === "opencode" ? "OpenCode" : tab.kind === "claude" ? "Claude Code" : "Terminal";
  return {
    id,
    runtimeId: tab.id,
    name: `${kindLabel} ${index + 1}`,
    parentFolderId: DEFAULT_FOLDER_ID,
    sortOrder: index,
    pinned: false,
    persistent: false,
    kind: tab.kind,
    projectId: tab.projectId,
    initialCwd: tab.initialCwd,
  };
}

function layoutFromArea(area: { activeTabId: string | null; splitTabIds: [string, string] | null; splitSizes: [number, number] }): TerminalPaneLayout | null {
  if (!area.activeTabId) return null;
  if (area.splitTabIds && area.splitTabIds.length === 2 && area.activeTabId) {
    const [leftId, rightId] = area.splitTabIds;
    return {
      type: "split",
      id: "split-migrated",
      orientation: "horizontal",
      sizes: [area.splitSizes[0] ?? 50, area.splitSizes[1] ?? 50],
      children: [
        { type: "pane", id: `pane-${leftId}`, runtimeId: leftId },
        { type: "pane", id: `pane-${rightId}`, runtimeId: rightId },
      ],
    };
  }
  return { type: "pane", id: `pane-${area.activeTabId}`, runtimeId: area.activeTabId };
}

/**
 * Migriert ein v1-Dokument (flache Areas mit Tabs) nach v2 (Ordner, Entries,
 * Pane-Layout). Beschädigte oder teilweise alte Daten werden fail safe
 * behandelt: Ungültige Tabs werden übersprungen, niemals geworfen.
 */
export function migrateTerminalWorkspaceV1(document: TerminalWorkspace): TerminalWorkspaceV2 {
  const seen = new Set<string>();
  const entries: TerminalEntry[] = [];
  const folders: TerminalFolder[] = [{
    id: DEFAULT_FOLDER_ID,
    parentFolderId: null,
    name: DEFAULT_FOLDER_NAME,
    sortOrder: 0,
    collapsed: false,
  }];

  const areas = Object.values(document.areas).sort((a, b) => a.id.localeCompare(b.id));

  for (const area of areas) {
    for (const tab of area.tabs) {
      if (!tab || typeof tab.id !== "string" || seen.has(`entry-${tab.id}`)) continue;
      entries.push(entryFromTab(tab, entries.length, seen));
    }
  }

  // Jede bestehende Area (Standalone-Seite, CLI-Seiten, Panels) bekommt ihr
  // eigenes Pane-Layout. Pane-Verweise, die nicht zu einer migrierten
  // Entry-Runtime gehören, entfernen, damit das Dokument seine Invarianten
  // erfüllt.
  const runtimeIds = new Set(entries.map((entry) => entry.runtimeId).filter((id): id is string => id !== null));
  const stripLayout = (node: TerminalPaneLayout): TerminalPaneLayout | null => {
    if (node.type === "pane") return runtimeIds.has(node.runtimeId) ? node : null;
    const children = node.children.filter((child) => runtimeIds.has(child.runtimeId));
    return children.length >= 2
      ? { ...node, sizes: node.sizes.slice(0, children.length), children: children.slice(0, 4) }
      : children.length === 1 ? { type: "pane", id: `pane-${children[0]!.runtimeId}`, runtimeId: children[0]!.runtimeId }
      : null;
  };
  const areaLayouts: Record<string, { paneLayout: TerminalPaneLayout | null; focusedPaneId: string | null }> = {};
  for (const area of areas) {
    // Bei beschädigten Daten ohne aktiven Tab fällt der Bereich auf null zurück.
    const rawLayout = area.tabs.length > 0 ? layoutFromArea(area) : null;
    const layout = rawLayout ? stripLayout(rawLayout) : null;
    areaLayouts[area.id] = {
      paneLayout: layout,
      focusedPaneId: layout ? (layout.type === "pane" ? layout.id : layout.children[0]?.id ?? null) : null,
    };
  }

  return {
    version: 2,
    entries,
    folders,
    areaLayouts,
  };
}

/** Leeres, gültiges V2-Dokument für neue Nutzer. */
export function emptyTerminalWorkspaceV2(): TerminalWorkspaceV2 {
  return {
    version: 2,
    entries: [],
    folders: [{
      id: DEFAULT_FOLDER_ID,
      parentFolderId: null,
      name: DEFAULT_FOLDER_NAME,
      sortOrder: 0,
      collapsed: false,
    }],
    areaLayouts: {},
  };
}
