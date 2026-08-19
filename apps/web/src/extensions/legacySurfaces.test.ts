import { describe, expect, it } from "vitest";
import { CommandRegistry } from "./commandRegistry";
import { ContextMenuRegistry } from "./contextMenuRegistry";
import { registerLegacyCommands } from "./legacyCommands";
import { registerLegacyContextMenus } from "./legacyContextMenus";
import { registerLegacyPageRoutes } from "./legacyPageRoutes";
import { registerLegacyStatusBar } from "./legacyStatusBar";
import { registerLegacyTopbar } from "./legacyTopbar";
import { PageRouteRegistry } from "./pageRouteRegistry";
import { StatusBarRegistry } from "./statusBarRegistry";
import { TopbarRegistry } from "./topbarRegistry";

describe("Legacy Oberflächen-Built-ins", () => {
  it("registriert die drei Usage Provider in fester Reihenfolge", () => {
    const commands = new CommandRegistry();
    registerLegacyCommands(commands);
    const registry = new StatusBarRegistry(commands);
    registerLegacyStatusBar(registry);

    const snapshot = registry.getSnapshot();
    expect(snapshot.right.map((item) => item.value.contribution.title)).toEqual([
      "Codex",
      "OpenCode",
      "Claude",
    ]);
    expect(snapshot.right.map((item) => item.value.runtime.usageProviderId)).toEqual([
      "codex",
      "opencode",
      "claude",
    ]);
    expect(snapshot.left).toHaveLength(0);
  });

  it("registriert die Topbar-Aktionen auf der Dateien-Route mit Shell-Commands", () => {
    const commands = new CommandRegistry();
    registerLegacyCommands(commands);
    const routes = new PageRouteRegistry();
    registerLegacyPageRoutes(routes);
    const registry = new TopbarRegistry(commands, routes);
    registerLegacyTopbar(registry);

    const snapshot = registry.getSnapshot();
    expect(snapshot.items.map((item) => item.contributionId)).toEqual([
      "wrapt.shell.topbar.fullscreen-toggle",
      "wrapt.shell.topbar.reload",
    ]);
    for (const item of snapshot.items) {
      expect(item.value.contribution.routeId).toBe("wrapt.files.route.main");
      expect(item.value.runtime.icon).toBeTypeOf("function");
      expect(commands.get(item.value.contribution.commandId)).toBeDefined();
    }
  });

  it("registriert den Projektbrowser-Menüpunkt auf der Orbit-Fläche", () => {
    const commands = new CommandRegistry();
    registerLegacyCommands(commands);
    const registry = new ContextMenuRegistry(commands);
    registerLegacyContextMenus(registry);

    const items = registry.getSnapshot().bySurface.get("host.context-menu.orbit-pane");
    expect(items?.map((item) => item.contributionId)).toEqual([
      "wrapt.orbit.menu.project-browser",
    ]);
    expect(items?.[0]?.value.contribution.commandId).toBe(
      "wrapt.orbit.command.project-browser",
    );
  });
});
