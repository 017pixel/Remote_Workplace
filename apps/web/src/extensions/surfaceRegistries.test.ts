import type {
  CommandContribution,
  ContextMenuContribution,
  StatusBarContribution,
  TopbarContribution,
} from "@workbench/extension-contracts";
import { pageContributionSchema, routeContributionSchema } from "@workbench/extension-contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { CommandRegistry } from "./commandRegistry";
import { ContextMenuRegistry, ContextMenuRegistryError } from "./contextMenuRegistry";
import { PageRouteRegistry } from "./pageRouteRegistry";
import { StatusBarRegistry, StatusBarRegistryError } from "./statusBarRegistry";
import { TopbarRegistry, TopbarRegistryError } from "./topbarRegistry";

function command(ownerId: string, id = `${ownerId}.command.main`): CommandContribution {
  return { id, title: "Testbefehl" } as CommandContribution;
}

function registerRoute(routes: PageRouteRegistry, ownerId: string): void {
  const pageId = `${ownerId}.page.main`;
  routes.replaceOwner(ownerId, {
    pages: [
      {
        contribution: pageContributionSchema.parse({ id: pageId, title: "Testseite" }),
        runtime: {
          chunkId: "test",
          exportName: "TestPage",
          loading: "lazy",
          recovery: "stale-chunk",
          load: () => Promise.resolve({}),
        },
      },
    ],
    routes: [
      {
        contribution: routeContributionSchema.parse({
          id: `${ownerId}.route.main`,
          pageId,
          path: "/test",
        }),
        runtime: {
          boundary: "deferred-route",
          aliasBehavior: "render",
        },
      },
    ],
  });
}

function statusBar(ownerId: string, overrides: Record<string, unknown> = {}): StatusBarContribution {
  return {
    id: `${ownerId}.statusbar.main`,
    title: "Teststatus",
    kind: "text",
    provider: `${ownerId}.provider.main`,
    alignment: "left",
    order: 10,
    priority: 50,
    compact: "value",
    ...overrides,
  } as StatusBarContribution;
}

function topbar(ownerId: string, overrides: Record<string, unknown> = {}): TopbarContribution {
  return {
    id: `${ownerId}.topbar.main`,
    kind: "action",
    routeId: `${ownerId}.route.main`,
    commandId: `${ownerId}.command.main`,
    placement: "primary",
    order: 10,
    priority: 50,
    presentation: "icon-label",
    compact: "overflow",
    ...overrides,
  } as TopbarContribution;
}

function contextMenu(ownerId: string, overrides: Record<string, unknown> = {}): ContextMenuContribution {
  return {
    id: `${ownerId}.menu.main`,
    surface: "host.context-menu.file",
    commandId: `${ownerId}.command.main`,
    group: "open",
    order: 10,
    ...overrides,
  } as ContextMenuContribution;
}

describe("StatusBarRegistry", () => {
  let commands: CommandRegistry;
  let registry: StatusBarRegistry;

  beforeEach(() => {
    commands = new CommandRegistry();
    registry = new StatusBarRegistry(commands);
  });

  it("registriert und sortiert Items nach Alignment und Reihenfolge", () => {
    const owner = "workbench.test";
    registry.replaceOwner(owner, [
      { contribution: statusBar(owner, { alignment: "right", order: 20 }), runtime: {} },
      { contribution: statusBar(owner, { id: `${owner}.statusbar.second`, alignment: "left", order: 30 }), runtime: {} },
    ]);
    const snapshot = registry.getSnapshot();
    expect(snapshot.left.map((item) => item.contributionId)).toEqual([`${owner}.statusbar.second`]);
    expect(snapshot.right.map((item) => item.contributionId)).toEqual([`${owner}.statusbar.main`]);
  });

  it("lehnt einen Provider außerhalb des Owner-Namespaces ab", () => {
    expect(() =>
      registry.replaceOwner("workbench.test", [
        { contribution: statusBar("workbench.test", { provider: "workbench.other.provider.main" }), runtime: {} },
      ]),
    ).toThrowError(StatusBarRegistryError);
  });

  it("lehnt einen fremden Command bei Aktionen ab", () => {
    commands.replaceOwner("workbench.other", [{ contribution: command("workbench.other"), runtime: { execute: () => undefined } }]);
    expect(() =>
      registry.replaceOwner("workbench.test", [
        {
          contribution: statusBar("workbench.test", { kind: "action", commandId: "workbench.other.command.main" }),
          runtime: {},
        },
      ]),
    ).toThrowError(StatusBarRegistryError);
  });

  it("wertet when-Expressions über sichtbare Items aus", () => {
    const owner = "workbench.test";
    registry.replaceOwner(owner, [
      {
        contribution: statusBar(owner, {
          when: { all: [{ key: "host.orbit.focused", operator: "exists" }] },
        }),
        runtime: {},
      },
    ]);
    const item = registry.getSnapshot().items[0]!;
    expect(registry.visibleIn(item, new Map())).toBe(false);
    expect(registry.visibleIn(item, new Map([["host.orbit.focused", true] as const]))).toBe(true);
  });

  it("entfernt Items eines Owners beim Dispose", () => {
    registry.replaceOwner("workbench.test", [{ contribution: statusBar("workbench.test"), runtime: {} }]);
    expect(registry.removeOwner("workbench.test")).toBe(true);
    expect(registry.getSnapshot().items).toHaveLength(0);
  });
});

describe("TopbarRegistry", () => {
  let commands: CommandRegistry;
  let routes: PageRouteRegistry;
  let registry: TopbarRegistry;

  beforeEach(() => {
    commands = new CommandRegistry();
    routes = new PageRouteRegistry();
    registry = new TopbarRegistry(commands, routes);
  });

  function registerCommand(ownerId: string) {
    commands.replaceOwner(ownerId, [{ contribution: command(ownerId), runtime: { execute: () => undefined } }]);
  }

  function registerOwner(ownerId: string) {
    registerCommand(ownerId);
    registerRoute(routes, ownerId);
  }

  it("registriert Actions mit Command-Referenz und sortiert nach Platzierung", () => {
    const owner = "workbench.test";
    registerOwner(owner);
    registry.replaceOwner(owner, [
      { contribution: topbar(owner, { placement: "secondary" }), runtime: {} },
      { contribution: topbar(owner, { id: `${owner}.topbar.second`, placement: "primary" }), runtime: {} },
    ]);
    const snapshot = registry.getSnapshot();
    expect(snapshot.primary.map((item) => item.contributionId)).toEqual([`${owner}.topbar.second`]);
    expect(snapshot.secondary).toHaveLength(1);
    expect(snapshot.overflow).toHaveLength(0);
  });

  it("lehnt einen fehlenden Command ab", () => {
    registerRoute(routes, "workbench.test");
    expect(() =>
      registry.replaceOwner("workbench.test", [{ contribution: topbar("workbench.test"), runtime: {} }]),
    ).toThrowError(TopbarRegistryError);
  });

  it("lehnt eine nicht deklarierte Route ab", () => {
    registerCommand("workbench.test");
    expect(() =>
      registry.replaceOwner("workbench.test", [{ contribution: topbar("workbench.test"), runtime: {} }]),
    ).toThrowError(TopbarRegistryError);
  });

  it("erlaubt Aktionen auf Routen eines fremden Owners", () => {
    const owner = "workbench.test";
    registerCommand(owner);
    registerRoute(routes, "workbench.other");
    registry.replaceOwner(owner, [
      { contribution: topbar(owner, { routeId: "workbench.other.route.main" }), runtime: {} },
    ]);
    expect(registry.getSnapshot().items).toHaveLength(1);
  });

  it("lehnt einen Selector Provider außerhalb des Owner-Namespaces ab", () => {
    const owner = "workbench.test";
    registerOwner(owner);
    expect(() =>
      registry.replaceOwner(owner, [
        {
          contribution: topbar(owner, { kind: "selector", provider: "workbench.other.provider.main" }),
          runtime: {},
        },
      ]),
    ).toThrowError(TopbarRegistryError);
  });
});

describe("ContextMenuRegistry", () => {
  let commands: CommandRegistry;
  let registry: ContextMenuRegistry;

  beforeEach(() => {
    commands = new CommandRegistry();
    registry = new ContextMenuRegistry(commands);
  });

  function registerCommand(ownerId: string) {
    commands.replaceOwner(ownerId, [{ contribution: command(ownerId), runtime: { execute: () => undefined } }]);
  }

  it("gruppiert Items pro Surface in deterministischer Reihenfolge", () => {
    const owner = "workbench.test";
    registerCommand(owner);
    registry.replaceOwner(owner, [
      { contribution: contextMenu(owner, { group: "danger", order: 10 }), runtime: {} },
      { contribution: contextMenu(owner, { id: `${owner}.menu.second`, group: "open", order: 20 }), runtime: {} },
    ]);
    const bySurface = registry.getSnapshot().bySurface.get("host.context-menu.file");
    expect(bySurface?.map((item) => item.value.contribution.group)).toEqual(["open", "danger"]);
  });

  it("erlaubt Host-Surfaces und eigene Extension-Surfaces", () => {
    const owner = "workbench.test";
    registerCommand(owner);
    registry.replaceOwner(owner, [
      { contribution: contextMenu(owner, { surface: `${owner}.menu.surface.custom` }), runtime: {} },
    ]);
    expect(registry.getSnapshot().bySurface.get(`${owner}.menu.surface.custom` as never)).toHaveLength(1);
  });

  it("lehnt eine fremde Extension-Surface ab", () => {
    const owner = "workbench.test";
    registerCommand(owner);
    expect(() =>
      registry.replaceOwner(owner, [
        { contribution: contextMenu(owner, { surface: "workbench.other.menu.surface.custom" }), runtime: {} },
      ]),
    ).toThrowError(ContextMenuRegistryError);
  });

  it("lehnt einen fremden Command ab", () => {
    const owner = "workbench.test";
    commands.replaceOwner("workbench.other", [{ contribution: command("workbench.other"), runtime: { execute: () => undefined } }]);
    expect(() =>
      registry.replaceOwner(owner, [
        { contribution: contextMenu(owner, { commandId: "workbench.other.command.main" }), runtime: {} },
      ]),
    ).toThrowError(ContextMenuRegistryError);
  });
});
