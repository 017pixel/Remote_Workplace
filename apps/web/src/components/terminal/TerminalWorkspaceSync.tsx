import { useEffect, useRef } from "react";
import type { TerminalWorkspaceOperation, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";

const SAVE_DELAY_MS = 400;
const POLL_INTERVAL_MS = 3_000;
const PENDING_KEY = "wrapt.terminals.pending.v2";
const BROADCAST_CHANNEL = "wrapt.terminals.v2";

interface PendingPayload { revision: number; operations: TerminalWorkspaceOperation[]; }

function readPending(): PendingPayload | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !("revision" in parsed) || !Array.isArray((parsed as PendingPayload).operations)) return null;
    return parsed as PendingPayload;
  } catch { return null; }
}

function writePending(payload: PendingPayload | null): void {
  try {
    if (payload === null) window.localStorage.removeItem(PENDING_KEY);
    else window.localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch { /* Server bleibt autoritativ. */ }
}

/** Lädt das Workspace-Dokument und migriert V1 einmalig serverseitig nach V2,
 *  sodass alle Aufrufer durchgehend ein V2-Dokument erhalten. */
async function loadWorkspaceV2(): Promise<{ document: TerminalWorkspaceV2; revision: number }> {
  const response = await apiClient.terminalWorkspace();
  if (response.document.version === 1) {
    const migrated = await apiClient.saveTerminalWorkspace({ document: response.document, expectedRevision: response.revision });
    if (migrated?.document.version === 2) return { document: migrated.document, revision: migrated.revision };
  }
  if (response.document.version === 2) return { document: response.document, revision: response.revision };
  throw new Error("Das Terminal-Layout konnte nicht migriert werden.");
}

export function TerminalWorkspaceSync() {
  const hydrated = useTerminalWorkspaceStore((state) => state.hydrated);
  const dirty = useTerminalWorkspaceStore((state) => state.dirty);
  const saving = useTerminalWorkspaceStore((state) => state.saving);
  const revision = useTerminalWorkspaceStore((state) => state.revision);
  const pendingOps = useTerminalWorkspaceStore((state) => state.pendingOps);
  const retryRef = useRef<number | null>(null);
  const conflictAttemptsRef = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await loadWorkspaceV2();
        if (!active) return;
        const pending = readPending();
        useTerminalWorkspaceStore.getState().initializeRemote(
          response.document,
          response.revision,
          pending ? pending.operations : [],
        );
      } catch (error: unknown) {
        if (!active) return;
        useTerminalWorkspaceStore.getState().markSyncError(error instanceof Error ? error.message : "Terminal-Layout konnte nicht geladen werden.");
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<{ document?: unknown; revision?: unknown }>) => {
      const state = useTerminalWorkspaceStore.getState();
      if (state.dirty || state.saving || !state.hydrated) return;
      if (typeof event.data?.revision === "number" && typeof event.data.document === "object" && event.data.document !== null) {
        const remote = event.data.document as Parameters<typeof state.applyRemote>[0];
        if (event.data.revision > state.revision) state.applyRemote(remote, event.data.revision);
      }
    };
    return () => { channel.close(); channelRef.current = null; };
  }, []);

  useEffect(() => {
    if (!hydrated || !dirty || saving || pendingOps.length === 0) return;
    writePending({ revision, operations: pendingOps });
    const snapshot = { revision, operations: pendingOps };
    const handle = window.setTimeout(() => {
      useTerminalWorkspaceStore.getState().markSaving(true);
      void (async () => {
        let latest = snapshot;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const response = await apiClient.terminalWorkspaceOps({ expectedRevision: latest.revision, operations: latest.operations });
            if (!response) return;
            if (response.document.version !== 2) {
              useTerminalWorkspaceStore.getState().markSyncError("Das Terminal-Layout konnte nicht gespeichert werden.");
              return;
            }
            useTerminalWorkspaceStore.getState().reconcileSaved(response.document, response.revision, snapshot.operations);
            conflictAttemptsRef.current = 0;
            const current = useTerminalWorkspaceStore.getState();
            if (current.pendingOps.length === 0) writePending(null);
            else writePending({ revision: current.revision, operations: current.pendingOps });
            channelRef.current?.postMessage({ document: response.document, revision: response.revision });
            return;
          } catch (error: unknown) {
            if (error instanceof ApiClientError && error.status === 409) {
              conflictAttemptsRef.current += 1;
              const remote = await loadWorkspaceV2().catch(() => null);
              if (!remote) {
                retryRef.current = window.setTimeout(() => useTerminalWorkspaceStore.getState().markSyncError("Terminal-Layout konnte nicht gespeichert werden."), 1_000);
                return;
              }
              // Rebase: lokale Ops auf den neuesten Serverstand anwenden und
              // erneut senden. `applyRemote` schützt absichtlich schmutzige
              // Dokumente, deshalb braucht der Konfliktpfad eine eigene
              // Methode, die die lokalen Operationen sichtbar erhält.
              const current = useTerminalWorkspaceStore.getState();
              const operations = current.pendingOps.length > 0 ? current.pendingOps : latest.operations;
              current.rebaseRemote(remote.document, remote.revision, operations);
              current.markSaving(true);
              latest = { revision: remote.revision, operations };
              continue;
            }
            retryRef.current = window.setTimeout(() => useTerminalWorkspaceStore.getState().markSyncError(
              error instanceof Error ? error.message : "Terminal-Layout konnte nicht gespeichert werden.",
            ), 1_000);
            return;
          }
        }
        // Bei ungewöhnlich hoher Konkurrenz bleibt der lokale Puffer erhalten.
        // `saving=false` stößt den normalen Debounce-Save erneut an; der alte
        // Fallback auf den leeren Serverstand darf keine Terminals entfernen.
        useTerminalWorkspaceStore.getState().markSaving(false);
      })();
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [dirty, hydrated, pendingOps, revision, saving]);

  useEffect(() => {
    const poll = () => {
      if (globalThis.document.visibilityState === "hidden") return;
      const state = useTerminalWorkspaceStore.getState();
      if (!state.hydrated || state.dirty || state.saving) return;
      void loadWorkspaceV2().then((response) => {
        if (response.revision > useTerminalWorkspaceStore.getState().revision) {
          useTerminalWorkspaceStore.getState().applyRemote(response.document, response.revision);
          channelRef.current?.postMessage({ document: response.document, revision: response.revision });
        }
      }).catch(() => { /* later poll retries */ });
    };
    const handle = window.setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => { if (globalThis.document.visibilityState === "visible") poll(); };
    window.addEventListener("focus", onVisible);
    globalThis.document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(handle);
      window.removeEventListener("focus", onVisible);
      globalThis.document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => () => { if (retryRef.current !== null) window.clearTimeout(retryRef.current); }, []);
  return null;
}
