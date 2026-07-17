import { describe, expect, it } from "vitest";
import { parseOrbitTodo, serializeOrbitTodo } from "./orbitTodo";

describe("Orbit todo documents", () => {
  it("round-trips checked and editable tasks", () => {
    const items = [{ id: "one", text: "Persistente Aufgabe", done: true }];
    expect(parseOrbitTodo(serializeOrbitTodo(items))).toEqual(items);
  });

  it("converts legacy line content without losing tasks", () => {
    expect(parseOrbitTodo("- Erste Aufgabe\nZweite Aufgabe")).toEqual([
      { id: "legacy-0", text: "Erste Aufgabe", done: false },
      { id: "legacy-1", text: "Zweite Aufgabe", done: false },
    ]);
  });
});

