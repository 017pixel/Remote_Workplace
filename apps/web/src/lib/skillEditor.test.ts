// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillEditorReadResponse } from "@workbench/contracts";
import { ApiClientError, apiClient } from "./apiClient";
import { isValidSkillName, skillForPath, skillFrontmatterWarnings, useAutosave } from "./skillEditor";

/** Ausstehende Mikrotasks der Speicherkette abarbeiten (fake timers schließen waitFor aus). */
async function settle(): Promise<void> {
  await act(async () => {
    for (let step = 0; step < 12; step += 1) await Promise.resolve();
  });
}

function fileAt(modifiedAt: string, content = "erste Fassung"): SkillEditorReadResponse {
  return { path: "/root/skills/alpha/SKILL.md", name: "SKILL.md", content, modifiedAt, sizeBytes: content.length };
}

describe("Namen und Frontmatter", () => {
  it("akzeptiert nur Kleinbuchstaben, Ziffern und Bindestriche", () => {
    expect(isValidSkillName("mein-skill")).toBe(true);
    expect(isValidSkillName("skill2")).toBe(true);
    expect(isValidSkillName("Mein Skill")).toBe(false);
    expect(isValidSkillName("-start")).toBe(false);
    expect(isValidSkillName("")).toBe(false);
  });

  it("meldet fehlenden Frontmatter, fehlende Beschreibung und falschen Namen", () => {
    expect(skillFrontmatterWarnings("# ohne Kopf\n", "alpha")[0]).toMatch(/Frontmatter-Block fehlt/);
    expect(skillFrontmatterWarnings("---\nname: alpha\n---\n", "alpha")).toEqual(["`description` fehlt — ohne sie wird der Skill nie geladen."]);
    expect(skillFrontmatterWarnings("---\nname: beta\ndescription: x\n---\n", "alpha")).toEqual(['`name` muss dem Ordnernamen „alpha" entsprechen.']);
    expect(skillFrontmatterWarnings("---\nname: alpha\ndescription: x\n---\n", "alpha")).toEqual([]);
    // Eingerückte Blockbeschreibung wie im echten convex-Skill zählt als vorhanden.
    expect(skillFrontmatterWarnings("---\nname: alpha\ndescription:\n  Erste Zeile\n  zweite Zeile\n---\n", "alpha")).toEqual([]);
  });

  it("findet den Skill zu einem Dateipfad", () => {
    const skills = [{ name: "alpha", path: "/root/skills/alpha", description: null, modifiedAt: null, symlink: true, broken: false, files: [] }];
    expect(skillForPath(skills, "/root/skills/alpha/SKILL.md")?.name).toBe("alpha");
    expect(skillForPath(skills, "/root/AGENTS.md")).toBeNull();
    expect(skillForPath(skills, null)).toBeNull();
  });
});

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("speichert nach der Tippause und übernimmt die neue Änderungszeit", async () => {
    const save = vi.spyOn(apiClient, "saveSkillEditorFile").mockResolvedValue(fileAt("2026-01-01T10:05:00.000Z", "zweite Fassung"));
    const { result } = renderHook(() => useAutosave({ file: fileAt("2026-01-01T10:00:00.000Z"), debounceMs: 1_000 }));

    act(() => result.current.setContent("zweite Fassung"));
    expect(result.current.state.kind).toBe("dirty");
    expect(save).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(1_000); });
    await settle();
    expect(save).toHaveBeenCalledWith({
      path: "/root/skills/alpha/SKILL.md",
      content: "zweite Fassung",
      expectedModifiedAt: "2026-01-01T10:00:00.000Z",
    });
    await settle();
    expect(result.current.state.kind).toBe("saved");

    // Der nächste Schreibvorgang erwartet die vom Server gelieferte Zeit.
    act(() => result.current.setContent("dritte Fassung"));
    await act(async () => { vi.advanceTimersByTime(1_000); });
    await settle();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ expectedModifiedAt: "2026-01-01T10:05:00.000Z" }));
  });

  it("schreibt beim Flush sofort und nicht erneut ohne Änderung", async () => {
    const save = vi.spyOn(apiClient, "saveSkillEditorFile").mockResolvedValue(fileAt("2026-01-01T10:05:00.000Z", "neu"));
    const { result } = renderHook(() => useAutosave({ file: fileAt("2026-01-01T10:00:00.000Z"), debounceMs: 5_000 }));

    act(() => result.current.setContent("neu"));
    await act(async () => { await result.current.flush(); });
    await settle();
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => { await result.current.flush(); });
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("sendet beim Ausblenden der Seite mit keepalive", () => {
    const beacon = vi.spyOn(apiClient, "saveSkillEditorFileOnUnload").mockImplementation(() => undefined);
    const { result } = renderHook(() => useAutosave({ file: fileAt("2026-01-01T10:00:00.000Z"), debounceMs: 5_000 }));

    act(() => result.current.setContent("halb getippt"));
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(beacon).toHaveBeenCalledWith(expect.objectContaining({ content: "halb getippt" }));
  });

  it("schreibt nach dem keepalive-Versand ohne veralteten Erwartungswert weiter", async () => {
    vi.spyOn(apiClient, "saveSkillEditorFileOnUnload").mockImplementation(() => undefined);
    const save = vi.spyOn(apiClient, "saveSkillEditorFile").mockResolvedValue(fileAt("2026-01-01T10:09:00.000Z", "danach"));
    const { result } = renderHook(() => useAutosave({ file: fileAt("2026-01-01T10:00:00.000Z"), debounceMs: 100 }));

    act(() => result.current.setContent("beim Ausblenden"));
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    act(() => result.current.setContent("danach"));
    await act(async () => { vi.advanceTimersByTime(100); });
    await settle();
    // Die Antwort des keepalive-Versands kennt niemand — der nächste Write erwartet deshalb nichts.
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ content: "danach", expectedModifiedAt: null }));
    expect(result.current.state.kind).toBe("saved");
  });

  it("meldet einen Konflikt und übernimmt beim Überschreiben ohne Erwartungswert", async () => {
    const save = vi.spyOn(apiClient, "saveSkillEditorFile")
      .mockRejectedValueOnce(new ApiClientError(409, "SKILLS_CONFLICT", "extern geändert", null, false, { serverModifiedAt: "2026-01-01T11:00:00.000Z" }))
      .mockResolvedValue(fileAt("2026-01-01T11:01:00.000Z", "meine Fassung"));
    const { result } = renderHook(() => useAutosave({ file: fileAt("2026-01-01T10:00:00.000Z"), debounceMs: 100 }));

    act(() => result.current.setContent("meine Fassung"));
    await act(async () => { vi.advanceTimersByTime(100); });
    await settle();
    expect(result.current.state).toEqual({ kind: "conflict", serverModifiedAt: "2026-01-01T11:00:00.000Z" });

    await act(async () => { await result.current.overwrite(); });
    await settle();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ expectedModifiedAt: null }));
    await settle();
    expect(result.current.state.kind).toBe("saved");
  });

  it("schreibt bei offenem Konflikt nichts mehr von allein", async () => {
    const beacon = vi.spyOn(apiClient, "saveSkillEditorFileOnUnload").mockImplementation(() => undefined);
    const save = vi.spyOn(apiClient, "saveSkillEditorFile")
      .mockRejectedValue(new ApiClientError(409, "SKILLS_CONFLICT", "extern geändert", null, false, {}));
    const { result } = renderHook(() => useAutosave({ file: fileAt("2026-01-01T10:00:00.000Z"), debounceMs: 100 }));

    act(() => result.current.setContent("meine Fassung"));
    await act(async () => { vi.advanceTimersByTime(100); });
    await settle();
    expect(result.current.state.kind).toBe("conflict");

    // Weiteres Tippen, Blur-Flush und das Ausblenden der Seite lösen keinen Write mehr aus.
    act(() => result.current.setContent("noch mehr"));
    await act(async () => { vi.advanceTimersByTime(1_000); });
    await act(async () => { await result.current.flush(); });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(beacon).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe("conflict");
  });

  it("meldet einen Fehler und versucht es auf Wunsch erneut", async () => {
    const save = vi.spyOn(apiClient, "saveSkillEditorFile")
      .mockRejectedValueOnce(new ApiClientError(500, "INTERNAL_ERROR", "Serverfehler"))
      .mockResolvedValue(fileAt("2026-01-01T10:05:00.000Z", "neu"));
    const { result } = renderHook(() => useAutosave({ file: fileAt("2026-01-01T10:00:00.000Z"), debounceMs: 100 }));

    act(() => result.current.setContent("neu"));
    await act(async () => { vi.advanceTimersByTime(100); });
    await settle();
    expect(result.current.state).toEqual({ kind: "error", message: "Serverfehler" });

    await act(async () => { await result.current.retry(); });
    await settle();
    expect(result.current.state.kind).toBe("saved");
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("sichert den offenen Stand beim Wechsel auf eine andere Datei", async () => {
    const save = vi.spyOn(apiClient, "saveSkillEditorFile").mockResolvedValue(fileAt("2026-01-01T10:05:00.000Z", "offen"));
    const first = fileAt("2026-01-01T10:00:00.000Z");
    const second: SkillEditorReadResponse = { ...first, path: "/root/AGENTS.md", name: "AGENTS.md", content: "Regeln" };
    const { result, rerender } = renderHook(({ file }) => useAutosave({ file, debounceMs: 5_000 }), { initialProps: { file: first } });

    act(() => result.current.setContent("offen"));
    rerender({ file: second });

    await settle();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ path: first.path, content: "offen" }));
    expect(result.current.content).toBe("Regeln");
  });
});
