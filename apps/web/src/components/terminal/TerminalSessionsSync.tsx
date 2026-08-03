import { useQuery } from "@tanstack/react-query";
import { workbenchQueries } from "../../lib/queryOptions";
import { useTerminalStore } from "../../stores/terminals";

/** Ein gemeinsamer Poller versorgt alle Terminalbereiche mit demselben Snapshot. */
export function TerminalSessionsSync() {
  const hasTerminalTabs = useTerminalStore((state) => Object.values(state.areas).some((area) => area.tabs.length > 0));
  useQuery({ ...workbenchQueries.terminalSessions(), enabled: hasTerminalTabs });
  return null;
}
