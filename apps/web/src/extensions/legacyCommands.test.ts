import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "./commandRegistry";
import { legacyCommandOwners, registerLegacyCommands } from "./legacyCommands";

describe("legacyCommands", () => {
  it("registriert die globalen Legacy Commands über die gemeinsame Registry-Grenze", () => {
    const registry = new CommandRegistry();
    registerLegacyCommands(registry);

    const snapshot = registry.getSnapshot();
    expect(snapshot.commands.map((item) => item.contributionId)).toEqual([
      "wrapt.orbit.command.project-browser",
      "wrapt.shell.command.fullscreen-toggle",
      "wrapt.shell.command.reload",
    ]);
  });

  it("führt den Projektbrowser-Command über den bestehenden Orbit-Kanal aus", async () => {
    const dispatch = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: dispatch });
    const registry = new CommandRegistry();
    registerLegacyCommands(registry);

    expect(await registry.execute("wrapt.orbit.command.project-browser")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0]![0] as Event).type).toBe("orbit:project-browser");
    vi.unstubAllGlobals();
  });

  it("hält alle Legacy Commands in der globalen Surface ausführbar", async () => {
    const registry = new CommandRegistry();
    registerLegacyCommands(registry);

    for (const item of legacyCommandOwners.flatMap((owner) => owner.registrations)) {
      expect(item.runtime.surface ?? "global").toBe("global");
      expect(item.contribution.category).toBeDefined();
    }
  });
});
