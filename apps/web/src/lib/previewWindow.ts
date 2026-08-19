// Preview-Gruppen lassen sich als eigenständiges Browserfenster öffnen: alle
// Slots nebeneinander, ohne Workbench-Navigation, damit sich Geräte direkt
// vergleichen lassen.
export function previewGroupWindowUrl(groupId: string, origin = window.location.origin): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return new URL(`${base}/previews/fenster/${encodeURIComponent(groupId)}`, origin).toString();
}

export function previewGroupSnapshotKey(groupId: string): string {
  return `wrapt:preview-group-snapshot:${groupId}`;
}

export function openPreviewGroupWindow(groupId: string, document?: unknown): void {
  if (document !== undefined) {
    try { window.localStorage.setItem(previewGroupSnapshotKey(groupId), JSON.stringify({ document, savedAt: Date.now() })); } catch { /* Serverzustand bleibt der Fallback. */ }
  }
  const width = Math.max(640, Math.round(window.screen.availWidth || 1_280));
  const height = Math.max(480, Math.round(window.screen.availHeight || 800));
  const features = `popup=yes,noopener=yes,noreferrer=yes,width=${width},height=${height},left=0,top=0`;
  const opened = window.open(previewGroupWindowUrl(groupId), `wrapt-preview-${groupId}`, features);
  // Blockiert der Browser Popups, bleibt der Tab-Fallback als sichtbarer Weg.
  if (!opened) window.open(previewGroupWindowUrl(groupId), "_blank", "noopener,noreferrer");
}
