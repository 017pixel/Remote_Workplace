import { describe, expect, it } from "vitest";
import { findHermesPage, hermesSurfacePages } from "./hermesSurfaces";
import { safeHermesPath } from "./HermesAdminFrame";

describe("Hermes-Flächen", () => {
  it("stellt die Betriebsseiten direkt in die Leiste", () => {
    const primary = hermesSurfacePages.filter((page) => page.primary).map((page) => page.path);
    // Genau das, was ohne Umweg erreichbar sein muss: Systeminfos, Zeitpläne,
    // Logs und Auswertung.
    expect(primary).toContain("/system");
    expect(primary).toContain("/cron");
    expect(primary).toContain("/logs");
    expect(primary).toContain("/analytics");
  });

  it("führt jede Seite genau einmal und immer mit absolutem Pfad", () => {
    const paths = hermesSurfacePages.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith("/")).toBe(true);
  });

  it("ordnet auch Unterseiten dem passenden Eintrag zu", () => {
    expect(findHermesPage("/cron")?.label).toBe("Cron");
    expect(findHermesPage("/profiles/new")?.label).toBe("Profile");
    expect(findHermesPage("/unbekannt")).toBeUndefined();
  });
});

describe("safeHermesPath", () => {
  it("lässt gültige interne Pfade durch", () => {
    expect(safeHermesPath("/cron")).toBe("/cron");
    expect(safeHermesPath("/logs?level=error")).toBe("/logs?level=error");
    expect(safeHermesPath("/")).toBe("/");
  });

  it("fängt Traversal, protokollrelative Ziele und Unsinn ab", () => {
    expect(safeHermesPath("/../etc/passwd")).toBe("/");
    expect(safeHermesPath("//example.com/phish")).toBe("/");
    expect(safeHermesPath("cron")).toBe("/");
    expect(safeHermesPath(null)).toBe("/");
    expect(safeHermesPath(undefined)).toBe("/");
    expect(safeHermesPath("")).toBe("/");
  });
});
