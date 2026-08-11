import { expect, test } from "@playwright/test";

const e2eUser = process.env.WORKBENCH_E2E_USER ?? "user@example.com";
test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser }, viewport: { width: 1440, height: 900 } });

test("öffnet Hermes ausschließlich in der offiziellen SPA", async ({ page }) => {
  await page.goto("/workbench/hermes-agent");
  const shell = page.locator(".hermes-shell");
  const frame = shell.locator('iframe[title="Hermes Agent"]');

  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute("data-surface", "admin");
  await expect(shell).toHaveAttribute("data-hermes-ui", "official");
  await expect(shell.locator(".hermes-surface-nav")).toHaveCount(0);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", "/hermes/chat");
});

test("übersetzt alte Session- und Verwaltungs-Deep-Links in Hermes-SPA-Routen", async ({ page }) => {
  await page.goto("/workbench/hermes-agent?session=session-from-deep-link");
  const frame = page.locator('iframe[title="Hermes Agent"]');
  await expect(frame).toHaveAttribute("src", "/hermes/chat?resume=session-from-deep-link");

  await page.goto("/workbench/hermes-agent?path=%2Fcron%2Fjob-1");
  await expect(frame).toHaveAttribute("src", "/hermes/cron/job-1");
});

test("ignoriert die entfernte native Flächenwahl", async ({ page }) => {
  await page.goto("/workbench/hermes-agent?surface=history");
  const shell = page.locator(".hermes-shell");
  await expect(shell).toHaveAttribute("data-surface", "admin");
  await expect(shell.locator('iframe[title="Hermes Agent"]')).toHaveAttribute("src", "/hermes/chat");
});
