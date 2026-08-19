import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { TerminalDatabase, StoredTerminalSession } from "./database.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import { GeometryLease } from "./runtime/GeometryLease.js";
import { OutputJournal } from "./runtime/OutputJournal.js";
import { TerminalFailure, type TerminalSession } from "./session.js";

/** Baut eine laufende Session aus einem gespeicherten Datensatz wieder auf. */
export function fromStored(stored: StoredTerminalSession): TerminalSession {
  return {
    ...stored,
    pty: null,
    history: "",
    clients: new Map(),
    clientViewports: new Map(),
    primaryClientId: null,
    dataListener: null,
    exitListener: null,
    sequence: 0,
    lastPersistedAt: undefined,
    headless: null,
    journal: new OutputJournal(),
    geometry: new GeometryLease(stored.cols, stored.rows),
  };
}

/** Erkennt vorhandene tmux-Sessions eines Einzelbenutzers und legt sie als
 *  verwaltete Sessions in der Registry ab. */
export function importSupervisorSessions(userId: string, deps: {
  supervisor: TmuxSupervisor | undefined;
  database: TerminalDatabase | undefined;
  externalSessionOwnerId: string | undefined;
  defaultCwd: string;
}): void {
  const { supervisor, database, externalSessionOwnerId, defaultCwd } = deps;
  if (!supervisor || !database) return;
  if (externalSessionOwnerId !== userId) return;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const discovered of supervisor.list()) {
    // Die eigene Supervisor-Session ist technisch ebenfalls ein tmux-Pane,
    // aber keine Nutzer-Session. Ohne diesen Filter würde jeder Backend-Start
    // `wrapt-supervisor` als Terminal in die Registry importieren.
    if (!discovered.managed || database.findSessionBySupervisor(discovered.name)) continue;
    const now = Date.now();
    database.saveSession({
      id: randomUUID(),
      userId,
      runtimeId: discovered.runtimeId && uuidPattern.test(discovered.runtimeId) ? discovered.runtimeId : randomUUID(),
      kind: discovered.kind,
      mode: "agent",
      projectId: discovered.projectId,
      profilePath: null,
      supervisorName: discovered.name,
      cwd: isAbsolute(discovered.cwd) ? discovered.cwd : defaultCwd,
      pid: 0,
      cols: 120,
      rows: 32,
      status: "running",
      createdAt: discovered.createdAt || now,
      updatedAt: now,
      exitCode: null,
      exitSignal: null,
      epoch: 0,
    });
  }
}

/** Prüft ein Arbeitsverzeichnis gegen die erlaubten Wurzeln und gibt den
 *  aufgelösten, existierenden Pfad zurück. */
export async function validateCwd(value: string, allowedRoots: string[]): Promise<string> {
  let cwd: string;
  try { cwd = resolve(value); }
  catch { throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis ist ungültig."); }
  if (!allowedRoots.some((root) => {
    const pathFromRoot = relative(root, cwd);
    return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
  })) throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis liegt außerhalb der erlaubten Bereiche.");
  let details;
  try { details = await stat(cwd); }
  catch { throw new TerminalFailure("CWD_NOT_FOUND", "Das Arbeitsverzeichnis wurde nicht gefunden."); }
  if (!details.isDirectory()) throw new TerminalFailure("CWD_NOT_DIRECTORY", "Der angegebene Pfad ist kein Verzeichnis.");
  return cwd;
}
