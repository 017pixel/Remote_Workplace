// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HermesSurfaceNav } from "./HermesSurfaceNav";

afterEach(() => cleanup());

describe("HermesSurfaceNav", () => {
  it("bietet die nativen Flächen plus Verwaltung", () => {
    render(<HermesSurfaceNav surface="chat" onSelect={vi.fn()} />);
    for (const label of ["Chat", "Aufgaben", "Verlauf", "Cron", "Verwaltung"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("markiert die aktive Fläche und meldet Wechsel", () => {
    const onSelect = vi.fn();
    render(<HermesSurfaceNav surface="tasks" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: "Aufgaben" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Verlauf" }));
    expect(onSelect).toHaveBeenCalledWith("history");
  });

  it("rendert alle fünf Bereiche in einer gemeinsamen Navigation", () => {
    const { container } = render(<HermesSurfaceNav surface="admin" onSelect={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Hermes-Bereiche" });
    expect(nav.querySelectorAll("button")).toHaveLength(5);
    expect(container.querySelector(".hermes-surface-scroll")).toBeNull();
    expect(screen.getByRole("button", { name: "Verwaltung" }).classList.contains("is-admin")).toBe(true);
  });
});
