import { useEffect, useRef } from "react";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { migrateWorkspaceToOrbit, useOrbitStore } from "../../stores/orbit";
import { useWorkspaceStore } from "../../stores/workspace";

const AUTOSAVE_DELAY_MS = 700;
const MAX_RETRY_DELAY_MS = 15_000;
const ORBIT_DRAFT_KEY = "workbench.orbit.pending-draft.v1";

function readPendingDraft() {
  try {
    const value = window.localStorage.getItem(ORBIT_DRAFT_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as { baseRevision?: unknown; document?: unknown };
    if (!Number.isSafeInteger(parsed.baseRevision)) return null;
    return { baseRevision: parsed.baseRevision as number, document: parsed.document };
  } catch {
    return null;
  }
}

function clearPendingDraft() {
  try { window.localStorage.removeItem(ORBIT_DRAFT_KEY); } catch { /* Storage can be disabled by the browser. */ }
}

export function OrbitSync() {
  const hydrated = useOrbitStore((state) => state.hydrated);
  const dirty = useOrbitStore((state) => state.dirty);
  const document = useOrbitStore((state) => state.document);
  const revision = useOrbitStore((state) => state.revision);
  const saving = useOrbitStore((state) => state.saving);
  const syncInterval = useRef(5_000);
  const retryDelay = useRef(AUTOSAVE_DELAY_MS);

  useEffect(() => {
    let active = true;
    void apiClient.orbit().then((response) => {
      if (!active) return;
      syncInterval.current = response.syncIntervalMilliseconds;
      const legacy = migrateWorkspaceToOrbit(useWorkspaceStore.getState());
      useOrbitStore.getState().initialize(response, legacy);
      const pending = readPendingDraft();
      if (pending?.baseRevision === response.revision) {
        try { useOrbitStore.getState().replaceDocument(pending.document as never); } catch { clearPendingDraft(); }
      }
    }).catch((error: unknown) => {
      if (!active) return;
      useOrbitStore.getState().markSyncError(error instanceof Error ? error.message : "Orbit konnte nicht geladen werden.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !dirty) return;
    try {
      window.localStorage.setItem(ORBIT_DRAFT_KEY, JSON.stringify({ baseRevision: revision, savedAt: new Date().toISOString(), document }));
    } catch { /* Server autosave remains authoritative when browser storage is unavailable. */ }
  }, [dirty, document, hydrated, revision]);

  useEffect(() => {
    if (!hydrated || !dirty || saving) return;
    const handle = window.setTimeout(() => {
      const snapshot = useOrbitStore.getState();
      snapshot.markSaving(true);
      void apiClient.saveOrbit({ document: snapshot.document, expectedRevision: snapshot.revision })
        .then((response) => {
          if (!response) return;
          retryDelay.current = AUTOSAVE_DELAY_MS;
          useOrbitStore.getState().markSaved(response, snapshot.document);
          if (!useOrbitStore.getState().dirty) clearPendingDraft();
        })
        .catch(async (error: unknown) => {
          if (error instanceof ApiClientError && error.status === 409) {
            try {
              const latest = await apiClient.orbit();
              retryDelay.current = AUTOSAVE_DELAY_MS;
              useOrbitStore.getState().resolveConflict(latest, "Ein abweichender lokaler Entwurf wurde serverseitig gesichert. Der neuere Serverstand bleibt aktiv.");
              clearPendingDraft();
              return;
            } catch (retryError) {
              retryDelay.current = Math.min(MAX_RETRY_DELAY_MS, Math.round(retryDelay.current * 1.8 + Math.random() * 400));
              useOrbitStore.getState().markSyncError(retryError instanceof Error ? retryError.message : "Synchronisierung fehlgeschlagen.");
              return;
            }
          }
          retryDelay.current = Math.min(MAX_RETRY_DELAY_MS, Math.round(retryDelay.current * 1.8 + Math.random() * 400));
          useOrbitStore.getState().markSyncError(error instanceof Error ? error.message : "Synchronisierung fehlgeschlagen.");
        });
    }, retryDelay.current);
    return () => window.clearTimeout(handle);
  }, [dirty, document, hydrated, revision, saving]);

  useEffect(() => {
    if (!hydrated) return;
    const poll = () => {
      const state = useOrbitStore.getState();
      if (state.dirty || state.saving) return;
      void apiClient.orbit().then((response) => {
        syncInterval.current = response.syncIntervalMilliseconds;
        useOrbitStore.getState().applyRemote(response);
      }).catch(() => { /* A later poll retries without disturbing local work. */ });
    };
    const handle = window.setInterval(poll, syncInterval.current);
    return () => window.clearInterval(handle);
  }, [hydrated]);

  return null;
}
