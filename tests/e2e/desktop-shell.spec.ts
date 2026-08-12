import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test("keeps the information-dense desktop shell", async ({ page }) => {
  await page.goto("/workbench/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-shell-mode", "desktop");
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.locator(".status-bar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Navigation öffnen" })).toHaveCount(0);

  for (const route of ["", "workbench", "tech-tldrs", "browser", "projects", "usage", "settings"]) {
    await page.goto(`/workbench/${route}`);
    const bounds = await page.locator(".app-shell").evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(bounds.scroll, route).toBeLessThanOrEqual(bounds.client + 1);
  }
});

test("moves standalone T3 Code actions into the topbar", async ({ page }) => {
  await page.goto("/workbench/t3-code");
  const actions = page.locator("#topbar-tool-actions");
  await expect(actions).toBeVisible();
  await expect(page.getByRole("button", { name: "Projekt auswählen" })).toHaveCount(0);
  await actions.getByRole("button", { name: "Werkzeugaktionen" }).click();
  // Base UI rendert Menüs absichtlich in ein Portal unter document.body.
  const menu = page.getByRole("menu", { name: "Werkzeugaktionen" });
  await expect(menu.getByRole("menuitem", { name: "Neu laden" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "In neuem Tab öffnen" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Vollbild" })).toBeVisible();
  await expect(page.locator(".standalone-tool-content .panel-island")).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Vollbild" }).click();
  await expect(page.locator(".tool-surface-maximized")).toBeVisible();
  // Im Vollbild steht die Wiederherstellen-Aktion direkt in den Topbar-Aktionen.
  await expect(page.locator("#topbar-tool-actions").getByRole("button", { name: "Wiederherstellen" })).toBeVisible();
});

test("keeps one standalone tool menu after switching between tool routes", async ({ page }) => {
  await page.goto("/workbench/t3-code");
  const actions = page.locator("#topbar-tool-actions");
  await expect(actions.getByRole("button", { name: "Werkzeugaktionen" })).toHaveCount(1);

  await page.getByRole("link", { name: "Code-Server" }).click();
  await expect(page).toHaveURL(/\/workbench\/code-editor$/);
  await expect(page.locator('iframe[title="Editor"]')).toBeVisible();
  await expect(page.locator("#topbar-tool-actions").getByRole("button", { name: "Werkzeugaktionen" })).toHaveCount(1);

  await page.getByRole("link", { name: "T3 Code" }).click();
  await expect(page).toHaveURL(/\/workbench\/t3-code$/);
  await expect(page.locator("#topbar-tool-actions").getByRole("button", { name: "Werkzeugaktionen" })).toHaveCount(1);
});
