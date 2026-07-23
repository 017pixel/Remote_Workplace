// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import type { Panel, Project } from "@workbench/contracts";
import { projectBoundCodeServerProxyUrl, projectBoundCodeServerUrl } from "./ToolPanel";
import { ToolPanel } from "./ToolPanel";

describe("project-bound code-server URLs", () => {
  it("always includes the validated project folder", () => {
    const path = "/home/user/projects/Remote_Workplace";
    expect(projectBoundCodeServerProxyUrl(path)).toBe("/editor/?folder=%2Fhome%2Fuser%2Fprojects%2FRemote_Workplace");
    expect(projectBoundCodeServerUrl("https://server.example/editor/", path)).toBe("https://server.example/editor/?folder=%2Fhome%2Fuser%2Fprojects%2FRemote_Workplace");
  });
});

describe("standalone T3 Code actions", () => {
  it("renders its actions in the topbar and keeps them available in fullscreen", async () => {
    const target = document.createElement("div");
    target.id = "topbar-tool-actions";
    document.body.append(target);
    const project = {
      id: "remote-workplace", name: "Remote Workplace", description: "Workbench", path: "/tmp/remote-workplace", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: null },
    } satisfies Project;
    const panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: true, standalone: true, actionPlacement: "topbar" }));

    await waitFor(() => expect(target.querySelector(".panel-island.is-topbar")).not.toBeNull());
    expect(target.querySelector('[aria-label="Neu laden"]')).not.toBeNull();
    expect(target.querySelector('[aria-label="In neuem Tab öffnen"]')).not.toBeNull();
    const firstFrame = screen.getByTitle("T3 Code");
    expect(firstFrame.getAttribute("allow")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Neu laden" }));
    await waitFor(() => expect(screen.getByTitle("T3 Code")).not.toBe(firstFrame));
    fireEvent.click(screen.getByRole("button", { name: "Vollbild" }));
    expect(target.querySelector(".panel-island")).toBeNull();
    expect(screen.getByRole("button", { name: "Wiederherstellen" })).not.toBeNull();
    expect(document.querySelector(".tool-surface-maximized .panel-island.is-maximized-actions")).not.toBeNull();
    target.remove();
  });
});
