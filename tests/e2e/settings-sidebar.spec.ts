import { expect, test, type Page } from "@playwright/test";

test.use({ extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" } });

const SIDEBAR_PREFERENCES_KEY = "wrapt.sidebar-preferences.v1";

async function startWithDefaultSidebarPreferences(page: Page) {
  await page.addInitScript((key) => {
    const resetMarker = `${key}.test-reset`;
    if (window.sessionStorage.getItem(resetMarker)) return;
    window.localStorage.removeItem(key);
    window.sessionStorage.setItem(resetMarker, "1");
  }, SIDEBAR_PREFERENCES_KEY);
}

function settingsSection(page: Page, title: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

async function openSurfaceTab(page: Page) {
  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Oberfläche", exact: true }).click();
}

test("schaltet Seiten in Sidebar und Navigation um und behält die Auswahl nach Reload", async ({ page }) => {
  await startWithDefaultSidebarPreferences(page);
  await openSurfaceTab(page);

  const visibility = settingsSection(page, "Seiten-Sichtbarkeit");
  const codex = visibility.getByRole("button", { name: "Codex Codex", exact: true });

  await expect(codex.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Codex", exact: true })).toHaveCount(0);

  await codex.click();
  await expect(codex.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Codex", exact: true })).toBeVisible();

  await page.reload();
  await expect(visibility.getByRole("button", { name: "Codex Codex", exact: true }).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Codex", exact: true })).toBeVisible();

  await visibility.getByRole("button", { name: "Codex Codex", exact: true }).click();
  await page.reload();
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Codex", exact: true })).toHaveCount(0);
});

test("wendet Orbit-Sidebar-Schalter sofort und nach Reload an", async ({ page }) => {
  await startWithDefaultSidebarPreferences(page);
  await openSurfaceTab(page);

  const orbitSettings = settingsSection(page, "Orbit-Sidebar");
  await orbitSettings.getByRole("button", { name: "OpenCode OpenCode", exact: true }).click();

  await page.goto("/wrapt/wrapt");
  const orbitTools = page.locator(".sidebar-section")
    .filter({ has: page.locator(".sidebar-section-header", { hasText: "Werkzeuge" }) })
    .filter({ has: page.locator(".orbit-palette-item") })
    .first();
  await expect(orbitTools.locator(".orbit-palette-item").filter({ hasText: "OpenCode" })).toHaveCount(0);

  await page.reload();
  const reloadedOrbitTools = page.locator(".sidebar-section")
    .filter({ has: page.locator(".sidebar-section-header", { hasText: "Werkzeuge" }) })
    .filter({ has: page.locator(".orbit-palette-item") })
    .first();
  await expect(reloadedOrbitTools.locator(".orbit-palette-item").filter({ hasText: "OpenCode" })).toHaveCount(0);
});

test("macht Claude Code als optionale CLI-Seite verfügbar", async ({ page }) => {
  await startWithDefaultSidebarPreferences(page);
  await openSurfaceTab(page);

  const visibility = settingsSection(page, "Seiten-Sichtbarkeit");
  const claude = visibility.getByRole("button", { name: "Claude Code Claude Code", exact: true });
  await expect(claude.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Claude Code", exact: true })).toHaveCount(0);

  await claude.click();
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "Claude Code", exact: true })).toBeVisible();
  await page.locator(".workspace-sidebar").getByRole("link", { name: "Claude Code", exact: true }).click();
  await expect(page).toHaveURL(/\/wrapt\/claude$/);
  // Die CLI-Seite rendert die neue Terminalfläche mit vertikaler Sidebar.
  // Ohne konfiguriertes Projekt darf sie leer starten; die Sidebar und der
  // kind-spezifische Öffnen-Button sind der stabile Nutzervertrag.
  await expect(page.getByRole("complementary", { name: "Terminal-Sidebar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claude Code öffnen" }).first()).toBeVisible();
});
