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
  await expect(actions.getByRole("button", { name: "Neu laden" })).toBeVisible();
  await expect(actions.getByRole("link", { name: "In neuem Tab öffnen" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Vollbild" })).toBeVisible();
  await expect(page.locator(".standalone-tool-content .panel-island")).toHaveCount(0);
  await actions.getByRole("button", { name: "Vollbild" }).click();
  await expect(page.locator(".tool-surface-maximized")).toBeVisible();
  await expect(page.locator(".tool-surface-maximized").getByRole("button", { name: "Wiederherstellen" })).toBeVisible();
});
