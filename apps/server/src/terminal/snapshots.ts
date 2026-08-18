import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { HISTORY_LIMIT, SNAPSHOT_LIMIT, type TerminalSession } from "./session.js";

export function limitHistory(history: string): string {
  return history.length <= HISTORY_LIMIT ? history : history.slice(history.length - HISTORY_LIMIT).replace(/^[^\n]*\n/, "");
}

/** Kürzt die History für den Snapshot auf den schlanken Anzeigeumfang. */
export function snapshotHistory(history: string): string {
  return history.length <= SNAPSHOT_LIMIT ? history : history.slice(history.length - SNAPSHOT_LIMIT).replace(/^[^\n]*\n/, "");
}

/** True, wenn die Pane gerade den Alternate Screen (Fullscreen-TUI) nutzt. */
export function isAlternateScreen(session: TerminalSession, supervisor: TmuxSupervisor | undefined): boolean {
  if (!supervisor || !session.supervisorName || !supervisor.has(session.supervisorName)) return false;
  try { return supervisor.isAlternate?.(session.supervisorName) ?? false; }
  catch { return false; }
}

/**
 * tmux kennt den tatsächlich gerenderten Pane-Inhalt. Für Reconnects ist
 * dieser Zustand wesentlich robuster als ein beliebiger Ausschnitt aus dem
 * rohen ANSI-Bytestrom, besonders bei OpenCode, Codex und Claude Code.
 */
export function snapshotForClient(session: TerminalSession, supervisor: TmuxSupervisor | undefined): string {
  if (supervisor && session.supervisorName && supervisor.has(session.supervisorName)) {
    try { return snapshotHistory(supervisor.capture(session.supervisorName)); }
    catch { /* Fallback auf den lokalen ANSI-Verlauf. */ }
  }
  return snapshotHistory(session.history);
}

/** Erzeugt einen geometrie-treuen Snapshot für genau einen Client. */
export function snapshotMessage(session: TerminalSession, clientId: string, supervisor: TmuxSupervisor | undefined): ServerTerminalMessage {
  return {
    type: "terminal.snapshot",
    sessionId: session.id,
    runtimeId: session.runtimeId,
    kind: session.kind,
    status: session.status,
    projectId: session.projectId,
    cwd: session.cwd,
    history: snapshotForClient(session, supervisor),
    sequence: session.sequence,
    cols: session.cols,
    rows: session.rows,
    ownsGeometry: session.primaryClientId === clientId,
    alternate: isAlternateScreen(session, supervisor),
  };
}

export function broadcastSnapshot(session: TerminalSession, supervisor: TmuxSupervisor | undefined): void {
  for (const [clientId, client] of session.clients) client(snapshotMessage(session, clientId, supervisor));
}

/** Verteilt die gemeinsame Geometrie an alle Clients. Der Primary bekommt
 *  `ownsGeometry`, damit er sich auf sein eigenes Fenster anpasst; die
 *  übrigen Clients übernehmen das gemeinsame Raster unverändert. */
export function announceGeometry(session: TerminalSession): void {
  for (const [clientId, client] of session.clients) {
    client({ type: "terminal.geometry", sessionId: session.id, cols: session.cols, rows: session.rows, ownsGeometry: session.primaryClientId === clientId });
  }
}

/** Resized die PTY nur bei echter Geometrieänderung und meldet sie zurück. */
export function applyResize(session: TerminalSession, cols: number, rows: number, persist: (session: TerminalSession) => void): void {
  // Kein Ping-Pong: Nur eine echte Geometrieänderung resize die PTY und
  // meldet sie zurück. Sonst würde jede identische Resize-Meldung erneut
  // verteilt und vom Client wieder beantwortet werden (Endlosschleife).
  if (session.cols === cols && session.rows === rows) return;
  session.pty?.resize(cols, rows);
  session.cols = cols;
  session.rows = rows;
  session.updatedAt = Date.now();
  persist(session);
  announceGeometry(session);
}
