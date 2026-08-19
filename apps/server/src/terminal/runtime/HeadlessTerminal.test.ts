import { describe, expect, it } from "vitest";
import { createHeadlessTerminal } from "./HeadlessTerminal.js";

function waitForParse(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe("HeadlessTerminal", () => {
  it("parst Output asynchron und serialisiert den geparsten Stand", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    terminal.write("zeile eins\r\nzeile zwei");
    await waitForParse();
    const snapshot = terminal.snapshot();
    expect(snapshot.serialized).toContain("zeile eins");
    expect(snapshot.serialized).toContain("zeile zwei");
    expect(snapshot.cols).toBe(20);
    expect(snapshot.rows).toBe(5);
    expect(snapshot.alternate).toBe(false);
  });

  it("erkennt den Alternate Screen und Maus-Reporting aus echten Sequenzen", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    terminal.write("\x1b[?1049hfullscreen");
    terminal.write("\x1b[?1000h");
    await waitForParse();
    const snapshot = terminal.snapshot();
    expect(snapshot.alternate).toBe(true);
    expect(snapshot.mouseTracking).toBe(true);
  });

  it("setzt den Zustand bei reset zurück und lässt den Epoch-Wechsel zu", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    terminal.write("alt");
    await waitForParse();
    expect(terminal.snapshot().serialized).toContain("alt");
    terminal.reset();
    expect(terminal.snapshot().serialized).not.toContain("alt");
  });

  it("zählt die geparsten Schreibvorgänge für die Snapshot-Sequenz", async () => {
    const terminal = createHeadlessTerminal(20, 5);
    expect(terminal.parsedCount).toBe(0);
    terminal.write("a");
    terminal.write("b");
    await waitForParse();
    expect(terminal.parsedCount).toBe(2);
  });

  it("behält die Geometrie beim resize", async () => {
    const terminal = createHeadlessTerminal(80, 24);
    terminal.resize(120, 40);
    expect(terminal.snapshot()).toMatchObject({ cols: 120, rows: 40 });
  });

  it("normalisiert gefährliche Geometrie-Eingaben", () => {
    const terminal = createHeadlessTerminal(0, -3);
    expect(terminal.cols).toBeGreaterThanOrEqual(2);
    expect(terminal.rows).toBeGreaterThanOrEqual(1);
  });
});
