import { CheckIcon, LoaderIcon, WarningIcon } from "../icons";
import { formatClockTime, type AutosaveState } from "../../lib/skillEditor";

/**
 * Statt eines Speichern-Knopfes: der Badge sagt jederzeit, ob der Stand auf dem
 * Server liegt. „Erneut versuchen" erscheint nur, wenn wirklich etwas offen ist.
 */
export function AutosaveStatus({ state, onRetry }: { state: AutosaveState; onRetry: () => void }) {
  if (state.kind === "saving") {
    return <span className="skill-save-badge is-working" role="status"><LoaderIcon className="h-3 w-3 animate-spin" aria-hidden /> Speichert…</span>;
  }
  if (state.kind === "dirty") {
    return <span className="skill-save-badge is-pending" role="status">Nicht gespeichert</span>;
  }
  if (state.kind === "conflict") {
    return <span className="skill-save-badge is-bad" role="status"><WarningIcon className="h-3 w-3" aria-hidden /> Extern geändert</span>;
  }
  if (state.kind === "error") {
    return (
      <span className="skill-save-badge is-bad" role="alert">
        <WarningIcon className="h-3 w-3" aria-hidden /> Nicht gespeichert
        <button type="button" onClick={onRetry}>Erneut versuchen</button>
      </span>
    );
  }
  return (
    <span className="skill-save-badge is-ok" role="status">
      <CheckIcon className="h-3 w-3" aria-hidden /> Gespeichert{state.at ? ` ${formatClockTime(state.at)}` : ""}
    </span>
  );
}
