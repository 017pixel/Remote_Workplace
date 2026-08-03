// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { elementContainsEventTarget } from "./domEvents";

describe("elementContainsEventTarget", () => {
  it("erkennt ein enthaltenes DOM-Ziel", () => {
    const element = document.createElement("div");
    const child = document.createElement("span");
    element.append(child);

    expect(elementContainsEventTarget(element, child)).toBe(true);
  });

  it("behandelt Ziele außerhalb des Elements als nicht enthalten", () => {
    const element = document.createElement("div");
    const outside = document.createElement("span");

    expect(elementContainsEventTarget(element, outside)).toBe(false);
    expect(elementContainsEventTarget(element, null)).toBe(false);
  });

  it("übergibt ein Window nicht an Node.contains", () => {
    const element = document.createElement("div");

    expect(() => elementContainsEventTarget(element, window)).not.toThrow();
    expect(elementContainsEventTarget(element, window)).toBe(false);
  });
});
