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

    fireEvent.click(screen.getByRole("button", { name: /Projekt\s*Projekt Eins/i }));
    const menu = screen.getByRole("listbox", { name: "Projekte" }).closest(".project-picker-popover");
    expect(menu?.parentElement).toBe(document.body);
    expect(container.querySelector(".project-picker-popover")).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /Projekt Zwei/i }));
    expect(onChange).toHaveBeenCalledWith("zwei");
    expect(screen.queryByRole("listbox", { name: "Projekte" })).toBeNull();
  });

  it("closes with Escape and restores focus to the trigger", () => {
    render(<ProjectPicker projects={projects} value="eins" onChange={() => undefined} />);
    const trigger = screen.getByRole("button", { name: /Projekt\s*Projekt Eins/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Projekte" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps arrow-key selection working inside the portal", () => {
    const onChange = vi.fn();
    render(<ProjectPicker projects={projects} value="eins" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Projekt\s*Projekt Eins/i }));
    const menu = screen.getByRole("listbox", { name: "Projekte" }).closest(".project-picker-popover")!;
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("zwei");
  });

  it("groups folders from the project root and opens a manually entered path", async () => {
    const onOpenPath = vi.fn().mockResolvedValue(undefined);
    render(<ProjectPicker projects={projects} projectsRoot="/tmp" value="eins" onChange={() => undefined} onOpenPath={onOpenPath} />);

    fireEvent.click(screen.getByRole("button", { name: /Projekt\s*Projekt Eins/i }));
    expect(screen.getByRole("group", { name: "Projekte in /tmp" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Anderen Ordner öffnen"), { target: { value: "/home/test/projekt" } });
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));

    await vi.waitFor(() => expect(onOpenPath).toHaveBeenCalledWith("/home/test/projekt"));
  });
});
