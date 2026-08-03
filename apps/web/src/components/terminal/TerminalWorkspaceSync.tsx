import { useEffect, useRef } from "react";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { useTerminalStore, type TerminalAreaState } from "../../stores/terminals";
import { terminalWorkspaceSchema } from "@workbench/contracts";

const SAVE_DELAY_MS = 500;
const POLL_INTERVAL_MS = 3_000;
const DRAFT_KEY = "workbench.terminals.pending.v1";

function documentFromAreas(areas: Record<string, TerminalAreaState>) { return { version: 1 as const, areas }; }

export function TerminalWorkspaceSync() {
  const hydrated = useTerminalStore((state) => state.hydrated);
  const dirty = useTerminalStore((state) => state.dirty);
  const saving = useTerminalStore((state) => state.saving);
  const revision = useTerminalStore((state) => state.revision);
  const areas = useTerminalStore((state) => state.areas);
  const hasTerminalTabs = useTerminalStore((state) => Object.values(state.areas).some((area) => area.tabs.length > 0));
  const retryRef = useRef<number | null>(null);
  const blockedAreasRef = useRef<Record<string, TerminalAreaState> | null>(null);

  useEffect(() => {
    let active = true;
    void apiClient.terminalWorkspace().then((response) => {
      if (!active) return;
      try {
        const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as unknown;
        const parsed = terminalWorkspaceSchema.safeParse(
          draft && typeof draft === "object" && "document" in draft
            ? (draft as { document: unknown }).document
            : null,
        );
        if (parsed.success) {
          useTerminalStore.getState().restoreDraft(parsed.data, response.revision);
          return;
        }
      } catch { /* Ein beschädigter Draft wird ignoriert; der Serverstand bleibt verfügbar. */ }
      useTerminalStore.getState().initializeRemote(response.document, response.revision);
    }).catch((error: unknown) => {
      if (!active) return;
      useTerminalStore.getState().initializeRemote(documentFromAreas({}), 0);
      useTerminalStore.getState().markSyncError(error instanceof Error ? error.message : "Terminal-Layout konnte nicht geladen werden.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !dirty || saving || blockedAreasRef.current === areas) return;
    const snapshotAreas = areas;
    const snapshotRevision = revision;
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ document: documentFromAreas(snapshotAreas), revision: snapshotRevision })); } catch { /* Server bleibt autoritativ. */ }
    const handle = window.setTimeout(() => {
      useTerminalStore.getState().markSaving(true);
      void apiClient.saveTerminalWorkspace({ document: documentFromAreas(snapshotAreas), expectedRevision: snapshotRevision })
        .then((response) => {
          if (!response) return;
          const current = useTerminalStore.getState();
          const unchanged = JSON.stringify(current.areas) === JSON.stringify(snapshotAreas);
          current.markSaved(response.revision, unchanged);
          blockedAreasRef.current = null;
          if (unchanged) { try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignored */ } }
        })
        .catch(async (error: unknown) => {
          if (error instanceof ApiClientError && error.status === 409) {
            try {
              const latest = await apiClient.terminalWorkspace();
              const current = useTerminalStore.getState();
              blockedAreasRef.current = current.areas;
              current.resolveConflict(latest.revision);
              return;
            } catch { /* retry below */ }
          }
          retryRef.current = window.setTimeout(() => useTerminalStore.getState().markSyncError(error instanceof Error ? error.message : "Terminal-Layout konnte nicht gespeichert werden."), 1_000);
        });
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [areas, dirty, hydrated, revision, saving]);

  useEffect(() => {
    if (!hydrated) return;
    const poll = () => {
      if (globalThis.document.visibilityState === "hidden") return;
      const state = useTerminalStore.getState();
      if (!Object.values(state.areas).some((area) => area.tabs.length > 0) && !state.dirty) return;
      if (state.dirty || state.saving) return;
      void apiClient.terminalWorkspace().then((response) => {
        if (response.revision > useTerminalStore.getState().revision) useTerminalStore.getState().applyRemote(response.document, response.revision);
      }).catch(() => { /* later poll retries */ });
    };
    const handle = window.setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (globalThis.document.visibilityState === "visible") poll();
    };
    window.addEventListener("focus", onVisible);
    globalThis.document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(handle);
      window.removeEventListener("focus", onVisible);
      globalThis.document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasTerminalTabs, hydrated]);

  useEffect(() => () => { if (retryRef.current !== null) window.clearTimeout(retryRef.current); }, []);
  return null;
}
