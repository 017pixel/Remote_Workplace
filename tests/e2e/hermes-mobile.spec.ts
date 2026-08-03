import { expect, test } from "@playwright/test";
import { hasPrivateWorkbench, privateWorkbenchReason } from "./helpers/environment";

test.skip(() => !hasPrivateWorkbench, privateWorkbenchReason);
const e2eUser = process.env.WORKBENCH_E2E_USER ?? "user@example.com";
test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser }, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("zeigt auf dem Smartphone nur die offizielle Hermes-Oberfläche", async ({ page }) => {
  await page.goto("/workbench/hermes-agent");
  const shell = page.locator(".hermes-shell");
  const frame = page.locator('iframe[title="Hermes Agent"]');
  await expect(shell).toBeVisible();
  await expect(frame).toBeVisible({ timeout: 20_000 });
  await expect(shell.locator(".hermes-surface-nav")).toHaveCount(0);
  await expect(shell.locator(".hermes-session-sidebar")).toHaveCount(0);

  const bounds = await shell.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
  const frameBox = await frame.boundingBox();
  expect(frameBox?.width ?? 0).toBeGreaterThanOrEqual(350);
  expect(frameBox?.height ?? 0).toBeGreaterThanOrEqual(500);
});
