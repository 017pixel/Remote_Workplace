import type { ReactNode } from "react";
import { Spinner } from "./primitives";

interface QueryBoundaryProps<T> {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  data?: T;
  loadingLabel?: string;
      children: (data: Exclude<T, undefined>) => ReactNode;
}

export function QueryBoundary<T>({
  isLoading,
  isError,
  error,
  data,
  loadingLabel = "Lädt…",
  children,
}: QueryBoundaryProps<T>) {
  if (isLoading && data === undefined) {
    return (
      <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted">
        <Spinner /> {loadingLabel}
      </div>
    );
  }
  if (isError) {
    const message = error instanceof Error ? error.message : "Daten konnten nicht geladen werden.";
    return (
      <div className="border-l-2 border-bad bg-bad-soft/50 px-3 py-3 text-sm text-bad">
        {message}
      </div>
    );
  }
  if (data === undefined) {
    return <div className="px-1 py-6 text-sm text-faint">Keine Daten verfügbar.</div>;
  }
  return <>{children(data as Exclude<T, undefined>)}</>;
}
