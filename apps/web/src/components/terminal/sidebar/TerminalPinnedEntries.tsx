import type { MouseEvent } from "react";
import type { TerminalEntry, TerminalSession } from "@wrapt/contracts";
import { PinIcon, TerminalIcon } from "../../icons";
import type { TerminalMeta } from "../terminal-types";
import type { RowHandlers } from "./useTerminalDnd";

interface TerminalPinnedEntriesProps {
  entries: TerminalEntry[];
  meta: Record<string, TerminalMeta>;
  sessions: TerminalSession[];
  createRowHandlers(kind: "entry", id: string, label: string): RowHandlers;
  cwdForEntry(entry: TerminalEntry): string | null;
  onContextMenu(event: MouseEvent<HTMLDivElement>, entryId: string): void;
  onOpenEntry(runtimeId: string): void;
  onHoverStart(entryId: string, anchor: HTMLElement): void;
  onHoverEnd(entryId: string): void;
}

export function TerminalPinnedEntries({ entries, meta, sessions, createRowHandlers, cwdForEntry, onContextMenu, onOpenEntry, onHoverStart, onHoverEnd }: TerminalPinnedEntriesProps) {
  return (
    <div className="terminal-sidebar-section" data-dnd="pins">
      <div className="terminal-sidebar-heading">Gepinnt</div>
      <ul className="terminal-tree">
        {entries.map((entry) => {
          const cwd = cwdForEntry(entry);
          const runtimeStatus = entry.runtimeId ? (meta[entry.runtimeId]?.status ?? (sessions.some((session) => session.runtimeId === entry.runtimeId) ? "connected" : "disconnected")) : "disconnected";
          return (
            <li key={entry.id} className="terminal-tree-entry">
              <div
                data-dnd={`entry:${entry.id}`}
                className="terminal-tree-row is-entry is-pinned-row"
                {...createRowHandlers("entry", entry.id, entry.name)}
                onContextMenu={(event) => { event.preventDefault(); onContextMenu(event, entry.id); }}
                onMouseEnter={(event) => onHoverStart(entry.id, event.currentTarget)}
                onMouseLeave={() => onHoverEnd(entry.id)}
                onClick={() => entry.runtimeId && onOpenEntry(entry.runtimeId)}
              >
                <span className={`terminal-tree-status is-${runtimeStatus}`} aria-hidden />
                <span className="terminal-tree-icon"><TerminalIcon className="h-4 w-4" /></span>
                <span className="terminal-tree-label-wrap"><span className="terminal-tree-label">{entry.name}</span>{cwd?.startsWith("/") ? <span className="terminal-tree-cwd" title={cwd}>{cwd}</span> : null}</span>
                <PinIcon className="terminal-tree-pin h-3 w-3" aria-label="Gepinnt" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
