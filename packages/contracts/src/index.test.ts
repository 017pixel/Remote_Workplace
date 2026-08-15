import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  createProjectFileRequestSchema,
  hermesClientMessageSchema,
  orbitNodeSchema,
  orbitWorkspaceSchema,
  operationalMetricsSchema,
  panelTypeSchema,
  previewLocalStorageSnapshotRequestSchema,
  skillEditorCreateRequestSchema,
  skillEditorGitResponseSchema,
  skillEditorRenameRequestSchema,
  skillEditorTreeResponseSchema,
  skillEditorWriteRequestSchema,
  terminalWorkspaceSchema,
} from "./index.js";

describe("öffentliche API-Verträge", () => {
  it("requires a correlatable error envelope", () => {
    expect(apiErrorSchema.safeParse({
      error: {
        code: "CONFLICT",
        message: "Konflikt",
        details: null,
        requestId: "request-1",
        retryable: false,
      },
    }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { code: "CONFLICT", message: "Konflikt" } }).success).toBe(false);
  });

  it("validates optimistic project-file versions", () => {
    expect(createProjectFileRequestSchema.parse({
      path: "src/app.ts",
      content: "export {};",
      overwrite: true,
      expectedVersion: "a".repeat(64),
    }).expectedVersion).toHaveLength(64);
    expect(createProjectFileRequestSchema.safeParse({
      path: "../secret",
      content: "x",
      overwrite: false,
    }).success).toBe(true);
    // Pfad-Containment bleibt eine serverseitige Dateisystemregel.
  });

  it("keeps legacy Notion nodes readable during migrations", () => {
    expect(panelTypeSchema.parse("notion")).toBe("notion");
  });

  it("validiert Hermes-Chat-Nachrichten und Orbit v8 mit alten Dokumentversionen", () => {
    expect(hermesClientMessageSchema.parse({ v: 1, type: "ping" })).toMatchObject({ type: "ping" });
    expect(orbitWorkspaceSchema.parse({ version: 6, activeBoardId: "board", focusedNodeId: null, boards: [{ id: "board", name: "Board", viewport: { x: 0, y: 0, zoom: 1 }, worldBounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 }, nodes: [], edges: [] }] }).version).toBe(6);
    expect(orbitWorkspaceSchema.parse({ version: 8, activeBoardId: "board", focusedNodeId: null, boards: [{ id: "board", name: "Board", viewport: { x: 0, y: 0, zoom: 1 }, worldBounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 }, nodes: [], edges: [] }] }).version).toBe(8);
  });

  it("hält Extension-Knoten strikt und Legacy-Knoten kompatibel", () => {
    const base = {
      id: "node-1",
      type: "note",
      title: "Notiz",
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 },
      projectId: null,
      parentId: null,
      runtimeId: null,
      toolType: null,
      previewId: null,
      provider: null,
      content: "",
      language: null,
      locked: false,
      zIndex: 0,
    };
    const legacy = orbitNodeSchema.parse(base);
    expect(legacy.extensionId).toBeNull();
    expect(legacy.state).toEqual({});

    const extension = orbitNodeSchema.parse({
      ...base,
      type: "extension",
      extensionId: "workbench.agent-tasks",
      contributionId: "workbench.agent-tasks.orbit.task-board",
      stateVersion: 3,
      state: { columns: ["offen", "fertig"] },
    });
    expect(extension.state).toEqual({ columns: ["offen", "fertig"] });

    expect(orbitNodeSchema.safeParse({ ...base, type: "extension", extensionId: "workbench.agent-tasks" }).success).toBe(false);
    expect(orbitNodeSchema.safeParse({ ...base, extensionId: "workbench.agent-tasks" }).success).toBe(false);
  });

  it("rejects oversized preview-storage values and malformed metrics", () => {
    expect(previewLocalStorageSnapshotRequestSchema.safeParse({
      baseVersion: 0,
      entries: [{ key: "x", value: "y".repeat(300_000) }],
    }).success).toBe(false);
    expect(operationalMetricsSchema.safeParse({ capturedAt: new Date().toISOString() }).success).toBe(false);
  });

  it("erzwingt Skill-Namen und Pflichtbeschreibung im Skill-Editor", () => {
    expect(skillEditorCreateRequestSchema.parse({ name: "mein-skill", description: "Beschreibung" }).name).toBe("mein-skill");
    expect(skillEditorCreateRequestSchema.safeParse({ name: "Mein Skill", description: "x" }).success).toBe(false);
    expect(skillEditorCreateRequestSchema.safeParse({ name: "skill", description: "" }).success).toBe(false);
    expect(skillEditorRenameRequestSchema.safeParse({ name: "alt", newName: "neu-2" }).success).toBe(true);
    expect(skillEditorRenameRequestSchema.safeParse({ name: "alt", newName: "../flucht" }).success).toBe(false);
  });

  it("verlangt den Erwartungswert beim Speichern und beschreibt Git-Ergebnisse vollständig", () => {
    expect(skillEditorWriteRequestSchema.safeParse({ path: "/root/AGENTS.md", content: "x" }).success).toBe(false);
    expect(skillEditorWriteRequestSchema.parse({ path: "/root/AGENTS.md", content: "x", expectedModifiedAt: null }).expectedModifiedAt).toBeNull();
    expect(skillEditorGitResponseSchema.safeParse({ committed: true, pushed: true, message: "feat: skill a hinzugefuegt", changedSkills: [{ name: "a", action: "hinzugefuegt" }], errorTail: null, notice: null }).success).toBe(true);
    expect(skillEditorGitResponseSchema.safeParse({ committed: true, pushed: true, message: null, changedSkills: [{ name: "a", action: "added" }], errorTail: null, notice: null }).success).toBe(false);
  });

  it("nimmt kaputte Verweise im Skill-Baum entgegen", () => {
    const tree = skillEditorTreeResponseSchema.parse({
      rootDirectory: "/root",
      agentsFile: null,
      skills: [{ name: "tot", path: "/root/skills/tot", description: null, modifiedAt: null, symlink: true, broken: true, files: [] }],
    });
    expect(tree.skills[0]?.broken).toBe(true);
  });

  it("migriert alte Terminal-Splits auf feste Pane-Plätze", () => {
    const first = "00000000-0000-4000-8000-000000000001";
    const second = "00000000-0000-4000-8000-000000000002";
    const parsed = terminalWorkspaceSchema.parse({
      version: 1,
      areas: {
        standalone: {
          id: "standalone",
          tabs: [
            { id: first, projectId: null, kind: "shell" },
            { id: second, projectId: null, kind: "shell" },
          ],
          activeTabId: first,
          splitTabId: second,
          splitSizes: [45, 55],
        },
      },
    });
    expect(parsed.areas.standalone).toMatchObject({ splitTabIds: [first, second] });
    expect(parsed.areas.standalone?.tabs.every((tab) => tab.initialCwd === null)).toBe(true);
  });
});
