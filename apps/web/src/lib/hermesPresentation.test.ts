import { describe, expect, it } from "vitest";
import { hermesSourceLabels } from "./hermesPresentation";

describe("Hermes-Quellen", () => {
  it("liefert lesbare Bezeichnungen für Session-Quellen", () => {
    expect(hermesSourceLabels.acp).toBe("Chat");
  });
});
