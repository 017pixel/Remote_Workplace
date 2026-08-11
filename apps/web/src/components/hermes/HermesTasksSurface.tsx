import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloseIcon, HermesIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { workbenchQueries } from "../../lib/queryOptions";
import type { HermesTask } from "@workbench/contracts";
import { hermesSourceLabels } from "../../lib/hermesPresentation";

function runtimeLabel(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

/** Live-Übersicht aller laufenden Hermes-Aufgaben, direkt abbrechbar. */
export function HermesTasksSurface({ onOpenSession }: { onOpenSession: (sessionId: string) => void }) {
  const tasks = useQuery({ ...workbenchQueries.hermesTasks(), refetchInterval: 3_000 });
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tasks.isError) return;
    setError("Die Aufgabenliste ist gerade nicht erreichbar.");
  }, [tasks.isError]);

  const cancel = async (task: HermesTask) => {
    setCancelling(task.sessionId);
    setError(null);
    try {
      await apiClient.cancelHermesTask(task.sessionId);
      await tasks.refetch();
    } catch {
      setError("Die Aufgabe konnte nicht abgebrochen werden.");
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="hermes-surface-pane" role="region" aria-label="Hermes-Aufgaben">
      {error ? <div className="hermes-chat-error" role="alert">{error}</div> : null}
      <div className="hermes-tasks-body">
        {tasks.data?.tasks.length === 0 ? (
          <div className="hermes-empty-chat"><HermesIcon className="hermes-empty-mark" /><strong>Keine laufenden Aufgaben</strong><p>Hermes arbeitet gerade an nichts. Neue Aufträge starten im Chat.</p></div>
        ) : (
          <ul className="hermes-task-list">
            {tasks.data?.tasks.map((task) => (
              <li key={task.id} className="hermes-task-card">
                <button type="button" className="hermes-task-main" onClick={() => onOpenSession(task.sessionId)} aria-label={`Aufgabe „${task.title}“ im Chat öffnen`}>
                  <span className="hermes-task-pulse" aria-hidden />
                  <span className="hermes-task-copy">
                    <strong>{task.title || "Hermes-Aufgabe"}</strong>
                    <small>{hermesSourceLabels[task.source]} · {task.model ?? "Modell unbekannt"}</small>
                  </span>
                  <time>läuft seit {runtimeLabel(task.runtimeSeconds)}</time>
                </button>
                {task.cancellable ? <button type="button" className="hermes-task-cancel" onClick={() => void cancel(task)} disabled={cancelling === task.sessionId} aria-label={`Aufgabe „${task.title}“ abbrechen`}>
                  <CloseIcon className="h-4 w-4" /> {cancelling === task.sessionId ? "Bricht ab…" : "Abbrechen"}
                </button> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
