// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkillEditorFile, SkillEditorTreeResponse } from "@wrapt/contracts";
import { SkillTree } from "./SkillTree";

function file(path: string, name: string, overrides: Partial<SkillEditorFile> = {}): SkillEditorFile {
  return { name, path, kind: "file", sizeBytes: 12, modifiedAt: "2026-01-01T10:00:00.000Z", symlink: false, broken: false, editable: true, ...overrides };
}

const tree: SkillEditorTreeResponse = {
  rootDirectory: "/root",
  agentsFile: file("/root/AGENTS.md", "AGENTS.md"),
  skills: [
    {
      name: "alpha",
      path: "/root/skills/alpha",
      description: "Erster Skill",
      modifiedAt: "2026-01-01T10:00:00.000Z",
      symlink: true,
      broken: false,
      files: [file("/root/skills/alpha/SKILL.md", "SKILL.md"), file("/root/skills/alpha/references", "references", { kind: "directory", editable: false })],
    },
    { name: "kaputt", path: "/root/skills/kaputt", description: null, modifiedAt: null, symlink: true, broken: true, files: [] },
  ],
};

afterEach(cleanup);

function renderTree(selectedPath: string | null, handlers: Partial<Parameters<typeof SkillTree>[0]> = {}) {
  const props = {
    tree,
    selectedPath,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...handlers,
  };
  render(<SkillTree {...props} />);
  return props;
}

describe("SkillTree", () => {
  it("zeigt die globalen Regeln, die Skills und deren Beschreibung", () => {
    renderTree(null);
    expect(screen.getByText("Globale Agenten-Regeln")).toBeTruthy();
    expect(screen.getByText("Skills (2)")).toBeTruthy();
    expect(screen.getByText("Erster Skill")).toBeTruthy();
    expect(screen.getByText("Der Verweis zeigt ins Leere.")).toBeTruthy();
  });

  it("klappt einen Skill auf und meldet die gewählte Datei", () => {
    const props = renderTree(null);
    fireEvent.click(screen.getByRole("button", { name: "alpha aufklappen" }));
    fireEvent.click(screen.getByText("SKILL.md"));
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: "/root/skills/alpha/SKILL.md" }));
  });

  it("öffnet keinen Ordner als Datei", () => {
    const props = renderTree(null);
    fireEvent.click(screen.getByRole("button", { name: "alpha aufklappen" }));
    fireEvent.click(screen.getByText("references"));
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("hält den Zweig der ausgewählten Datei offen", () => {
    renderTree("/root/skills/alpha/SKILL.md");
    expect(screen.getByText("SKILL.md")).toBeTruthy();
  });

  it("kennzeichnet einen kaputten Verweis und bietet nur Löschen an", () => {
    const props = renderTree(null);
    fireEvent.click(screen.getByRole("button", { name: "kaputt aufklappen" }));
    expect(screen.getByText("Ziel nicht gefunden. Der Skill lässt sich nur noch löschen.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "kaputt löschen" }));
    expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ name: "kaputt" }));
  });

  it("meldet Umbenennen und Neuanlage", () => {
    const props = renderTree(null);
    fireEvent.click(screen.getByRole("button", { name: "alpha umbenennen" }));
    expect(props.onRename).toHaveBeenCalledWith(expect.objectContaining({ name: "alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Neuen Skill anlegen" }));
    expect(props.onCreate).toHaveBeenCalled();
  });
});
