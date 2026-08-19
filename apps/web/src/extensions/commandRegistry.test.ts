import { type CommandContribution } from "@wrapt/extension-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrontendRegistryError } from "./registryCore";
import {
  CommandRegistry,
  CommandRegistryError,
  type CommandRegistration,
} from "./commandRegistry";

// Bewusst ohne Schema-Parse: die Registry validiert das Manifest selbst,
// damit negative Fälle auch wirklich die Registry erreichen.
function command(
  ownerId: string,
  overrides: Record<string, unknown> = {},
): CommandRegistration {
  return {
    contribution: {
      id: `${ownerId}.command.main`,
      title: "Testbefehl",
      ...overrides,
    } as CommandContribution,
    runtime: Object.freeze({ execute: vi.fn() }),
  };
}

function expectCommandError(
  action: () => unknown,
  code: CommandRegistryError["code"],
): void {
  try {
    action();
    throw new Error("Der erwartete Command-Registry-Fehler blieb aus.");
  } catch (error) {
    expect(error).toBeInstanceOf(CommandRegistryError);
    expect((error as CommandRegistryError).code).toBe(code);
  }
}

describe("CommandRegistry", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it("registriert Commands mit Metadaten und Handler", () => {
    const snapshot = registry.replaceOwner("workbench.test", [command("workbench.test")]);
    expect(snapshot.revision).toBe(1);
    expect(snapshot.commands).toHaveLength(1);
    expect(registry.get("workbench.test.command.main")?.value.contribution.title).toBe("Testbefehl");
  });

  it("führt einen registrierten Command aus", async () => {
    const registration = command("workbench.test");
    registry.replaceOwner("workbench.test", [registration]);
    const executed = await registry.execute("workbench.test.command.main");
    expect(executed).toBe(true);
    expect(registration.runtime.execute).toHaveBeenCalledWith({ surface: "global" });
  });

  it("löst alte workbench-IDs auf einen Wrapt-Command auf", async () => {
    const registration = command("wrapt.test");
    registry.replaceOwner("wrapt.test", [registration]);
    expect(await registry.execute("workbench.test.command.main")).toBe(true);
    expect(registry.get("workbench.test.command.main")?.ownerId).toBe("wrapt.test");
  });

  it("meldet einen unbekannten Command als nicht ausführbar", async () => {
    expect(await registry.execute("workbench.test.command.fehlt")).toBe(false);
  });

  it("blockiert Commands außerhalb ihrer Surface", async () => {
    const registration = command("workbench.test", {});
    registry.replaceOwner("workbench.test", [
      { ...registration, runtime: Object.freeze({ execute: vi.fn(), surface: "terminal" }) },
    ]);
    expect(await registry.execute("workbench.test.command.main")).toBe(false);
    expect(await registry.execute("workbench.test.command.main", { surface: "terminal" })).toBe(true);
  });

  it("propagiert Handler-Fehler an den Aufrufer", async () => {
    const failure = new Error("Handler-Fehler");
    registry.replaceOwner("workbench.test", [
      { ...command("workbench.test"), runtime: Object.freeze({ execute: () => { throw failure; } }) },
    ]);
    await expect(registry.execute("workbench.test.command.main")).rejects.toBe(failure);
  });

  it("entfernt Commands eines Owners beim Dispose", () => {
    registry.replaceOwner("workbench.test", [command("workbench.test")]);
    expect(registry.removeOwner("workbench.test")).toBe(true);
    expect(registry.getSnapshot().commands).toHaveLength(0);
  });

  it("lehnt ein ungültiges Manifest ab", () => {
    expectCommandError(
      () => registry.replaceOwner("workbench.test", [command("workbench.test", { title: "x".repeat(500) })]),
      "invalid-command",
    );
  });

  it("lehnt eine Runtime-Bindung ohne Handler ab", () => {
    expectCommandError(
      () => registry.replaceOwner("workbench.test", [
        { ...command("workbench.test"), runtime: Object.freeze({}) } as CommandRegistration,
      ]),
      "invalid-command-runtime",
    );
  });

  it("lehnt eine Contribution ID eines fremden Owners ab", () => {
    try {
      registry.replaceOwner("workbench.test", [command("workbench.test", { id: "workbench.other.command.main" })]);
      throw new Error("Der erwartete Namespace-Fehler blieb aus.");
    } catch (error) {
      expect(error).toBeInstanceOf(FrontendRegistryError);
      expect((error as FrontendRegistryError).code).toBe("foreign-namespace");
    }
  });
});
