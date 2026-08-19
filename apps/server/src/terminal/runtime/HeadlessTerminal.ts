import { createRequire } from "node:module";
import type * as HeadlessModule from "@xterm/headless";
import type * as SerializeModule from "@xterm/addon-serialize";
import type { Terminal as BrowserTerminal } from "@xterm/xterm";

// @xterm/headless und @xterm/addon-serialize sind CommonJS-Bundles ohne
// benannte ESM-Exports. Der createRequire-Weg lädt sie zuverlässig im
// ESM-Server und behält die Typen aus ihren .d.ts-Dateien.
const require = createRequire(import.meta.url);
const { Terminal } = require("@xterm/headless") as typeof HeadlessModule;
const { SerializeAddon } = require("@xterm/addon-serialize") as typeof SerializeModule;

export interface HeadlessSnapshot {
  /** ANSI-Daten, die ein gleich großes Browser-xterm exakt reproduziert. */
  serialized: string;
  cols: number;
  rows: number;
  /** True, wenn der Alternate Screen (Fullscreen-TUI) aktiv ist. */
  alternate: boolean;
  /** True, wenn die Anwendung Maus-Reporting aktiviert hat. */
  mouseTracking: boolean;
}

/**
 * Hält den autoritativen Terminalzustand einer Runtime auf dem Server. Jedes
 * Byte aus der PTY fließt hier zuerst hinein. Reconnect-Clients bekommen den
 * serialisierten Zustand plus Deltas — nie einen rohen History-Ausschnitt.
 */
export class HeadlessTerminal {
  private readonly terminal: InstanceType<typeof Terminal>;
  private readonly serialize: InstanceType<typeof SerializeAddon>;
  private parsed = 0;
  private submitted = 0;

  constructor(cols: number, rows: number) {
    this.terminal = new Terminal({
      cols,
      rows,
      scrollback: 10_000,
      // buffer, modes und serialize nutzen die experimentelle API.
      allowProposedApi: true,
    });
    this.serialize = new SerializeAddon();
    // Das Serialize-Addon ist gegen das Browser-xterm typisiert; der Headless-
    // Terminal ist strukturell ausreichend (buffer, modes, options).
    this.serialize.activate(this.terminal as unknown as BrowserTerminal);
  }

  get cols(): number { return this.terminal.cols; }
  get rows(): number { return this.terminal.rows; }
  get alternate(): boolean { return this.terminal.buffer.active.type === "alternate"; }
  get mouseTracking(): boolean { return this.terminal.modes.mouseTrackingMode !== "none"; }

  /** Anzahl der bereits vollständig geparsten Schreibvorgänge. Ein Snapshot
   *  mit dieser Sequenz enthält garantiert genau diesen Zustand — xterm 6
   *  puffert `write` asynchron. */
  get parsedCount(): number { return this.parsed; }

  write(data: string): void {
    const sequence = ++this.submitted;
    this.terminal.write(data, () => { this.parsed = sequence; });
  }

  resize(cols: number, rows: number): void { this.terminal.resize(cols, rows); }

  reset(): void {
    this.terminal.reset();
    this.parsed = this.submitted;
  }

  /** Serialisiert den kompletten Terminalzustand inklusive Cursor. */
  snapshot(): HeadlessSnapshot {
    return {
      serialized: this.serialize.serialize(),
      cols: this.terminal.cols,
      rows: this.terminal.rows,
      alternate: this.alternate,
      mouseTracking: this.mouseTracking,
    };
  }
}

/** Erstellt einen Headless-Terminal mit sicheren Standard-Geometrien. */
export function createHeadlessTerminal(cols: number, rows: number): HeadlessTerminal {
  const safeCols = Math.max(2, Math.min(500, Math.trunc(cols || 120)));
  const safeRows = Math.max(1, Math.min(300, Math.trunc(rows || 30)));
  return new HeadlessTerminal(safeCols, safeRows);
}
