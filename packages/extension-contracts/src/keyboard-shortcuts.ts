import { z } from "zod";
import { contextExpressionSchema } from "./context-expressions.js";
import { contributionIdSchema } from "./ids.js";

export const KEYBOARD_SHORTCUTS_MAX_COUNT = 256;
export const SHORTCUT_CHORD_MAX_STROKES = 2;

export const shortcutKeyCodes = [
  "KeyA",
  "KeyB",
  "KeyC",
  "KeyD",
  "KeyE",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyL",
  "KeyM",
  "KeyN",
  "KeyO",
  "KeyP",
  "KeyQ",
  "KeyR",
  "KeyS",
  "KeyT",
  "KeyU",
  "KeyV",
  "KeyW",
  "KeyX",
  "KeyY",
  "KeyZ",
  "Digit0",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  "F13",
  "F14",
  "F15",
  "F16",
  "F17",
  "F18",
  "F19",
  "F20",
  "F21",
  "F22",
  "F23",
  "F24",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Escape",
  "Space",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Slash",
  "Backslash",
  "BracketLeft",
  "BracketRight",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Minus",
  "Equal",
  "Backquote",
] as const;

export const shortcutKeyCodeSchema = z.enum(shortcutKeyCodes);
export type ShortcutKeyCode = z.infer<typeof shortcutKeyCodeSchema>;

export const shortcutModifiers = [
  "primary",
  "control",
  "meta",
  "alt",
  "shift",
] as const;
export const shortcutModifierSchema = z.enum(shortcutModifiers);
export type ShortcutModifier = z.infer<typeof shortcutModifierSchema>;

const shortcutModifierOrder = new Map(
  shortcutModifiers.map((modifier, index) => [modifier, index]),
);

export const shortcutKeyStrokeSchema = z
  .strictObject({
    key: shortcutKeyCodeSchema,
    modifiers: z
      .array(shortcutModifierSchema)
      .max(shortcutModifiers.length)
      .meta({ uniqueItems: true })
      .default([]),
  })
  .superRefine((stroke, context) => {
    const seen = new Set<ShortcutModifier>();
    let previousOrder = -1;
    for (const [index, modifier] of stroke.modifiers.entries()) {
      if (seen.has(modifier)) {
        context.addIssue({
          code: "custom",
          message: "Shortcut-Modifikatoren dürfen nicht doppelt vorkommen.",
          path: ["modifiers", index],
        });
      }
      seen.add(modifier);
      const currentOrder = shortcutModifierOrder.get(modifier) ?? -1;
      if (currentOrder <= previousOrder) {
        context.addIssue({
          code: "custom",
          message:
            "Shortcut-Modifikatoren müssen in kanonischer Reihenfolge stehen.",
          path: ["modifiers", index],
        });
      }
      previousOrder = currentOrder;
    }
    if (seen.has("primary") && (seen.has("control") || seen.has("meta"))) {
      context.addIssue({
        code: "custom",
        message: "primary darf nicht mit control oder meta kombiniert werden.",
        path: ["modifiers"],
      });
    }
    if (seen.has("control") && seen.has("meta")) {
      context.addIssue({
        code: "custom",
        message: "control und meta dürfen nicht gemeinsam verwendet werden.",
        path: ["modifiers"],
      });
    }
  });

export type ShortcutKeyStroke = z.infer<typeof shortcutKeyStrokeSchema>;

export const shortcutKeybindingSchema = z
  .array(shortcutKeyStrokeSchema)
  .min(1)
  .max(SHORTCUT_CHORD_MAX_STROKES);

export type ShortcutKeybinding = z.infer<typeof shortcutKeybindingSchema>;

export const shortcutPlatformOverridesSchema = z
  .strictObject({
    mac: shortcutKeybindingSchema.optional(),
    windows: shortcutKeybindingSchema.optional(),
    linux: shortcutKeybindingSchema.optional(),
  })
  .refine(
    (overrides) =>
      overrides.mac !== undefined ||
      overrides.windows !== undefined ||
      overrides.linux !== undefined,
    "Platform Overrides benötigen mindestens eine Plattform.",
  );

export type ShortcutPlatformOverrides = z.infer<
  typeof shortcutPlatformOverridesSchema
>;

const unmodifiedPrintableKeyCodes = new Set<ShortcutKeyCode>([
  ...shortcutKeyCodes.filter(
    (key) => key.startsWith("Key") || key.startsWith("Digit"),
  ),
  "Space",
  "Slash",
  "Backslash",
  "BracketLeft",
  "BracketRight",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Minus",
  "Equal",
  "Backquote",
]);

function firstStrokeIsUnmodifiedPrintable(
  keybinding: ShortcutKeybinding,
): boolean {
  const first = keybinding[0];
  return (
    first !== undefined &&
    first.modifiers.length === 0 &&
    unmodifiedPrintableKeyCodes.has(first.key)
  );
}

export const keyboardShortcutContributionSchema = z
  .strictObject({
    id: contributionIdSchema,
    commandId: contributionIdSchema,
    keybinding: shortcutKeybindingSchema,
    platformOverrides: shortcutPlatformOverridesSchema.optional(),
    when: contextExpressionSchema.optional(),
    allowInEditable: z.boolean().default(false),
    allowRepeat: z.boolean().default(false),
  })
  .superRefine((shortcut, context) => {
    if (!shortcut.allowInEditable) return;
    const bindings = [
      shortcut.keybinding,
      shortcut.platformOverrides?.mac,
      shortcut.platformOverrides?.windows,
      shortcut.platformOverrides?.linux,
    ].filter((binding): binding is ShortcutKeybinding => binding !== undefined);
    for (const binding of bindings) {
      if (!firstStrokeIsUnmodifiedPrintable(binding)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Ein editierbarer Bereich darf keinen unmodifizierten druckbaren Shortcut abfangen.",
        path: ["allowInEditable"],
      });
      break;
    }
  });

export type KeyboardShortcutContribution = z.infer<
  typeof keyboardShortcutContributionSchema
>;

export const keyboardShortcutContributionsSchema = z
  .array(keyboardShortcutContributionSchema)
  .min(1)
  .max(KEYBOARD_SHORTCUTS_MAX_COUNT)
  .superRefine((shortcuts, context) => {
    const seen = new Set<string>();
    for (const [index, shortcut] of shortcuts.entries()) {
      if (seen.has(shortcut.id)) {
        context.addIssue({
          code: "custom",
          message:
            "Jede Keyboard Shortcut Contribution ID darf nur einmal vorkommen.",
          path: [index, "id"],
        });
      }
      seen.add(shortcut.id);
    }
  })
  .meta({ uniqueItems: true });

export type KeyboardShortcutContributions = z.infer<
  typeof keyboardShortcutContributionsSchema
>;

export function shortcutKeybindingCollisionKey(
  keybinding: ShortcutKeybinding,
): string {
  return keybinding
    .map((stroke) => [...stroke.modifiers, stroke.key].join("+"))
    .join(" ");
}
