import { type CommandContribution, type KeyboardShortcutContribution } from "@wrapt/extension-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "./commandRegistry";
import {
  ShortcutRegistry,
  ShortcutRegistryError,
  type ShortcutKeyEvent,
  type ShortcutPlatform,
} from "./shortcutRegistry";

function command(ownerId: string): { id: string; contribution: CommandContribution; execute: ReturnType<typeof vi.fn<() => void>> } {
  const execute = vi.fn<() => void>();
  return {
    id: `${ownerId}.command.main`,
    contribution: { id: `${ownerId}.command.main`, title: "Testbefehl" } as CommandContribution,
    execute,
  };
}

// Bewusst ohne Schema-Parse: die Registry validiert das Manifest selbst.
function shortcut(
  ownerId: string,
  overrides: Record<string, unknown> = {},
): KeyboardShortcutContribution {
  return {
    id: `${ownerId}.shortcut.main`,
    commandId: `${ownerId}.command.main`,
    keybinding: [{ key: "KeyA", modifiers: ["primary"] }],
    ...overrides,
  } as KeyboardShortcutContribution;
}

function keyEvent(overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    code: "KeyA",
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  };
}

const platform: ShortcutPlatform = "windows";

const input = { values: new Map(), editable: false } as const;

function expectShortcutError(
  action: () => unknown,
  code: ShortcutRegistryError["code"],
): void {
  try {
    action();
    throw new Error("Der erwartete Shortcut-Registry-Fehler blieb aus.");
  } catch (error) {
    expect(error).toBeInstanceOf(ShortcutRegistryError);
    expect((error as ShortcutRegistryError).code).toBe(code);
  }
}

describe("ShortcutRegistry", () => {
  let commands: CommandRegistry;
  let registry: ShortcutRegistry;

  beforeEach(() => {
    commands = new CommandRegistry();
    registry = new ShortcutRegistry(commands);
  });

  function registerOwner(ownerId: string, shortcuts: KeyboardShortcutContribution[] = [shortcut(ownerId)]) {
    const cmd = command(ownerId);
    commands.replaceOwner(ownerId, [{ contribution: cmd.contribution, runtime: { execute: cmd.execute } }]);
    registry.replaceOwner(ownerId, shortcuts);
    return cmd;
  }

  it("führt einen passenden Shortcut über den referenzierten Command aus", async () => {
    const cmd = registerOwner("workbench.test");
    const executed = await registry.handleKeyDown(keyEvent(), platform, input, { surface: "global" });
    expect(executed?.contributionId).toBe("workbench.test.shortcut.main");
    expect(cmd.execute).toHaveBeenCalledTimes(1);
  });

  it("meldet einen Konflikt statt still zu überschreiben", () => {
    const first = command("workbench.alpha");
    const second = command("workbench.beta");
    commands.replaceOwner("workbench.alpha", [{ contribution: first.contribution, runtime: { execute: first.execute } }]);
    commands.replaceOwner("workbench.beta", [{ contribution: second.contribution, runtime: { execute: second.execute } }]);
    registry.replaceOwner("workbench.alpha", [shortcut("workbench.alpha")]);
    registry.replaceOwner("workbench.beta", [shortcut("workbench.beta")]);

    const conflicts = registry.getSnapshot().conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.ids).toEqual([
      "workbench.alpha.shortcut.main",
      "workbench.beta.shortcut.main",
    ]);
    expect(conflicts[0]!.platforms).toEqual(["mac", "windows", "linux"]);
  });

  it("trennt Konflikte nach Plattform statt sie zu verschmelzen", async () => {
    // alpha und beta kollidieren nur auf Windows: beta hat auf dem Mac ein
    // eigenes Override, alpha nicht. Der Mac-Shortcut darf trotzdem feuern.
    const first = command("workbench.alpha");
    const second = command("workbench.beta");
    commands.replaceOwner("workbench.alpha", [{ contribution: first.contribution, runtime: { execute: first.execute } }]);
    commands.replaceOwner("workbench.beta", [{ contribution: second.contribution, runtime: { execute: second.execute } }]);
    registry.replaceOwner("workbench.alpha", [shortcut("workbench.alpha")]);
    registry.replaceOwner("workbench.beta", [
      shortcut("workbench.beta", {
        platformOverrides: { mac: [{ key: "KeyB", modifiers: ["meta"] }] },
      }),
    ]);

    const conflicts = registry.getSnapshot().conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.platforms).toEqual(["windows", "linux"]);

    // Windows: Konflikt ⇒ beide blockiert.
    const blocked = await registry.handleKeyDown(keyEvent(), "windows", input, { surface: "global" });
    expect(blocked).toBeNull();
    expect(first.execute).not.toHaveBeenCalled();

    // Mac: kein Konflikt ⇒ alpha feuert über primary (meta).
    const executed = await registry.handleKeyDown(
      keyEvent({ ctrlKey: false, metaKey: true }),
      "mac",
      input,
      { surface: "global" },
    );
    expect(executed?.contributionId).toBe("workbench.alpha.shortcut.main");
    expect(first.execute).toHaveBeenCalledTimes(1);
    expect(second.execute).not.toHaveBeenCalled();
  });

  it("führt konfliktbehaftete Shortcuts nicht aus", async () => {
    const first = registerOwner("workbench.alpha");
    const second = command("workbench.beta");
    commands.replaceOwner("workbench.beta", [{ contribution: second.contribution, runtime: { execute: second.execute } }]);
    registry.replaceOwner("workbench.beta", [shortcut("workbench.beta")]);

    const executed = await registry.handleKeyDown(keyEvent(), platform, input, { surface: "global" });
    expect(executed).toBeNull();
    expect(first.execute).not.toHaveBeenCalled();
    expect(second.execute).not.toHaveBeenCalled();
  });

  it("überspringt Shortcuts mit nicht erfüllter Context Expression", async () => {
    const cmd = registerOwner("workbench.test", [
      shortcut("workbench.test", {
        when: { all: [{ key: "host.surface", operator: "equals", value: "workbench" }] },
      }),
    ]);
    const executed = await registry.handleKeyDown(keyEvent(), platform, input, { surface: "global" });
    expect(executed).toBeNull();
    expect(cmd.execute).not.toHaveBeenCalled();
  });

  it("respektiert allowRepeat", async () => {
    const cmd = registerOwner("workbench.test");
    const repeated = await registry.handleKeyDown(keyEvent({ repeat: true }), platform, input, { surface: "global" });
    expect(repeated).toBeNull();
    expect(cmd.execute).not.toHaveBeenCalled();
  });

  it("blockiert editierbare Bereiche ohne allowInEditable", async () => {
    const cmd = registerOwner("workbench.test");
    const executed = await registry.handleKeyDown(keyEvent(), platform, { values: new Map(), editable: true }, { surface: "global" });
    expect(executed).toBeNull();
    expect(cmd.execute).not.toHaveBeenCalled();
  });

  it("führt zweistufige Chords erst nach dem zweiten Stroke aus", async () => {
    const cmd = registerOwner("workbench.test", [
      shortcut("workbench.test", {
        keybinding: [
          { key: "KeyA", modifiers: ["primary"] },
          { key: "KeyB", modifiers: [] },
        ],
      }),
    ]);
    const firstStroke = await registry.handleKeyDown(keyEvent(), platform, input, { surface: "global" });
    expect(firstStroke).toBeNull();
    expect(cmd.execute).not.toHaveBeenCalled();
    const secondStroke = await registry.handleKeyDown(keyEvent({ code: "KeyB", ctrlKey: false }), platform, input, { surface: "global" });
    expect(secondStroke?.contributionId).toBe("workbench.test.shortcut.main");
    expect(cmd.execute).toHaveBeenCalledTimes(1);
  });

  it("setzt einen unterbrochenen Chord nach abweichendem Stroke zurück", async () => {
    const cmd = registerOwner("workbench.test", [
      shortcut("workbench.test", {
        keybinding: [
          { key: "KeyA", modifiers: ["primary"] },
          { key: "KeyB", modifiers: [] },
        ],
      }),
    ]);
    await registry.handleKeyDown(keyEvent(), platform, input, { surface: "global" });
    await registry.handleKeyDown(keyEvent({ code: "KeyC", ctrlKey: false }), platform, input, { surface: "global" });
    const restarted = await registry.handleKeyDown(keyEvent(), platform, input, { surface: "global" });
    expect(restarted).toBeNull();
    expect(cmd.execute).not.toHaveBeenCalled();
  });

  it("nutzt Plattform-Overrides", async () => {
    const cmd = registerOwner("workbench.test", [
      shortcut("workbench.test", {
        platformOverrides: { mac: [{ key: "KeyA", modifiers: ["meta"] }] },
      }),
    ]);
    const executed = await registry.handleKeyDown(
      keyEvent({ ctrlKey: false, metaKey: true }),
      "mac",
      input,
      { surface: "global" },
    );
    expect(executed?.contributionId).toBe("workbench.test.shortcut.main");
    expect(cmd.execute).toHaveBeenCalledTimes(1);
  });

  it("entfernt Shortcuts eines Owners beim Dispose", () => {
    registerOwner("workbench.test");
    expect(registry.removeOwner("workbench.test")).toBe(true);
    expect(registry.getSnapshot().shortcuts).toHaveLength(0);
  });

  it("lehnt ein ungültiges Manifest ab", () => {
    expectShortcutError(
      () => registry.replaceOwner("workbench.test", [shortcut("workbench.test", { keybinding: [] })]),
      "invalid-shortcut",
    );
  });

  it("lehnt eine fehlende Command-Referenz ab", () => {
    expectShortcutError(
      () => registry.replaceOwner("workbench.test", [shortcut("workbench.test", { commandId: "workbench.test.command.fehlt" })]),
      "missing-command",
    );
  });

  it("lehnt einen Command eines fremden Owners ab", () => {
    const other = command("workbench.other");
    commands.replaceOwner("workbench.other", [{ contribution: other.contribution, runtime: { execute: other.execute } }]);
    expectShortcutError(
      () => registry.replaceOwner("workbench.test", [shortcut("workbench.test", { commandId: "workbench.other.command.main" })]),
      "foreign-command",
    );
  });

  it("lehnt Context Keys in fremden Namespaces ab", () => {
    registerOwner("workbench.test");
    expectShortcutError(
      () => registry.replaceOwner("workbench.test", [
        shortcut("workbench.test", {
          when: { all: [{ key: "workbench.other.context.value", operator: "exists" }] },
        }),
      ]),
      "foreign-context-key",
    );
  });
});
