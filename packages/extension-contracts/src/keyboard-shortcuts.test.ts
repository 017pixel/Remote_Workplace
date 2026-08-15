import { describe, expect, it } from "vitest";
import {
  KEYBOARD_SHORTCUTS_MAX_COUNT,
  SHORTCUT_CHORD_MAX_STROKES,
  keyboardShortcutContributionSchema,
  keyboardShortcutContributionsSchema,
  shortcutKeyStrokeSchema,
  shortcutKeybindingCollisionKey,
  shortcutKeybindingSchema,
  shortcutPlatformOverridesSchema,
} from "./keyboard-shortcuts.js";

const shortcut = {
  id: "workbench.agent-tasks.shortcut.create",
  commandId: "workbench.agent-tasks.command.create",
  keybinding: [{ key: "KeyK", modifiers: ["primary", "shift"] }],
} as const;

describe("Keyboard Shortcut Contributions V1", () => {
  it("füllt Focus- und Repeat-Regeln als sichere Defaults", () => {
    expect(keyboardShortcutContributionSchema.parse(shortcut)).toEqual({
      ...shortcut,
      allowInEditable: false,
      allowRepeat: false,
    });
  });

  it("akzeptiert maximal zweistufige Chords und Plattform-Overrides", () => {
    expect(
      keyboardShortcutContributionSchema.safeParse({
        ...shortcut,
        keybinding: [
          { key: "KeyK", modifiers: ["primary"] },
          { key: "KeyS", modifiers: ["primary"] },
        ],
        platformOverrides: {
          mac: [{ key: "KeyK", modifiers: ["meta", "shift"] }],
          windows: [{ key: "KeyK", modifiers: ["control", "shift"] }],
          linux: [{ key: "F12", modifiers: [] }],
        },
        when: {
          all: [
            { key: "host.input.focused", operator: "equals", value: false },
          ],
        },
      }).success,
    ).toBe(true);
    expect(
      shortcutKeybindingSchema.safeParse(
        Array.from({ length: SHORTCUT_CHORD_MAX_STROKES + 1 }, () => ({
          key: "KeyK",
          modifiers: ["primary"],
        })),
      ).success,
    ).toBe(false);
  });

  it("verlangt eindeutige Modifikatoren in kanonischer Reihenfolge", () => {
    expect(
      shortcutKeyStrokeSchema.safeParse({
        key: "KeyK",
        modifiers: ["primary", "shift"],
      }).success,
    ).toBe(true);
    expect(
      shortcutKeyStrokeSchema.safeParse({
        key: "KeyK",
        modifiers: ["shift", "primary"],
      }).success,
    ).toBe(false);
    expect(
      shortcutKeyStrokeSchema.safeParse({
        key: "KeyK",
        modifiers: ["primary", "primary"],
      }).success,
    ).toBe(false);
    expect(
      shortcutKeyStrokeSchema.safeParse({
        key: "KeyK",
        modifiers: ["primary", "control"],
      }).success,
    ).toBe(false);
    expect(
      shortcutKeyStrokeSchema.safeParse({
        key: "KeyK",
        modifiers: ["control", "meta"],
      }).success,
    ).toBe(false);
  });

  it("weist unbekannte Codes, leere Chords und leere Overrides ab", () => {
    expect(
      shortcutKeyStrokeSchema.safeParse({ key: "k", modifiers: ["primary"] })
        .success,
    ).toBe(false);
    expect(shortcutKeybindingSchema.safeParse([]).success).toBe(false);
    expect(shortcutPlatformOverridesSchema.safeParse({}).success).toBe(false);
    expect(
      shortcutPlatformOverridesSchema.safeParse({ ios: shortcut.keybinding })
        .success,
    ).toBe(false);
  });

  it("schützt editierbare Flächen vor unmodifizierten druckbaren Tasten", () => {
    expect(
      keyboardShortcutContributionSchema.safeParse({
        ...shortcut,
        keybinding: [{ key: "Slash", modifiers: [] }],
      }).success,
    ).toBe(true);
    expect(
      keyboardShortcutContributionSchema.safeParse({
        ...shortcut,
        keybinding: [{ key: "Slash", modifiers: [] }],
        allowInEditable: true,
      }).success,
    ).toBe(false);
    expect(
      keyboardShortcutContributionSchema.safeParse({
        ...shortcut,
        keybinding: [{ key: "Enter", modifiers: ["primary"] }],
        allowInEditable: true,
      }).success,
    ).toBe(true);
  });

  it("erzeugt einen stabilen Kollisionsschlüssel", () => {
    const binding = shortcutKeybindingSchema.parse([
      { key: "KeyK", modifiers: ["primary"] },
      { key: "KeyS", modifiers: ["primary", "shift"] },
    ]);
    expect(shortcutKeybindingCollisionKey(binding)).toBe(
      "primary+KeyK primary+shift+KeyS",
    );
  });

  it("überlässt Default-Kollisionen der späteren konfliktfähigen Registry", () => {
    expect(
      keyboardShortcutContributionsSchema.safeParse([
        shortcut,
        {
          ...shortcut,
          id: "workbench.agent-tasks.shortcut.open",
          commandId: "workbench.agent-tasks.command.open",
        },
      ]).success,
    ).toBe(true);
  });

  it("weist leere, doppelte und übergroße Shortcut-Listen ab", () => {
    expect(keyboardShortcutContributionsSchema.safeParse([]).success).toBe(
      false,
    );
    expect(
      keyboardShortcutContributionsSchema.safeParse([shortcut, shortcut])
        .success,
    ).toBe(false);
    expect(
      keyboardShortcutContributionsSchema.safeParse(
        Array.from(
          { length: KEYBOARD_SHORTCUTS_MAX_COUNT + 1 },
          (_, index) => ({
            ...shortcut,
            id: `workbench.agent-tasks.shortcut.shortcut-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
