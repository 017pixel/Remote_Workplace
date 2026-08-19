// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewHubStore } from "./previewHub";

describe("Preview-Hub-Tabs", () => {
  beforeEach(() => usePreviewHubStore.setState({ openProjectIds: [], activeProjectId: null }));

  it("öffnet Projekte nur einmal und aktiviert den gewählten Tab", () => {
    const store = usePreviewHubStore.getState();
    store.openProject("eins");
    usePreviewHubStore.getState().openProject("zwei");
    usePreviewHubStore.getState().openProject("eins");
    expect(usePreviewHubStore.getState()).toMatchObject({ openProjectIds: ["eins", "zwei"], activeProjectId: "eins" });
  });

  it("schließt nur den Tab und wählt den benachbarten Tab", () => {
    usePreviewHubStore.setState({ openProjectIds: ["eins", "zwei", "drei"], activeProjectId: "zwei" });
    usePreviewHubStore.getState().closeProject("zwei");
    expect(usePreviewHubStore.getState()).toMatchObject({ openProjectIds: ["eins", "drei"], activeProjectId: "drei" });
  });

  it("entfernt nicht mehr verfügbare Projekte und stellt einen gültigen Fallback her", () => {
    usePreviewHubStore.setState({ openProjectIds: ["entfernt", "zwei"], activeProjectId: "entfernt" });
    usePreviewHubStore.getState().reconcileProjects(["eins", "zwei"], "eins");
    expect(usePreviewHubStore.getState()).toMatchObject({ openProjectIds: ["zwei"], activeProjectId: "zwei" });

    usePreviewHubStore.setState({ openProjectIds: [], activeProjectId: null });
    usePreviewHubStore.getState().reconcileProjects(["eins"], "eins");
    expect(usePreviewHubStore.getState()).toMatchObject({ openProjectIds: ["eins"], activeProjectId: "eins" });
  });

  it("lässt einen bewusst geleerten Hub nach der Initialisierung leer", () => {
    usePreviewHubStore.setState({ openProjectIds: [], activeProjectId: null });
    usePreviewHubStore.getState().reconcileProjects(["eins", "zwei"], null);
    expect(usePreviewHubStore.getState()).toMatchObject({ openProjectIds: [], activeProjectId: null });
  });

  it("meldet bei unveränderter Projektauswahl kein Store-Update", () => {
    usePreviewHubStore.setState({ openProjectIds: ["eins", "zwei"], activeProjectId: "zwei" });
    const listener = vi.fn();
    const unsubscribe = usePreviewHubStore.subscribe(listener);

    usePreviewHubStore.getState().reconcileProjects(["eins", "zwei"], null);
    usePreviewHubStore.getState().openProject("zwei");
    usePreviewHubStore.getState().activateProject("zwei");

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
