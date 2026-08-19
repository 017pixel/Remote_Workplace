const storageKeyAliases: ReadonlyArray<readonly [string, string]> = [
  ["remote-workplace.app-preferences.v1", "wrapt.app-preferences.v1"],
  ["remote-workplace.sidebar-preferences.v1", "wrapt.sidebar-preferences.v1"],
  ["remote-workplace.sidebar.v1", "wrapt.sidebar.v1"],
  ["remote-workplace.workspace.v2", "wrapt.workspace.v2"],
  ["remote-workplace.workspace.v1", "wrapt.workspace.v1"],
  ["benjamin-dev-workbench.workspace.v2", "wrapt.workspace.v2"],
  ["benjamin-dev-workbench.workspace.v1", "wrapt.workspace.v1"],
  ["remote-workplace.dashboard-preferences.v1", "wrapt.dashboard-preferences.v1"],
  ["remote-workplace.usage-preferences.v1", "wrapt.usage-preferences.v1"],
  ["remote-workplace.node-colors.v1", "wrapt.node-colors.v1"],
  ["remote-workplace.terminals.v1", "wrapt.terminals.v1"],
  ["remote-workplace.preview-hub.v1", "wrapt.preview-hub.v1"],
  ["remote-workplace.files.tree-width.v1", "wrapt.files.tree-width.v1"],
  ["remote-workplace.skills.tree-width.v1", "wrapt.skills.tree-width.v1"],
  ["remote-workplace.terminal-sidebar.v1", "wrapt.terminal-sidebar.v1"],
  ["workbench.file-manager.pending.v1", "wrapt.file-manager.pending.v1"],
  ["workbench.orbit.pending-draft.v1", "wrapt.orbit.pending-draft.v1"],
  ["workbench-orbit-palette-queue", "wrapt-orbit-palette-queue"],
  ["workbench-orbit-open-intents", "wrapt-orbit-open-intents"],
  ["workbench:orbit-touch-hint:v1", "wrapt:orbit-touch-hint:v1"],
  ["workbench:preview-group-snapshot:", "wrapt:preview-group-snapshot:"],
  ["workbench:preview-slot:", "wrapt:preview-slot:"],
  ["workbench:preview-target:", "wrapt:preview-target:"],
  ["workbench.news.chatModel", "wrapt.news.chatModel"],
];

function isValidStoredJson(raw: string): boolean {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

export function migrateLegacyBrowserStorage(storage: Storage = window.localStorage): void {
  for (const [legacyKey, wraptKey] of storageKeyAliases) {
    if (wraptKey.endsWith(":")) {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (!key?.startsWith(legacyKey)) continue;
        const target = `${wraptKey}${key.slice(legacyKey.length)}`;
        if (storage.getItem(target) === null) {
          const raw = storage.getItem(key);
          if (raw !== null && isValidStoredJson(raw)) storage.setItem(target, raw);
        }
      }
      continue;
    }
    const raw = storage.getItem(legacyKey);
    if (raw === null || storage.getItem(wraptKey) !== null || !isValidStoredJson(raw)) continue;
    storage.setItem(wraptKey, raw);
  }
}
