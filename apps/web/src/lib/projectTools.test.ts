import { describe, expect, it } from "vitest";
import type { Project } from "@wrapt/contracts";
import { projectToolOptions } from "./projectTools";

const project = (overrides: Partial<Project> = {}): Project => ({
  id: "demo",
  name: "Demo",
  description: "",
  path: "/tmp/demo",
  enabled: true,
  sortOrder: 1,
  availability: "available",
  activity: {
    lastWorkbenchUseAt: null,
    lastFilesystemChangeAt: null,
    lastGitCommitAt: null,
    effectiveAt: null,
  },
  previews: [],
  links: { t3Code: null, codeServer: null },
  ...overrides,
});

describe("projectToolOptions", () => {
  it("zeigt alle projektgebundenen Workbench-Werkzeuge und konfigurierte Previews", () => {
    const options = projectToolOptions(project({
      links: { t3Code: "https://t3.example.test", codeServer: "https://editor.example.test" },
      previews: [{
        id: "frontend",
        name: "Frontend",
        url: null,
        targetPort: 5173,
        path: "/",
        mode: "hybrid",
        runtime: "iframe",
        dependencies: [],
      }],
    }));

    expect(options.map((option) => option.type)).toEqual([
      "t3-code",
      "code-server",
      "preview",
      "terminal",
      "opencode",
      "codex",
      "browser",
      "files",
      "preview",
    ]);
    expect(options.at(-1)).toMatchObject({ id: "preview:frontend", label: "Frontend", previewId: "frontend" });
    expect(options[2]).toMatchObject({ id: "preview-runtime", label: "Projektlaufzeit" });
    expect(options[2]).not.toHaveProperty("previewId");
  });

  it("blendet nicht verfügbare Server-Werkzeuge aus, behält aber lokale Werkzeuge", () => {
    expect(projectToolOptions(project()).map((option) => option.type)).toEqual([
      "preview",
      "terminal",
      "opencode",
      "codex",
      "browser",
      "files",
    ]);
  });
});
