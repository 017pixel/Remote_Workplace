export interface ClientViewport { cols: number; rows: number; }

/**
 * Deterministische Geometrie-Eigentümerschaft einer Runtime. Eine PTY besitzt
 * immer genau eine cols/rows-Geometrie. Der Owner wechselt ausschließlich bei
 * echter Nutzerinteraktion (`takeControl`) oder beim Trennen (`release`).
 * Ein ResizeObserver oder Snapshot-Empfang übernimmt nie den Owner.
 */
export class GeometryLease {
  private readonly viewports = new Map<string, ClientViewport>();
  private cols: number;
  private rows: number;
  private ownerId: string | null;

  constructor(cols: number, rows: number, ownerId: string | null = null) {
    this.cols = cols;
    this.rows = rows;
    this.ownerId = ownerId;
  }

  get canonicalCols(): number { return this.cols; }
  get canonicalRows(): number { return this.rows; }
  get owner(): string | null { return this.ownerId; }

  recordViewport(clientId: string, cols: number, rows: number): void {
    this.viewports.set(clientId, { cols, rows });
  }

  remove(clientId: string): void {
    this.viewports.delete(clientId);
  }

  viewportOf(clientId: string): ClientViewport | undefined {
    return this.viewports.get(clientId);
  }

  /** Meldet einen lokalen Wunsch-Viewport. Übernimmt die Geometrie nur, wenn
   *  dieser Client bereits Owner ist — ein ResizeObserver wird nie Owner. */
  handleResize(cols: number, rows: number, clientId: string): { cols: number; rows: number } | null {
    this.recordViewport(clientId, cols, rows);
    if (this.ownerId !== clientId) return null;
    if (this.cols === cols && this.rows === rows) return null;
    this.cols = cols;
    this.rows = rows;
    return { cols, rows };
  }

  /** Echte Nutzerinteraktion: übernimmt den Owner und wendet den Viewport an. */
  takeControl(cols: number | undefined, rows: number | undefined, clientId: string): { cols: number; rows: number } | null {
    this.ownerId = clientId;
    const viewport = cols !== undefined && rows !== undefined
      ? { cols, rows }
      : this.viewports.get(clientId);
    if (!viewport) return null;
    if (this.cols === viewport.cols && this.rows === viewport.rows) return null;
    this.cols = viewport.cols;
    this.rows = viewport.rows;
    return { cols: viewport.cols, rows: viewport.rows };
  }

  /** Owner getrennt: übergibt an den nächsten verbundenen Client. */
  release(clientId: string): { cols: number; rows: number } | null {
    this.viewports.delete(clientId);
    if (this.ownerId !== clientId) return null;
    const next = this.viewports.keys().next().value as string | undefined;
    this.ownerId = next ?? null;
    if (next === undefined) return null;
    const viewport = this.viewports.get(next);
    if (!viewport || (this.cols === viewport.cols && this.rows === viewport.rows)) return null;
    this.cols = viewport.cols;
    this.rows = viewport.rows;
    return { cols: viewport.cols, rows: viewport.rows };
  }
}
