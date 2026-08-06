// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { openPreviewLiveWindow, openPreviewWindow, previewLiveWindowUrl } from "./previewExternalOpen";

describe("Preview-Fenster", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("erzeugt eine interne, normalisierte Fensterroute", () => {
    const url = previewLiveWindowUrl({ projectId: "projekt", port: 5173, path: "/admin", title: "Projekt" }, "https://server.test");
    expect(url).toContain("/previews/live");
    expect(url).toContain("port=5173");
    expect(url).toContain("path=%2Fadmin");
  });

  it("öffnet den Fenster- und Tab-Modus getrennt", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    openPreviewLiveWindow({ projectId: "projekt", port: 5173, mode: "window" });
    expect(open.mock.calls[0]?.[1]).toContain("workbench-preview-projekt-");
    expect(open.mock.calls[0]?.[2]).toContain("popup=yes");
    openPreviewLiveWindow({ projectId: "projekt", port: 5173, mode: "tab" });
    expect(open.mock.calls[1]?.[1]).toBe("_blank");
  });

  it("öffnet die öffentliche Preview-URL direkt in einem eigenen Fenster", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    openPreviewWindow("https://server.test:8451/app", "projekt");
    expect(open.mock.calls[0]?.[0]).toBe("https://server.test:8451/app");
    expect(open.mock.calls[0]?.[1]).toContain("preview-projekt-");
    expect(open.mock.calls[0]?.[2]).toContain("popup=yes");
    expect(open.mock.calls[0]?.[2]).not.toContain("noopener");
  });
});
