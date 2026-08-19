export interface JournalEntry {
  sequence: number;
  data: string;
}

/**
 * Begrenzter Ringpuffer der jüngsten Output-Deltas einer Runtime. Ermöglicht
 * den Fast Reconnect: Weiß ein Client, dass er Sequenz N besitzt, und sind
 * alle Deltas ab N+1 noch da, wird ohne vollen Snapshot nachgeliefert.
 */
export class OutputJournal {
  private readonly entries: JournalEntry[] = [];
  private bytes = 0;

  constructor(
    private readonly maxEntries = 400,
    private readonly maxBytes = 2 * 1024 * 1024,
  ) {}

  get size(): number { return this.entries.length; }

  push(entry: JournalEntry): void {
    this.entries.push(entry);
    this.bytes += entry.data.length;
    while (this.entries.length > this.maxEntries || (this.bytes > this.maxBytes && this.entries.length > 1)) {
      const oldest = this.entries.shift();
      if (oldest) this.bytes -= oldest.data.length;
    }
  }

  /** Liefert alle Deltas ab `fromSequence + 1`, oder `null`, wenn eine Lücke
   *  besteht beziehungsweise der älteste Eintrag jünger ist. */
  deltasAfter(lastSequence: number): JournalEntry[] | null {
    if (this.entries.length === 0) return [];
    const first = this.entries[0]!;
    const last = this.entries[this.entries.length - 1]!;
    if (lastSequence === last.sequence) return [];
    // Behauptet der Client einen Stand, der jünger ist als das Journal kennt,
    // ist sein Zustand unsicher — voller Snapshot statt best effort.
    if (lastSequence > last.sequence) return null;
    if (lastSequence + 1 < first.sequence) return null;
    const startIndex = lastSequence + 1 - first.sequence;
    const result = this.entries.slice(startIndex);
    // Der erste Eintrag muss exakt an den Client-Stand anschließen und alle
    // Einträge müssen lückenlos aufeinander folgen.
    if (result[0]!.sequence !== lastSequence + 1) return null;
    for (let index = 1; index < result.length; index += 1) {
      if (result[index]!.sequence !== result[index - 1]!.sequence + 1) return null;
    }
    return result;
  }

  clear(): void {
    this.entries.length = 0;
    this.bytes = 0;
  }
}
