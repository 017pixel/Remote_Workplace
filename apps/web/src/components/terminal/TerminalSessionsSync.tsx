import { useQuery } from "@tanstack/react-query";
import { wraptQueries } from "../../lib/queryOptions";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";

/** Ein gemeinsamer Poller versorgt alle Terminalbereiche mit demselben Snapshot. */
export function TerminalSessionsSync() {
  const hasTerminalTabs = useTerminalWorkspaceStore((state) => (state.document?.entries.length ?? 0) > 0);
  useQuery({ ...wraptQueries.terminalSessions(), enabled: hasTerminalTabs });
  return null;
}
