import { describe, expect, it } from "vitest";
import { projectBoundCodeServerProxyUrl, projectBoundCodeServerUrl } from "./ToolPanel";

describe("project-bound code-server URLs", () => {
  it("always includes the validated project folder", () => {
    const path = "/home/bbecker/projects/Remote_Workplace";
    expect(projectBoundCodeServerProxyUrl(path)).toBe("/editor/?folder=%2Fhome%2Fbbecker%2Fprojects%2FRemote_Workplace");
    expect(projectBoundCodeServerUrl("https://server.example/editor/", path)).toBe("https://server.example/editor/?folder=%2Fhome%2Fbbecker%2Fprojects%2FRemote_Workplace");
  });
});

