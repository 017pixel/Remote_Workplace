import { useEffect, useMemo, useRef } from "react";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { fileManagerStateSchema, type FileManagerState } from "@wrapt/contracts";
import { FILE_MANAGER_STORAGE_KEY, useFileManagerStore } from "../../stores/fileManager";
import { useRouteActivity } from "../../lib/routeActivity";

const SAVE_DELAY_MS = 500;
const POLL_INTERVAL_MS = 3_000;

export function FileManagerSync() {
  const routeActive = useRouteActivity();
  const hydrated = useFileManagerStore((state) => state.hydrated);
  const dirty = useFileManagerStore((state) => state.dirty);
  const saving = useFileManagerStore((state) => state.saving);
  const revision = useFileManagerStore((state) => state.revision);
  const currentPath = useFileManagerStore((state) => state.currentPath);
  const history = useFileManagerStore((state) => state.history);
  const favorites = useFileManagerStore((state) => state.favorites);
  const viewMode = useFileManagerStore((state) => state.viewMode);
  const sortKey = useFileManagerStore((state) => state.sortKey);
  const sortDirection = useFileManagerStore((state) => state.sortDirection);
  const document = useMemo(
    () => ({ currentPath, history, favorites, viewMode, sortKey, sortDirection }),
    [currentPath, favorites, history, sortDirection, sortKey, viewMode],
  );
  const snapshotRef = useRef<FileManagerState | null>(null);

  useEffect(() => {
    let active = true;
    void apiClient.fileManagerState().then((response) => {
      if (!active) return;
      try {
        const draft = JSON.parse(window.localStorage.getItem(FILE_MANAGER_STORAGE_KEY) ?? "null") as unknown;
        const parsed = fileManagerStateSchema.safeParse(
          draft && typeof draft === "object" && "document" in draft
            ? (draft as { document: unknown }).document
            : null,
        );
        if (parsed.success) {
          useFileManagerStore.getState().restoreDraft(parsed.data, response.revision);
          return;
        }
      } catch {
        // Ein beschädigter Draft wird ignoriert; der Serverstand bleibt autoritativ.
      }
      useFileManagerStore.getState().initializeRemote(response.document, response.revision);
    }).catch((error: unknown) => {
      if (!active) return;
      useFileManagerStore.getState().markSyncError(error instanceof Error ? error.message : "Der Dateimanager-Zustand konnte nicht geladen werden.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated || !dirty || saving) return;
    snapshotRef.current = document;
    const snapshotRevision = revision;
    try {
      window.localStorage.setItem(FILE_MANAGER_STORAGE_KEY, JSON.stringify({ document, revision: snapshotRevision }));
    } catch {
      // Server bleibt autoritativ.
    }
    const handle = window.setTimeout(() => {
      useFileManagerStore.getState().markSaving(true);
      void apiClient.saveFileManagerState(document, snapshotRevision)
        .then((response) => {
          if (!response) return;
          const current = useFileManagerStore.getState();
          const unchanged = snapshotRef.current !== null &&
            JSON.stringify({ currentPath: current.currentPath, history: current.history, favorites: current.favorites, viewMode: current.viewMode, sortKey: current.sortKey, sortDirection: current.sortDirection }) ===
            JSON.stringify(snapshotRef.current);
          snapshotRef.current = null;
          current.markSaved(response.revision, unchanged);
          if (unchanged) {
            try { window.localStorage.removeItem(FILE_MANAGER_STORAGE_KEY); } catch { /* ignorieren */ }
          }
        })
        .catch((error: unknown) => {
          snapshotRef.current = null;
          if (error instanceof ApiClientError && error.code === "FILE_MANAGER_STATE_CONFLICT") {
            void apiClient.fileManagerState().then((response) => {
              useFileManagerStore.getState().resolveConflict(response.revision);
            }).catch(() => undefined);
            return;
          }
          useFileManagerStore.getState().markSyncError(error instanceof Error ? error.message : "Der Dateimanager-Zustand konnte nicht gespeichert werden.");
        });
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [document, dirty, hydrated, revision, saving]);

  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    const poll = () => {
      if (!routeActive) return;
      void apiClient.fileManagerState().then((response) => {
        if (!active) return;
        if (useFileManagerStore.getState().dirty) return;
        useFileManagerStore.getState().applyRemote(response.document, response.revision);
      }).catch(() => {
        // Polling-Fehler sind nicht kritisch; der nächste Zyklus versucht es erneut.
      });
    };
    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (routeActive && globalThis.document.visibilityState === "visible") poll();
    };
    window.addEventListener("focus", onVisible);
    globalThis.document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      globalThis.document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, routeActive]);

  return null;
}
