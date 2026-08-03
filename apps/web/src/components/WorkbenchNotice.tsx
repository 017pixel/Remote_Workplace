import { WarningIcon } from "./icons";
import { useWorkbenchNotice } from "../stores/workbenchNotice";

/** Blendet die globale Kurzmeldung aus `useWorkbenchNotice` ein (F04-05). */
export function WorkbenchNotice() {
  const message = useWorkbenchNotice((state) => state.message);
  if (!message) return null;
  return (
    <div className="workbench-notice" role="status" aria-live="polite">
      <WarningIcon className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}
