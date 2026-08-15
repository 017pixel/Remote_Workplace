import { describe, expect, it } from "vitest";
import { registerLegacyPageRoutes } from "./legacyPageRoutes";
import { registerLegacyNavigation, legacyNavigationOwners } from "./legacyNavigation";
import { NavigationRegistry } from "./navigationRegistry";
import { PageRouteRegistry } from "./pageRouteRegistry";

// Feste Paritätserwartungen der bisherigen statischen Navigation
// (ehemals `routes/navigation.ts`). Änderungen an dieser Liste sind
// sichtbare Produktänderungen und benötigen bewusste Entscheidung.
const expectedGroups: ReadonlyArray<{
  group: "workspace" | "tools" | "account";
  labels: readonly string[];
}> = [
  {
    group: "workspace",
    labels: ["Dashboard", "Inbox", "Workbench", "Tech TLDRs", "Projekte"],
  },
  {
    group: "tools",
    labels: [
      "T3 Code",
      "Hermes Agent",
      "Code-Server",
      "Terminal",
      "OpenCode",
      "Codex",
      "Claude Code",
      "Previews",
      "Dateien",
      "Browser",
      "KI-Skills",
    ],
  },
  {
    group: "account",
    labels: ["Nutzung", "Einstellungen"],
  },
];

const expectedPaths: ReadonlyArray<readonly [string, string]> = [
  ["Dashboard", "/"],
  ["Inbox", "/inbox"],
  ["Workbench", "/workbench"],
  ["Tech TLDRs", "/tech-tldrs"],
  ["Projekte", "/projects"],
  ["T3 Code", "/t3-code"],
  ["Hermes Agent", "/hermes-agent"],
  ["Code-Server", "/code-editor"],
  ["Terminal", "/terminal"],
  ["OpenCode", "/opencode"],
  ["Codex", "/codex"],
  ["Claude Code", "/claude"],
  ["Previews", "/previews"],
  ["Dateien", "/files"],
  ["Browser", "/browser"],
  ["KI-Skills", "/ki-skills"],
  ["Nutzung", "/usage"],
  ["Einstellungen", "/settings"],
];

function buildIsolatedRegistry(): { registry: NavigationRegistry; routes: PageRouteRegistry } {
  const routes = new PageRouteRegistry();
  registerLegacyPageRoutes(routes);
  return { registry: new NavigationRegistry(routes), routes };
}

describe("legacyNavigation", () => {
  it("registriert genau einen Built-in pro bisheriger Navigationsfläche", () => {
    expect(legacyNavigationOwners).toHaveLength(18);
  });

  it("bildet Gruppen, Reihenfolge und Labels der bisherigen Navigation exakt ab", () => {
    const { registry } = buildIsolatedRegistry();
    registerLegacyNavigation(registry);
    const snapshot = registry.getSnapshot();

    expect(snapshot.byGroup.extensions).toHaveLength(0);
    expect(snapshot.byGroup.system).toHaveLength(0);

    const groupByKey = {
      workspace: snapshot.byGroup.workspace,
      tools: snapshot.byGroup.tools,
      account: snapshot.byGroup.account,
    };
    for (const expected of expectedGroups) {
      expect(groupByKey[expected.group].map((item) => item.value.contribution.label)).toEqual(expected.labels);
    }
  });

  it("führt jede Fläche auf denselben URL-Pfad wie bisher", () => {
    const { registry } = buildIsolatedRegistry();
    registerLegacyNavigation(registry);
    const byLabel = new Map(
      registry.getSnapshot().items.map((item) => [item.value.contribution.label, item.value.route.path]),
    );
    for (const [label, path] of expectedPaths) {
      expect(byLabel.get(label)).toBe(path);
    }
  });

  it("registriert alle Items über die gemeinsame Registry-Grenze", () => {
    const { registry } = buildIsolatedRegistry();
    registerLegacyNavigation(registry);
    const snapshot = registry.getSnapshot();

    expect(snapshot.items).toHaveLength(18);
    for (const item of snapshot.items) {
      expect(item.value.contribution.id).toBe(`${item.ownerId}.navigation.main`);
      expect(item.value.runtime.icon).toBeTypeOf("function");
      expect(item.value.runtime.legacyVisibilityKey).toBeTypeOf("string");
      expect(item.value.route.path.startsWith("/")).toBe(true);
    }
  });

  it("hält die Standard-Sichtbarkeit der CLI-Flächen konsistent zur Persistenz", () => {
    const { registry } = buildIsolatedRegistry();
    registerLegacyNavigation(registry);
    const snapshot = registry.getSnapshot();

    const byLabel = new Map(
      snapshot.items.map((item) => [item.value.contribution.label, item.value.contribution]),
    );
    expect(byLabel.get("Codex")?.visibleByDefault).toBe(false);
    expect(byLabel.get("OpenCode")?.visibleByDefault).toBe(false);
    expect(byLabel.get("Claude Code")?.visibleByDefault).toBe(false);
    expect(byLabel.get("Dashboard")?.visibleByDefault).toBe(true);
    expect(byLabel.get("Einstellungen")?.visibleByDefault).toBe(true);
  });

  it("führt Navigation- und Route-Metadaten aus einer Quelle zusammen", () => {
    const { registry, routes } = buildIsolatedRegistry();
    registerLegacyNavigation(registry);

    for (const item of registry.getSnapshot().items) {
      const route = routes.getRoute(item.value.route.routeId);
      expect(route).toBeDefined();
      expect(item.value.route.prefetch).toBe(route?.value.contribution.prefetch);
      expect(item.value.route.mobileNavigation).toBe(true);
    }
  });
});
