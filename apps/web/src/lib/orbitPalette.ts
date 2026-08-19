/**
 * Verlustfreier Kanal für „zum Orbit hinzufügen"-Anfragen (Sidebar, Projekt-
 * Dialoge, Dateimanager). Das `orbit:add`-Window-Event geht verloren, wenn es
 * ausgelöst wird, bevor die Orbit-Workbench gemountet ist (z. B. Klick in die
 * Sidebar direkt nach dem Laden der Seite). Deshalb wird jede Anfrage zusätzlich
 * in einer sessionStorage-Queue abgelegt; die Workbench konsumiert sie nach dem
 * Mount und entfernt synchron verarbeitete Einträge aus der Queue, damit es
 * keine doppelten Knoten gibt.
 */

export interface OrbitPalettePayload {
  type: "project" | "tool" | "previewGroup" | "note" | "todo" | "snippet" | "file" | "frame" | "usage" | "gallery" | "fileGallery" | "hermesStatus" | "hermesTasks" | "hermesCron" | "hermesResults";
  title: string;
  projectId?: string;
  toolType?: "t3-code" | "code-server" | "preview" | "browser" | "terminal" | "codex" | "opencode" | "files" | "hermes";
  provider?: "codex" | "opencode" | "claude";
  previewId?: string;
  layout?: "1" | "2" | "3" | "6";
  targetPort?: number;
  referenceId?: string;
}

const ORBIT_PALETTE_QUEUE_KEY = "wrapt-orbit-palette-queue";
const ORBIT_PALETTE_QUEUE_MAX = 20;

export function queueOrbitPayload(payload: OrbitPalettePayload): void {
  try {
    const queued = JSON.parse(window.sessionStorage.getItem(ORBIT_PALETTE_QUEUE_KEY) ?? "[]") as unknown;
    const items = Array.isArray(queued) ? queued : [];
    items.push(payload);
    while (items.length > ORBIT_PALETTE_QUEUE_MAX) items.shift();
    window.sessionStorage.setItem(ORBIT_PALETTE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // sessionStorage kann voll oder gesperrt sein; dann bleibt das Event der Kanal.
  }
}

export function dequeueOrbitPayload(payload: OrbitPalettePayload): void {
  try {
    const queued = JSON.parse(window.sessionStorage.getItem(ORBIT_PALETTE_QUEUE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(queued)) return;
    const serialized = JSON.stringify(payload);
    const index = queued.findIndex((item) => JSON.stringify(item) === serialized);
    if (index === -1) return;
    queued.splice(index, 1);
    window.sessionStorage.setItem(ORBIT_PALETTE_QUEUE_KEY, JSON.stringify(queued));
  } catch {
    // Best Effort: Ein verbliebener Eintrag würde höchstens einen Knoten doppelt anlegen.
  }
}

export function consumeOrbitPayloads(): OrbitPalettePayload[] {
  try {
    const queued = JSON.parse(window.sessionStorage.getItem(ORBIT_PALETTE_QUEUE_KEY) ?? "[]") as unknown;
    window.sessionStorage.removeItem(ORBIT_PALETTE_QUEUE_KEY);
    if (!Array.isArray(queued)) return [];
    return queued.filter((item): item is OrbitPalettePayload =>
      typeof item === "object" && item !== null &&
      typeof (item as OrbitPalettePayload).type === "string" &&
      typeof (item as OrbitPalettePayload).title === "string",
    );
  } catch {
    return [];
  }
}

/** Anfrage absetzen: Event (für die geladene Workbench) plus Queue (Backup). */
export function requestOrbitNode(payload: OrbitPalettePayload): void {
  window.dispatchEvent(new CustomEvent<OrbitPalettePayload>("orbit:add", { detail: payload }));
  queueOrbitPayload(payload);
}
