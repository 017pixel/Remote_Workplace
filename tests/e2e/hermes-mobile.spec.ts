import { expect, test } from "@playwright/test";

const e2eUser = process.env.WRAPT_E2E_USER ?? "user@example.com";
test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser }, viewport: { width: 390, height: 844 }, hasTouch: true });

test("rendert Hermes mobil ausschließlich als offizielle SPA", async ({ page }) => {
  await page.goto("/wrapt/hermes-agent");
  const shell = page.locator(".hermes-shell");
  const frame = shell.locator('iframe[title="Hermes Agent"]');
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute("data-surface", "admin");
  await expect(shell).toHaveAttribute("data-hermes-ui", "official");
  await expect(shell.locator(".hermes-surface-nav")).toHaveCount(0);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", "/hermes/chat");

  const overflow = await shell.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
