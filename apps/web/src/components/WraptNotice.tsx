import { WarningIcon } from "./icons";
import { useWraptNotice } from "../stores/wraptNotice";

/** Blendet die globale Kurzmeldung aus `useWraptNotice` ein (F04-05). */
export function WraptNotice() {
  const message = useWraptNotice((state) => state.message);
  if (!message) return null;
  return (
    <div className="workbench-notice" role="status" aria-live="polite">
      <WarningIcon className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}
