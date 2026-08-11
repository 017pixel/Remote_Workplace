import { describe, expect, it } from "vitest";
import {
  formatHermesDateTime,
  hermesSourceLabels,
  hermesSessionStatusLabel,
  normalizeHermesSurface,
  normalizeHermesUiMode,
  resolveHermesSurface,
} from "./hermesPresentation";

describe("Hermes-Darstellungsmodell", () => {
  it("normalisiert nur bekannte Flächen", () => {
    expect(normalizeHermesSurface("history")).toBe("history");
    expect(normalizeHermesSurface("unknown")).toBe("chat");
    expect(normalizeHermesSurface(null, "admin")).toBe("admin");
    expect(normalizeHermesUiMode("official")).toBe("official");
    expect(normalizeHermesUiMode("unknown")).toBe("native");
  });

  it("gibt Session-Deep-Links immer Vorrang vor gespeicherten Flächen", () => {
    expect(resolveHermesSurface({ urlSurface: null, sessionId: "session-1", panelSurface: "admin", storedSurface: "tasks" })).toBe("chat");
    expect(resolveHermesSurface({ urlSurface: "cron", sessionId: null, panelSurface: "admin", storedSurface: "tasks" })).toBe("cron");
    expect(resolveHermesSurface({ urlSurface: null, sessionId: null, panelSurface: "history", storedSurface: "tasks" })).toBe("history");
  });

  it("formatiert gemeinsame Datums- und Statuswerte konsistent", () => {
    expect(formatHermesDateTime(null)).toBe("–");
    expect(formatHermesDateTime("2026-08-11T08:05:00.000Z")).toMatch(/11\.08\. 08:05/);
    expect(hermesSessionStatusLabel("running")).toBe("läuft");
    expect(hermesSessionStatusLabel("unknown")).toBe("unbekannt");
    expect(hermesSourceLabels.acp).toBe("Chat");
  });
});
