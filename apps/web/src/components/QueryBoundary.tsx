import type { ReactNode } from "react";
import { RefreshIcon } from "./icons";

interface QueryBoundaryProps<T> {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  data?: T;
  loadingLabel?: string;
  refetch?: () => unknown;
  children: (data: Exclude<T, undefined>) => ReactNode;
}

export function QueryBoundary<T>({
  isLoading,
  isError,
  error,
  data,
  loadingLabel = "Lädt…",
  refetch,
  children,
}: QueryBoundaryProps<T>) {
  if (isLoading && data === undefined) {
    return (
      <div className="query-skeleton" role="status" aria-live="polite" aria-label={loadingLabel}>
        <span className="query-skeleton-title" />
        <span />
        <span />
        <span className="query-skeleton-short" />
        <span className="sr-only">{loadingLabel}</span>
      </div>
    );
  }
  if (isError) {
    const message = error instanceof Error ? error.message : "Daten konnten nicht geladen werden.";
    return (
      <div className="query-error" role="alert">
        <div><strong>Daten konnten nicht geladen werden</strong><span>{message}</span></div>
        {refetch ? <button type="button" className="quiet-button" onClick={() => void refetch()}><RefreshIcon className="h-4 w-4" /> Erneut versuchen</button> : null}
      </div>
    );
  }
  if (data === undefined) {
    return <div className="px-1 py-6 text-sm text-faint">Keine Daten verfügbar.</div>;
  }
  return <>{children(data as Exclude<T, undefined>)}</>;
}
