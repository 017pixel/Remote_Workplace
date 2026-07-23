import { expect, test } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL;
const projectPath = "/home/user/projects/Remote_Workplace";

test.describe("Orbit project browser desktop", () => {
  test.use({
    extraHTTPHeaders: { "tailscale-user-login": "project-browser@example.com" },
    viewport: { width: 1440, height: 960 },
  });

  test("navigates the server tree and opens a selected folder in Orbit", async ({ page }) => {
    test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench`);
    await expect(page.locator(".orbit-page")).toBeVisible();

    await page.getByRole("button", { name: "Alle Projekte auswählen" }).click();
    const browser = page.getByRole("dialog", { name: "Serverprojekt öffnen" });
    await expect(browser).toBeVisible();
    await expect(browser).toHaveCSS("width", /\d+px/);
    await browser.getByRole("textbox", { name: "Serverpfad" }).fill(projectPath);
    await browser.getByRole("button", { name: "Öffnen", exact: true }).click();

    await expect(browser.locator(".orbit-server-tree-row.is-selected")).toHaveAttribute("data-path", projectPath);
    await expect(browser.locator(".orbit-server-tree-row").filter({ hasText: "package.json" })).toBeVisible();
    await browser.getByRole("button", { name: "Im Orbit öffnen" }).click();

    await expect(browser).toHaveCount(0);
    await expect(page.locator(".orbit-project-node").filter({ hasText: "Remote_Workplace" })).toBeVisible();
    await expect(page.locator(".sidebar-section").nth(1).locator("button.orbit-palette-item").first()).toContainText("Remote_Workplace");
  });
});

test.describe("Orbit project browser mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("opens as a safe-area fullscreen dialog from the command palette", async ({ page }) => {
    test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench`);
    await page.getByRole("button", { name: "Befehl" }).click();
    await page.getByRole("button", { name: /Projektordner durchsuchen/ }).click();

    const browser = page.getByRole("dialog", { name: "Serverprojekt öffnen" });
    await expect(browser).toBeVisible();
    const bounds = await browser.boundingBox();
    expect(bounds?.x).toBe(0);
    expect(bounds?.width).toBe(390);
    expect(bounds?.height).toBe(844);
    await expect(browser.getByRole("textbox", { name: "Serverpfad" })).toHaveCSS("font-size", "16px");
    const action = browser.getByRole("button", { name: "Im Orbit öffnen" });
    const actionBounds = await action.boundingBox();
    expect(actionBounds?.height).toBeGreaterThanOrEqual(44);
    await expect(action).toBeDisabled();
    await browser.getByRole("button", { name: "Dialog schließen" }).click();
    await expect(browser).toHaveCount(0);
  });
});
