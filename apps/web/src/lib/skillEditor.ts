import { useCallback, useEffect, useRef, useState } from "react";
import type { SkillEditorNode, SkillEditorReadResponse } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "./apiClient";

export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSkillName(value: string): boolean {
  const name = value.trim();
  return name.length > 0 && name.length <= 64 && SKILL_NAME_PATTERN.test(name);
}

/**
 * Prüft den Frontmatter-Kopf einer `SKILL.md` nach den Regeln des offiziellen
 * Skill-Formats. Verstöße werden nur angezeigt, nie blockiert — ein halb
 * getippter Kopf soll das Speichern nicht verhindern.
 */
export function skillFrontmatterWarnings(content: string, skillName: string | null): string[] {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return ["Der Frontmatter-Block fehlt. Ohne ihn lädt kein Agent diesen Skill."];
  const values = new Map<string, string>();
  let closed = false;
  let continuedKey: string | null = null;
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") { closed = true; break; }
    if (/^\s/.test(line)) {
      // Eingerückte Fortsetzung eines leer begonnenen Werts (YAML-Blockschreibweise).
      const text = line.trim();
      if (continuedKey && text && !/^[A-Za-z0-9_-]+\s*:/.test(text)) {
        values.set(continuedKey, `${values.get(continuedKey) ?? ""} ${text}`.trim());
      }
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) { continuedKey = null; continue; }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    continuedKey = value ? null : key;
    if (value) values.set(key, value);
  }

  const warnings: string[] = [];
  if (!closed) warnings.push("Der Frontmatter-Block ist nicht mit `---` geschlossen.");
  const name = values.get("name");
  if (!name) warnings.push("`name` fehlt im Frontmatter.");
  else if (!SKILL_NAME_PATTERN.test(name)) warnings.push("`name` darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.");
  else if (skillName && name !== skillName) warnings.push(`\`name\` muss dem Ordnernamen „${skillName}" entsprechen.`);
  const description = values.get("description");
  if (!description) warnings.push("`description` fehlt — ohne sie wird der Skill nie geladen.");
  else if (description.length > 1_024) warnings.push("`description` ist länger als 1024 Zeichen.");
  return warnings;
}

/** Ordnet einen Dateipfad dem Skill zu, zu dem er gehört. */
export function skillForPath(skills: SkillEditorNode[], path: string | null): SkillEditorNode | null {
  if (!path) return null;
  return skills.find((skill) => path === skill.path || path.startsWith(`${skill.path}/`)) ?? null;
}

export function formatClockTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export type AutosaveState =
  | { kind: "saved"; at: string | null }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; serverModifiedAt: string | null };

interface OpenDocument {
  path: string;
  /** Erwartete Änderungszeit für den nächsten Schreibvorgang; `null` heißt „unbekannt". */
  modifiedAt: string | null;
  saved: string;
}

export interface AutosaveController {
  content: string;
  state: AutosaveState;
  dirty: boolean;
  setContent: (value: string) => void;
  /** Sofort speichern (Blur, Dateiwechsel, Verlassen der Route). */
  flush: () => Promise<void>;
  /** Nach einem Fehler erneut versuchen. */
  retry: () => Promise<void>;
  /** Konflikt: eigene Fassung durchsetzen. */
  overwrite: () => Promise<void>;
  /** Konflikt: Serverfassung übernehmen und lokale Änderung verwerfen. */
  reload: () => Promise<void>;
}

export interface AutosaveOptions {
  file: SkillEditorReadResponse | null;
  debounceMs: number;
  onSaved?: (file: SkillEditorReadResponse) => void;
}

/**
 * Speichert Editorinhalte ohne Speichern-Knopf: nach kurzer Tippause, spätestens
 * beim Verlassen der Datei, der Route oder der Seite. Der Server liefert bei jedem
 * Schreibvorgang die neue `modifiedAt` zurück, die als Erwartungswert des nächsten
 * Schreibvorgangs dient — so fällt eine parallele Fremdänderung als Konflikt auf.
 */
export function useAutosave({ file, debounceMs, onSaved }: AutosaveOptions): AutosaveController {
  const [content, setContentState] = useState(file?.content ?? "");
  const [state, setState] = useState<AutosaveState>({ kind: "saved", at: null });
  const documentRef = useRef<OpenDocument | null>(null);
  const contentRef = useRef(content);
  const timerRef = useRef<number | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  // Solange ein Konflikt offen ist, wird nichts mehr von allein geschrieben: Jeder
  // weitere Versuch liefe in denselben 409, und die Entscheidung liegt beim Nutzer.
  const conflictRef = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const performSave = useCallback(async (openDocument: OpenDocument, value: string, overwrite: boolean) => {
    if (value === openDocument.saved && !overwrite) return;
    const isCurrent = () => documentRef.current?.path === openDocument.path;
    if (isCurrent()) setState({ kind: "saving" });
    try {
      const saved = await apiClient.saveSkillEditorFile({
        path: openDocument.path,
        content: value,
        expectedModifiedAt: overwrite ? null : openDocument.modifiedAt,
      });
      if (!saved) return;
      conflictRef.current = false;
      if (isCurrent()) {
        documentRef.current = { path: saved.path, modifiedAt: saved.modifiedAt, saved: value };
        // Während des Speicherns kann weitergetippt worden sein.
        setState(contentRef.current === value ? { kind: "saved", at: new Date().toISOString() } : { kind: "dirty" });
      }
      onSavedRef.current?.(saved);
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof ApiClientError && error.status === 409) {
        conflictRef.current = true;
        const serverModifiedAt = error.details?.serverModifiedAt;
        setState({ kind: "conflict", serverModifiedAt: typeof serverModifiedAt === "string" ? serverModifiedAt : null });
        return;
      }
      setState({ kind: "error", message: error instanceof Error ? error.message : "Die Datei konnte nicht gespeichert werden." });
    }
  }, []);

  // Schreibvorgänge laufen streng nacheinander: sonst überholt ein schneller
  // Tastendruck den vorherigen Write und die erwartete mtime passt nicht mehr.
  const runSave = useCallback((openDocument: OpenDocument | null, value: string, overwrite = false): Promise<void> => {
    if (!openDocument) return Promise.resolve();
    if (conflictRef.current && !overwrite) return Promise.resolve();
    clearTimer();
    chainRef.current = chainRef.current.then(() => performSave(openDocument, value, overwrite)).catch(() => undefined);
    return chainRef.current;
  }, [clearTimer, performSave]);

  // Dateiwechsel: hängige Änderungen der vorigen Datei noch wegschreiben.
  useEffect(() => {
    const previous = documentRef.current;
    if (previous && previous.path !== file?.path && contentRef.current !== previous.saved) {
      void runSave(previous, contentRef.current);
    }
    if (!file) {
      documentRef.current = null;
      contentRef.current = "";
      setContentState("");
      setState({ kind: "saved", at: null });
      return;
    }
    if (previous?.path === file.path) return;
    clearTimer();
    conflictRef.current = false;
    documentRef.current = { path: file.path, modifiedAt: file.modifiedAt, saved: file.content };
    contentRef.current = file.content;
    setContentState(file.content);
    setState({ kind: "saved", at: null });
  }, [clearTimer, file, runSave]);

  const setContent = useCallback((value: string) => {
    contentRef.current = value;
    setContentState(value);
    const openDocument = documentRef.current;
    if (!openDocument) return;
    if (!conflictRef.current) setState(value === openDocument.saved ? { kind: "saved", at: null } : { kind: "dirty" });
    clearTimer();
    if (value === openDocument.saved || conflictRef.current) return;
    timerRef.current = window.setTimeout(() => void runSave(documentRef.current, contentRef.current), debounceMs);
  }, [clearTimer, debounceMs, runSave]);

  const flush = useCallback(() => runSave(documentRef.current, contentRef.current), [runSave]);

  // Seite ausblenden oder schließen: der normale Fetch würde abgebrochen, deshalb
  // geht der letzte Stand mit `keepalive` raus.
  useEffect(() => {
    const saveOnUnload = () => {
      const openDocument = documentRef.current;
      if (!openDocument || conflictRef.current || contentRef.current === openDocument.saved) return;
      clearTimer();
      apiClient.saveSkillEditorFileOnUnload({ path: openDocument.path, content: contentRef.current, expectedModifiedAt: openDocument.modifiedAt });
      // Die Antwort dieses Aufrufs liest niemand mehr: die neue Änderungszeit bleibt
      // unbekannt. Da wir selbst zuletzt geschrieben haben, schreibt der nächste
      // Vorgang ohne Erwartungswert — sonst meldete er einen Konflikt mit uns selbst.
      documentRef.current = { path: openDocument.path, modifiedAt: null, saved: contentRef.current };
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") saveOnUnload(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", saveOnUnload);
    window.addEventListener("beforeunload", saveOnUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", saveOnUnload);
      window.removeEventListener("beforeunload", saveOnUnload);
    };
  }, [clearTimer]);

  // Beim Verlassen der Route bleibt keine Zeit mehr für ein Debounce-Fenster.
  useEffect(() => () => {
    const openDocument = documentRef.current;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (openDocument && !conflictRef.current && contentRef.current !== openDocument.saved) {
      void apiClient.saveSkillEditorFile({ path: openDocument.path, content: contentRef.current, expectedModifiedAt: openDocument.modifiedAt }).catch(() => undefined);
    }
  }, []);

  const reload = useCallback(async () => {
    const openDocument = documentRef.current;
    if (!openDocument) return;
    const fresh = await apiClient.skillEditorRead(openDocument.path);
    conflictRef.current = false;
    documentRef.current = { path: fresh.path, modifiedAt: fresh.modifiedAt, saved: fresh.content };
    contentRef.current = fresh.content;
    setContentState(fresh.content);
    setState({ kind: "saved", at: null });
    onSavedRef.current?.(fresh);
  }, []);

  return {
    content,
    state,
    dirty: state.kind === "dirty" || state.kind === "conflict" || state.kind === "error",
    setContent,
    flush,
    retry: flush,
    overwrite: useCallback(() => runSave(documentRef.current, contentRef.current, true), [runSave]),
    reload,
  };
}
