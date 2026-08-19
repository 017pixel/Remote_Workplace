import { describe, expect, it } from "vitest";
import { OutputJournal } from "./OutputJournal.js";

describe("OutputJournal", () => {
  it("liefert Deltas ab einer bekannten Sequenz für den Fast Reconnect", () => {
    const journal = new OutputJournal();
    journal.push({ sequence: 1, data: "a" });
    journal.push({ sequence: 2, data: "b" });
    journal.push({ sequence: 3, data: "c" });

    expect(journal.deltasAfter(1)).toEqual([{ sequence: 2, data: "b" }, { sequence: 3, data: "c" }]);
    expect(journal.deltasAfter(3)).toEqual([]);
  });

  it("meldet eine Lücke, wenn der älteste Eintrag jünger ist als der Client-Stand", () => {
    const journal = new OutputJournal();
    journal.push({ sequence: 5, data: "e" });
    journal.push({ sequence: 6, data: "f" });

    expect(journal.deltasAfter(3)).toBeNull();
  });

  it("meldet eine Lücke, wenn Sequenzen nicht zusammenhängen", () => {
    const journal = new OutputJournal();
    journal.push({ sequence: 1, data: "a" });
    journal.push({ sequence: 3, data: "c" });

    expect(journal.deltasAfter(1)).toBeNull();
  });

  it("wirft alte Einträge ab, sobald das Limit erreicht ist", () => {
    const journal = new OutputJournal(3, 1_024);
    journal.push({ sequence: 1, data: "a" });
    journal.push({ sequence: 2, data: "b" });
    journal.push({ sequence: 3, data: "c" });
    journal.push({ sequence: 4, data: "d" });

    // Eintrag 1 wurde verworfen: Ein Client auf Stand 0 hat eine Lücke,
    // ein Client auf Stand 1 bekommt den lückenlosen Rest.
    expect(journal.deltasAfter(0)).toBeNull();
    expect(journal.deltasAfter(1)).toEqual([
      { sequence: 2, data: "b" },
      { sequence: 3, data: "c" },
      { sequence: 4, data: "d" },
    ]);
  });

  it("begrenzt den Speicher über die maximale Bytezahl", () => {
    const journal = new OutputJournal(100, 6);
    journal.push({ sequence: 1, data: "aaaa" });
    journal.push({ sequence: 2, data: "bbbb" });
    journal.push({ sequence: 3, data: "cccc" });

    // Nur die letzten beiden Einträge passen in das 6-Byte-Limit.
    expect(journal.deltasAfter(1)).toBeNull();
    expect(journal.deltasAfter(2)).toEqual([{ sequence: 3, data: "cccc" }]);
  });

  it("lässt sich zurücksetzen", () => {
    const journal = new OutputJournal();
    journal.push({ sequence: 1, data: "a" });
    journal.clear();
    expect(journal.deltasAfter(0)).toEqual([]);
    expect(journal.size).toBe(0);
  });
});
