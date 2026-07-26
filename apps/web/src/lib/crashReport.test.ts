import { beforeEach, describe, expect, it } from "vitest";
import {
  addBreadcrumb,
  dismissCrash,
  getCurrentCrash,
  isBenignError,
  reportCrash,
  resetBreadcrumbsForTest,
} from "./crashReport";

beforeEach(() => {
  dismissCrash();
  resetBreadcrumbsForTest();
});

describe("harmlose Browser-Meldungen", () => {
  // Diese Meldung tauchte im Orbit (@xyflow/react) auf und hat fälschlich das
  // Crash-Pop-Up geöffnet, obwohl laut Spezifikation nichts kaputt ist.
  it("stuft ResizeObserver-Meldungen nicht als Absturz ein", () => {
    const message = "ResizeObserver loop completed with undelivered notifications.";
    expect(isBenignError("error", message, message)).toBe(true);

    reportCrash({ kind: "error", error: message });
    expect(getCurrentCrash()).toBeNull();
  });

  it("ignoriert auch die ältere ResizeObserver-Variante", () => {
    const message = "ResizeObserver loop limit exceeded";
    expect(isBenignError("error", message, message)).toBe(true);
  });

  it("ignoriert inhaltslose Cross-Origin-Meldungen", () => {
    expect(isBenignError("error", null, "Script error.")).toBe(true);
    expect(isBenignError("error", null, "Script error")).toBe(true);
  });

  it("ignoriert abgebrochene Anfragen", () => {
    const abort = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
    expect(isBenignError("unhandledrejection", abort, abort.message)).toBe(true);
  });

  it("hält echte Fehler weiterhin fest", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'name')");
    expect(isBenignError("error", error, error.message)).toBe(false);

    reportCrash({ kind: "error", error });
    expect(getCurrentCrash()?.message).toContain("Cannot read properties of undefined");
  });

  it("meldet einen Renderfehler auch dann, wenn der Text zufällig 'Script error' enthält", () => {
    const error = new Error("Script error handling in ToolPanel schlug fehl");
    expect(isBenignError("render", error, error.message)).toBe(false);
  });

  it("notiert Ignoriertes im Verlauf, damit es bei echten Abstürzen sichtbar bleibt", () => {
    reportCrash({ kind: "error", error: "ResizeObserver loop limit exceeded" });
    reportCrash({ kind: "error", error: new Error("Echter Fehler") });

    const crash = getCurrentCrash();
    expect(crash?.message).toContain("Echter Fehler");
    expect(crash?.breadcrumbs.join("\n")).toContain("Ignoriert (harmlos): ResizeObserver");
  });
});

describe("Verlauf", () => {
  it("fasst Wiederholungen zusammen, statt den Puffer zu fluten", () => {
    for (let index = 0; index < 40; index += 1) addBreadcrumb("Immer dieselbe Meldung");
    addBreadcrumb("Etwas anderes");

    reportCrash({ kind: "error", error: new Error("Ausloeser") });
    const breadcrumbs = getCurrentCrash()?.breadcrumbs ?? [];

    expect(breadcrumbs).toHaveLength(2);
    expect(breadcrumbs[0]).toContain("(40×)");
    expect(breadcrumbs[1]).toContain("Etwas anderes");
  });

  it("behält nur die jüngsten Einträge", () => {
    for (let index = 0; index < 40; index += 1) addBreadcrumb(`Schritt ${index}`);

    reportCrash({ kind: "error", error: new Error("Ausloeser") });
    const breadcrumbs = getCurrentCrash()?.breadcrumbs ?? [];

    expect(breadcrumbs).toHaveLength(25);
    expect(breadcrumbs.at(-1)).toContain("Schritt 39");
    expect(breadcrumbs.at(0)).toContain("Schritt 15");
  });
});
