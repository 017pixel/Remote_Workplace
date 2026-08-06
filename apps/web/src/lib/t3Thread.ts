/**
 * Extrahiert die T3-Thread-ID aus einem T3-Routenpfad. Die Thread-Route liegt
 * unter dem `/_chat`-Layout (`/_chat/<environmentId>/<threadId>`); ältere
 * Pfade ohne Layoutsegment werden als `<environmentId>/<threadId>` gelesen.
 */
export function t3ThreadIdFromPath(path: string): string | null {
  const segments = (path.split("?")[0] ?? "").split("/").filter(Boolean);
  if (segments[0] === "_chat") return segments[2] ?? null;
  return segments.length >= 2 ? segments[1] ?? null : null;
}
