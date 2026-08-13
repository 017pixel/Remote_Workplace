// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Project, ProjectsResponse } from "@workbench/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { RouteActivityProvider } from "../lib/routeActivity";
import { usePreviewHubStore } from "../stores/previewHub";
import { useWorkspaceStore } from "../stores/workspace";
import { PreviewHub } from "./PreviewHub";

function project(id: string): Project {
  return {
    id,
    name: id,
    description: "Testprojekt",
    path: `/tmp/${id}`,
    enabled: true,
    sortOrder: 1,
    availability: "available",
    activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [],
    links: { t3Code: null, codeServer: null },
  };
}

afterEach(() => {
  cleanup();
});

describe("Preview-Hub-Routensynchronisierung", () => {
  beforeEach(() => {
    const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    usePreviewHubStore.persist.setOptions({ storage });
    useWorkspaceStore.persist.setOptions({ storage });
    usePreviewHubStore.setState({ openProjectIds: ["preview-projekt"], activeProjectId: "preview-projekt" });
    useWorkspaceStore.setState({ selectedProjectId: "preview-projekt" });
  });

  it("ignoriert Suchparameter einer anderen aktiven Route", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData<ProjectsResponse>(["projects"], {
      projects: [project("preview-projekt"), project("terminal-projekt")],
      projectsRoot: "/tmp",
      recentLimit: 8,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/terminal?project=terminal-projekt"]}>
          <RouteActivityProvider active={false}>
            <PreviewHub />
          </RouteActivityProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(usePreviewHubStore.getState()).toMatchObject({
        openProjectIds: ["preview-projekt"],
        activeProjectId: "preview-projekt",
      });
      expect(useWorkspaceStore.getState().selectedProjectId).toBe("preview-projekt");
    });
  });
});
