// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@workbench/contracts";
import { ProjectPicker } from "./ProjectPicker";

const projects = [
  {
    id: "eins", name: "Projekt Eins", description: "Eins", path: "/tmp/eins", enabled: true, sortOrder: 1,
    availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [], links: { t3Code: null, codeServer: "https://editor.example" },
  },
  {
    id: "zwei", name: "Projekt Zwei", description: "Zwei", path: "/tmp/zwei", enabled: true, sortOrder: 2,
    availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [], links: { t3Code: null, codeServer: "https://editor.example" },
  },
] satisfies Project[];

afterEach(cleanup);

describe("ProjectPicker", () => {
  it("renders the menu in a body portal and selects a project", () => {
    const onChange = vi.fn();
    const { container } = render(<ProjectPicker projects={projects} value="eins" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Projektliste öffnen" }));
    const menu = screen.getByRole("listbox").closest(".project-picker-popover");
    expect(menu?.closest("[data-base-ui-portal]")?.parentElement).toBe(document.body);
    expect(container.querySelector(".project-picker-popover")).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /Projekt Zwei/i }));
    expect(onChange).toHaveBeenCalledWith("zwei");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes with Escape and restores focus to the trigger", () => {
    render(<ProjectPicker projects={projects} value="eins" onChange={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "Projektliste öffnen" });
    const input = screen.getByRole("combobox", { name: "Projekt" });
    input.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("keeps arrow-key selection working inside the portal", () => {
    const onChange = vi.fn();
    render(<ProjectPicker projects={projects} value="eins" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Projekt" });
    fireEvent.click(screen.getByRole("button", { name: "Projektliste öffnen" }));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("zwei");
  });
});
