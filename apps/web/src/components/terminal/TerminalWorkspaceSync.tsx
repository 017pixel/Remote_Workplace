import { useEffect, useRef } from "react";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { useTerminalStore, type TerminalAreaState } from "../../stores/terminals";

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
  const retryRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void apiClient.terminalWorkspace().then((response) => {
      if (!active) return;
      useTerminalStore.getState().initializeRemote(response.document, response.revision);
    }).catch((error: unknown) => {
      if (!active) return;
      useTerminalStore.getState().initializeRemote(documentFromAreas({}), 0);
      useTerminalStore.getState().markSyncError(error instanceof Error ? error.message : "Terminal-Layout konnte nicht geladen werden.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !dirty || saving) return;
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
          if (unchanged) { try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignored */ } }
        })
        .catch(async (error: unknown) => {
          if (error instanceof ApiClientError && error.status === 409) {
            try {
              const latest = await apiClient.terminalWorkspace();
              useTerminalStore.getState().replaceRemote(latest.document, latest.revision);
              try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignored */ }
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
      const state = useTerminalStore.getState();
      if (state.dirty || state.saving) return;
      void apiClient.terminalWorkspace().then((response) => {
        if (response.revision > useTerminalStore.getState().revision) useTerminalStore.getState().applyRemote(response.document, response.revision);
      }).catch(() => { /* later poll retries */ });
    };
    const handle = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, [hydrated]);

  useEffect(() => () => { if (retryRef.current !== null) window.clearTimeout(retryRef.current); }, []);
  return null;
}
