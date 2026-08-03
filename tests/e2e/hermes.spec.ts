import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { hasPrivateWorkbench, privateWorkbenchReason } from "./helpers/environment";

test.skip(() => !hasPrivateWorkbench, privateWorkbenchReason);
const e2eUser = process.env.WORKBENCH_E2E_USER ?? "user@example.com";
test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser }, viewport: { width: 1440, height: 900 } });

async function officialHermesBody(page: Page) {
  const frame = page.locator('iframe[title="Hermes Agent"]');
  await expect(frame).toBeVisible({ timeout: 20_000 });
  const body = frame.contentFrame().locator("body");
  await expect(body).toBeVisible({ timeout: 30_000 });
  return body;
}

test("öffnet Hermes direkt als offizielle Weboberfläche", async ({ page }) => {
  await page.goto("/workbench/hermes-agent");
  const shell = page.locator(".hermes-shell");
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute("data-surface", "admin");
  await expect(shell).toHaveAttribute("data-hermes-ui", "official");
  await expect(shell.locator(".hermes-surface-nav")).toHaveCount(0);
  await expect(shell.locator(".hermes-chat-main")).toHaveCount(0);

  const body = await officialHermesBody(page);
  await expect(body).toContainText(/Hermes|Chat|Sessions/i);
});

test("öffnet Verwaltungsseiten innerhalb derselben offiziellen Oberfläche", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/workbench/hermes-agent?path=%2Fcron");
  const body = await officialHermesBody(page);
  await expect(body).toContainText(/Cron/i, { timeout: 30_000 });

  await page.goto("/workbench/settings");
  await page.goto("/workbench/hermes-agent");
  await expect(page.locator(".hermes-shell")).toHaveAttribute("data-surface", "admin");
  await officialHermesBody(page);
});

test("übernimmt bestehende Hermes-Session-Deep-Links in die offizielle Chatroute", async ({ page }) => {
  await page.goto("/workbench/hermes-agent?session=session-from-deep-link");
  const frame = page.locator('iframe[title="Hermes Agent"]');
  await expect(frame).toBeVisible({ timeout: 20_000 });
  await expect(frame).toHaveAttribute("src", /\/hermes\/chat\?resume=session-from-deep-link/);
});
