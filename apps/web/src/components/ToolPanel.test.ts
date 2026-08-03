// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import type { Panel, Project } from "@workbench/contracts";
import { projectBoundCodeServerProxyUrl, projectBoundCodeServerUrl } from "./ToolPanel";
import { ToolPanel } from "./ToolPanel";
import { RouteActivityProvider } from "../lib/routeActivity";

afterEach(() => cleanup());

describe("project-bound code-server URLs", () => {
  it("always includes the validated project folder", () => {
    const path = "/home/user/projects/Remote_Workplace";
    expect(projectBoundCodeServerProxyUrl(path)).toBe("/editor/?folder=%2Fhome%2Fuser%2Fprojects%2FRemote_Workplace");
    expect(projectBoundCodeServerUrl("https://server.example/editor/", path)).toBe("https://server.example/editor/?folder=%2Fhome%2Fuser%2Fprojects%2FRemote_Workplace");
  });
});

describe("standalone T3 Code actions", () => {
  it("behält das T3-iframe auch in einer geparkten Route", () => {
    const project = {
      id: "remote-workplace", name: "Remote Workplace", description: "Workbench", path: "/tmp/remote-workplace", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: null },
    } satisfies Project;
    const panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    const renderTool = (active: boolean) => createElement(RouteActivityProvider, {
      active,
      children: createElement(ToolPanel, { panel, project, isFocused: active, standalone: true }),
    });

    const { rerender } = render(renderTool(false));
    const firstFrame = screen.getByTitle("T3 Code");
    expect(firstFrame).toBeInstanceOf(HTMLIFrameElement);

    rerender(renderTool(true));

    expect(screen.getByTitle("T3 Code")).toBe(firstFrame);
  });

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

    await waitFor(() => expect(target.querySelector(".tool-actions-menu.is-topbar")).not.toBeNull());
    fireEvent.click(within(target).getByRole("button", { name: "Werkzeugaktionen" }));
    expect(screen.getByRole("menuitem", { name: "Neu laden" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "In neuem Tab öffnen" })).not.toBeNull();
    const firstFrame = screen.getByTitle("T3 Code");
    expect(firstFrame.getAttribute("allow")).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Neu laden" }));
    await waitFor(() => expect(screen.getByTitle("T3 Code")).not.toBe(firstFrame));
    fireEvent.click(within(target).getByRole("button", { name: "Werkzeugaktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Vollbild" }));
    expect(target.querySelector(".tool-actions-menu")).toBeNull();
    expect(document.querySelector(".tool-surface-maximized .tool-actions-menu")).not.toBeNull();
    target.remove();
  });

  it("renders standalone code-server actions as a flat topbar toolbar", async () => {
    const target = document.createElement("div");
    target.id = "topbar-tool-actions";
    document.body.append(target);
    const project = {
      id: "remote-workplace", name: "Remote Workplace", description: "Workbench", path: "/tmp/remote-workplace", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: null, codeServer: "https://editor.example.test" },
    } satisfies Project;
    const panel = { id: "standalone-code-server", type: "code-server", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: true, standalone: true, actionPlacement: "topbar", codeServerMode: "embedded" }));

    await waitFor(() => expect(target.querySelector(".tool-actions-menu.is-topbar")).not.toBeNull());
    fireEvent.click(within(target).getByRole("button", { name: "Werkzeugaktionen" }));
    expect(screen.getByRole("menuitem", { name: "Neu laden" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "In neuem Tab öffnen" })).not.toBeNull();
    target.remove();
  });

  it("shows topbar actions only for the active standalone tool", async () => {
    const target = document.createElement("div");
    target.id = "topbar-tool-actions";
    document.body.append(target);
    const project = {
      id: "remote-workplace", name: "Remote Workplace", description: "Workbench", path: "/tmp/remote-workplace", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: "https://editor.example.test" },
    } satisfies Project;
    const t3Panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    const editorPanel = { id: "standalone-code-server", type: "code-server", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    const renderTools = (activeType: Panel["type"]) => createElement("div", null,
      createElement(RouteActivityProvider, { active: activeType === "t3-code", children: createElement(ToolPanel, { panel: t3Panel, project, isFocused: true, standalone: true, actionPlacement: "topbar" }) }),
      createElement(RouteActivityProvider, { active: activeType === "code-server", children: createElement(ToolPanel, { panel: editorPanel, project, isFocused: true, standalone: true, actionPlacement: "topbar", codeServerMode: "embedded" }) }),
    );

    const { rerender } = render(renderTools("code-server"));
    await waitFor(() => expect(target.querySelectorAll(".tool-actions-menu")).toHaveLength(1));
    expect(within(target).getAllByRole("button", { name: "Werkzeugaktionen" })).toHaveLength(1);

    rerender(renderTools("t3-code"));
    await waitFor(() => expect(target.querySelectorAll(".tool-actions-menu")).toHaveLength(1));
    expect(within(target).getAllByRole("button", { name: "Werkzeugaktionen" })).toHaveLength(1);
    target.remove();
  });
});

describe("eingebettete Werkzeug-Eingaben", () => {
  it("lässt Pointer-Gesten im Werkzeug nicht bis zum Canvas durch", () => {
    const project = {
      id: "remote-workplace", name: "Remote Workplace", description: "Workbench", path: "/tmp/remote-workplace", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: null },
    } satisfies Project;
    const panel = { id: "orbit-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    const onFocus = vi.fn();
    const onCanvasPointerDown = vi.fn();
    const { container } = render(createElement("div", { onPointerDown: onCanvasPointerDown }, createElement(ToolPanel, { panel, project, isFocused: false, onFocus })));

    fireEvent.pointerDown(container.querySelector(".tool-surface")!);

    expect(onFocus).toHaveBeenCalledOnce();
    expect(onCanvasPointerDown).not.toHaveBeenCalled();
  });
});
