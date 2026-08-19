import {
  contextExpressionKeys,
  contextKeyBelongsToExtension,
  keyboardShortcutContributionSchema,
  type ContributionId,
  type ExtensionId,
  type KeyboardShortcutContribution,
  type ShortcutKeybinding,
  type ShortcutKeyStroke,
} from "@wrapt/extension-contracts";
import {
  commandRegistry,
  type CommandRegistry,
  type CommandExecutionContext,
} from "./commandRegistry";
import { evaluateContextExpression, type ShortcutContextValues } from "./contextExpression";
import {
  FrontendContributionRegistry,
  type FrontendRegistrySnapshot,
  type OwnedFrontendContribution,
} from "./registryCore";

export type ShortcutPlatform = "mac" | "windows" | "linux";

export interface ShortcutRegistryValue {
  readonly contribution: KeyboardShortcutContribution;
}

export type OwnedShortcutItem = OwnedFrontendContribution<
  ShortcutRegistryValue
>;

/**
 * Kurzschlüsse, deren Chord auf einer Plattform mehrfach belegt ist, werden
 * nie still durch Registrierungsreihenfolge überschrieben, sondern im
 * Snapshot als Konflikt sichtbar und beim Matching übersprungen. Ein Konflikt
 * trägt alle Plattformen, auf denen der Chord tatsächlich kollidiert —
 * ein Mac-Override darf keinen Konflikt auf Windows auslösen und umgekehrt.
 */
export interface ShortcutConflict {
  readonly chordKey: string;
  readonly platforms: readonly ShortcutPlatform[];
  readonly ids: readonly ContributionId[];
}

export interface ShortcutRegistrySnapshot {
  readonly revision: number;
  readonly shortcuts: readonly OwnedShortcutItem[];
  readonly conflicts: readonly ShortcutConflict[];
}

export interface ShortcutKeyEvent {
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
}

export interface ShortcutInputContext {
  readonly values: ShortcutContextValues;
  readonly editable: boolean;
}

export const shortcutRegistryErrorCodes = [
  "invalid-shortcut",
  "missing-command",
  "foreign-command",
  "foreign-context-key",
] as const;
export type ShortcutRegistryErrorCode =
  (typeof shortcutRegistryErrorCodes)[number];

export class ShortcutRegistryError extends Error {
  readonly code: ShortcutRegistryErrorCode;
  readonly ownerId: string;
  readonly contributionId: string | undefined;

  constructor(
    code: ShortcutRegistryErrorCode,
    message: string,
    ownerId: string,
    contributionId?: string,
  ) {
    super(message);
    this.name = "ShortcutRegistryError";
    this.code = code;
    this.ownerId = ownerId;
    this.contributionId = contributionId;
  }
}

function chordKey(binding: ShortcutKeybinding): string {
  return binding
    .map((stroke) => `${stroke.modifiers.join("+")}+${stroke.key}`)
    .join(" ");
}

function bindingForPlatform(
  contribution: KeyboardShortcutContribution,
  platform: ShortcutPlatform,
): ShortcutKeybinding {
  return contribution.platformOverrides?.[platform] ?? contribution.keybinding;
}

function strokeMatches(
  stroke: ShortcutKeyStroke,
  event: ShortcutKeyEvent,
  platform: ShortcutPlatform,
): boolean {
  if (stroke.key !== event.code) return false;
  const has = (modifier: (typeof stroke.modifiers)[number]): boolean =>
    stroke.modifiers.includes(modifier);
  const primaryPressed = platform === "mac" ? event.metaKey : event.ctrlKey;
  const otherControlPressed = platform === "mac" ? event.ctrlKey : event.metaKey;

  if (has("primary")) {
    if (!primaryPressed || otherControlPressed) return false;
  } else if (has("control")) {
    if (!event.ctrlKey) return false;
  } else if (has("meta")) {
    if (!event.metaKey) return false;
  }

  if (has("alt") !== event.altKey) return false;
  if (has("shift") !== event.shiftKey) return false;
  if (!has("alt") && event.altKey) return false;
  if (!has("shift") && event.shiftKey) return false;
  if (!has("primary") && !has("control") && event.ctrlKey) return false;
  if (!has("primary") && !has("meta") && event.metaKey) return false;
  return true;
}

function compareShortcuts(
  left: OwnedFrontendContribution<ShortcutRegistryValue>,
  right: OwnedFrontendContribution<ShortcutRegistryValue>,
): number {
  return left.contributionId < right.contributionId
    ? -1
    : left.contributionId > right.contributionId
      ? 1
      : 0;
}

const CHORD_TIMEOUT_MS = 1_500;

/**
 * Typisierte Runtime-Grenze für Keyboard Shortcuts. Shortcuts referenzieren
 * Commands desselben Owners und werden über die Command Registry ausgeführt.
 * Kollidierende Chords und nicht erfüllte Context Expressions sind sichtbare,
 * niemals stille Zustände.
 */
export class ShortcutRegistry {
  private readonly commands: CommandRegistry;
  private readonly registry =
    new FrontendContributionRegistry<ShortcutRegistryValue>();
  private readonly chordState = new Map<
    ContributionId,
    { strokeIndex: number; keybinding: ShortcutKeybinding; at: number }
  >();
  private derivedSnapshot: ShortcutRegistrySnapshot = Object.freeze({
    revision: 0,
    shortcuts: Object.freeze([]),
    conflicts: Object.freeze([]),
  });

  constructor(commands: CommandRegistry = commandRegistry) {
    this.commands = commands;
  }

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): ShortcutRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  replaceOwner(
    ownerId: string,
    contributions: readonly KeyboardShortcutContribution[],
  ): ShortcutRegistrySnapshot {
    const values = contributions.map((contribution) => {
      const parsed = keyboardShortcutContributionSchema.safeParse(contribution);
      if (!parsed.success) {
        throw new ShortcutRegistryError(
          "invalid-shortcut",
          "Ein gültiger Keyboard Shortcut wird erwartet.",
          ownerId,
          contribution.id,
        );
      }
      const command = this.commands.get(parsed.data.commandId);
      if (command === undefined) {
        throw new ShortcutRegistryError(
          "missing-command",
          "Ein Shortcut muss einen registrierten Command referenzieren.",
          ownerId,
          parsed.data.id,
        );
      }
      if (command.ownerId !== ownerId) {
        throw new ShortcutRegistryError(
          "foreign-command",
          "Ein Shortcut darf nur einen Command seines eigenen Owners referenzieren.",
          ownerId,
          parsed.data.id,
        );
      }
      if (parsed.data.when !== undefined) {
        for (const key of contextExpressionKeys(parsed.data.when)) {
          if (!contextKeyBelongsToExtension(ownerId, key)) {
            throw new ShortcutRegistryError(
              "foreign-context-key",
              "Context Keys müssen Host-Keys oder Contributions des eigenen Owners sein.",
              ownerId,
              parsed.data.id,
            );
          }
        }
      }
      return Object.freeze({ contribution: parsed.data });
    });

    this.registry.replaceOwner(
      ownerId,
      values.map((value) => ({ id: value.contribution.id, value })),
    );
    return this.getSnapshot();
  }

  removeOwner(ownerId: string): boolean {
    const removed = this.registry.removeOwner(ownerId);
    if (removed) {
      for (const id of this.chordState.keys()) {
        if (id.startsWith(`${ownerId}.`)) this.chordState.delete(id);
      }
    }
    return removed;
  }

  resetChords(): void {
    this.chordState.clear();
  }

  /**
   * Verarbeitet einen Tastendruck. Gibt den ausgeführten Shortcut zurück oder
   * `null`, wenn kein Shortcut zutrifft, der Chord noch unvollständig ist,
   * ein Konflikt besteht oder Context beziehungsweise Eingabefokus den
   * Shortcut blockieren.
   */
  async handleKeyDown(
    event: ShortcutKeyEvent,
    platform: ShortcutPlatform,
    input: ShortcutInputContext,
    commandContext: CommandExecutionContext,
  ): Promise<OwnedShortcutItem | null> {
    const now = Date.now();
    const conflictIds = new Set(
      this.getSnapshot()
        .conflicts.filter((conflict) => conflict.platforms.includes(platform))
        .flatMap((conflict) => conflict.ids),
    );

    for (const shortcut of this.getSnapshot().shortcuts) {
      const contribution = shortcut.value.contribution;
      if (conflictIds.has(shortcut.contributionId)) continue;
      if (event.repeat && !contribution.allowRepeat) continue;
      if (input.editable && !contribution.allowInEditable) continue;
      if (
        contribution.when !== undefined &&
        !evaluateContextExpression(contribution.when, input.values)
      ) {
        this.chordState.delete(shortcut.contributionId);
        continue;
      }

      const keybinding = bindingForPlatform(contribution, platform);
      const pending = this.chordState.get(shortcut.contributionId);
      const strokeIndex =
        pending !== undefined &&
        pending.keybinding === keybinding &&
        now - pending.at <= CHORD_TIMEOUT_MS
          ? pending.strokeIndex
          : 0;
      const stroke = keybinding[strokeIndex];
      if (stroke === undefined || !strokeMatches(stroke, event, platform)) {
        this.chordState.delete(shortcut.contributionId);
        continue;
      }

      if (strokeIndex + 1 < keybinding.length) {
        this.chordState.set(shortcut.contributionId, {
          strokeIndex: strokeIndex + 1,
          keybinding,
          at: now,
        });
        continue;
      }

      this.chordState.delete(shortcut.contributionId);
      const executed = await this.commands.execute(
        contribution.commandId,
        commandContext,
      );
      return executed ? shortcut : null;
    }

    this.resetExpiredChords(now);
    return null;
  }

  private resetExpiredChords(now: number): void {
    for (const [id, state] of this.chordState) {
      if (now - state.at > CHORD_TIMEOUT_MS) this.chordState.delete(id);
    }
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<ShortcutRegistryValue>,
  ): ShortcutRegistrySnapshot {
    const shortcuts = Object.freeze(
      [...snapshot.contributions].sort(compareShortcuts),
    );
    // Konflikte werden pro Plattform ermittelt und anschließend über
    // identische Chord- und ID-Mengen zusammengefasst, damit ein Konflikt,
    // der auf mehreren Plattformen gleich aussieht, nur einen Eintrag mit
    // vollständiger Plattformliste erzeugt.
    const byPlatform = new Map<
      string,
      { chordKey: string; platforms: ShortcutPlatform[]; ids: Set<ContributionId> }
    >();
    const platforms: ShortcutPlatform[] = ["mac", "windows", "linux"];
    for (const platform of platforms) {
      const perPlatform = new Map<
        string,
        { platform: ShortcutPlatform; ids: ContributionId[] }
      >();
      for (const shortcut of shortcuts) {
        const contribution = shortcut.value.contribution;
        const key = chordKey(bindingForPlatform(contribution, platform));
        const entry = perPlatform.get(key);
        if (entry === undefined) {
          perPlatform.set(key, { platform, ids: [shortcut.contributionId] });
          continue;
        }
        if (!entry.ids.includes(shortcut.contributionId)) {
          entry.ids.push(shortcut.contributionId);
        }
      }
      for (const [chordKey, entry] of perPlatform) {
        if (entry.ids.length < 2) continue;
        const idsKey = [...entry.ids].sort().join("\u0000");
        const merged = byPlatform.get(`${chordKey}\u0000${idsKey}`);
        if (merged === undefined) {
          byPlatform.set(`${chordKey}\u0000${idsKey}`, {
            chordKey,
            platforms: [platform],
            ids: new Set(entry.ids),
          });
          continue;
        }
        merged.platforms.push(platform);
      }
    }
    const conflicts = Object.freeze(
      [...byPlatform.values()]
        .sort((left, right) =>
          left.chordKey === right.chordKey
            ? [...left.ids].sort().join("\u0000").localeCompare([...right.ids].sort().join("\u0000"))
            : left.chordKey.localeCompare(right.chordKey),
        )
        .map((entry) =>
          Object.freeze({
            chordKey: entry.chordKey,
            platforms: Object.freeze(entry.platforms),
            ids: Object.freeze([...entry.ids].sort()),
          }),
        ),
    );
    return Object.freeze({ revision: snapshot.revision, shortcuts, conflicts });
  }
}

export const shortcutRegistry = new ShortcutRegistry();

export type { ContributionId, ExtensionId };
