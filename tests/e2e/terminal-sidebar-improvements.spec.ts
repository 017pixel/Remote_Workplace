import { expect, test, type Page } from "@playwright/test";

const origin = process.env.WRAPT_E2E_URL?.replace(/\/$/, "");
const workbench = origin ? `${origin}/wrapt` : undefined;
const e2eUser = process.env.WRAPT_E2E_USER ?? "user@example.com";

test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser } });
test.describe.configure({ retries: 0 });

async function openFirstTerminal(page: Page) {
  const emptyButton = page.locator(".terminal-empty-state button");
  await expect.poll(async () => (await emptyButton.count()) + (await page.locator(".terminal-tree-entry").count()), { timeout: 20_000 }).toBeGreaterThan(0);
  if (await emptyButton.count() > 0 && await emptyButton.isVisible().catch(() => false)) await emptyButton.click();
  await expect(page.locator(".terminal-tree-row.is-entry").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".xterm-helper-textarea").last()).toBeAttached({ timeout: 20_000 });
}

function entryRow(page: Page, name: string) {
  return page.locator(".terminal-tree-row.is-entry").filter({ hasText: name }).first();
}

test("zeigt nach einer Sekunde eine lesbare Preview und schließt nur normale Terminals", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL auf einen isolierten Wrapt-Testserver.");
  // 1080p bedeutet beim Desktop-Monitor 1920 × 1080 CSS-Pixel.
  await page.setViewportSize({ width: 1_920, height: 1_080 });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Error with Permissions-Policy header:")) consoleErrors.push(message.text());
  });
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);

  const marker = "TERMINAL_PREVIEW_LIVE";
  const input = page.locator(".xterm-helper-textarea").last();
  await input.fill(`printf '${marker}\\n'`);
  await input.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText(marker, { timeout: 15_000 });

  const sidebar = page.getByRole("complementary", { name: "Terminal-Sidebar" });
  await sidebar.getByRole("button", { name: "Terminal öffnen", exact: true }).click();
  await sidebar.getByRole("button", { name: "Terminal öffnen", exact: true }).click();
  await expect(sidebar.locator(".terminal-tree-entry")).toHaveCount(3, { timeout: 15_000 });

  const first = entryRow(page, "Terminal 1");
  await first.hover();
  await expect(page.getByTestId("terminal-hover-preview")).toHaveCount(0);
  await page.waitForTimeout(1_100);
  const preview = page.getByTestId("terminal-hover-preview");
  await expect(preview).toContainText(marker, { timeout: 10_000 });
  const previewBox = await preview.boundingBox();
  expect(previewBox?.width).toBeCloseTo(360, 0);
  expect(previewBox?.height).toBeCloseTo(220, 0);
  await sidebar.locator(".terminal-sidebar-header").hover();
  await expect(preview).toHaveCount(0);

  await entryRow(page, "Terminal 2").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pinnen", exact: true }).click();
  await entryRow(page, "Terminal 3").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Persistent machen", exact: true }).click();

  await sidebar.locator(".terminal-sidebar-header").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Alle normalen Terminals schließen", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("1 normale Terminals");
  await page.getByRole("dialog").getByRole("button", { name: "Schließen", exact: true }).click();

  await expect(entryRow(page, "Terminal 1")).toHaveCount(0, { timeout: 15_000 });
  await expect(entryRow(page, "Terminal 2")).toBeVisible();
  await expect(entryRow(page, "Terminal 3")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
